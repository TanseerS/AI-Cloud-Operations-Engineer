import { FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';

import { getLogsClient, describeAwsError } from '../aws/clients.js';
import { redact } from './redaction.js';

/**
 * CloudWatch Logs sampling.
 *
 * Deliberately bounded on both axes: a fixed time window and a hard event limit per log
 * group. Log ingestion is billed and a health check that scans a busy log group would
 * cost more than the problem it found.
 *
 * Two passes per log group, each cheap:
 *   errors  - lines matching an error pattern, the evidence for a reliability finding
 *   reports - Lambda REPORT lines, which carry Max Memory Used and billed duration
 */

const MAX_EVENTS_PER_QUERY = 40;

// FilterLogEvents patterns are literal terms; a space-separated ?term list is an OR.
const ERROR_PATTERN = '?ERROR ?Exception ?Traceback ?"Task timed out"';
const REPORT_PATTERN = 'REPORT';

async function filterEvents(client, logGroupName, filterPattern, window) {
  const response = await client.send(
    new FilterLogEventsCommand({
      logGroupName,
      startTime: new Date(window.start).getTime(),
      endTime: new Date(window.end).getTime(),
      filterPattern,
      limit: MAX_EVENTS_PER_QUERY,
    }),
  );
  return response.events ?? [];
}

/** REPORT lines are structured enough to parse, and carry the memory evidence. */
export function parseReportLine(message) {
  const number = (label) => {
    const match = message.match(new RegExp(`${label}:\\s*([0-9.]+)`));
    return match ? Number.parseFloat(match[1]) : null;
  };
  return {
    durationMs: number('\\tDuration') ?? number('Duration'),
    billedDurationMs: number('Billed Duration'),
    memorySizeMb: number('Memory Size'),
    maxMemoryUsedMb: number('Max Memory Used'),
  };
}

export async function collectLogInsights({ logGroups, window }) {
  const client = getLogsClient();
  const byLogGroup = new Map();
  const warnings = [];
  let requestCount = 0;

  for (const group of logGroups) {
    const entry = {
      logGroup: group.name,
      resourceId: group.id,
      errorEvents: [],
      errorCount: 0,
      reports: [],
      available: true,
      error: null,
    };

    try {
      requestCount += 1;
      const errors = await filterEvents(client, group.name, ERROR_PATTERN, window);
      entry.errorCount = errors.length;
      entry.truncated = errors.length >= MAX_EVENTS_PER_QUERY;
      entry.errorEvents = errors.slice(-6).map((event) => ({
        timestamp: new Date(event.timestamp).toISOString(),
        logStream: event.logStreamName,
        // Redacted and truncated before it can ever reach a response body.
        message: redact(event.message),
      }));
    } catch (error) {
      entry.available = false;
      entry.error = describeAwsError(error);
      warnings.push({ logGroup: group.name, stage: 'errors', ...entry.error });
    }

    try {
      requestCount += 1;
      const reports = await filterEvents(client, group.name, REPORT_PATTERN, window);
      entry.reports = reports
        .map((event) => ({ timestamp: new Date(event.timestamp).toISOString(), ...parseReportLine(event.message) }))
        .filter((report) => report.memorySizeMb !== null);
    } catch (error) {
      warnings.push({ logGroup: group.name, stage: 'reports', ...describeAwsError(error) });
    }

    byLogGroup.set(group.name, entry);
  }

  return { byLogGroup, warnings, requestCount, limits: { maxEventsPerQuery: MAX_EVENTS_PER_QUERY } };
}

export { ERROR_PATTERN, MAX_EVENTS_PER_QUERY };

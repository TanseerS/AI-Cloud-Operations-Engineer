import { GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm';

import config from '../../config/index.js';
import { getSsmClient, describeAwsError } from '../aws/clients.js';

/**
 * Shared reset audit.
 *
 * The scheduled run happens in Lambda and the manual run happens in the API process, so
 * neither can see the other's memory. One small SSM parameter is the shared record -
 * cheap, already the pattern this project uses for lab state, and no new infrastructure.
 *
 * Records are deliberately compact: a Standard-tier parameter holds 4096 characters and
 * a summary is all the dashboard needs.
 */

const MAX_HISTORY = 5;

function compact(record) {
  return {
    trigger: record.trigger,
    status: record.status,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    durationMs: record.durationMs,
    alreadyAtBaseline: record.alreadyAtBaseline,
    resourcesEvaluated: record.summary?.resourcesEvaluated ?? 0,
    changesApplied: (record.changesApplied ?? []).map((change) => ({
      issueId: change.issueId,
      attribute: change.attribute,
      from: change.beforeValue,
      to: change.afterValue,
    })),
    verificationPassed: record.verification?.passed ?? null,
    errorCount: (record.errors ?? []).length,
  };
}

export async function readAutomationState() {
  try {
    const response = await getSsmClient().send(
      new GetParameterCommand({ Name: config.automation.statePath }),
    );
    return { available: true, state: JSON.parse(response.Parameter.Value), error: null };
  } catch (error) {
    // A missing parameter simply means nothing has run yet.
    if (error?.name === 'ParameterNotFound') {
      return { available: true, state: null, error: null };
    }
    return { available: false, state: null, error: describeAwsError(error) };
  }
}

/**
 * Records a run. Never throws: an audit write failing must not turn a successful reset
 * into a failed one.
 */
export async function recordRun(record) {
  try {
    const existing = (await readAutomationState()).state ?? {};
    const entry = compact(record);

    const next = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      lastRun: entry,
      lastManualReset: record.trigger === 'manual' ? entry : existing.lastManualReset ?? null,
      lastAutonomousCheck: record.trigger === 'scheduled' ? entry : existing.lastAutonomousCheck ?? null,
      // Distinct from the check: the last scheduled run that actually changed something.
      lastAutonomousReset:
        record.trigger === 'scheduled' && !record.alreadyAtBaseline
          ? entry
          : existing.lastAutonomousReset ?? null,
      history: [entry, ...(existing.history ?? [])].slice(0, MAX_HISTORY),
    };

    await getSsmClient().send(
      new PutParameterCommand({
        Name: config.automation.statePath,
        Value: JSON.stringify(next),
        Type: 'String',
        Tier: 'Standard',
        Overwrite: true,
      }),
    );
    return { recorded: true };
  } catch (error) {
    return { recorded: false, error: describeAwsError(error) };
  }
}

export { compact };

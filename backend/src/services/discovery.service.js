import config from '../config/index.js';
import { describeAwsError } from './aws/clients.js';
import {
  buildLabIndex,
  LAB_TAG_KEY,
  LAB_TAG_VALUE,
} from './aws/lab-filter.js';
import { collectors } from './discovery/index.js';

/**
 * AWS resource discovery.
 *
 * Runs every collector concurrently and keeps them independent: one service being
 * unreachable or unauthorised degrades that service's slice of the response and
 * nothing else. A caller can always tell the difference between "there are no
 * resources" and "we could not look".
 */

function emptySummary() {
  return { totalResources: 0, byService: {}, byStatus: { healthy: 0, warning: 0, failing: 0, unknown: 0 } };
}

export async function discoverResources() {
  const startedAt = Date.now();

  // One cross-service tag lookup up front, so collectors do not each pay for it.
  const index = await buildLabIndex();

  const settled = await Promise.allSettled(
    collectors.map(async (collector) => {
      const collectorStartedAt = Date.now();
      const { resources, warnings } = await collector.collect(index);
      return {
        service: collector.service,
        label: collector.label,
        resourceType: collector.resourceType,
        status: warnings.length ? 'partial' : 'ok',
        resourceCount: resources.length,
        durationMs: Date.now() - collectorStartedAt,
        resources,
        warnings,
        error: null,
      };
    }),
  );

  const services = [];
  const errors = [];
  const summary = emptySummary();

  settled.forEach((outcome, position) => {
    const collector = collectors[position];

    if (outcome.status === 'rejected') {
      const error = describeAwsError(outcome.reason);
      errors.push({ service: collector.service, label: collector.label, ...error });
      services.push({
        service: collector.service,
        label: collector.label,
        resourceType: collector.resourceType,
        status: 'failed',
        resourceCount: 0,
        durationMs: null,
        resources: [],
        warnings: [],
        error,
      });
      return;
    }

    const result = outcome.value;
    services.push(result);
    summary.totalResources += result.resourceCount;
    summary.byService[result.service] = result.resourceCount;
    for (const resource of result.resources) {
      const level = resource.status?.level ?? 'unknown';
      summary.byStatus[level] = (summary.byStatus[level] ?? 0) + 1;
    }
    for (const warning of result.warnings) {
      errors.push({ service: result.service, label: result.label, level: 'warning', ...warning });
    }
  });

  const failedServices = services.filter((entry) => entry.status === 'failed').length;
  const degradedFilter = !index.available;

  if (degradedFilter) {
    errors.push({
      service: 'resourcegroupstaggingapi',
      label: 'Tag index',
      level: 'warning',
      message:
        'Could not read the account tag index; fell back to per-service tags and the naming convention.',
      ...(index.error ?? {}),
    });
  }

  return {
    discoveredAt: new Date().toISOString(),
    region: config.aws.region,
    durationMs: Date.now() - startedAt,
    partial: failedServices > 0 || errors.length > 0,
    filter: {
      tagKey: LAB_TAG_KEY,
      tagValue: LAB_TAG_VALUE,
      namingPrefix: config.aws.labPrefix,
      tagIndexAvailable: index.available,
      taggedResourcesInAccount: index.arns.size,
    },
    summary: {
      ...summary,
      servicesQueried: collectors.length,
      servicesSucceeded: collectors.length - failedServices,
      servicesFailed: failedServices,
    },
    services,
    errors,
  };
}

export default { discoverResources };

import config from '../config/index.js';
import { discoverResources } from './discovery.service.js';
import { getCostAnalysis } from './cost.service.js';
import { getHealthAnalysis } from './health.service.js';
import { getRemediationPlans } from './remediation.service.js';
import { getLabStatus } from './lab.service.js';

/**
 * The overview summary.
 *
 * Assembled on the backend rather than by the dashboard making five calls, for two
 * reasons: each underlying service already caches its own AWS reads, so composing here
 * reuses those caches instead of racing them, and one request means the landing page
 * shows a consistent snapshot rather than five slices taken at different moments.
 *
 * Every section is independent. One source failing leaves a section marked unavailable
 * and the rest intact - an overview that hides a failure is worse than one with a gap.
 */

function settled(result, shape) {
  if (result.status === 'fulfilled') return { available: true, ...shape(result.value) };
  return { available: false, error: result.reason?.message ?? 'unavailable' };
}

export async function getOverview() {
  const startedAt = Date.now();

  const [inventory, cost, health, remediation, lab] = await Promise.allSettled([
    discoverResources(),
    getCostAnalysis(),
    getHealthAnalysis(),
    getRemediationPlans(),
    getLabStatus(),
  ]);

  const sections = {
    resources: settled(inventory, (value) => ({
      total: value.summary?.totalResources ?? 0,
      byService: value.summary?.byService ?? {},
      servicesDetected: Object.keys(value.summary?.byService ?? {}).length,
      partial: Boolean(value.partial),
      retrievedAt: value.discoveredAt,
    })),

    cost: settled(cost, (value) => ({
      // Cost Explorer is never live; the flag travels with the number so the UI cannot
      // present it as current spend by accident.
      realTime: false,
      currency: value.currency,
      period: value.periods?.current?.label ?? null,
      daysElapsed: value.periods?.current?.days ?? null,
      usageCost: value.totals?.usageCost ?? null,
      netCost: value.totals?.netCost ?? null,
      changePercent: value.comparison?.available ? value.comparison.percentChange : null,
      changeDirection: value.comparison?.available ? value.comparison.direction : null,
      comparisonBasis: value.comparison?.available ? value.comparison.basis : null,
      topService: value.services?.[0]
        ? { service: value.services[0].service, cost: value.services[0].cost, percentage: value.services[0].percentage }
        : null,
      lastAvailableDate: value.dataStatus?.lastAvailableDate ?? null,
      retrievedAt: value.generatedAt,
      dataAvailable: Boolean(value.available),
    })),

    health: settled(health, (value) => ({
      score: value.summary?.score ?? null,
      status: value.summary?.status ?? null,
      totalIssues: value.summary?.totalIssues ?? 0,
      countsBySeverity: value.summary?.countsBySeverity ?? {},
      resourcesWithIssues: value.summary?.resourcesWithIssues ?? 0,
      metricsUnavailable: value.summary?.metricsUnavailable ?? 0,
      windowHours: value.window?.hours ?? null,
      topIssues: (value.issues ?? []).slice(0, 3).map((issue) => ({
        id: issue.id,
        title: issue.title,
        severity: issue.severity,
        resource: issue.resource,
        resourceId: issue.resourceId,
      })),
      retrievedAt: value.generatedAt,
    })),

    remediation: settled(remediation, (value) => ({
      total: value.count ?? 0,
      executable: value.summary?.executable ?? 0,
      recommendationOnly: value.summary?.recommendationOnly ?? 0,
      approved: value.summary?.approved ?? 0,
      awaitingApproval: (value.plans ?? []).filter((plan) => plan.executable && plan.status === 'proposed').length,
      verified: (value.plans ?? []).filter((plan) => plan.status === 'verified').length,
      failed: (value.plans ?? []).filter((plan) => plan.status === 'failed').length,
      retrievedAt: value.generatedAt,
    })),

    lab: settled(lab, (value) => ({
      state: value.labState,
      matchesBaseline: value.matchesBaseline,
      managedResourceCount: value.managedResourceCount,
      automationEnabled: value.automation?.enabled ?? false,
      intervalHours: value.automation?.intervalHours ?? null,
      lastAutonomousCheck: value.automation?.lastAutonomousCheck?.completedAt ?? null,
      lastReset:
        [value.automation?.lastAutonomousReset?.completedAt, value.automation?.lastManualReset?.completedAt]
          .filter(Boolean)
          .sort()
          .at(-1) ?? null,
      nextCheckEstimatedAt: value.automation?.nextCheckEstimatedAt ?? null,
      retrievedAt: new Date().toISOString(),
    })),
  };

  const unavailable = Object.entries(sections)
    .filter(([, section]) => !section.available)
    .map(([name, section]) => ({ section: name, error: section.error }));

  return {
    generatedAt: new Date().toISOString(),
    region: config.aws.region,
    durationMs: Date.now() - startedAt,
    partial: unavailable.length > 0,
    unavailableSections: unavailable,
    ...sections,
  };
}

export default { getOverview };

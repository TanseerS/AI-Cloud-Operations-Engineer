/**
 * Deterministic detection rules.
 *
 * Each rule is a pure function of the collected facts. No model, no heuristics that
 * cannot be explained, no randomness - the same facts always produce the same findings,
 * which is what makes the output worth acting on and what makes it testable.
 *
 * Two constraints every rule honours:
 *   - It emits nothing when the evidence is absent. A metric CloudWatch could not
 *     return is not evidence of health.
 *   - Everything it asserts is backed by a fact it cites.
 */

export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

const THRESHOLDS = {
  lambdaErrorRate: { critical: 50, high: 10, medium: 0 },
  apiErrorRate: { critical: 50, high: 10, medium: 0 },
  memoryUtilisation: 40, // percent below which provisioning is questioned
  memoryFloorMb: 256, // below this the saving is not worth a finding
  retentionDays: 400,
};

function rate(numerator, denominator) {
  if (!denominator) return null;
  return Number.parseFloat(((numerator / denominator) * 100).toFixed(2));
}

function severityFor(value, scale) {
  if (value >= scale.critical) return 'critical';
  if (value >= scale.high) return 'high';
  if (value > scale.medium) return 'medium';
  return null;
}

/** 1. A function that is actually failing, measured rather than assumed. */
export const lambdaErrorRate = {
  id: 'lambda-error-rate',
  category: 'reliability',
  detect({ lambdaMetrics }) {
    const issues = [];
    for (const entry of lambdaMetrics) {
      const { invocations, errors } = entry.facts;
      if (!invocations?.available || !errors?.available) continue;
      if (invocations.value === 0 || errors.value === 0) continue;

      const errorRate = rate(errors.value, invocations.value);
      const severity = severityFor(errorRate, THRESHOLDS.lambdaErrorRate);
      if (!severity) continue;

      issues.push({
        ruleId: 'lambda-error-rate',
        severity,
        category: 'reliability',
        title: `Lambda ${entry.resource.name} is failing ${errorRate}% of invocations`,
        description:
          `Over the analysis window the function was invoked ${invocations.value} times and reported ` +
          `${errors.value} errors. Every failed invocation is a request that did not complete.`,
        resource: entry.resource.name,
        resourceId: entry.resource.id,
        service: 'lambda',
        metrics: { invocations: invocations.value, errors: errors.value, errorRate },
        evidenceFactIds: [invocations.id, errors.id, entry.facts.durationAvg?.id].filter(Boolean),
      });
    }
    return issues;
  },
};

/** 2. An endpoint returning server errors to real callers. */
export const apiServerErrors = {
  id: 'api-5xx-errors',
  category: 'reliability',
  detect({ apiMetrics }) {
    const issues = [];
    for (const entry of apiMetrics) {
      const { count, status5xx } = entry.facts;
      if (!count?.available || !status5xx?.available) continue;
      if (count.value === 0 || status5xx.value === 0) continue;

      const errorRate = rate(status5xx.value, count.value);
      const severity = severityFor(errorRate, THRESHOLDS.apiErrorRate);
      if (!severity) continue;

      issues.push({
        ruleId: 'api-5xx-errors',
        severity,
        category: 'reliability',
        title: `API ${entry.resource.name} returned 5XX on ${errorRate}% of requests`,
        description:
          `The API handled ${count.value} requests in the window and answered ${status5xx.value} of them ` +
          'with a server error. Callers of this endpoint are seeing failures.',
        resource: entry.resource.name,
        resourceId: entry.resource.id,
        service: 'apigateway',
        metrics: { requests: count.value, serverErrors: status5xx.value, errorRate },
        evidenceFactIds: [count.id, status5xx.id, entry.facts.latencyAvg?.id].filter(Boolean),
      });
    }
    return issues;
  },
};

/**
 * 3. Memory provisioned far above what the function uses.
 *
 * Only fires when utilisation was actually measured from REPORT lines. A large memory
 * setting on its own is a configuration choice, not a defect.
 */
export const lambdaMemoryOverProvisioned = {
  id: 'lambda-memory-over-provisioned',
  category: 'cost',
  detect({ lambdaMetrics }) {
    const issues = [];
    for (const entry of lambdaMetrics) {
      const configured = entry.facts.memoryConfigured;
      const used = entry.facts.memoryMaxUsed;
      if (!configured?.available || !used?.available) continue;
      if (configured.value <= THRESHOLDS.memoryFloorMb) continue;

      const utilisation = rate(used.value, configured.value);
      if (utilisation === null || utilisation >= THRESHOLDS.memoryUtilisation) continue;

      const ratio = Number.parseFloat((configured.value / Math.max(used.value, 1)).toFixed(1));
      issues.push({
        ruleId: 'lambda-memory-over-provisioned',
        severity: utilisation < 10 ? 'medium' : 'low',
        category: 'cost',
        title: `Lambda ${entry.resource.name} is provisioned ${ratio}x above its measured memory use`,
        description:
          `The function is configured with ${configured.value} MB but the highest use observed in its ` +
          `own REPORT lines is ${used.value} MB (${utilisation}%). Lambda bills on memory x duration, so ` +
          'the unused headroom is charged on every invocation.',
        resource: entry.resource.name,
        resourceId: entry.resource.id,
        service: 'lambda',
        metrics: { configuredMb: configured.value, maxUsedMb: used.value, utilisationPercent: utilisation, ratio },
        evidenceFactIds: [configured.id, used.id],
      });
    }
    return issues;
  },
};

/** 4. Retention far beyond any plausible need, charged for storage the whole time. */
export const logRetentionExcessive = {
  id: 'log-retention-excessive',
  category: 'cost',
  detect({ logGroupFacts }) {
    const issues = [];
    for (const entry of logGroupFacts) {
      const retention = entry.facts.retention;
      if (!retention?.available) continue;

      const days = retention.value;
      const neverExpires = days === null;
      if (!neverExpires && days <= THRESHOLDS.retentionDays) continue;

      issues.push({
        ruleId: 'log-retention-excessive',
        severity: 'low',
        category: 'cost',
        title: neverExpires
          ? `Log group ${entry.resource.name} never expires`
          : `Log group ${entry.resource.name} retains logs for ${days} days`,
        description: neverExpires
          ? 'The log group has no retention policy, so everything written to it is stored and charged indefinitely.'
          : `Retention is set to ${days} days (about ${(days / 365).toFixed(1)} years). CloudWatch Logs charges ` +
            'for stored data for the whole retention period.',
        resource: entry.resource.name,
        resourceId: entry.resource.id,
        service: 'logs',
        metrics: { retentionInDays: days, storedBytes: entry.facts.storedBytes?.value ?? null },
        evidenceFactIds: [retention.id, entry.facts.storedBytes?.id].filter(Boolean),
      });
    }
    return issues;
  },
};

/** 5. Application errors present in the logs, with the lines that prove it. */
export const logErrorsPresent = {
  id: 'log-errors-present',
  category: 'reliability',
  detect({ logGroupFacts }) {
    const issues = [];
    for (const entry of logGroupFacts) {
      const errorCount = entry.facts.logErrorCount;
      if (!errorCount?.available || errorCount.value === 0) continue;

      issues.push({
        ruleId: 'log-errors-present',
        severity: errorCount.value >= 10 ? 'high' : 'medium',
        category: 'reliability',
        title: `${errorCount.value} error entries in ${entry.resource.name}`,
        description:
          `CloudWatch Logs matched ${errorCount.value} entries containing an error, exception or timeout in ` +
          'the analysis window. Sample lines are attached as evidence, with credential-shaped values removed.',
        resource: entry.resource.name,
        resourceId: entry.resource.id,
        service: 'logs',
        metrics: { matchingEvents: errorCount.value, truncated: Boolean(entry.truncated) },
        evidenceFactIds: [errorCount.id, entry.facts.logErrorSample?.id].filter(Boolean),
      });
    }
    return issues;
  },
};

/**
 * 6. A function allowed to run far longer than the caller will wait.
 *
 * Derived from the architecture graph, so it only fires where a real invoking edge was
 * established from AWS configuration.
 */
export const timeoutExceedsCaller = {
  id: 'lambda-timeout-exceeds-caller',
  category: 'configuration',
  detect({ timeoutMismatches }) {
    return timeoutMismatches.map((mismatch) => ({
      ruleId: 'lambda-timeout-exceeds-caller',
      severity: 'medium',
      category: 'configuration',
      title: `Lambda ${mismatch.functionName} may run ${mismatch.ratio}x longer than its caller waits`,
      description:
        `The function's timeout is ${mismatch.functionTimeoutSeconds}s while ${mismatch.callerName} gives up ` +
        `after ${mismatch.callerTimeoutSeconds}s. A slow invocation keeps running, and billing, after the ` +
        'caller has already abandoned the request.',
      resource: mismatch.functionName,
      resourceId: mismatch.functionId,
      service: 'lambda',
      metrics: {
        functionTimeoutSeconds: mismatch.functionTimeoutSeconds,
        callerTimeoutSeconds: mismatch.callerTimeoutSeconds,
        ratio: mismatch.ratio,
      },
      evidenceFactIds: mismatch.evidenceFactIds,
    }));
  },
};

export const RULES = [
  lambdaErrorRate,
  apiServerErrors,
  lambdaMemoryOverProvisioned,
  logRetentionExcessive,
  logErrorsPresent,
  timeoutExceedsCaller,
];

export { THRESHOLDS };
export default RULES;

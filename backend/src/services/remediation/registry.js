/**
 * The remediation action allowlist.
 *
 * This file is the only place an AWS mutation can be described. Every plan the
 * application produces resolves to an entry here, and an entry names one AWS operation
 * with parameters computed by code in this repository.
 *
 * Nothing outside this registry can become an action: not a model, not a request body,
 * not a resource id. A model may describe a situation; it cannot name the call. If a
 * detected issue has no entry here, the plan is recommendation-only and says why -
 * inventing an action would be worse than admitting the gap.
 *
 * Every entry must:
 *   - target exactly one AWS operation
 *   - compute its parameters from measured evidence, never from request input
 *   - produce a rollback that restores the value observed before the change
 */

/** CloudWatch Logs only accepts these retention values. */
const ALLOWED_RETENTION_DAYS = [
  1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653,
];

const LAMBDA_MEMORY_MIN_MB = 128;
const LAMBDA_MEMORY_MAX_MB = 10240;
const LAMBDA_TIMEOUT_MIN_S = 1;
const LAMBDA_TIMEOUT_MAX_S = 900;

/** Headroom over observed peak use, so a fix does not trade cost for an OOM. */
const MEMORY_HEADROOM_MULTIPLE = 3;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function nearestAllowedRetention(days) {
  return ALLOWED_RETENTION_DAYS.reduce((best, candidate) =>
    Math.abs(candidate - days) < Math.abs(best - days) ? candidate : best,
  );
}

export const ACTION_TYPES = {
  LAMBDA_UPDATE_MEMORY: 'lambda:update-memory',
  LAMBDA_UPDATE_TIMEOUT: 'lambda:update-timeout',
  LOGS_UPDATE_RETENTION: 'logs:update-retention',
  // Used by lab reset to restore the recorded baseline environment, which for this lab
  // is the empty set. No remediation rule maps to it, so it never proposes a fix.
  LAMBDA_UPDATE_ENVIRONMENT: 'lambda:update-environment',
};

export const REMEDIATION_REGISTRY = {
  'lambda-memory-over-provisioned': {
    actionType: ACTION_TYPES.LAMBDA_UPDATE_MEMORY,
    awsOperation: 'lambda:UpdateFunctionConfiguration',
    service: 'lambda',
    risk: 'low',
    reversible: true,
    title: 'Reduce provisioned memory to fit measured use',
    prerequisites: [
      'The function must not be mid-update (LastUpdateStatus must be Successful).',
      'Peak memory use must have been measured from the function\'s own REPORT lines.',
    ],
    expectedImpact:
      'Lambda bills memory x duration, so the unused headroom stops being charged on every invocation. ' +
      'Execution behaviour is unchanged; CPU scales with memory, so a large reduction can slightly increase duration.',
    /** Target is derived from the measured peak, not from the lab baseline. */
    computeChange({ issue, resource }) {
      const current = resource.attributes?.memorySizeMb ?? null;
      const peak = issue.metrics?.maxUsedMb ?? null;
      if (current === null || peak === null || peak <= 0) {
        return { supported: false, reason: 'Configured memory or measured peak use is unavailable.' };
      }

      const target = clamp(
        Math.max(LAMBDA_MEMORY_MIN_MB, Math.ceil((peak * MEMORY_HEADROOM_MULTIPLE) / 64) * 64),
        LAMBDA_MEMORY_MIN_MB,
        LAMBDA_MEMORY_MAX_MB,
      );
      if (target >= current) {
        return { supported: false, reason: 'The derived target is not lower than the current setting.' };
      }

      return {
        supported: true,
        currentState: { MemorySize: current },
        desiredState: { MemorySize: target },
        parameters: { FunctionName: resource.name, MemorySize: target },
        rollbackParameters: { FunctionName: resource.name, MemorySize: current },
        rationale:
          `Peak observed use is ${peak} MB. ${MEMORY_HEADROOM_MULTIPLE}x headroom rounded up to a 64 MB ` +
          `boundary gives ${target} MB, down from ${current} MB.`,
      };
    },
  },

  'lambda-timeout-exceeds-caller': {
    actionType: ACTION_TYPES.LAMBDA_UPDATE_TIMEOUT,
    awsOperation: 'lambda:UpdateFunctionConfiguration',
    service: 'lambda',
    risk: 'low',
    reversible: true,
    title: "Align function timeout with its caller's timeout",
    prerequisites: [
      'An invoking relationship must have been established from AWS configuration.',
      "The caller's own timeout must be known.",
    ],
    expectedImpact:
      'A hung invocation stops being billed after the caller has already given up, and stops holding ' +
      'concurrency. Invocations that complete normally are unaffected.',
    computeChange({ issue, resource }) {
      const current = resource.attributes?.timeoutSeconds ?? null;
      const callerTimeout = issue.metrics?.callerTimeoutSeconds ?? null;
      if (current === null || callerTimeout === null) {
        return { supported: false, reason: 'Function or caller timeout is unavailable.' };
      }

      // One second inside the caller's limit, so the function fails before the caller
      // abandons the request rather than at the same moment.
      const target = clamp(Math.max(LAMBDA_TIMEOUT_MIN_S, callerTimeout - 1), LAMBDA_TIMEOUT_MIN_S, LAMBDA_TIMEOUT_MAX_S);
      if (target >= current) {
        return { supported: false, reason: 'The derived target is not lower than the current setting.' };
      }

      return {
        supported: true,
        currentState: { Timeout: current },
        desiredState: { Timeout: target },
        parameters: { FunctionName: resource.name, Timeout: target },
        rollbackParameters: { FunctionName: resource.name, Timeout: current },
        rationale:
          `The caller gives up after ${callerTimeout}s. Setting the function to ${target}s keeps it inside ` +
          `that window, down from ${current}s.`,
      };
    },
  },

  'log-retention-excessive': {
    actionType: ACTION_TYPES.LOGS_UPDATE_RETENTION,
    awsOperation: 'logs:PutRetentionPolicy',
    service: 'logs',
    risk: 'medium',
    reversible: true,
    title: 'Reduce log retention to an operational window',
    prerequisites: ['The log group must exist and be owned by this lab.'],
    expectedImpact:
      'CloudWatch Logs stops charging storage beyond the new window. Applying a shorter retention ' +
      'deletes existing events older than it, which is why this is not a low-risk change: the rollback ' +
      'restores the setting but cannot restore deleted events.',
    computeChange({ resource }) {
      const current = resource.attributes?.retentionInDays ?? null;
      const target = nearestAllowedRetention(14);

      if (current !== null && current <= target) {
        return { supported: false, reason: 'Retention is already at or below the target window.' };
      }

      return {
        supported: true,
        currentState: { retentionInDays: current },
        desiredState: { retentionInDays: target },
        parameters: { logGroupName: resource.name, retentionInDays: target },
        // A group with no policy is restored by removing the policy again, not by setting a number.
        rollbackParameters:
          current === null
            ? { logGroupName: resource.name, operation: 'logs:DeleteRetentionPolicy' }
            : { logGroupName: resource.name, retentionInDays: current },
        rationale:
          current === null
            ? `The group has no retention policy, so events are stored indefinitely. ${target} days is a ` +
              'standard operational window.'
            : `Retention is ${current} days. ${target} days covers operational need at a fraction of the storage.`,
        warnings: [
          'Applying this deletes log events older than the new retention period. That deletion cannot be undone.',
        ],
      };
    },
  },
};

/**
 * Why an issue has no automated remediation. Stated explicitly so a gap reads as a
 * decision rather than an oversight.
 */
export const RECOMMENDATION_ONLY_REASONS = {
  'lambda-error-rate':
    'An elevated error rate has many possible causes - application defects, missing configuration, a ' +
    'failing dependency, permissions. No single AWS configuration change follows safely from the error ' +
    'rate alone, so this needs a human to choose the fix.',
  'api-5xx-errors':
    'The API is returning the failure of its integration target. The fix belongs to that target, not to ' +
    'the API, and applying an API-level change would hide the fault rather than resolve it.',
  'log-errors-present':
    'Log entries are evidence of a fault, not a misconfiguration. There is no AWS operation that makes ' +
    'application errors stop; the underlying cause has to be addressed in the function.',
};

export function lookupAction(ruleId) {
  return REMEDIATION_REGISTRY[ruleId] ?? null;
}

export function isAllowedActionType(actionType) {
  return Object.values(ACTION_TYPES).includes(actionType);
}

export { ALLOWED_RETENTION_DAYS, LAMBDA_MEMORY_MIN_MB, LAMBDA_MEMORY_MAX_MB, LAMBDA_TIMEOUT_MIN_S, LAMBDA_TIMEOUT_MAX_S };

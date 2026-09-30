import config from '../config/index.js';
import { describeAwsError } from './aws/clients.js';
import { discoverResources } from './discovery.service.js';
import { getHealthAnalysis } from './health.service.js';
import { evaluateSafety, REQUIRED_TAGS } from './remediation/safety.js';
import { captureStateFor, executorFor } from './remediation/executors.js';
import { loadBaseline, toRestoreTargets } from './lab/baseline.js';

/**
 * Lab reset.
 *
 * Restores the environment to the intentionally broken baseline recorded at lab setup,
 * so a demo can be run again from the same starting point.
 *
 * Three properties shape the implementation:
 *
 *   idempotent - the current value of every managed attribute is read first and compared
 *                against the baseline. Only differences are written. Resetting an already
 *                broken lab makes no AWS calls at all.
 *   lab-only   - targets come from AWS discovery, which is itself scoped to the lab, and
 *                each one is re-checked for the required tags before anything is written.
 *                The caller supplies nothing.
 *   cheap      - it only ever updates configuration on resources that already exist. It
 *                creates and deletes nothing.
 *
 * There is deliberately no cooldown: this endpoint is meant to be reachable by anyone
 * demonstrating the lab. Concurrency is handled by refusing to run two resets at once,
 * not by rate-limiting the caller.
 */

// Held only for the duration of a reset. Not a persistent lock, and never a cooldown.
let activeReset = null;
const history = [];
const HISTORY_LIMIT = 10;

function compareValue(observed, expected) {
  if (Array.isArray(expected)) {
    const left = Array.isArray(observed) ? observed : [];
    return left.length === expected.length && left.every((value, index) => value === expected[index]);
  }
  return observed === expected;
}

function summarise(evaluations) {
  return {
    resourcesEvaluated: evaluations.length,
    alreadyAtBaseline: evaluations.filter((entry) => entry.status === 'already-at-baseline').length,
    changesApplied: evaluations.filter((entry) => entry.status === 'restored').length,
    skipped: evaluations.filter((entry) => entry.status === 'skipped').length,
    failed: evaluations.filter((entry) => entry.status === 'failed').length,
  };
}

async function performReset() {
  const startedAt = new Date().toISOString();
  const errors = [];

  const baseline = await loadBaseline();
  if (!baseline.available) {
    return {
      status: 'failed',
      startedAt,
      completedAt: new Date().toISOString(),
      alreadyAtBaseline: false,
      changesApplied: [],
      errors: [{ stage: 'baseline', message: 'The lab baseline could not be read.', ...baseline.error }],
    };
  }

  const { restorable, derived } = toRestoreTargets(baseline.issues);

  // Targets come from discovery, which only returns resources carrying the lab tags or
  // matching the lab naming convention. Nothing here originates with the caller.
  const inventory = await discoverResources();
  const resources = (inventory.services ?? [])
    .filter((entry) => entry.status !== 'failed')
    .flatMap((entry) => entry.resources ?? []);
  const byName = new Map(resources.map((resource) => [resource.name, resource]));

  if (inventory.partial) {
    errors.push({
      stage: 'discovery',
      message: 'Discovery was partial, so some baseline targets may not have been evaluated.',
    });
  }

  const evaluations = [];

  for (const target of restorable) {
    const resource = byName.get(target.resourceName);

    if (!resource) {
      evaluations.push({
        ...publicTarget(target),
        status: 'skipped',
        reason: 'The resource is not present in the discovered lab inventory, so it was not touched.',
      });
      continue;
    }

    const safety = evaluateSafety({
      resource,
      actionType: target.actionType,
      parameters: target.parameters,
      reversible: true,
    });

    if (!safety.safe) {
      evaluations.push({
        ...publicTarget(target),
        status: 'skipped',
        reason: `Safety validation failed: ${safety.failedChecks.join(', ')}`,
        safetyChecks: safety.checks,
      });
      continue;
    }

    let currentState;
    try {
      currentState = await captureStateFor(target.service, target.resourceName);
    } catch (error) {
      const described = describeAwsError(error);
      errors.push({ stage: 'read', issueId: target.issueId, ...described });
      evaluations.push({
        ...publicTarget(target),
        status: 'failed',
        reason: `Could not read the current configuration: ${described.message}`,
      });
      continue;
    }

    const observed = currentState?.[target.stateField] ?? null;

    // The idempotency check: nothing is written when the value already matches.
    if (compareValue(observed, target.expectedValue)) {
      evaluations.push({
        ...publicTarget(target),
        status: 'already-at-baseline',
        observedValue: observed,
        reason: 'Already at the baseline value. No AWS call was made.',
      });
      continue;
    }

    const executor = executorFor(target.actionType);
    if (!executor) {
      evaluations.push({
        ...publicTarget(target),
        status: 'skipped',
        reason: `No executor is registered for ${target.actionType}.`,
      });
      continue;
    }

    try {
      const execution = await executor(target.parameters);
      const afterState = await captureStateFor(target.service, target.resourceName);
      const afterValue = afterState?.[target.stateField] ?? null;

      evaluations.push({
        ...publicTarget(target),
        status: compareValue(afterValue, target.expectedValue) ? 'restored' : 'failed',
        beforeValue: observed,
        afterValue,
        awsOperation: execution.awsOperation,
        reason: compareValue(afterValue, target.expectedValue)
          ? 'Restored to the baseline value.'
          : 'The AWS call succeeded but the resource does not hold the baseline value.',
      });
    } catch (error) {
      const described = describeAwsError(error);
      errors.push({ stage: 'write', issueId: target.issueId, ...described });
      evaluations.push({
        ...publicTarget(target),
        status: 'failed',
        beforeValue: observed,
        reason: `The AWS operation failed: ${described.message}`,
      });
    }
  }

  const counts = summarise(evaluations);
  const changesApplied = evaluations.filter((entry) => entry.status === 'restored');

  // Verification: re-read the resources and re-run the detector that found the issues in
  // the first place. A reset is only successful if the lab is broken again.
  const verification = await verifyBaseline({ restorable, derived, evaluations });

  const completedAt = new Date().toISOString();
  const record = {
    status: counts.failed > 0 ? 'failed' : 'reset',
    startedAt,
    completedAt,
    durationMs: new Date(completedAt) - new Date(startedAt),
    region: config.aws.region,
    alreadyAtBaseline: counts.changesApplied === 0 && counts.failed === 0,
    summary: { ...counts, derivedIssues: derived.length },
    changesApplied: changesApplied.map(({ issueId, resourceName, attribute, beforeValue, afterValue, awsOperation }) => ({
      issueId,
      resourceName,
      attribute,
      beforeValue,
      afterValue,
      awsOperation,
    })),
    evaluations,
    derivedIssues: derived,
    verification,
    guardrails: {
      requiredTags: REQUIRED_TAGS,
      namingPrefix: config.aws.labPrefix,
      region: config.aws.region,
      callerMaySupplyTargets: false,
      resourcesCreated: 0,
      resourcesDeleted: 0,
      note: 'Reset only updates configuration on resources that already exist.',
    },
    errors,
    baseline: { source: baseline.path, issues: baseline.issues.length },
  };

  history.unshift(record);
  if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
  return record;
}

/** Only fields that are safe to publish; no parameter values leave this module. */
function publicTarget(target) {
  return {
    issueId: target.issueId,
    title: target.title,
    category: target.category,
    service: target.service,
    resourceName: target.resourceName,
    attribute: target.attribute,
    actionType: target.actionType,
    expectedValue: target.expectedValue,
  };
}

async function verifyBaseline({ restorable, derived, evaluations }) {
  const checks = [];

  // 1. Read every managed attribute back from AWS.
  for (const target of restorable) {
    const evaluation = evaluations.find((entry) => entry.issueId === target.issueId);
    if (evaluation?.status === 'skipped') continue;

    try {
      const state = await captureStateFor(target.service, target.resourceName);
      const observed = state?.[target.stateField] ?? null;
      checks.push({
        check: 'configuration-readback',
        issueId: target.issueId,
        resource: target.resourceName,
        attribute: target.attribute,
        expected: target.expectedValue,
        observed,
        passed: compareValue(observed, target.expectedValue),
        source: state?.source ?? null,
      });
    } catch (error) {
      checks.push({
        check: 'configuration-readback',
        issueId: target.issueId,
        resource: target.resourceName,
        passed: false,
        detail: describeAwsError(error).message,
      });
    }
  }

  // 2. Re-run the detector. The intentional issues should be detected again.
  let detectedIssueIds = [];
  let detectorError = null;
  try {
    const health = await getHealthAnalysis({ force: true });
    detectedIssueIds = (health.issues ?? []).map((issue) => issue.ruleId);
  } catch (error) {
    detectorError = describeAwsError(error).message;
  }

  const restoredRuleExpectations = {
    'aicoe-lab-issue-001': 'lambda-memory-over-provisioned',
    'aicoe-lab-issue-002': 'log-retention-excessive',
    'aicoe-lab-issue-005': 'lambda-timeout-exceeds-caller',
  };

  const issuesDetected = [];
  for (const [issueId, ruleId] of Object.entries(restoredRuleExpectations)) {
    if (!restorable.some((target) => target.issueId === issueId)) continue;
    const detected = detectedIssueIds.includes(ruleId);
    issuesDetected.push({ issueId, ruleId, detected });
    checks.push({
      check: 'detector-rerun',
      issueId,
      passed: detected,
      detail: detected
        ? `The detector reports ${ruleId} again.`
        : `The detector does not report ${ruleId}. The lab may not be fully back at baseline.`,
    });
  }

  const failed = checks.filter((entry) => !entry.passed);
  return {
    passed: failed.length === 0 && !detectorError,
    verifiedAt: new Date().toISOString(),
    checks,
    issuesDetected,
    derivedIssues: derived.map((entry) => ({ issueId: entry.issueId, reason: entry.reason })),
    detectorError,
    conclusion:
      failed.length === 0 && !detectorError
        ? 'Every managed attribute matches the baseline and the detector reports the intentional issues again.'
        : `${failed.length} verification check(s) did not pass.`,
  };
}

/**
 * Run a reset. Concurrent callers join the in-flight run rather than starting a second
 * one, so two requests can never write to the same resource at the same time and the
 * second caller still gets a real result.
 */
export async function resetLab() {
  if (activeReset) {
    // Capture the reference first: the in-flight run clears activeReset in its finally
    // block, so reading it again after the await would dereference null.
    const inFlight = activeReset;
    const result = await inFlight.promise;
    return { ...result, joinedInFlightReset: true, startedAtOfJoinedRun: inFlight.startedAt };
  }

  const startedAt = new Date().toISOString();
  const promise = performReset().finally(() => {
    activeReset = null;
  });
  activeReset = { startedAt, promise };
  return promise;
}

/** Baseline summary and last reset, for the dashboard. Makes no AWS change. */
export async function getLabStatus() {
  const baseline = await loadBaseline();
  const { restorable, derived } = baseline.available
    ? toRestoreTargets(baseline.issues)
    : { restorable: [], derived: [] };

  return {
    region: config.aws.region,
    baseline: {
      available: baseline.available,
      source: baseline.path ?? null,
      issues: baseline.issues.length,
      managedAttributes: restorable.map(publicTarget),
      derivedIssues: derived,
      error: baseline.error ?? null,
    },
    guardrails: {
      requiredTags: REQUIRED_TAGS,
      namingPrefix: config.aws.labPrefix,
      callerMaySupplyTargets: false,
      cooldown: null,
      note: 'Reset is available on demand. Concurrency is handled server-side, not by rate-limiting callers.',
    },
    resetInProgress: Boolean(activeReset),
    lastReset: history[0]
      ? {
          status: history[0].status,
          completedAt: history[0].completedAt,
          alreadyAtBaseline: history[0].alreadyAtBaseline,
          changesApplied: history[0].changesApplied.length,
          verificationPassed: history[0].verification?.passed ?? null,
        }
      : null,
    history: history.map((entry) => ({
      status: entry.status,
      completedAt: entry.completedAt,
      alreadyAtBaseline: entry.alreadyAtBaseline,
      changesApplied: entry.changesApplied.length,
      verificationPassed: entry.verification?.passed ?? null,
    })),
  };
}

export default { resetLab, getLabStatus };

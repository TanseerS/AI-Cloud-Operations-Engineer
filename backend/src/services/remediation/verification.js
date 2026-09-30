import { getHealthAnalysis } from '../health.service.js';
import { captureStateFor } from './executors.js';

/**
 * Verification.
 *
 * A successful AWS API response means the request was accepted, not that the problem is
 * gone. Verification therefore asks two independent questions:
 *
 *   1. Does the resource now hold the configuration the plan proposed? Read back from
 *      AWS, not inferred from the call succeeding.
 *   2. Does the detector still report the issue? The same rules and the same CloudWatch
 *      sources that found it in the first place are re-run.
 *
 * Both must agree before a remediation is called verified. If AWS accepted the change but
 * the detector still fires, that is verification_failed - a real and useful outcome, and
 * one worth reporting honestly rather than rounding up to success.
 */

function compareState(observed, expected) {
  const mismatches = [];
  for (const [key, expectedValue] of Object.entries(expected ?? {})) {
    const observedValue = observed?.[key] ?? null;
    if (observedValue !== expectedValue) {
      mismatches.push({ field: key, expected: expectedValue, observed: observedValue });
    }
  }
  return { matches: mismatches.length === 0, mismatches };
}

export async function verifyRemediation({ plan, targetName }) {
  const verifiedAt = new Date().toISOString();
  const evidence = [];

  // 1. The resource's own configuration, read back from AWS.
  let observedState = null;
  let configurationMatches = false;
  let stateComparison = { matches: false, mismatches: [] };

  try {
    observedState = await captureStateFor(plan.service, targetName);
    stateComparison = compareState(observedState, plan.desiredState);
    configurationMatches = stateComparison.matches;
    evidence.push({
      check: 'configuration-readback',
      source: observedState.source,
      passed: configurationMatches,
      detail: configurationMatches
        ? `${plan.service} now reports ${JSON.stringify(plan.desiredState)}`
        : `mismatch: ${JSON.stringify(stateComparison.mismatches)}`,
    });
  } catch (error) {
    evidence.push({
      check: 'configuration-readback',
      source: plan.service,
      passed: false,
      detail: `Could not read the resource back: ${error.message}`,
    });
  }

  // 2. The detector, re-run against live CloudWatch and live configuration.
  let issueStillDetected = null;
  let detectorEvidence = null;
  try {
    const health = await getHealthAnalysis({ force: true });
    const stillThere = (health.issues ?? []).find((issue) => issue.id === plan.issueId);
    issueStillDetected = Boolean(stillThere);
    detectorEvidence = stillThere ? stillThere.metrics : null;
    evidence.push({
      check: 'detector-rerun',
      source: `deterministic rule ${plan.ruleId} over live CloudWatch and configuration`,
      passed: !issueStillDetected,
      detail: issueStillDetected
        ? `The detector still reports this issue: ${JSON.stringify(stillThere.metrics)}`
        : 'The detector no longer reports this issue.',
    });
  } catch (error) {
    evidence.push({
      check: 'detector-rerun',
      source: 'health analysis',
      passed: false,
      detail: `Could not re-run the detector: ${error.message}`,
    });
  }

  const verified = configurationMatches && issueStillDetected === false;

  return {
    verified,
    verifiedAt,
    expectedState: plan.desiredState,
    observedState,
    stateMatches: configurationMatches,
    stateMismatches: stateComparison.mismatches,
    issueStillDetected,
    detectorMetrics: detectorEvidence,
    evidence,
    conclusion: verified
      ? 'AWS reports the intended configuration and the detector no longer reports the issue.'
      : configurationMatches
        ? 'The configuration changed as intended, but the detector still reports the issue.'
        : 'The resource does not hold the intended configuration.',
  };
}

export { compareState };

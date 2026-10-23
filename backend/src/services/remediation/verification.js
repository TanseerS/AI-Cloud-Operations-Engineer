import { getHealthAnalysis } from '../health.service.js';
import { captureStateFor, probeLambdaAlias } from './executors.js';

/**
 * Verification.
 *
 * A successful AWS API response means the request was accepted, not that the problem is
 * gone. Verification therefore asks independent questions:
 *
 *   1. Does the resource now hold the configuration the plan proposed? Read back from
 *      AWS, not inferred from the call succeeding.
 *   2. Does the detector still report the issue? The same rules and the same CloudWatch
 *      sources that found it in the first place are re-run.
 *   3. For a rollback, does the thing actually work now? The alias is invoked and its
 *      response checked against the contract the baseline records.
 *
 * The third check exists because the first two can both pass while the service is still
 * broken. An alias read-back proves a pointer moved; the detector can only report what
 * CloudWatch has already published, which lags. Invoking the alias and seeing the
 * known-good release answer is the only one of the three that observes behaviour, and it
 * is the difference between "we changed something" and "it is working".
 *
 * All applicable checks must agree before a remediation is called verified. If AWS
 * accepted the change but the detector still fires, or the probe still fails, that is
 * verification_failed - a real and useful outcome, and one worth reporting honestly
 * rather than rounding up to success.
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
    observedState = await captureStateFor(plan.service, targetName, plan.parameters);
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

  // 3. Behaviour. Only a plan that carries a probe contract gets one, so the two
  //    existing checks are untouched for every action that had no probe before.
  let probe = null;
  if (plan.probe && plan.service === 'lambda-alias') {
    try {
      probe = await probeLambdaAlias({
        FunctionName: plan.parameters.FunctionName,
        Name: plan.parameters.Name,
        payload: plan.probe.payload,
        expectRelease: plan.probe.expectRelease ?? null,
      });
      evidence.push({
        check: 'behaviour-probe',
        source: `lambda:Invoke ${plan.parameters.FunctionName}:${plan.parameters.Name}`,
        passed: probe.healthy,
        detail: probe.healthy
          ? `The alias answered healthily from version ${probe.executedVersion} serving ${probe.releaseServed}.`
          : `The alias is still not behaving correctly: ${
              probe.functionError
                ? `FunctionError ${probe.functionError}`
                : `statusCode ${probe.statusCode}, release ${probe.releaseServed}`
            }`,
      });
    } catch (error) {
      probe = { invoked: false, healthy: false, error: error.message };
      evidence.push({
        check: 'behaviour-probe',
        source: 'lambda:Invoke',
        passed: false,
        detail: `Could not invoke the alias to verify behaviour: ${error.message}`,
      });
    }
  }

  const { verified, conclusion } = concludeVerification({ configurationMatches, issueStillDetected, probe });

  return {
    verified,
    verifiedAt,
    expectedState: plan.desiredState,
    observedState,
    stateMatches: configurationMatches,
    stateMismatches: stateComparison.mismatches,
    issueStillDetected,
    detectorMetrics: detectorEvidence,
    probe,
    evidence,
    conclusion,
  };
}

/**
 * Whether the evidence adds up to "recovered", separated from the gathering of it so
 * the decision can be tested exhaustively without touching AWS.
 *
 * A probe that was attempted must pass. A probe that does not apply cannot mask a
 * failure elsewhere, and cannot manufacture a pass on its own either.
 */
export function concludeVerification({ configurationMatches, issueStillDetected, probe }) {
  const behaviourOk = probe === null || probe === undefined ? true : probe.healthy === true;
  const verified = configurationMatches === true && issueStillDetected === false && behaviourOk;

  if (verified) {
    return {
      verified: true,
      conclusion: probe
        ? 'AWS reports the intended version, the detector no longer reports the issue, and the alias answers healthily when invoked.'
        : 'AWS reports the intended configuration and the detector no longer reports the issue.',
    };
  }
  if (configurationMatches !== true) {
    return { verified: false, conclusion: 'The resource does not hold the intended configuration.' };
  }
  if (!behaviourOk) {
    return {
      verified: false,
      conclusion: 'The configuration changed as intended, but invoking the alias shows it is still not working.',
    };
  }
  return {
    verified: false,
    conclusion: 'The configuration changed as intended, but the detector still reports the issue.',
  };
}

export { compareState };

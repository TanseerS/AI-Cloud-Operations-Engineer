import test from 'node:test';
import assert from 'node:assert/strict';

import { concludeVerification, compareState } from '../src/services/remediation/verification.js';
import { detectAliasDrift } from '../src/services/remediation.service.js';
import { judgeDetectorExpectation } from '../src/services/lab.service.js';

/**
 * The decisions that turn evidence into a verdict.
 *
 * These are the points where the system is most tempted to be generous with itself -
 * "the API call succeeded, call it fixed" - so each branch is pinned here rather than
 * left to be exercised only by a live lab.
 */

/* ------------------------------------------------- verification verdict */

test('recovery requires the configuration, the detector AND the probe', () => {
  const healthy = { healthy: true };
  assert.equal(
    concludeVerification({ configurationMatches: true, issueStillDetected: false, probe: healthy }).verified,
    true,
  );
});

test('a passing probe cannot rescue a configuration that did not change', () => {
  const result = concludeVerification({
    configurationMatches: false,
    issueStillDetected: false,
    probe: { healthy: true },
  });
  assert.equal(result.verified, false);
  assert.match(result.conclusion, /does not hold the intended configuration/);
});

test('a correct alias with a still-failing probe is NOT recovery', () => {
  const result = concludeVerification({
    configurationMatches: true,
    issueStillDetected: false,
    probe: { healthy: false, functionError: 'Unhandled' },
  });
  assert.equal(result.verified, false, 'the pointer moved but the service is still broken');
  assert.match(result.conclusion, /still not working/);
});

test('a probe that could not run at all is a failure, not a pass', () => {
  const result = concludeVerification({
    configurationMatches: true,
    issueStillDetected: false,
    probe: { invoked: false, healthy: false, error: 'AccessDeniedException' },
  });
  assert.equal(result.verified, false);
});

test('a detector that still fires blocks recovery even with a healthy probe', () => {
  const result = concludeVerification({
    configurationMatches: true,
    issueStillDetected: true,
    probe: { healthy: true },
  });
  assert.equal(result.verified, false);
  assert.match(result.conclusion, /detector still reports/);
});

test('actions with no probe keep exactly their previous two-check behaviour', () => {
  for (const probe of [null, undefined]) {
    assert.equal(concludeVerification({ configurationMatches: true, issueStillDetected: false, probe }).verified, true);
    assert.equal(concludeVerification({ configurationMatches: true, issueStillDetected: true, probe }).verified, false);
    assert.equal(concludeVerification({ configurationMatches: false, issueStillDetected: false, probe }).verified, false);
  }
});

test('an undetermined detector result never counts as cleared', () => {
  // issueStillDetected is null when the detector could not be re-run at all.
  const result = concludeVerification({ configurationMatches: true, issueStillDetected: null, probe: null });
  assert.equal(result.verified, false);
});

test('compareState is unchanged for the existing services', () => {
  assert.equal(compareState({ MemorySize: 128 }, { MemorySize: 128 }).matches, true);
  assert.equal(compareState({ MemorySize: 3008 }, { MemorySize: 128 }).matches, false);
  assert.equal(compareState({ retentionInDays: 14 }, { retentionInDays: 14 }).matches, true);
  // Versions are strings everywhere; a number must not quietly compare equal.
  assert.equal(compareState({ FunctionVersion: 1 }, { FunctionVersion: '1' }).matches, false);
  assert.equal(compareState({ FunctionVersion: '1' }, { FunctionVersion: '1' }).matches, true);
});

/* ------------------------------------------- concurrent alias movement */

const approvedPlan = {
  service: 'lambda-alias',
  currentState: { FunctionVersion: '2' },
  parameters: { FunctionName: 'aicoe-lab-rollback-function', Name: 'live', FunctionVersion: '1', RevisionId: 'rev-A' },
};

const observed = { FunctionVersion: '2', RevisionId: 'rev-A', AliasName: 'live' };

test('an unchanged alias shows no drift', () => {
  assert.deepEqual(detectAliasDrift(observed, approvedPlan), []);
});

test('an alias moved to another version after approval is refused', () => {
  const drift = detectAliasDrift({ ...observed, FunctionVersion: '3' }, approvedPlan);
  assert.equal(drift.length >= 1, true);
  assert.match(drift.join(' '), /now serves version 3/);
});

test('a revision that changed after approval is refused even at the same version', () => {
  // Someone moved the alias away and back: same version, new revision. The approval
  // was given against a specific revision, so this must still fail closed.
  const drift = detectAliasDrift({ ...observed, RevisionId: 'rev-B' }, approvedPlan);
  assert.equal(drift.length, 1);
  assert.match(drift[0], /revision changed/);
});

test('reading a different alias than the plan names is refused', () => {
  const drift = detectAliasDrift({ ...observed, AliasName: 'prod' }, approvedPlan);
  assert.match(drift.join(' '), /alias name mismatch/);
});

test('an unreadable alias state is drift, not a pass', () => {
  for (const state of [null, undefined, {}]) {
    assert.ok(detectAliasDrift(state, approvedPlan).length > 0, `${JSON.stringify(state)} must be treated as drift`);
  }
});

/* -------------------------------- reset verification (B2 regression) */

test('a rule that fires after reset passes', () => {
  const result = judgeDetectorExpectation({ ruleId: 'log-retention-excessive', detected: true, evidenceAvailable: true });
  assert.equal(result.passed, true);
  assert.equal(result.inconclusive, false);
});

test('REGRESSION: a traffic-dependent rule with no evidence is inconclusive, not failed', () => {
  // This is the bug: reset restored the configuration correctly, but the memory rule
  // needs a REPORT line that only exists after an invocation. Reset does not generate
  // traffic, so demanding the rule fire made reset report its own success as a failure.
  const result = judgeDetectorExpectation({
    ruleId: 'lambda-memory-over-provisioned',
    detected: false,
    evidenceAvailable: false,
  });
  assert.equal(result.passed, true, 'a missing signal must not fail the reset');
  assert.equal(result.inconclusive, true);
  assert.match(result.detail, /does not generate traffic/);
});

test('REGRESSION: a rule whose evidence IS available but does not fire still fails', () => {
  // The fix must not blanket-excuse every silent rule - that would hide a real
  // incomplete restore.
  const result = judgeDetectorExpectation({
    ruleId: 'log-retention-excessive',
    detected: false,
    evidenceAvailable: true,
  });
  assert.equal(result.passed, false, 'present evidence and no finding is a genuine failure');
  assert.equal(result.inconclusive, false);
  assert.match(result.detail, /may not be fully back at baseline/);
});

test('the three outcomes are mutually exclusive and total', () => {
  const seen = new Set();
  for (const detected of [true, false]) {
    for (const evidenceAvailable of [true, false]) {
      const r = judgeDetectorExpectation({ ruleId: 'r', detected, evidenceAvailable });
      seen.add(`${r.passed}/${r.inconclusive}`);
      assert.ok(typeof r.detail === 'string' && r.detail.length > 0);
      assert.ok(!(r.passed === false && r.inconclusive === true), 'inconclusive must never also be a failure');
    }
  }
  assert.deepEqual([...seen].sort(), ['false/false', 'true/false', 'true/true']);
});

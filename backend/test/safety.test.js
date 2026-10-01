import test from 'node:test';
import assert from 'node:assert/strict';

import evaluateSafety from '../src/services/remediation/safety.js';
import {
  ACTION_TYPES,
  REMEDIATION_REGISTRY,
  isAllowedActionType,
  lookupAction,
} from '../src/services/remediation/registry.js';
import { executorFor, SUPPORTED_ACTION_TYPES } from '../src/services/remediation/executors.js';

/**
 * The safety gate is the claim this whole application rests on: a model, or a browser,
 * can describe a situation but cannot cause an AWS mutation outside the lab. These tests
 * exercise that claim directly, with no AWS involved - every function here is pure.
 */

/** A target shaped exactly as discovery produces one, and permitted. */
function labResource(overrides = {}) {
  return {
    arn: 'arn:aws:lambda:us-east-1:111122223333:function:aicoe-lab-function',
    id: 'aicoe-lab-function',
    name: 'aicoe-lab-function',
    region: 'us-east-1',
    tags: {
      Project: 'ai-cloud-operations-engineer',
      Environment: 'lab',
      ManagedBy: 'aicoe',
    },
    ...overrides,
  };
}

const validMemoryChange = {
  actionType: ACTION_TYPES.LAMBDA_UPDATE_MEMORY,
  parameters: { FunctionName: 'aicoe-lab-function', MemorySize: 128 },
  reversible: true,
};

test('a correctly tagged lab resource with valid parameters passes every check', () => {
  const result = evaluateSafety({ resource: labResource(), ...validMemoryChange });
  assert.equal(result.safe, true, `failed: ${result.failedChecks.join(', ')}`);
  assert.deepEqual(result.failedChecks, []);
});

test('a resource outside the lab naming convention is refused', () => {
  const result = evaluateSafety({
    resource: labResource({ name: 'payments-api-production', id: 'payments-api-production' }),
    ...validMemoryChange,
  });
  assert.equal(result.safe, false);
  assert.ok(result.failedChecks.includes('lab-membership'));
});

test('each required tag is independently load-bearing', () => {
  for (const key of ['Project', 'Environment', 'ManagedBy']) {
    const tags = { ...labResource().tags };
    delete tags[key];
    const result = evaluateSafety({ resource: labResource({ tags }), ...validMemoryChange });
    assert.equal(result.safe, false, `missing ${key} should have failed the gate`);
    assert.ok(result.failedChecks.includes('required-tags'), `missing ${key} should fail required-tags`);
  }
});

test('a production-looking Environment tag is refused even on a lab-named resource', () => {
  const tags = { ...labResource().tags, Environment: 'production' };
  const result = evaluateSafety({ resource: labResource({ tags }), ...validMemoryChange });
  assert.equal(result.safe, false);
  assert.ok(result.failedChecks.includes('required-tags'));
});

test('a resource in another region is refused', () => {
  const result = evaluateSafety({
    resource: labResource({ region: 'eu-west-1' }),
    ...validMemoryChange,
  });
  assert.equal(result.safe, false);
  assert.ok(result.failedChecks.includes('region-scope'));
});

test('a missing resource fails rather than defaulting to permitted', () => {
  const result = evaluateSafety({ resource: null, ...validMemoryChange });
  assert.equal(result.safe, false);
  assert.ok(result.failedChecks.includes('resource-verified'));
  assert.ok(result.failedChecks.includes('required-tags'));
});

test('an action type outside the allowlist is refused and has no executor', () => {
  for (const actionType of ['lambda:DeleteFunction', 'iam:PutRolePolicy', 's3:DeleteBucket', '*']) {
    assert.equal(isAllowedActionType(actionType), false, `${actionType} must not be allowlisted`);
    assert.equal(executorFor(actionType), null, `${actionType} must have no executor`);

    const result = evaluateSafety({ resource: labResource(), actionType, parameters: {}, reversible: true });
    assert.equal(result.safe, false);
    assert.ok(result.failedChecks.includes('action-allowlisted'));
  }
});

test('prototype pollution cannot smuggle in an executor', () => {
  for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(executorFor(key), null, `${key} must not resolve to a function`);
  }
});

test('out-of-range parameters are refused', () => {
  const cases = [
    { actionType: ACTION_TYPES.LAMBDA_UPDATE_MEMORY, parameters: { FunctionName: 'aicoe-lab-function', MemorySize: 64 } },
    { actionType: ACTION_TYPES.LAMBDA_UPDATE_MEMORY, parameters: { FunctionName: 'aicoe-lab-function', MemorySize: 99999 } },
    { actionType: ACTION_TYPES.LAMBDA_UPDATE_MEMORY, parameters: { FunctionName: 'aicoe-lab-function', MemorySize: '128' } },
    { actionType: ACTION_TYPES.LAMBDA_UPDATE_TIMEOUT, parameters: { FunctionName: 'aicoe-lab-function', Timeout: 0 } },
    { actionType: ACTION_TYPES.LAMBDA_UPDATE_TIMEOUT, parameters: { FunctionName: 'aicoe-lab-function', Timeout: 901 } },
    // 13 is not one of the retention values CloudWatch Logs accepts.
    { actionType: ACTION_TYPES.LOGS_UPDATE_RETENTION, parameters: { logGroupName: '/aws/lambda/aicoe-lab-function', retentionInDays: 13 } },
  ];

  for (const { actionType, parameters } of cases) {
    const result = evaluateSafety({ resource: labResource(), actionType, parameters, reversible: true });
    assert.equal(result.safe, false, `${actionType} ${JSON.stringify(parameters)} should be refused`);
    assert.ok(result.failedChecks.includes('action-parameters'));
  }
});

test('a change with no rollback is refused', () => {
  const result = evaluateSafety({ resource: labResource(), ...validMemoryChange, reversible: false });
  assert.equal(result.safe, false);
  assert.ok(result.failedChecks.includes('reversible'));
});

test('every registry entry maps to an executor and declares a rollback', () => {
  for (const [ruleId, entry] of Object.entries(REMEDIATION_REGISTRY)) {
    assert.equal(lookupAction(ruleId), entry);
    assert.ok(isAllowedActionType(entry.actionType), `${ruleId} action is not allowlisted`);
    assert.equal(typeof executorFor(entry.actionType), 'function', `${ruleId} has no executor`);
    assert.equal(entry.reversible, true, `${ruleId} must be reversible`);
    assert.equal(typeof entry.computeChange, 'function');
  }
});

test('the executor map holds nothing the allowlist does not name', () => {
  for (const actionType of SUPPORTED_ACTION_TYPES) {
    assert.ok(isAllowedActionType(actionType), `${actionType} has an executor but is not allowlisted`);
  }
});

test('memory remediation derives its target from measured peak use, not from input', () => {
  const entry = REMEDIATION_REGISTRY['lambda-memory-over-provisioned'];
  const change = entry.computeChange({
    issue: { metrics: { maxUsedMb: 37 } },
    resource: { name: 'aicoe-lab-function', attributes: { memorySizeMb: 3008 } },
  });

  assert.equal(change.supported, true);
  // 37 MB x 3 headroom = 111, rounded up to the next 64 MB boundary = 128.
  assert.equal(change.desiredState.MemorySize, 128);
  assert.equal(change.rollbackParameters.MemorySize, 3008, 'rollback must restore the observed value');
});

test('memory remediation declines rather than proposing an increase', () => {
  const entry = REMEDIATION_REGISTRY['lambda-memory-over-provisioned'];
  const change = entry.computeChange({
    issue: { metrics: { maxUsedMb: 900 } },
    resource: { name: 'aicoe-lab-function', attributes: { memorySizeMb: 512 } },
  });
  assert.equal(change.supported, false);
});

test('memory remediation declines when peak use was never measured', () => {
  const entry = REMEDIATION_REGISTRY['lambda-memory-over-provisioned'];
  const change = entry.computeChange({
    issue: { metrics: {} },
    resource: { name: 'aicoe-lab-function', attributes: { memorySizeMb: 3008 } },
  });
  assert.equal(change.supported, false);
});

test('a log group with no retention policy rolls back by removing the policy, not by setting a number', () => {
  const entry = REMEDIATION_REGISTRY['log-retention-excessive'];
  const change = entry.computeChange({
    resource: { name: '/aws/lambda/aicoe-lab-function', attributes: { retentionInDays: null } },
  });

  assert.equal(change.supported, true);
  assert.equal(change.rollbackParameters.operation, 'logs:DeleteRetentionPolicy');
  assert.ok(change.warnings.length > 0, 'deleting log events must carry a warning');
});

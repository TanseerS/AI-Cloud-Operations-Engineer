import test from 'node:test';
import assert from 'node:assert/strict';

import evaluateSafety from '../src/services/remediation/safety.js';
import {
  ACTION_TYPES,
  REMEDIATION_REGISTRY,
  isAllowedActionType,
  isPublishedVersion,
} from '../src/services/remediation/registry.js';
import { executorFor, SUPPORTED_ACTION_TYPES, captureStateFor } from '../src/services/remediation/executors.js';
import { toRestoreTargets, readRollbackBaseline } from '../src/services/lab/baseline.js';
import { aliasServingFailingVersion } from '../src/services/health/rules.js';
import config from '../src/config/index.js';

/**
 * The version-rollback action.
 *
 * Rolling an alias is the first action in this project that changes which *code* serves
 * traffic rather than how a function is configured, so the question "could this ever
 * point somewhere it should not" deserves to be answered by tests rather than by
 * reading. Nothing here touches AWS: every function under test is pure.
 */

const FN = config.lab.rollbackFunctionName;
const ALIAS = config.lab.rollbackAliasName;

function labResource(overrides = {}) {
  return {
    arn: `arn:aws:lambda:us-east-1:111122223333:function:${FN}`,
    id: `arn:aws:lambda:us-east-1:111122223333:function:${FN}`,
    name: FN,
    region: 'us-east-1',
    tags: {
      Project: 'ai-cloud-operations-engineer',
      Environment: 'lab',
      ManagedBy: 'aicoe',
    },
    ...overrides,
  };
}

const validRollback = {
  actionType: ACTION_TYPES.LAMBDA_ROLLBACK_ALIAS,
  parameters: { FunctionName: FN, Name: ALIAS, FunctionVersion: '1', RevisionId: 'rev-observed' },
  reversible: true,
};

/* ------------------------------------------------------------ the gate */

test('a well-formed rollback against the lab function passes every check', () => {
  const result = evaluateSafety({ resource: labResource(), ...validRollback });
  assert.equal(result.safe, true, `failed: ${result.failedChecks.join(', ')}`);
});

test('$LATEST is never a rollback target', () => {
  const result = evaluateSafety({
    resource: labResource(),
    ...validRollback,
    parameters: { ...validRollback.parameters, FunctionVersion: '$LATEST' },
  });
  assert.equal(result.safe, false);
  assert.ok(result.failedChecks.includes('action-parameters'));
});

test('a version that is not an explicitly published number is refused', () => {
  for (const version of ['0', '-1', '1.0', 'live', 'latest', '', ' 1', '1a', null, undefined, 1]) {
    const result = evaluateSafety({
      resource: labResource(),
      ...validRollback,
      parameters: { ...validRollback.parameters, FunctionVersion: version },
    });
    assert.equal(result.safe, false, `version ${JSON.stringify(version)} should be refused`);
    assert.ok(result.failedChecks.includes('action-parameters'));
  }
});

test('only genuinely published version numbers are accepted', () => {
  for (const good of ['1', '2', '17', '100']) assert.equal(isPublishedVersion(good), true, good);
  for (const bad of ['$LATEST', '0', '01', '', 'x', null, 3]) assert.equal(isPublishedVersion(bad), false, String(bad));
});

test('a rollback naming any other function is refused', () => {
  const result = evaluateSafety({
    resource: labResource({ name: 'aicoe-lab-function' }),
    ...validRollback,
    parameters: { ...validRollback.parameters, FunctionName: 'aicoe-lab-function' },
  });
  assert.equal(result.safe, false);
  assert.ok(result.failedChecks.includes('action-parameters'));
});

test('a production-looking function is refused by name, tags and parameters together', () => {
  const result = evaluateSafety({
    resource: labResource({ name: 'payments-api-production', tags: {} }),
    ...validRollback,
    parameters: { ...validRollback.parameters, FunctionName: 'payments-api-production' },
  });
  assert.equal(result.safe, false);
  for (const check of ['lab-membership', 'required-tags', 'action-parameters']) {
    assert.ok(result.failedChecks.includes(check), `expected ${check} to fail`);
  }
});

test('any alias other than the configured one is refused', () => {
  for (const alias of ['prod', 'LIVE', 'staging', '', null]) {
    const result = evaluateSafety({
      resource: labResource(),
      ...validRollback,
      parameters: { ...validRollback.parameters, Name: alias },
    });
    assert.equal(result.safe, false, `alias ${JSON.stringify(alias)} should be refused`);
  }
});

test('a rollback without an observed revision is refused', () => {
  for (const revision of [undefined, null, '', 42]) {
    const result = evaluateSafety({
      resource: labResource(),
      ...validRollback,
      parameters: { ...validRollback.parameters, RevisionId: revision },
    });
    assert.equal(result.safe, false, `revision ${JSON.stringify(revision)} should be refused`);
    assert.ok(result.failedChecks.includes('action-parameters'));
  }
});

test('each required tag is independently load-bearing for a rollback', () => {
  for (const key of ['Project', 'Environment', 'ManagedBy']) {
    const tags = { ...labResource().tags };
    delete tags[key];
    const result = evaluateSafety({ resource: labResource({ tags }), ...validRollback });
    assert.equal(result.safe, false, `missing ${key} should fail`);
    assert.ok(result.failedChecks.includes('required-tags'));
  }
});

/* -------------------------------------------------- allowlist integrity */

test('the rollback action is allowlisted, has an executor, and is reversible', () => {
  assert.equal(isAllowedActionType(ACTION_TYPES.LAMBDA_ROLLBACK_ALIAS), true);
  assert.equal(typeof executorFor(ACTION_TYPES.LAMBDA_ROLLBACK_ALIAS), 'function');
  assert.equal(REMEDIATION_REGISTRY['lambda-alias-serving-failing-version'].reversible, true);
});

test('the executor map still holds nothing the allowlist does not name', () => {
  for (const actionType of SUPPORTED_ACTION_TYPES) {
    assert.ok(isAllowedActionType(actionType), `${actionType} has an executor but is not allowlisted`);
  }
});

test('unknown actions and prototype keys still resolve to no executor', () => {
  for (const key of [
    'lambda:PublishVersion', 'lambda:DeleteAlias', 'lambda:DeleteFunction', 'lambda:rollback', '*',
    'constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf',
  ]) {
    assert.equal(executorFor(key), null, `${key} must not resolve to a function`);
    const result = evaluateSafety({ resource: labResource(), actionType: key, parameters: {}, reversible: true });
    assert.equal(result.safe, false);
  }
});

/* --------------------------------------------------- change computation */

function issueFor(overrides = {}) {
  return {
    metrics: {
      aliasName: ALIAS,
      aliasVersion: '2',
      knownGoodVersion: '1',
      aliasRevisionId: 'rev-observed',
      knownGoodRelease: 'v1-known-good',
      probePayload: { probe: true },
      ...overrides,
    },
  };
}

test('the change moves the alias to the baseline version and rolls back to the observed one', () => {
  const entry = REMEDIATION_REGISTRY['lambda-alias-serving-failing-version'];
  const change = entry.computeChange({ issue: issueFor(), resource: labResource() });

  assert.equal(change.supported, true);
  assert.deepEqual(change.currentState, { FunctionVersion: '2' });
  assert.deepEqual(change.desiredState, { FunctionVersion: '1' });
  assert.equal(change.parameters.RevisionId, 'rev-observed');
  assert.equal(change.rollbackParameters.FunctionVersion, '2', 'rollback must restore the observed version');
  assert.equal(change.probe.expectRelease, 'v1-known-good');
});

test('no change is proposed when the alias already serves the known-good version', () => {
  const entry = REMEDIATION_REGISTRY['lambda-alias-serving-failing-version'];
  const change = entry.computeChange({ issue: issueFor({ aliasVersion: '1' }), resource: labResource() });
  assert.equal(change.supported, false);
});

test('a baseline with no usable known-good version yields no action', () => {
  const entry = REMEDIATION_REGISTRY['lambda-alias-serving-failing-version'];
  for (const knownGood of [null, undefined, '$LATEST', '0', 'v1']) {
    const change = entry.computeChange({ issue: issueFor({ knownGoodVersion: knownGood }), resource: labResource() });
    assert.equal(change.supported, false, `knownGood ${JSON.stringify(knownGood)} should yield no action`);
  }
});

test('an alias pointing at $LATEST yields no action rather than a guess', () => {
  const entry = REMEDIATION_REGISTRY['lambda-alias-serving-failing-version'];
  const change = entry.computeChange({ issue: issueFor({ aliasVersion: '$LATEST' }), resource: labResource() });
  assert.equal(change.supported, false);
});

/* -------------------------------------------------------------- the rule */

function metricsFor({ invocations, errors, name = FN }) {
  return [{
    resource: { name, id: 'arn-x' },
    facts: {
      invocations: { available: invocations !== null, value: invocations, id: 'f:inv' },
      errors: { available: errors !== null, value: errors, id: 'f:err' },
    },
  }];
}

const deployment = {
  functionName: FN, functionId: 'arn-x', aliasName: ALIAS,
  aliasVersion: '2', knownGoodVersion: '1', aliasRevisionId: 'rev-observed',
  knownGoodRelease: 'v1-known-good', probePayload: { probe: true },
  aliasFactId: 'f:alias', knownGoodFactId: 'f:known',
};

test('the rule fires only when the error rate and the version mismatch both hold', () => {
  const issues = aliasServingFailingVersion.detect({
    lambdaMetrics: metricsFor({ invocations: 10, errors: 10 }),
    aliasDeployments: [deployment],
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'critical');
  assert.equal(issues[0].metrics.aliasVersion, '2');
  assert.equal(issues[0].metrics.knownGoodVersion, '1');
});

test('the rule stays silent when the alias already serves the known-good version', () => {
  const issues = aliasServingFailingVersion.detect({
    lambdaMetrics: metricsFor({ invocations: 10, errors: 10 }),
    aliasDeployments: [{ ...deployment, aliasVersion: '1' }],
  });
  assert.deepEqual(issues, []);
});

test('the rule stays silent without CloudWatch evidence, however wrong the version is', () => {
  for (const metrics of [
    metricsFor({ invocations: null, errors: null }),   // dormant lab
    metricsFor({ invocations: 10, errors: 0 }),        // healthy
    metricsFor({ invocations: 2, errors: 2 }),         // too few invocations to conclude
    metricsFor({ invocations: 100, errors: 1 }),       // below the rate threshold
  ]) {
    const issues = aliasServingFailingVersion.detect({ lambdaMetrics: metrics, aliasDeployments: [deployment] });
    assert.deepEqual(issues, [], 'absent or weak evidence must not produce a finding');
  }
});

test('the rule ignores a deployment whose function it has no metrics for', () => {
  const issues = aliasServingFailingVersion.detect({
    lambdaMetrics: metricsFor({ invocations: 10, errors: 10, name: 'some-other-function' }),
    aliasDeployments: [deployment],
  });
  assert.deepEqual(issues, []);
});

/* ------------------------------------------------- baseline and tamper */

function baselineDoc(overrides = {}) {
  return {
    issue_id: 'aicoe-lab-issue-006',
    target: { type: 'aws_lambda_alias', name: FN, function_name: FN, alias: ALIAS, attribute: 'FunctionVersion' },
    broken_value: '2',
    known_good: { version: '1', release: 'v1-known-good', probe_payload: { probe: true } },
    reset: { api: 'lambda:UpdateAlias' },
    ...overrides,
  };
}

test('the baseline maps onto the allowlisted restore action', () => {
  const { restorable, derived } = toRestoreTargets([baselineDoc()]);
  assert.equal(derived.length, 0);
  assert.equal(restorable[0].actionType, ACTION_TYPES.LAMBDA_ROLLBACK_ALIAS);
  assert.deepEqual(restorable[0].parameters, { FunctionName: FN, Name: ALIAS, FunctionVersion: '2' });
  assert.equal(restorable[0].expectedValue, '2', 'versions compare as strings');
});

test('a baseline declaring a different AWS API is skipped, not trusted', () => {
  const { restorable, derived } = toRestoreTargets([
    baselineDoc({ reset: { api: 'lambda:DeleteFunction' } }),
  ]);
  assert.deepEqual(restorable, [], 'a tampered baseline must not become a restore target');
  assert.equal(derived[0].mismatch, true);
});

test('a baseline cannot introduce an action the allowlist does not define', () => {
  const { restorable, derived } = toRestoreTargets([
    baselineDoc({ target: { type: 'aws_s3_bucket', name: 'x', attribute: 'Policy' } }),
  ]);
  assert.deepEqual(restorable, []);
  assert.equal(derived.length, 1);
});

test('a baseline with no known-good version yields no rollback context', () => {
  assert.equal(readRollbackBaseline([baselineDoc({ known_good: {} })]), null);
  assert.equal(readRollbackBaseline([]), null);
});

test('the committed issue-006 baseline is internally consistent', async () => {
  const fs = await import('node:fs/promises');
  const doc = JSON.parse(
    await fs.readFile(new URL('../../infrastructure/lab/baseline/issues/aicoe-lab-issue-006.json', import.meta.url), 'utf8'),
  );
  const rollback = readRollbackBaseline([doc]);

  assert.equal(rollback.functionName, FN);
  assert.equal(rollback.aliasName, ALIAS);
  assert.notEqual(rollback.knownGoodVersion, rollback.brokenVersion, 'broken and known-good must differ');
  assert.equal(isPublishedVersion(rollback.knownGoodVersion), true);
  assert.equal(isPublishedVersion(rollback.brokenVersion), true);
  // The reset parameters the engine derives must restore the broken version, not the fix.
  const { restorable } = toRestoreTargets([doc]);
  assert.equal(restorable[0].parameters.FunctionVersion, rollback.brokenVersion);
});

/* ------------------------------------------------ state-capture dispatch */

test('every registry entry names a service that state capture can actually read', () => {
  // The plan takes its service from the registry, not from the issue - an alias
  // rollback is detected on a function but acted on through the alias API. If those
  // ever diverge again, execution would read the wrong thing back and "verify" it.
  const supported = ['lambda', 'logs', 'lambda-alias'];
  for (const [ruleId, entry] of Object.entries(REMEDIATION_REGISTRY)) {
    assert.ok(supported.includes(entry.service), `${ruleId} names service "${entry.service}" with no capture branch`);
  }
});

test('state capture fails closed on a service it does not know', async () => {
  for (const service of ['nope', '', null, undefined, 'constructor', '__proto__']) {
    await assert.rejects(
      () => captureStateFor(service, 'aicoe-lab-rollback-function'),
      /No state capture defined/,
      `service ${JSON.stringify(service)} must throw rather than silently return`,
    );
  }
});

test('alias capture refuses to run without both a function and an alias name', async () => {
  const { captureLambdaAliasState } = await import('../src/services/remediation/executors.js');
  for (const args of [[undefined, 'live'], ['fn', undefined], [null, null], [1, 'live']]) {
    await assert.rejects(() => captureLambdaAliasState(...args), /requires a function name and an alias name/);
  }
});

test('the alias executor refuses an unpublished version before reaching AWS', async () => {
  const { applyLambdaAliasRollback } = await import('../src/services/remediation/executors.js');
  for (const version of ['$LATEST', '0', 'live', null, undefined, 1]) {
    await assert.rejects(
      () => applyLambdaAliasRollback({ FunctionName: FN, Name: ALIAS, FunctionVersion: version, RevisionId: 'r' }),
      /explicitly published version/,
      `version ${JSON.stringify(version)} must be refused`,
    );
  }
});

test('the alias executor refuses a missing function or alias before reaching AWS', async () => {
  const { applyLambdaAliasRollback } = await import('../src/services/remediation/executors.js');
  for (const args of [{ Name: ALIAS }, { FunctionName: FN }, {}]) {
    await assert.rejects(
      () => applyLambdaAliasRollback({ FunctionVersion: '1', RevisionId: 'r', ...args }),
      /requires FunctionName and Name/,
    );
  }
});

test('the probe refuses a missing function or alias before invoking anything', async () => {
  const { probeLambdaAlias } = await import('../src/services/remediation/executors.js');
  for (const args of [{ Name: ALIAS }, { FunctionName: FN }, {}]) {
    await assert.rejects(() => probeLambdaAlias(args), /requires FunctionName and Name/);
  }
});

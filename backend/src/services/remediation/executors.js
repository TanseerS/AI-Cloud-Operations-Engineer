import {
  UpdateFunctionConfigurationCommand,
  GetFunctionConfigurationCommand,
  GetAliasCommand,
  UpdateAliasCommand,
  InvokeCommand,
} from '@aws-sdk/client-lambda';
import {
  PutRetentionPolicyCommand,
  DeleteRetentionPolicyCommand,
  DescribeLogGroupsCommand,
} from '@aws-sdk/client-cloudwatch-logs';

import { getLambdaClient, getLogsClient } from '../aws/clients.js';
import { ACTION_TYPES, isPublishedVersion } from './registry.js';

/**
 * The only code in this application that changes AWS.
 *
 * Each permitted operation is its own named function with its own hardcoded AWS command.
 * There is deliberately no `executeAwsCommand(operation, params)` - a generic dispatcher
 * would make the set of possible mutations a runtime question, and the whole point of
 * this layer is that you can read the set off the page.
 *
 * Adding a capability means writing a function here and adding it to EXECUTORS. Nothing
 * else - no configuration, no model output, no request body - can introduce one.
 */

const LAMBDA_UPDATE_POLL_ATTEMPTS = 15;
const LAMBDA_UPDATE_POLL_INTERVAL_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Lambda applies configuration changes asynchronously. Reading straight back can return
 * the previous values, which would make verification report a false failure - or worse,
 * a false success on a rollback.
 */
async function waitForLambdaUpdate(functionName) {
  const client = getLambdaClient();
  for (let attempt = 0; attempt < LAMBDA_UPDATE_POLL_ATTEMPTS; attempt += 1) {
    const configuration = await client.send(
      new GetFunctionConfigurationCommand({ FunctionName: functionName }),
    );
    if (configuration.LastUpdateStatus !== 'InProgress') {
      return {
        settled: true,
        lastUpdateStatus: configuration.LastUpdateStatus,
        stateReason: configuration.StateReason ?? null,
        configuration,
      };
    }
    await sleep(LAMBDA_UPDATE_POLL_INTERVAL_MS);
  }
  return { settled: false, lastUpdateStatus: 'InProgress', configuration: null };
}

/* ------------------------------------------------------------------ capture */

export async function captureLambdaState(functionName) {
  const configuration = await getLambdaClient().send(
    new GetFunctionConfigurationCommand({ FunctionName: functionName }),
  );
  return {
    source: 'lambda:GetFunctionConfiguration',
    capturedAt: new Date().toISOString(),
    // Only what the supported actions can touch, plus the fields needed to judge the
    // result. Environment variable values are names-only elsewhere and are not read here
    // at all, so no secret can enter an audit record.
    MemorySize: configuration.MemorySize ?? null,
    Timeout: configuration.Timeout ?? null,
    Runtime: configuration.Runtime ?? null,
    State: configuration.State ?? null,
    LastUpdateStatus: configuration.LastUpdateStatus ?? null,
    LastModified: configuration.LastModified ?? null,
    LoggingConfig: configuration.LoggingConfig ?? null,
    RevisionId: configuration.RevisionId ?? null,
    // Names only, never values - a diff needs to know which keys are set, not what they hold.
    environmentVariableNames: Object.keys(configuration.Environment?.Variables ?? {}).sort(),
  };
}

export async function captureLogGroupState(logGroupName) {
  const response = await getLogsClient().send(
    new DescribeLogGroupsCommand({ logGroupNamePrefix: logGroupName }),
  );
  const group = (response.logGroups ?? []).find((entry) => entry.logGroupName === logGroupName);
  return {
    source: 'logs:DescribeLogGroups',
    capturedAt: new Date().toISOString(),
    exists: Boolean(group),
    // null is meaningful here: it means "never expires", not "unknown".
    retentionInDays: group ? (group.retentionInDays ?? null) : null,
    storedBytes: group?.storedBytes ?? null,
    logGroupClass: group?.logGroupClass ?? null,
  };
}

/**
 * An alias is an attribute of a function rather than a resource of its own, so the
 * alias name travels alongside the function name rather than inside it.
 */
export async function captureLambdaAliasState(functionName, aliasName) {
  if (typeof functionName !== 'string' || typeof aliasName !== 'string') {
    throw new Error('captureLambdaAliasState requires a function name and an alias name');
  }

  const alias = await getLambdaClient().send(
    new GetAliasCommand({ FunctionName: functionName, Name: aliasName }),
  );
  return {
    source: 'lambda:GetAlias',
    capturedAt: new Date().toISOString(),
    FunctionName: functionName,
    AliasName: alias.Name ?? null,
    // A string in the Lambda API, and compared as one everywhere in this codebase.
    FunctionVersion: alias.FunctionVersion ?? null,
    // The optimistic-concurrency token. Captured so a later mutation can prove the
    // alias has not moved since it was read.
    RevisionId: alias.RevisionId ?? null,
    AliasArn: alias.AliasArn ?? null,
  };
}

/**
 * @param parameters the plan's own parameters, for the services whose target needs more
 *   than a single name. Never caller input: by this point the parameters came from the
 *   registry or the lab baseline.
 */
export async function captureStateFor(service, targetName, parameters = {}) {
  switch (service) {
    case 'lambda':
      return captureLambdaState(targetName);
    case 'logs':
      return captureLogGroupState(targetName);
    case 'lambda-alias':
      return captureLambdaAliasState(targetName, parameters.Name);
    default:
      throw new Error(`No state capture defined for service "${service}"`);
  }
}

/* ----------------------------------------------------------------- executors */

/** lambda:update-memory - changes MemorySize and nothing else. */
export async function applyLambdaMemoryFix({ FunctionName, MemorySize }) {
  if (typeof FunctionName !== 'string' || !Number.isInteger(MemorySize)) {
    throw new Error('applyLambdaMemoryFix requires FunctionName and an integer MemorySize');
  }

  const response = await getLambdaClient().send(
    new UpdateFunctionConfigurationCommand({ FunctionName, MemorySize }),
  );
  const settled = await waitForLambdaUpdate(FunctionName);

  return {
    awsOperation: 'lambda:UpdateFunctionConfiguration',
    requested: { FunctionName, MemorySize },
    acceptedRevisionId: response.RevisionId ?? null,
    settled: settled.settled,
    lastUpdateStatus: settled.lastUpdateStatus,
    stateReason: settled.stateReason ?? null,
  };
}

/** lambda:update-timeout - changes Timeout and nothing else. */
export async function applyLambdaTimeoutFix({ FunctionName, Timeout }) {
  if (typeof FunctionName !== 'string' || !Number.isInteger(Timeout)) {
    throw new Error('applyLambdaTimeoutFix requires FunctionName and an integer Timeout');
  }

  const response = await getLambdaClient().send(
    new UpdateFunctionConfigurationCommand({ FunctionName, Timeout }),
  );
  const settled = await waitForLambdaUpdate(FunctionName);

  return {
    awsOperation: 'lambda:UpdateFunctionConfiguration',
    requested: { FunctionName, Timeout },
    acceptedRevisionId: response.RevisionId ?? null,
    settled: settled.settled,
    lastUpdateStatus: settled.lastUpdateStatus,
    stateReason: settled.stateReason ?? null,
  };
}

/**
 * lambda:update-environment - replaces the function's environment variable set.
 *
 * Used only to restore the baseline's recorded environment. Values are written, never
 * read back into an audit record, so nothing placed here can leak through the API.
 */
export async function applyLambdaEnvironmentFix({ FunctionName, Environment }) {
  const variables = Environment?.Variables;
  if (typeof FunctionName !== 'string' || typeof variables !== 'object' || variables === null) {
    throw new Error('applyLambdaEnvironmentFix requires FunctionName and Environment.Variables');
  }

  const response = await getLambdaClient().send(
    new UpdateFunctionConfigurationCommand({ FunctionName, Environment: { Variables: variables } }),
  );
  const settled = await waitForLambdaUpdate(FunctionName);

  return {
    awsOperation: 'lambda:UpdateFunctionConfiguration',
    // Names only. The values are deliberately not echoed.
    requested: { FunctionName, environmentVariableNames: Object.keys(variables) },
    acceptedRevisionId: response.RevisionId ?? null,
    settled: settled.settled,
    lastUpdateStatus: settled.lastUpdateStatus,
  };
}

/**
 * logs:update-retention - sets a retention policy, or removes one when restoring a group
 * that previously had none.
 */
export async function applyLogRetentionFix({ logGroupName, retentionInDays, operation }) {
  if (typeof logGroupName !== 'string') {
    throw new Error('applyLogRetentionFix requires a logGroupName');
  }

  if (operation === 'logs:DeleteRetentionPolicy') {
    await getLogsClient().send(new DeleteRetentionPolicyCommand({ logGroupName }));
    return {
      awsOperation: 'logs:DeleteRetentionPolicy',
      requested: { logGroupName },
      settled: true,
    };
  }

  if (!Number.isInteger(retentionInDays)) {
    throw new Error('applyLogRetentionFix requires an integer retentionInDays');
  }

  await getLogsClient().send(new PutRetentionPolicyCommand({ logGroupName, retentionInDays }));
  return {
    awsOperation: 'logs:PutRetentionPolicy',
    requested: { logGroupName, retentionInDays },
    settled: true,
  };
}

/**
 * lambda:rollback-alias - moves an alias between two already-published versions.
 *
 * It cannot publish a version and it cannot delete one: the only thing it changes is
 * which existing version the alias resolves to. RevisionId makes that change
 * conditional, so if the alias moved between approval and execution the call fails
 * rather than silently overwriting whatever happened in between.
 */
export async function applyLambdaAliasRollback({ FunctionName, Name, FunctionVersion, RevisionId }) {
  if (typeof FunctionName !== 'string' || typeof Name !== 'string') {
    throw new Error('applyLambdaAliasRollback requires FunctionName and Name');
  }
  if (!isPublishedVersion(FunctionVersion)) {
    throw new Error('applyLambdaAliasRollback requires an explicitly published version');
  }

  const response = await getLambdaClient().send(
    new UpdateAliasCommand({
      FunctionName,
      Name,
      FunctionVersion,
      // Omitted only when the caller could not observe one; the safety gate requires it
      // for a remediation, so in practice it is always present there.
      ...(RevisionId ? { RevisionId } : {}),
    }),
  );

  return {
    awsOperation: 'lambda:UpdateAlias',
    requested: { FunctionName, Name, FunctionVersion },
    usedRevisionId: RevisionId ?? null,
    acceptedRevisionId: response.RevisionId ?? null,
    aliasArn: response.AliasArn ?? null,
    settled: true,
  };
}

/**
 * The behaviour probe.
 *
 * Reading the alias back proves the pointer moved. It does not prove the code behind it
 * works - those are different claims, and only the second one is "recovered". So the
 * alias is invoked with a fixed, read-only payload and the response is checked against
 * the contract the baseline records.
 *
 * Deliberately narrow: it invokes one alias, sends no caller-supplied payload, and never
 * reads the function's environment or logs.
 */
export async function probeLambdaAlias({ FunctionName, Name, payload = { probe: true }, expectRelease = null }) {
  if (typeof FunctionName !== 'string' || typeof Name !== 'string') {
    throw new Error('probeLambdaAlias requires FunctionName and Name');
  }

  const response = await getLambdaClient().send(
    new InvokeCommand({
      FunctionName: `${FunctionName}:${Name}`,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );

  const raw = response.Payload ? Buffer.from(response.Payload).toString('utf8') : '';
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  // A handled error still arrives as a 200 with FunctionError set, so the status code
  // alone is not evidence of health.
  const functionError = response.FunctionError ?? null;
  let body = null;
  try {
    body = typeof parsed?.body === 'string' ? JSON.parse(parsed.body) : (parsed?.body ?? null);
  } catch {
    body = null;
  }

  const releaseServed = body?.release ?? null;
  const healthy =
    !functionError &&
    parsed?.statusCode === 200 &&
    body?.ok === true &&
    (expectRelease === null || releaseServed === expectRelease);

  return {
    invoked: true,
    statusCode: parsed?.statusCode ?? null,
    functionError,
    executedVersion: response.ExecutedVersion ?? null,
    releaseServed,
    expectedRelease: expectRelease,
    healthy,
    // Truncated: a probe response is lab output, but there is no reason to let an
    // arbitrary payload grow without bound in an audit record.
    responseExcerpt: raw.slice(0, 400),
  };
}

/**
 * Action type to executor. Keys are the literal allowlisted action types; there is no
 * lookup by a caller-supplied string and no default branch that would run something
 * unrecognised.
 */
const EXECUTORS = Object.freeze({
  [ACTION_TYPES.LAMBDA_UPDATE_MEMORY]: applyLambdaMemoryFix,
  [ACTION_TYPES.LAMBDA_UPDATE_TIMEOUT]: applyLambdaTimeoutFix,
  [ACTION_TYPES.LOGS_UPDATE_RETENTION]: applyLogRetentionFix,
  [ACTION_TYPES.LAMBDA_UPDATE_ENVIRONMENT]: applyLambdaEnvironmentFix,
  [ACTION_TYPES.LAMBDA_ROLLBACK_ALIAS]: applyLambdaAliasRollback,
});

export function executorFor(actionType) {
  return Object.prototype.hasOwnProperty.call(EXECUTORS, actionType) ? EXECUTORS[actionType] : null;
}

export const SUPPORTED_ACTION_TYPES = Object.keys(EXECUTORS);

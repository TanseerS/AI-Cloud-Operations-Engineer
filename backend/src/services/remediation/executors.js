import {
  UpdateFunctionConfigurationCommand,
  GetFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda';
import {
  PutRetentionPolicyCommand,
  DeleteRetentionPolicyCommand,
  DescribeLogGroupsCommand,
} from '@aws-sdk/client-cloudwatch-logs';

import { getLambdaClient, getLogsClient } from '../aws/clients.js';
import { ACTION_TYPES } from './registry.js';

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

export async function captureStateFor(service, targetName) {
  switch (service) {
    case 'lambda':
      return captureLambdaState(targetName);
    case 'logs':
      return captureLogGroupState(targetName);
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
 * Action type to executor. Keys are the literal allowlisted action types; there is no
 * lookup by a caller-supplied string and no default branch that would run something
 * unrecognised.
 */
const EXECUTORS = Object.freeze({
  [ACTION_TYPES.LAMBDA_UPDATE_MEMORY]: applyLambdaMemoryFix,
  [ACTION_TYPES.LAMBDA_UPDATE_TIMEOUT]: applyLambdaTimeoutFix,
  [ACTION_TYPES.LOGS_UPDATE_RETENTION]: applyLogRetentionFix,
});

export function executorFor(actionType) {
  return Object.prototype.hasOwnProperty.call(EXECUTORS, actionType) ? EXECUTORS[actionType] : null;
}

export const SUPPORTED_ACTION_TYPES = Object.keys(EXECUTORS);

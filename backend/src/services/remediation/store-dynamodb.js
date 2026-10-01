import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';

import config from '../../config/index.js';

/**
 * DynamoDB persistence for remediation plans.
 *
 * The plan store started as a JSON file, which is the right shape for one process with
 * its own disk. On Lambda it is not: /tmp belongs to a container, so a plan approved on
 * one container is invisible to the next, and the dashboard could show a fix as still
 * awaiting approval after it had already been applied and verified.
 *
 * That is a correctness problem rather than a durability nicety - the approval record and
 * the verification result are what the audit trail is made of - so plans live in a table
 * instead. On-demand billing with at most a handful of small items costs effectively
 * nothing and nothing runs when the app is idle.
 *
 * The whole set is read and written at once. That is wasteful in general and exactly
 * right here: there are never more than a dozen plans, one writer, and the merge rules in
 * store.js are defined over the full set.
 */

const TABLE = config.remediation.tableName;
const BATCH_LIMIT = 25;

let documentClient;
function getClient() {
  if (!documentClient) {
    documentClient = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: config.aws.region, maxAttempts: 3 }),
      // Plans carry nulls for "not applicable" (no rollback value, no caller note), and
      // those nulls are meaningful, so they must survive the round trip.
      { marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true } },
    );
  }
  return documentClient;
}

function chunk(items, size) {
  const out = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

export async function readAll() {
  const client = getClient();
  const plans = [];
  let startKey;

  do {
    const response = await client.send(
      new ScanCommand({ TableName: TABLE, ExclusiveStartKey: startKey }),
    );
    for (const item of response.Items ?? []) {
      if (item?.plan) plans.push(item.plan);
    }
    startKey = response.LastEvaluatedKey;
  } while (startKey);

  // Scan returns items in no useful order; planning order is what the UI reads.
  return plans.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export async function persist(plans) {
  const client = getClient();
  const keep = new Set(plans.map((plan) => plan.id));

  // Anything stored that is no longer in the set is gone, so a clear really clears.
  const stored = await client.send(new ScanCommand({ TableName: TABLE, ProjectionExpression: 'id' }));
  const deletions = (stored.Items ?? [])
    .map((item) => item.id)
    .filter((id) => !keep.has(id))
    .map((id) => ({ DeleteRequest: { Key: { id } } }));

  const writes = plans.map((plan) => ({ PutRequest: { Item: { id: plan.id, plan } } }));

  for (const batch of chunk([...writes, ...deletions], BATCH_LIMIT)) {
    let request = { RequestItems: { [TABLE]: batch } };
    // DynamoDB can decline part of a batch under throttling and hands back what it did
    // not take. At this volume it never should, but dropping a plan silently is not an
    // acceptable failure mode.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await client.send(new BatchWriteCommand(request));
      const unprocessed = response.UnprocessedItems?.[TABLE] ?? [];
      if (unprocessed.length === 0) break;
      request = { RequestItems: { [TABLE]: unprocessed } };
    }
  }
}

export const describeBackend = () => ({ backend: 'dynamodb', table: TABLE, durable: true });

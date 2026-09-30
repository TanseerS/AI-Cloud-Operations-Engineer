import {
  CostExplorerClient,
  GetCostAndUsageCommand,
} from '@aws-sdk/client-cost-explorer';

import { describeAwsError } from '../aws/clients.js';

/**
 * Cost Explorer access.
 *
 * Two things shape this module:
 *
 * 1. Cost Explorer is a global service reached through us-east-1, regardless of which
 *    region the workload runs in. Billing is account-wide, not regional.
 * 2. Every GetCostAndUsage request is billed at $0.01. That is cheap but not free, and
 *    a dashboard that refreshes on every page view would quietly meter itself, so the
 *    caller caches and this module counts its requests and reports them.
 */

const BILLING_REGION = 'us-east-1';

/** Charges only - credits, refunds and tax are read separately and reported apart. */
export const USAGE_ONLY_FILTER = {
  Dimensions: { Key: 'RECORD_TYPE', Values: ['Usage'] },
};

let client;
function getClient() {
  if (!client) client = new CostExplorerClient({ region: BILLING_REGION, maxAttempts: 3 });
  return client;
}

export function createRequestCounter() {
  return { count: 0 };
}

async function query(counter, input) {
  counter.count += 1;
  return getClient().send(new GetCostAndUsageCommand(input));
}

/** Daily spend by service for one window, charges only. */
export async function getDailyCostByService(counter, period) {
  const response = await query(counter, {
    TimePeriod: { Start: period.start, End: period.end },
    Granularity: 'DAILY',
    Metrics: ['UnblendedCost'],
    Filter: USAGE_ONLY_FILTER,
    GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
  });
  return response.ResultsByTime ?? [];
}

/** One window split by record type, so credits and tax are visible rather than netted away. */
export async function getRecordTypeTotals(counter, period) {
  const response = await query(counter, {
    TimePeriod: { Start: period.start, End: period.end },
    Granularity: 'MONTHLY',
    Metrics: ['UnblendedCost'],
    GroupBy: [{ Type: 'DIMENSION', Key: 'RECORD_TYPE' }],
  });
  return response.ResultsByTime ?? [];
}

/** Per-service charges for a window, used for the previous-period comparison. */
export async function getServiceTotals(counter, period) {
  const response = await query(counter, {
    TimePeriod: { Start: period.start, End: period.end },
    Granularity: 'MONTHLY',
    Metrics: ['UnblendedCost'],
    Filter: USAGE_ONLY_FILTER,
    GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
  });
  return response.ResultsByTime ?? [];
}

export { describeAwsError, BILLING_REGION };

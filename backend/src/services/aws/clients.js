import { LambdaClient } from '@aws-sdk/client-lambda';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { ApiGatewayV2Client } from '@aws-sdk/client-apigatewayv2';
import { SSMClient } from '@aws-sdk/client-ssm';
import { ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api';
import { IAMClient } from '@aws-sdk/client-iam';

import config from '../../config/index.js';

/**
 * AWS SDK clients, created once per process.
 *
 * Nothing here passes credentials. Each client resolves them at call time from the
 * default provider chain - shared config, environment, or the instance/task role in
 * deployment - so no key material is ever held in application state or in the repo.
 */

const SHARED = {
  region: config.aws.region,
  maxAttempts: 3,
};

function memoize(factory) {
  let instance;
  return () => {
    if (!instance) instance = factory();
    return instance;
  };
}

export const getLambdaClient = memoize(() => new LambdaClient(SHARED));
export const getLogsClient = memoize(() => new CloudWatchLogsClient(SHARED));
export const getApiGatewayClient = memoize(() => new ApiGatewayV2Client(SHARED));
export const getSsmClient = memoize(() => new SSMClient(SHARED));
export const getTaggingClient = memoize(() => new ResourceGroupsTaggingAPIClient(SHARED));
// IAM is global; us-east-1 is its canonical endpoint.
export const getIamClient = memoize(() => new IAMClient({ ...SHARED, region: 'us-east-1' }));

/** Normalises the many shapes AWS uses for tags into a plain object. */
export function toTagMap(tags) {
  if (!tags) return {};
  if (Array.isArray(tags)) {
    return Object.fromEntries(
      tags.map((tag) => [tag.Key ?? tag.key, tag.Value ?? tag.value]).filter(([key]) => key),
    );
  }
  return { ...tags };
}

/** Turns an SDK failure into something safe to put in an API response. */
export function describeAwsError(error) {
  return {
    name: error?.name ?? 'Error',
    message: error?.message ?? 'Unknown AWS error',
    code: error?.Code ?? error?.$metadata?.httpStatusCode ?? null,
    retryable: Boolean(error?.$retryable?.throttling),
  };
}

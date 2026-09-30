import {
  ListFunctionsCommand,
  GetFunctionConfigurationCommand,
  ListTagsCommand,
} from '@aws-sdk/client-lambda';

import config from '../../config/index.js';
import { getLambdaClient, describeAwsError } from '../aws/clients.js';
import { classifyResource, resolveTags } from '../aws/lab-filter.js';

export const service = 'lambda';
export const label = 'Lambda';
export const resourceType = 'AWS::Lambda::Function';

function health(configuration) {
  if (configuration.State === 'Active' && configuration.LastUpdateStatus !== 'Failed') {
    return { level: 'healthy', label: configuration.State };
  }
  if (configuration.State === 'Failed' || configuration.LastUpdateStatus === 'Failed') {
    return { level: 'failing', label: configuration.StateReason || 'Failed' };
  }
  return { level: 'unknown', label: configuration.State ?? 'Unknown' };
}

export async function collect(index) {
  const client = getLambdaClient();
  const warnings = [];
  const candidates = [];

  let marker;
  do {
    const page = await client.send(new ListFunctionsCommand({ Marker: marker, MaxItems: 50 }));
    for (const fn of page.Functions ?? []) {
      const match = classifyResource({ arn: fn.FunctionArn, name: fn.FunctionName }, index);
      if (match.isLabResource) candidates.push({ fn, match });
    }
    marker = page.NextMarker;
  } while (marker);

  // Detail calls happen only for lab resources, never for the rest of the account.
  const resources = await Promise.all(
    candidates.map(async ({ fn, match }) => {
      let configuration = fn;
      try {
        configuration = await client.send(
          new GetFunctionConfigurationCommand({ FunctionName: fn.FunctionName }),
        );
      } catch (error) {
        warnings.push({
          resource: fn.FunctionName,
          message: `Could not read live configuration: ${describeAwsError(error).message}`,
        });
      }

      let tags = resolveTags({ arn: fn.FunctionArn }, index);
      if (Object.keys(tags).length === 0) {
        try {
          const response = await client.send(new ListTagsCommand({ Resource: fn.FunctionArn }));
          tags = response.Tags ?? {};
        } catch (error) {
          warnings.push({
            resource: fn.FunctionName,
            message: `Could not read tags: ${describeAwsError(error).message}`,
          });
        }
      }

      return {
        id: fn.FunctionArn,
        service,
        type: resourceType,
        name: fn.FunctionName,
        arn: fn.FunctionArn,
        region: config.aws.region,
        status: health(configuration),
        matchedBy: match.reasons,
        tags,
        attributes: {
          runtime: configuration.Runtime ?? null,
          handler: configuration.Handler ?? null,
          memorySizeMb: configuration.MemorySize ?? null,
          timeoutSeconds: configuration.Timeout ?? null,
          ephemeralStorageMb: configuration.EphemeralStorage?.Size ?? null,
          architectures: configuration.Architectures ?? [],
          codeSizeBytes: configuration.CodeSize ?? null,
          state: configuration.State ?? null,
          lastUpdateStatus: configuration.LastUpdateStatus ?? null,
          lastModified: configuration.LastModified ?? null,
          roleArn: configuration.Role ?? null,
          logGroup: configuration.LoggingConfig?.LogGroup ?? `/aws/lambda/${fn.FunctionName}`,
          // 'configuration' when the function names its log group explicitly, 'default'
          // when AWS's documented naming rule is what determines it.
          logGroupSource: configuration.LoggingConfig?.LogGroup ? 'configuration' : 'default',
          // Names only. Environment variable values can hold secrets and are never returned.
          environmentVariableNames: Object.keys(configuration.Environment?.Variables ?? {}),
        },
      };
    }),
  );

  return { resources, warnings };
}

export default { service, label, resourceType, collect };

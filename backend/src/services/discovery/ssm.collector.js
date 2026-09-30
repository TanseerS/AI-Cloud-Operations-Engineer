import { DescribeParametersCommand, ListTagsForResourceCommand } from '@aws-sdk/client-ssm';

import config from '../../config/index.js';
import { getSsmClient, toTagMap, describeAwsError } from '../aws/clients.js';
import { classifyResource, resolveTags } from '../aws/lab-filter.js';

export const service = 'ssm';
export const label = 'SSM Parameter Store';
export const resourceType = 'AWS::SSM::Parameter';

/**
 * DescribeParameters is used rather than GetParametersByPath on purpose: it returns
 * metadata only. The parameter values are never requested, so they cannot leak into a
 * response, a log line, or an error message.
 */
export async function collect(index) {
  const client = getSsmClient();
  const warnings = [];
  const candidates = [];

  let nextToken;
  do {
    const page = await client.send(
      new DescribeParametersCommand({
        ParameterFilters: [
          { Key: 'Path', Option: 'Recursive', Values: [`/${config.aws.labPrefix}`] },
        ],
        MaxResults: 50,
        NextToken: nextToken,
      }),
    );
    for (const parameter of page.Parameters ?? []) {
      const arn =
        parameter.ARN ??
        `arn:aws:ssm:${config.aws.region}:*:parameter${parameter.Name}`;
      const match = classifyResource({ arn: parameter.ARN, name: parameter.Name }, index);
      if (match.isLabResource) candidates.push({ parameter, arn, match });
    }
    nextToken = page.NextToken;
  } while (nextToken);

  const resources = await Promise.all(
    candidates.map(async ({ parameter, arn, match }) => {
      let tags = resolveTags({ arn: parameter.ARN }, index);
      if (Object.keys(tags).length === 0) {
        try {
          const response = await client.send(
            new ListTagsForResourceCommand({ ResourceType: 'Parameter', ResourceId: parameter.Name }),
          );
          tags = toTagMap(response.TagList);
        } catch (error) {
          warnings.push({
            resource: parameter.Name,
            message: `Could not read tags: ${describeAwsError(error).message}`,
          });
        }
      }

      return {
        id: arn,
        service,
        type: resourceType,
        name: parameter.Name,
        arn: parameter.ARN ?? null,
        region: config.aws.region,
        status:
          parameter.Type === 'SecureString'
            ? { level: 'unknown', label: 'SecureString' }
            : { level: 'healthy', label: parameter.Type ?? 'String' },
        matchedBy: match.reasons,
        tags,
        attributes: {
          parameterType: parameter.Type ?? null,
          tier: parameter.Tier ?? null,
          version: parameter.Version ?? null,
          dataType: parameter.DataType ?? null,
          description: parameter.Description ?? null,
          lastModified: parameter.LastModifiedDate
            ? new Date(parameter.LastModifiedDate).toISOString()
            : null,
          // Deliberately absent: the parameter value. Discovery never reads it.
          valueExposed: false,
        },
      };
    }),
  );

  return { resources, warnings };
}

export default { service, label, resourceType, collect };

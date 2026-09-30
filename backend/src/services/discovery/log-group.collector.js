import {
  DescribeLogGroupsCommand,
  ListTagsForResourceCommand,
} from '@aws-sdk/client-cloudwatch-logs';

import config from '../../config/index.js';
import { getLogsClient, describeAwsError } from '../aws/clients.js';
import { classifyResource, resolveTags } from '../aws/lab-filter.js';

export const service = 'logs';
export const label = 'CloudWatch Logs';
export const resourceType = 'AWS::Logs::LogGroup';

/** DescribeLogGroups returns an ARN suffixed with ":*"; the tag index stores it without. */
function canonicalArn(arn) {
  return typeof arn === 'string' && arn.endsWith(':*') ? arn.slice(0, -2) : arn;
}

export async function collect(index) {
  const client = getLogsClient();
  const warnings = [];
  const candidates = [];

  let nextToken;
  do {
    const page = await client.send(new DescribeLogGroupsCommand({ nextToken, limit: 50 }));
    for (const group of page.logGroups ?? []) {
      const arn = canonicalArn(group.arn);
      const match = classifyResource({ arn, name: group.logGroupName }, index);
      if (match.isLabResource) candidates.push({ group, arn, match });
    }
    nextToken = page.nextToken;
  } while (nextToken);

  const resources = await Promise.all(
    candidates.map(async ({ group, arn, match }) => {
      let tags = resolveTags({ arn }, index);
      if (Object.keys(tags).length === 0) {
        try {
          const response = await client.send(new ListTagsForResourceCommand({ resourceArn: arn }));
          tags = response.tags ?? {};
        } catch (error) {
          warnings.push({
            resource: group.logGroupName,
            message: `Could not read tags: ${describeAwsError(error).message}`,
          });
        }
      }

      const retention = group.retentionInDays ?? null;

      return {
        id: arn ?? group.logGroupName,
        service,
        type: resourceType,
        name: group.logGroupName,
        arn: arn ?? null,
        region: config.aws.region,
        status:
          retention === null
            ? { level: 'warning', label: 'Never expires' }
            : { level: 'healthy', label: `${retention}d retention` },
        matchedBy: match.reasons,
        tags,
        attributes: {
          // null means "never expire" in the CloudWatch API, which is itself a finding.
          retentionInDays: retention,
          storedBytes: group.storedBytes ?? null,
          creationTime: group.creationTime ? new Date(group.creationTime).toISOString() : null,
          metricFilterCount: group.metricFilterCount ?? 0,
          logGroupClass: group.logGroupClass ?? null,
        },
      };
    }),
  );

  return { resources, warnings };
}

export default { service, label, resourceType, collect };

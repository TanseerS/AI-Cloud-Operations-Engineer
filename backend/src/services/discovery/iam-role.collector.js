import {
  ListRolesCommand,
  ListRolePoliciesCommand,
  ListAttachedRolePoliciesCommand,
  ListRoleTagsCommand,
} from '@aws-sdk/client-iam';

import config from '../../config/index.js';
import { getIamClient, toTagMap, describeAwsError } from '../aws/clients.js';
import { classifyResource } from '../aws/lab-filter.js';

export const service = 'iam';
export const label = 'IAM Roles';
export const resourceType = 'AWS::IAM::Role';

/**
 * IAM is global and is not indexed by the Resource Groups Tagging API, so these roles
 * are found by the naming convention and confirmed by their own tags.
 *
 * Policy documents are deliberately not returned - only the names of the policies
 * attached, which is what an operator needs to reason about permissions.
 */
export async function collect(index) {
  const client = getIamClient();
  const warnings = [];
  const candidates = [];

  let marker;
  do {
    const page = await client.send(new ListRolesCommand({ Marker: marker, MaxItems: 100 }));
    for (const role of page.Roles ?? []) {
      const match = classifyResource({ arn: role.Arn, name: role.RoleName }, index);
      if (match.isLabResource) candidates.push({ role, match });
    }
    marker = page.IsTruncated ? page.Marker : undefined;
  } while (marker);

  const resources = await Promise.all(
    candidates.map(async ({ role, match }) => {
      // ListRoles omits tags entirely, so they need their own call per matched role.
      const [inline, attached, roleTags] = await Promise.all(
        [
          client.send(new ListRolePoliciesCommand({ RoleName: role.RoleName })),
          client.send(new ListAttachedRolePoliciesCommand({ RoleName: role.RoleName })),
          client.send(new ListRoleTagsCommand({ RoleName: role.RoleName })),
        ].map((promise) =>
          promise.catch((error) => {
            warnings.push({
              resource: role.RoleName,
              message: `Could not read role detail: ${describeAwsError(error).message}`,
            });
            return null;
          }),
        ),
      );

      return {
        id: role.Arn,
        service,
        type: resourceType,
        name: role.RoleName,
        arn: role.Arn,
        region: 'global',
        status: { level: 'healthy', label: 'Active' },
        matchedBy: match.reasons,
        tags: toTagMap(roleTags?.Tags ?? role.Tags),
        attributes: {
          path: role.Path ?? null,
          description: role.Description ?? null,
          createdDate: role.CreateDate ? new Date(role.CreateDate).toISOString() : null,
          maxSessionDurationSeconds: role.MaxSessionDuration ?? null,
          // Names only; policy documents are never returned.
          inlinePolicyNames: inline?.PolicyNames ?? [],
          attachedPolicyNames: (attached?.AttachedPolicies ?? []).map((p) => p.PolicyName),
        },
      };
    }),
  );

  return { resources, warnings };
}

export default { service, label, resourceType, collect };

# AWS resource discovery

`GET /api/v1/infrastructure/resources`

Returns the live inventory of AWS resources belonging to this lab. Every value comes from
a real AWS API call at request time - nothing is cached, seeded or mocked.

## Services covered

| Collector | AWS calls | Key data returned |
|---|---|---|
| Lambda | `ListFunctions`, `GetFunctionConfiguration`, `ListTags` | runtime, memory, timeout, state, last modified, role, log group, tags |
| CloudWatch Logs | `DescribeLogGroups`, `ListTagsForResource` | retention, stored bytes, creation time, tags |
| API Gateway | `GetApis`, `GetRoutes`, `GetStages`, `GetIntegrations` | endpoint, protocol, routes, stages, integration targets and timeouts |
| SSM Parameter Store | `DescribeParameters`, `ListTagsForResource` | name, type, tier, version, description - **never the value** |
| IAM | `ListRoles`, `ListRoleTags`, `ListRolePolicies`, `ListAttachedRolePolicies` | path, created date, policy names - **never policy documents** |

Every command is `List`, `Describe` or `Get`. Discovery cannot modify anything.

## Adding a service

Write one module under `backend/src/services/discovery/` exporting `service`, `label`,
`resourceType` and `collect(index)`, then add it to the array in `discovery/index.js`.
Nothing else changes: the orchestrator, error handling, summary counts and the frontend
service cards all adapt. Give the frontend an entry in
`frontend/src/components/infrastructure/presentation.js` to control its icon and the facts
shown on a collapsed row; an unknown service still renders without one.

## The lab filter

`backend/src/services/aws/lab-filter.js` is the single answer to "is this ours?", so the
boundary is one file rather than a rule repeated in every collector.

Two signals, in order of trust:

1. **Tags** - `Project=ai-cloud-operations-engineer`. One call to the Resource Groups
   Tagging API answers this for every service at once, so the common path costs no
   per-resource lookups.
2. **Naming convention** - `aicoe-lab-*`, `/aicoe-lab/*`, `/aws/lambda/aicoe-lab-*`. The
   tag index is eventually consistent, and IAM is not indexed by it at all.

Each returned resource carries `matchedBy`, so an unexpected inclusion can be explained
rather than guessed at. The match is deliberately strict: `aicoe-labrador` does not match.

## Data deliberately not returned

- SSM parameter **values**. `DescribeParameters` is used instead of `GetParametersByPath`
  precisely so the values are never fetched and cannot leak into a response, a log line or
  an error message.
- Lambda environment variable **values**. Only the variable names are returned.
- IAM **policy documents**. Only policy names.

## Partial failure

One unreachable service degrades its own slice and nothing else. The response is still
`200` with:

```json
{
  "partial": true,
  "summary": { "servicesQueried": 5, "servicesSucceeded": 4, "servicesFailed": 1 },
  "services": [ { "service": "ssm", "status": "failed", "error": { "name": "...", "message": "..." } } ],
  "errors": [ { "service": "ssm", "message": "..." } ]
}
```

A caller can always tell "there are no resources" apart from "we could not look". The
frontend renders the three cases differently: a warning banner naming the failed services
with the rest of the inventory intact, a full-page error with a retry when nothing could
be reached, and an empty state when AWS answered but owns nothing matching the filter.

## Response shape

```
discoveredAt, region, durationMs, partial
filter   { tagKey, tagValue, namingPrefix, tagIndexAvailable, taggedResourcesInAccount }
summary  { totalResources, byService, byStatus, servicesQueried, servicesSucceeded, servicesFailed }
services [ { service, label, resourceType, status, resourceCount, durationMs, resources[], warnings[], error } ]
errors   [ ... ]
```

Each resource: `id, service, type, name, arn, region, status{level,label}, matchedBy[], tags{}, attributes{}`.

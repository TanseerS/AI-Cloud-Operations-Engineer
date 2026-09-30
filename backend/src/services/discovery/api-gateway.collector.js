import {
  GetApisCommand,
  GetRoutesCommand,
  GetStagesCommand,
  GetIntegrationsCommand,
} from '@aws-sdk/client-apigatewayv2';

import config from '../../config/index.js';
import { getApiGatewayClient, toTagMap, describeAwsError } from '../aws/clients.js';
import { classifyResource, resolveTags } from '../aws/lab-filter.js';

export const service = 'apigateway';
export const label = 'API Gateway';
export const resourceType = 'AWS::ApiGatewayV2::Api';

/** An integration URI embeds the target Lambda ARN; both halves are worth keeping. */
function integrationTarget(uri) {
  if (typeof uri !== 'string') return { name: null, arn: null };
  const arnMatch = uri.match(/(arn:aws[a-z-]*:lambda:[^/]+)/);
  const nameMatch = uri.match(/function:([^/:]+)/);
  return { name: nameMatch ? nameMatch[1] : uri, arn: arnMatch ? arnMatch[1] : null };
}

export async function collect(index) {
  const client = getApiGatewayClient();
  const warnings = [];
  const candidates = [];

  let nextToken;
  do {
    const page = await client.send(new GetApisCommand({ NextToken: nextToken, MaxResults: '50' }));
    for (const api of page.Items ?? []) {
      const arn = `arn:aws:apigateway:${config.aws.region}::/apis/${api.ApiId}`;
      const match = classifyResource({ arn, name: api.Name, tags: api.Tags }, index);
      if (match.isLabResource) candidates.push({ api, arn, match });
    }
    nextToken = page.NextToken;
  } while (nextToken);

  const resources = await Promise.all(
    candidates.map(async ({ api, arn, match }) => {
      const [routes, stages, integrations] = await Promise.all(
        [
          client.send(new GetRoutesCommand({ ApiId: api.ApiId })),
          client.send(new GetStagesCommand({ ApiId: api.ApiId })),
          client.send(new GetIntegrationsCommand({ ApiId: api.ApiId })),
        ].map((promise) =>
          promise.catch((error) => {
            warnings.push({
              resource: api.Name,
              message: `Could not read sub-resources: ${describeAwsError(error).message}`,
            });
            return null;
          }),
        ),
      );

      const integrationList = (integrations?.Items ?? []).map((item) => ({
        integrationId: item.IntegrationId,
        type: item.IntegrationType,
        target: integrationTarget(item.IntegrationUri).name,
        targetArn: integrationTarget(item.IntegrationUri).arn,
        timeoutMs: item.TimeoutInMillis ?? null,
        payloadFormatVersion: item.PayloadFormatVersion ?? null,
      }));

      const stageList = (stages?.Items ?? []).map((item) => ({
        name: item.StageName,
        autoDeploy: Boolean(item.AutoDeploy),
        throttleRateLimit: item.DefaultRouteSettings?.ThrottlingRateLimit ?? null,
        throttleBurstLimit: item.DefaultRouteSettings?.ThrottlingBurstLimit ?? null,
        hasAccessLogging: Boolean(item.AccessLogSettings?.DestinationArn),
      }));

      const routeList = (routes?.Items ?? []).map((item) => ({
        routeKey: item.RouteKey,
        target: item.Target ?? null,
        authorizationType: item.AuthorizationType ?? 'NONE',
      }));

      return {
        id: api.ApiId,
        service,
        type: resourceType,
        name: api.Name,
        arn,
        region: config.aws.region,
        status: routeList.length
          ? { level: 'healthy', label: `${routeList.length} route${routeList.length === 1 ? '' : 's'}` }
          : { level: 'warning', label: 'No routes' },
        matchedBy: match.reasons,
        tags: resolveTags({ arn, tags: api.Tags }, index) || toTagMap(api.Tags),
        attributes: {
          apiId: api.ApiId,
          protocol: api.ProtocolType ?? null,
          endpoint: api.ApiEndpoint ?? null,
          createdDate: api.CreatedDate ? new Date(api.CreatedDate).toISOString() : null,
          routeCount: routeList.length,
          routes: routeList,
          stages: stageList,
          integrations: integrationList,
        },
      };
    }),
  );

  return { resources, warnings };
}

export default { service, label, resourceType, collect };

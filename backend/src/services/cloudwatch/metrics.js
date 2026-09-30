import { GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';

import { getMetricsClient, describeAwsError } from '../aws/clients.js';

/**
 * CloudWatch metrics.
 *
 * Everything goes through one GetMetricData call rather than a GetMetricStatistics per
 * series: it is a single request regardless of how many resources were discovered, and
 * it returns a per-query status so an absent metric is distinguishable from a zero.
 *
 * That distinction matters here. Per-function ConcurrentExecutions only exists when a
 * function has reserved concurrency, so for most functions CloudWatch has nothing to
 * return - which is not the same as "concurrency was zero".
 */

export const LAMBDA_METRICS = [
  { key: 'invocations', name: 'Invocations', stat: 'Sum', unit: 'count' },
  { key: 'errors', name: 'Errors', stat: 'Sum', unit: 'count' },
  { key: 'throttles', name: 'Throttles', stat: 'Sum', unit: 'count' },
  { key: 'durationAvg', name: 'Duration', stat: 'Average', unit: 'ms' },
  { key: 'durationMax', name: 'Duration', stat: 'Maximum', unit: 'ms' },
  { key: 'concurrentExecutions', name: 'ConcurrentExecutions', stat: 'Maximum', unit: 'count' },
];

export const API_METRICS = [
  { key: 'count', name: 'Count', stat: 'Sum', unit: 'count' },
  { key: 'status5xx', name: '5xx', stat: 'Sum', unit: 'count' },
  { key: 'status4xx', name: '4xx', stat: 'Sum', unit: 'count' },
  { key: 'latencyAvg', name: 'Latency', stat: 'Average', unit: 'ms' },
  { key: 'latencyMax', name: 'Latency', stat: 'Maximum', unit: 'ms' },
  { key: 'integrationLatencyAvg', name: 'IntegrationLatency', stat: 'Average', unit: 'ms' },
];

// GetMetricData accepts at most 500 queries per request; stay clear of the edge.
const MAX_QUERIES_PER_REQUEST = 400;

/** CloudWatch query ids must match /^[a-z][a-zA-Z0-9_]*$/. */
function queryId(prefix, index, key) {
  return `${prefix}${index}_${key.replace(/[^a-zA-Z0-9_]/g, '')}`;
}

export function buildQueries({ lambdas, apis, periodSeconds }) {
  const queries = [];
  const index = new Map();

  lambdas.forEach((fn, position) => {
    for (const metric of LAMBDA_METRICS) {
      const id = queryId('lam', position, `${metric.key}`);
      index.set(id, { target: fn, scope: 'lambda', metric });
      queries.push({
        Id: id,
        Label: `${fn.name}|${metric.key}`,
        ReturnData: true,
        MetricStat: {
          Metric: {
            Namespace: 'AWS/Lambda',
            MetricName: metric.name,
            Dimensions: [{ Name: 'FunctionName', Value: fn.name }],
          },
          Period: periodSeconds,
          Stat: metric.stat,
        },
      });
    }
  });

  apis.forEach((api, position) => {
    for (const metric of API_METRICS) {
      const id = queryId('api', position, `${metric.key}`);
      index.set(id, { target: api, scope: 'apigateway', metric });
      queries.push({
        Id: id,
        Label: `${api.name}|${metric.key}`,
        ReturnData: true,
        MetricStat: {
          Metric: {
            Namespace: 'AWS/ApiGateway',
            MetricName: metric.name,
            Dimensions: [{ Name: 'ApiId', Value: api.attributes?.apiId ?? api.id }],
          },
          Period: periodSeconds,
          Stat: metric.stat,
        },
      });
    }
  });

  return { queries, index };
}

export async function collectMetrics({ lambdas, apis, window }) {
  const { queries, index } = buildQueries({ lambdas, apis, periodSeconds: window.periodSeconds });
  if (queries.length === 0) return { series: new Map(), warnings: [], requestCount: 0 };

  const client = getMetricsClient();
  const series = new Map();
  const warnings = [];
  let requestCount = 0;

  // GetMetricData accepts at most 500 queries per request.
  for (let offset = 0; offset < queries.length; offset += MAX_QUERIES_PER_REQUEST) {
    const batch = queries.slice(offset, offset + MAX_QUERIES_PER_REQUEST);
    let nextToken;
    do {
      requestCount += 1;
      const response = await client.send(
        new GetMetricDataCommand({
          MetricDataQueries: batch,
          StartTime: new Date(window.start),
          EndTime: new Date(window.end),
          ScanBy: 'TimestampAscending',
          NextToken: nextToken,
        }),
      );

      for (const result of response.MetricDataResults ?? []) {
        const meta = index.get(result.Id);
        if (!meta) continue;
        const existing = series.get(result.Id) ?? {
          ...meta,
          timestamps: [],
          values: [],
          statusCode: result.StatusCode,
        };
        existing.timestamps.push(...(result.Timestamps ?? []).map((t) => new Date(t).toISOString()));
        existing.values.push(...(result.Values ?? []));
        existing.statusCode = result.StatusCode ?? existing.statusCode;
        series.set(result.Id, existing);
      }

      for (const message of response.Messages ?? []) {
        warnings.push({ code: message.Code, message: message.Value });
      }
      nextToken = response.NextToken;
    } while (nextToken);
  }

  return { series, warnings, requestCount };
}

export { describeAwsError };

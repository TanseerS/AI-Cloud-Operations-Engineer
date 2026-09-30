import config from '../config/index.js';
import { describeAwsError } from './aws/clients.js';
import { discoverResources } from './discovery.service.js';
import { buildGraph } from './architecture/graph.js';
import { collectMetrics } from './cloudwatch/metrics.js';
import { collectLogInsights } from './cloudwatch/logs.js';
import { makeFact, summarise } from './health/facts.js';
import { RULES, SEVERITY_ORDER } from './health/rules.js';

/**
 * Health analysis.
 *
 * Collects observations from CloudWatch and the discovery inventory, then runs the
 * deterministic rule set over them. The response keeps facts and issues apart: facts
 * are what AWS reported, issues are what the rules concluded, and every issue cites the
 * facts it rests on.
 *
 * No model is involved at this stage. The same facts always produce the same findings.
 */

const DEFAULT_WINDOW_HOURS = 24;
const CACHE_TTL_MS = 60 * 1000;
/**
 * Score penalties, capped per severity class.
 *
 * Without the caps a handful of critical findings pins the score at zero and every
 * further finding is invisible - the score stops carrying information exactly when
 * there is most to say. Capping each class keeps the number responsive while still
 * letting criticals dominate.
 */
const SEVERITY_PENALTY = {
  critical: { each: 26, cap: 60 },
  high: { each: 14, cap: 24 },
  medium: { each: 6, cap: 12 },
  low: { each: 2, cap: 6 },
  info: { each: 0, cap: 0 },
};

let cache = null;

const slug = (value) =>
  String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

function buildWindow(hours) {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600 * 1000);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    hours,
    // One point per hour: enough shape for a sparkline, few enough to keep responses small.
    periodSeconds: 3600,
  };
}

function metricFact({ id, resource, service, label, key, entry, unit, window }) {
  const summary = summarise(entry);
  return makeFact({
    id,
    kind: 'metric',
    label,
    value: summary.value,
    unit,
    resourceId: resource.id,
    resourceName: resource.name,
    service,
    source: `cloudwatch:GetMetricData ${entry?.metric?.name ?? key} (${entry?.metric?.stat ?? 'Sum'})`,
    window,
    series: summary.series ?? null,
    available: summary.available,
    note: summary.available
      ? null
      : 'CloudWatch returned no datapoints for this metric in the window. This is not the same as a value of zero.',
  });
}

export async function getHealthAnalysis({ hours = DEFAULT_WINDOW_HOURS, force = false } = {}) {
  if (!force && cache && cache.hours === hours && Date.now() - cache.at < CACHE_TTL_MS) {
    return { ...cache.payload, meta: { ...cache.payload.meta, cached: true } };
  }

  const window = buildWindow(hours);
  const warnings = [];
  const errors = [];

  const inventory = await discoverResources();
  const graph = buildGraph(inventory);

  const resources = (inventory.services ?? [])
    .filter((entry) => entry.status !== 'failed')
    .flatMap((entry) => entry.resources ?? []);

  const lambdas = resources.filter((resource) => resource.service === 'lambda');
  const apis = resources.filter((resource) => resource.service === 'apigateway');
  const logGroups = resources.filter((resource) => resource.service === 'logs');

  if (inventory.partial) {
    warnings.push({
      stage: 'discovery',
      message: 'Resource discovery was partial, so some resources may be missing from this analysis.',
    });
  }

  let metrics = { series: new Map(), warnings: [], requestCount: 0 };
  try {
    metrics = await collectMetrics({ lambdas, apis, window });
    for (const warning of metrics.warnings) warnings.push({ stage: 'metrics', ...warning });
  } catch (error) {
    const described = describeAwsError(error);
    errors.push({ stage: 'metrics', ...described });
    warnings.push({ stage: 'metrics', message: `CloudWatch metrics unavailable: ${described.message}` });
  }

  let logs = { byLogGroup: new Map(), warnings: [], requestCount: 0, limits: {} };
  try {
    logs = await collectLogInsights({ logGroups, window });
    for (const warning of logs.warnings) warnings.push({ stage: 'logs', ...warning });
  } catch (error) {
    const described = describeAwsError(error);
    errors.push({ stage: 'logs', ...described });
    warnings.push({ stage: 'logs', message: `CloudWatch Logs unavailable: ${described.message}` });
  }

  const facts = [];
  const record = (fact) => {
    facts.push(fact);
    return fact;
  };

  // ---- Lambda observations
  const lambdaMetrics = lambdas.map((resource, position) => {
    const get = (key) => metrics.series.get(`lam${position}_${key}`);
    const logEntry = logs.byLogGroup.get(resource.attributes?.logGroup);
    const reports = logEntry?.reports ?? [];
    const maxUsed = reports.length ? Math.max(...reports.map((report) => report.maxMemoryUsedMb ?? 0)) : null;

    const factsForResource = {
      invocations: record(metricFact({ id: `fact:lambda:${slug(resource.name)}:invocations`, resource, service: 'lambda', label: 'Invocations', key: 'Invocations', entry: get('invocations'), unit: 'count', window })),
      errors: record(metricFact({ id: `fact:lambda:${slug(resource.name)}:errors`, resource, service: 'lambda', label: 'Errors', key: 'Errors', entry: get('errors'), unit: 'count', window })),
      throttles: record(metricFact({ id: `fact:lambda:${slug(resource.name)}:throttles`, resource, service: 'lambda', label: 'Throttles', key: 'Throttles', entry: get('throttles'), unit: 'count', window })),
      durationAvg: record(metricFact({ id: `fact:lambda:${slug(resource.name)}:duration-avg`, resource, service: 'lambda', label: 'Duration (average)', key: 'Duration', entry: get('durationAvg'), unit: 'ms', window })),
      durationMax: record(metricFact({ id: `fact:lambda:${slug(resource.name)}:duration-max`, resource, service: 'lambda', label: 'Duration (max)', key: 'Duration', entry: get('durationMax'), unit: 'ms', window })),
      concurrentExecutions: record(metricFact({ id: `fact:lambda:${slug(resource.name)}:concurrency`, resource, service: 'lambda', label: 'Concurrent executions', key: 'ConcurrentExecutions', entry: get('concurrentExecutions'), unit: 'count', window })),
      memoryConfigured: record(
        makeFact({
          id: `fact:lambda:${slug(resource.name)}:memory-configured`,
          kind: 'configuration',
          label: 'Configured memory',
          value: resource.attributes?.memorySizeMb ?? null,
          unit: 'MB',
          resourceId: resource.id,
          resourceName: resource.name,
          service: 'lambda',
          source: 'lambda:GetFunctionConfiguration MemorySize',
          available: resource.attributes?.memorySizeMb != null,
        }),
      ),
      memoryMaxUsed: record(
        makeFact({
          id: `fact:lambda:${slug(resource.name)}:memory-used`,
          kind: 'log',
          label: 'Peak memory used',
          value: maxUsed,
          unit: 'MB',
          resourceId: resource.id,
          resourceName: resource.name,
          service: 'lambda',
          source: `cloudwatch:FilterLogEvents REPORT lines (${reports.length} sampled)`,
          window,
          available: maxUsed !== null && maxUsed > 0,
          note:
            maxUsed === null || maxUsed === 0
              ? 'No REPORT lines in the window, so memory utilisation could not be measured.'
              : null,
        }),
      ),
    };

    return { resource, facts: factsForResource };
  });

  // ---- API observations
  const apiMetrics = apis.map((resource, position) => {
    const get = (key) => metrics.series.get(`api${position}_${key}`);
    const factsForResource = {
      count: record(metricFact({ id: `fact:api:${slug(resource.name)}:count`, resource, service: 'apigateway', label: 'Requests', key: 'Count', entry: get('count'), unit: 'count', window })),
      status5xx: record(metricFact({ id: `fact:api:${slug(resource.name)}:5xx`, resource, service: 'apigateway', label: '5XX responses', key: '5xx', entry: get('status5xx'), unit: 'count', window })),
      status4xx: record(metricFact({ id: `fact:api:${slug(resource.name)}:4xx`, resource, service: 'apigateway', label: '4XX responses', key: '4xx', entry: get('status4xx'), unit: 'count', window })),
      latencyAvg: record(metricFact({ id: `fact:api:${slug(resource.name)}:latency-avg`, resource, service: 'apigateway', label: 'Latency (average)', key: 'Latency', entry: get('latencyAvg'), unit: 'ms', window })),
      latencyMax: record(metricFact({ id: `fact:api:${slug(resource.name)}:latency-max`, resource, service: 'apigateway', label: 'Latency (max)', key: 'Latency', entry: get('latencyMax'), unit: 'ms', window })),
      integrationLatencyAvg: record(metricFact({ id: `fact:api:${slug(resource.name)}:integration-latency`, resource, service: 'apigateway', label: 'Integration latency (average)', key: 'IntegrationLatency', entry: get('integrationLatencyAvg'), unit: 'ms', window })),
    };
    return { resource, facts: factsForResource };
  });

  // ---- Log group observations
  const logGroupFacts = logGroups.map((resource) => {
    const entry = logs.byLogGroup.get(resource.name);
    const factsForResource = {
      retention: record(
        makeFact({
          id: `fact:logs:${slug(resource.name)}:retention`,
          kind: 'configuration',
          label: 'Retention',
          value: resource.attributes?.retentionInDays ?? null,
          unit: 'days',
          resourceId: resource.id,
          resourceName: resource.name,
          service: 'logs',
          source: 'logs:DescribeLogGroups retentionInDays',
          available: true,
          note: resource.attributes?.retentionInDays == null ? 'No retention policy: logs never expire.' : null,
        }),
      ),
      storedBytes: record(
        makeFact({
          id: `fact:logs:${slug(resource.name)}:stored-bytes`,
          kind: 'configuration',
          label: 'Stored bytes',
          value: resource.attributes?.storedBytes ?? null,
          unit: 'bytes',
          resourceId: resource.id,
          resourceName: resource.name,
          service: 'logs',
          source: 'logs:DescribeLogGroups storedBytes',
          available: resource.attributes?.storedBytes != null,
        }),
      ),
      logErrorCount: record(
        makeFact({
          id: `fact:logs:${slug(resource.name)}:error-count`,
          kind: 'log',
          label: 'Error log entries',
          value: entry?.available ? entry.errorCount : null,
          unit: 'events',
          resourceId: resource.id,
          resourceName: resource.name,
          service: 'logs',
          source: 'cloudwatch:FilterLogEvents error pattern',
          window,
          available: Boolean(entry?.available),
          note: entry?.available ? null : 'Log group could not be read in this window.',
        }),
      ),
      logErrorSample: record(
        makeFact({
          id: `fact:logs:${slug(resource.name)}:error-sample`,
          kind: 'log',
          label: 'Sample error lines',
          value: entry?.errorEvents ?? [],
          resourceId: resource.id,
          resourceName: resource.name,
          service: 'logs',
          source: 'cloudwatch:FilterLogEvents (redacted, truncated)',
          window,
          available: Boolean(entry?.errorEvents?.length),
        }),
      ),
    };
    return { resource, facts: factsForResource, truncated: entry?.truncated };
  });

  // ---- Timeout mismatches, from real invoking edges only
  const timeoutMismatches = [];
  for (const edge of graph.edges.filter((item) => item.kind === 'invokes')) {
    const caller = graph.nodes.find((node) => node.id === edge.source);
    const target = lambdas.find((resource) => resource.id === edge.target);
    if (!caller || !target) continue;

    const callerTimeoutMs = caller.attributes?.integrations?.find(
      (integration) => integration.target === target.name,
    )?.timeoutMs;
    const functionTimeout = target.attributes?.timeoutSeconds;
    if (!callerTimeoutMs || !functionTimeout) continue;

    const callerTimeoutSeconds = callerTimeoutMs / 1000;
    if (functionTimeout <= callerTimeoutSeconds) continue;

    const fact = record(
      makeFact({
        id: `fact:lambda:${slug(target.name)}:timeout-vs-caller`,
        kind: 'configuration',
        label: 'Function timeout vs caller timeout',
        value: { functionTimeoutSeconds: functionTimeout, callerTimeoutSeconds, caller: caller.name },
        unit: 'seconds',
        resourceId: target.id,
        resourceName: target.name,
        service: 'lambda',
        source: 'lambda:GetFunctionConfiguration Timeout + apigatewayv2:GetIntegrations TimeoutInMillis',
        available: true,
      }),
    );

    timeoutMismatches.push({
      functionName: target.name,
      functionId: target.id,
      callerName: caller.name,
      functionTimeoutSeconds: functionTimeout,
      callerTimeoutSeconds,
      ratio: Number.parseFloat((functionTimeout / callerTimeoutSeconds).toFixed(1)),
      evidenceFactIds: [fact.id],
    });
  }

  // ---- Run the rules
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  const context = { lambdaMetrics, apiMetrics, logGroupFacts, timeoutMismatches, window };
  const detectedAt = new Date().toISOString();

  const issues = RULES.flatMap((rule) => rule.detect(context)).map((issue) => ({
    id: `${issue.ruleId}--${slug(issue.resource)}`,
    ruleId: issue.ruleId,
    severity: issue.severity,
    category: issue.category,
    title: issue.title,
    description: issue.description,
    resource: issue.resource,
    resourceId: issue.resourceId,
    service: issue.service,
    metrics: issue.metrics,
    evidence: issue.evidenceFactIds
      .map((factId) => factsById.get(factId))
      .filter(Boolean)
      .map(({ id, kind, label, value, unit, source, window: factWindow, series, available, note }) => ({
        id,
        kind,
        label,
        value,
        unit,
        source,
        window: factWindow,
        // Kept so the evidence can show the shape of the metric, not just its total.
        series,
        available,
        note,
      })),
    detectedAt,
    status: 'open',
  }));

  issues.sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || a.id.localeCompare(b.id),
  );

  const countsBySeverity = SEVERITY_ORDER.reduce((accumulator, severity) => {
    accumulator[severity] = issues.filter((issue) => issue.severity === severity).length;
    return accumulator;
  }, {});

  const penalty = Object.entries(countsBySeverity).reduce((total, [severity, count]) => {
    const weight = SEVERITY_PENALTY[severity];
    return weight ? total + Math.min(weight.cap, weight.each * count) : total;
  }, 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const status = score >= 90 ? 'healthy' : score >= 70 ? 'degraded' : score >= 40 ? 'unhealthy' : 'critical';

  // Per-resource rollup, so the architecture view can colour a node by its worst finding.
  const resourceHealth = resources.map((resource) => {
    const resourceIssues = issues.filter((issue) => issue.resourceId === resource.id);
    const worst = SEVERITY_ORDER.find((severity) => resourceIssues.some((issue) => issue.severity === severity));
    return {
      resourceId: resource.id,
      name: resource.name,
      service: resource.service,
      issueCount: resourceIssues.length,
      worstSeverity: worst ?? null,
      issueIds: resourceIssues.map((issue) => issue.id),
      status: worst ? (worst === 'critical' || worst === 'high' ? 'failing' : 'warning') : 'healthy',
    };
  });

  const unavailableMetrics = facts.filter((fact) => fact.kind === 'metric' && !fact.available);

  const payload = {
    generatedAt: detectedAt,
    region: config.aws.region,
    window,
    summary: {
      score,
      status,
      totalIssues: issues.length,
      countsBySeverity,
      resourcesAnalysed: resources.length,
      resourcesWithIssues: resourceHealth.filter((entry) => entry.issueCount > 0).length,
      factsCollected: facts.length,
      metricsUnavailable: unavailableMetrics.length,
    },
    issues,
    facts,
    resourceHealth,
    dataCollection: {
      cloudwatchTimestamp: detectedAt,
      metricRequests: metrics.requestCount,
      logRequests: logs.requestCount,
      logLimits: logs.limits,
      discoveryPartial: Boolean(inventory.partial),
      unavailableMetrics: unavailableMetrics.map((fact) => ({
        resource: fact.resourceName,
        metric: fact.label,
        note: fact.note,
      })),
      warnings,
      errors,
    },
    partial: errors.length > 0 || warnings.length > 0,
    meta: { deterministic: true, aiAssisted: false, cached: false, cacheTtlSeconds: CACHE_TTL_MS / 1000 },
  };

  cache = { at: Date.now(), hours, payload };
  return payload;
}

export async function getIssueById(issueId, options = {}) {
  const analysis = await getHealthAnalysis(options);
  const issue = analysis.issues.find((entry) => entry.id === issueId);
  if (!issue) return null;

  const related = analysis.issues.filter(
    (entry) => entry.id !== issue.id && entry.resourceId === issue.resourceId,
  );

  return {
    issue,
    resourceHealth: analysis.resourceHealth.find((entry) => entry.resourceId === issue.resourceId) ?? null,
    relatedIssues: related.map(({ id, title, severity, category }) => ({ id, title, severity, category })),
    window: analysis.window,
    generatedAt: analysis.generatedAt,
  };
}

export default { getHealthAnalysis, getIssueById };

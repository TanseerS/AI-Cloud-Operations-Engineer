/**
 * The analysis context.
 *
 * The backend decides what reaches Bedrock. The frontend never supplies AWS data, and
 * the model never sees the raw inventory - only a compact projection of what it needs
 * to reason about. Two reasons: tokens are billed, and a model given a wall of JSON
 * reasons worse than one given the relevant slice.
 *
 * Everything here is an observation the application actually made. Nothing is
 * paraphrased into a claim the underlying data does not support.
 */

const MAX_LOG_LINES_PER_ISSUE = 3;
const MAX_LOG_LINE_LENGTH = 240;
const MAX_SERVICES = 8;

function compactResource(node) {
  const attributes = node.attributes ?? {};
  const base = { name: node.name, service: node.service, type: node.type };

  switch (node.service) {
    case 'lambda':
      return {
        ...base,
        memoryMb: attributes.memorySizeMb,
        timeoutSeconds: attributes.timeoutSeconds,
        runtime: attributes.runtime,
        state: attributes.state,
        logGroup: attributes.logGroup,
      };
    case 'logs':
      return { ...base, retentionInDays: attributes.retentionInDays, storedBytes: attributes.storedBytes };
    case 'apigateway':
      return {
        ...base,
        protocol: attributes.protocol,
        routes: (attributes.routes ?? []).map((route) => route.routeKey),
        integrations: (attributes.integrations ?? []).map((integration) => ({
          target: integration.target,
          timeoutMs: integration.timeoutMs,
        })),
      };
    case 'iam':
      return { ...base, inlinePolicies: attributes.inlinePolicyNames };
    default:
      return base;
  }
}

function compactFactValue(fact) {
  if (Array.isArray(fact.value)) {
    return fact.value
      .slice(-MAX_LOG_LINES_PER_ISSUE)
      .map((entry) => (entry?.message ?? String(entry)).slice(0, MAX_LOG_LINE_LENGTH));
  }
  return fact.value;
}

export function buildAnalysisContext({ graph, cost, health }) {
  const architecture = {
    region: graph?.region ?? null,
    resources: (graph?.nodes ?? []).filter((node) => node.kind === 'resource').map(compactResource),
    groupedResources: (graph?.nodes ?? [])
      .filter((node) => node.kind === 'group')
      .map((node) => ({ name: node.name, service: node.service, memberCount: node.memberCount })),
    relationships: (graph?.edges ?? []).map((edge) => ({
      from: graph.nodes.find((node) => node.id === edge.source)?.name ?? edge.source,
      to: graph.nodes.find((node) => node.id === edge.target)?.name ?? edge.target,
      kind: edge.kind,
      confidence: edge.confidence,
      derivedFrom: edge.evidence,
    })),
  };

  const costContext = cost?.available
    ? {
        currency: cost.currency,
        period: cost.periods?.current?.label,
        daysElapsed: cost.periods?.current?.days,
        usageCost: cost.totals?.usageCost,
        netBilledCost: cost.totals?.netCost,
        creditsApplied: cost.totals?.recordTypes?.Credit ?? null,
        comparison: cost.comparison?.available
          ? {
              previousTotal: cost.comparison.previousTotal,
              percentChange: cost.comparison.percentChange,
              basis: cost.comparison.basis,
            }
          : { available: false, reason: cost.comparison?.reason },
        topServices: (cost.services ?? []).slice(0, MAX_SERVICES).map((service) => ({
          service: service.service,
          cost: service.cost,
          percentOfPeriod: service.percentage,
          previousCost: service.previousCost,
          changePercent: service.changePercent,
          // Tells the model which cost lines can be tied to a discovered resource.
          correlatesWithDiscoveredService: service.discoveryService,
        })),
        note: 'Usage cost is charges at list rate. Net billed is after credits. They differ in this account.',
      }
    : { available: false, note: 'Cost Explorer data could not be retrieved for this analysis.' };

  const healthContext = {
    windowHours: health?.window?.hours,
    score: health?.summary?.score,
    status: health?.summary?.status,
    countsBySeverity: health?.summary?.countsBySeverity,
    issues: (health?.issues ?? []).map((issue) => ({
      issueId: issue.id,
      severity: issue.severity,
      category: issue.category,
      title: issue.title,
      resource: issue.resource,
      service: issue.service,
      detectedBy: `deterministic rule ${issue.ruleId}`,
      measurements: issue.metrics,
      evidence: (issue.evidence ?? []).map((fact) => ({
        label: fact.label,
        value: compactFactValue(fact),
        unit: fact.unit,
        observedFrom: fact.source,
        available: fact.available,
      })),
    })),
    metricsUnavailable: (health?.dataCollection?.unavailableMetrics ?? []).map((entry) => ({
      resource: entry.resource,
      metric: entry.metric,
    })),
    collectionWarnings: (health?.dataCollection?.warnings ?? []).map((warning) => warning.message).filter(Boolean),
  };

  return {
    generatedAt: new Date().toISOString(),
    architecture,
    cost: costContext,
    health: healthContext,
  };
}

/**
 * The known universe, used after the model answers to check that everything it named
 * actually exists. Anything outside these sets was invented.
 */
export function buildGroundingIndex({ graph, health }) {
  return {
    issueIds: new Set((health?.issues ?? []).map((issue) => issue.id)),
    resourceNames: new Set((graph?.nodes ?? []).map((node) => node.name)),
  };
}

export default buildAnalysisContext;

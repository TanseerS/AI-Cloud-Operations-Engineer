import config from '../config/index.js';
import { discoverResources } from './discovery.service.js';
import { buildGraph } from './architecture/graph.js';
import { getCostAnalysis } from './cost.service.js';
import { getHealthAnalysis } from './health.service.js';
import { buildAnalysisContext, buildGroundingIndex } from './ai/context.js';
import { invokeAnalysis } from './ai/bedrock-client.js';
import { validateAnalysis } from './ai/schema.js';

/**
 * AI analysis.
 *
 * The backend owns the whole pipeline: it gathers the observations, decides what
 * reaches the model, invokes it, then checks the answer before anyone sees it. The
 * frontend supplies no AWS data and cannot influence what is sent.
 *
 * Two guards sit between the model and the UI:
 *   validation - the response must match the schema the UI renders
 *   grounding  - every issue and resource the model names must actually exist
 *
 * A finding that references something we never observed is dropped rather than shown.
 * The model is a reasoning layer over measured data, not a source of facts.
 */

let cache = null;
let lastInvocationAt = 0;

/**
 * Checks the model's answer against the observations it was given. Anything naming an
 * issue or resource we did not observe is treated as invented and quarantined.
 */
export function checkGrounding(analysis, index) {
  const accepted = [];
  const rejected = [];
  const unknownResourceReferences = new Set();

  for (const finding of analysis.findings ?? []) {
    if (index.issueIds.has(finding.issueId)) {
      accepted.push(finding);
    } else {
      rejected.push({
        finding,
        reason: `issueId "${finding.issueId}" does not match any detected issue`,
      });
    }
  }

  for (const key of ['costOptimization', 'reliabilityRecommendations', 'performanceRecommendations']) {
    for (const entry of analysis[key] ?? []) {
      if (entry.resource && !index.resourceNames.has(entry.resource)) {
        unknownResourceReferences.add(`${key}: ${entry.resource}`);
      }
    }
  }

  return {
    findings: accepted,
    rejectedFindings: rejected,
    grounding: {
      knownIssueIds: index.issueIds.size,
      knownResources: index.resourceNames.size,
      findingsAccepted: accepted.length,
      findingsRejected: rejected.length,
      unknownResourceReferences: [...unknownResourceReferences],
      // True when nothing the model named fell outside the observation set.
      fullyGrounded: rejected.length === 0 && unknownResourceReferences.size === 0,
    },
  };
}

function modelInfo(extra = {}) {
  return {
    provider: 'Amazon Bedrock',
    region: config.bedrock.region,
    modelId: config.bedrock.modelId,
    fallbackModelIds: config.bedrock.fallbackModelIds,
    api: 'Converse with forced tool use',
    ...extra,
  };
}

/** Configuration and last-known state. Makes no Bedrock call, so the UI can poll it. */
export function getAiStatus() {
  return {
    configured: Boolean(config.bedrock.modelId),
    model: modelInfo(),
    lastAnalysis: cache
      ? {
          generatedAt: cache.payload.generatedAt,
          modelUsed: cache.payload.model.modelIdUsed,
          ok: cache.payload.ok,
          ageSeconds: Math.round((Date.now() - cache.at) / 1000),
        }
      : null,
    policy: {
      invokedOnExplicitRequestOnly: true,
      method: 'POST',
      cacheTtlSeconds: config.bedrock.cacheTtlSeconds,
      minIntervalSeconds: config.bedrock.minIntervalSeconds,
    },
  };
}

export async function runAiAnalysis({ force = false } = {}) {
  const cacheAgeMs = cache ? Date.now() - cache.at : Infinity;
  if (!force && cache && cacheAgeMs < config.bedrock.cacheTtlSeconds * 1000) {
    return { ...cache.payload, cached: true, cacheAgeSeconds: Math.round(cacheAgeMs / 1000) };
  }

  // A floor between live invocations, so a held-down refresh cannot meter the account.
  const sinceLast = Date.now() - lastInvocationAt;
  if (cache && sinceLast < config.bedrock.minIntervalSeconds * 1000) {
    return {
      ...cache.payload,
      cached: true,
      cacheAgeSeconds: Math.round(cacheAgeMs / 1000),
      throttledByPolicy: {
        message: `A live analysis was requested ${Math.round(sinceLast / 1000)}s ago; the minimum interval is ${config.bedrock.minIntervalSeconds}s.`,
        retryAfterSeconds: Math.ceil((config.bedrock.minIntervalSeconds * 1000 - sinceLast) / 1000),
      },
    };
  }

  // Observations first. Each of these already caches independently.
  const inventory = await discoverResources();
  const graph = { ...buildGraph(inventory), region: inventory.region };
  const [cost, health] = await Promise.all([
    getCostAnalysis().catch(() => null),
    getHealthAnalysis(),
  ]);

  const context = buildAnalysisContext({ graph, cost, health });
  const index = buildGroundingIndex({ graph, health });
  const contextBytes = JSON.stringify(context).length;

  lastInvocationAt = Date.now();

  let invocation;
  try {
    invocation = await invokeAnalysis(context);
  } catch (error) {
    const payload = {
      generatedAt: new Date().toISOString(),
      ok: false,
      failure: {
        stage: 'invocation',
        message: error.message,
        attempts: error.attempts ?? [],
      },
      model: modelInfo({ modelIdUsed: null }),
      context: { bytes: contextBytes, issues: index.issueIds.size, resources: index.resourceNames.size },
      analysis: null,
    };
    return payload;
  }

  if (!invocation.raw) {
    return {
      generatedAt: new Date().toISOString(),
      ok: false,
      failure: {
        stage: 'parse',
        message: 'The model returned no parsable structured output.',
        modelText: invocation.unparsedText,
      },
      model: modelInfo({ modelIdUsed: invocation.modelId, viaToolUse: invocation.viaToolUse }),
      context: { bytes: contextBytes, issues: index.issueIds.size, resources: index.resourceNames.size },
      analysis: null,
    };
  }

  const validation = validateAnalysis(invocation.raw);
  if (!validation.valid) {
    return {
      generatedAt: new Date().toISOString(),
      ok: false,
      failure: {
        stage: 'validation',
        message: 'The model returned structured output that does not match the analysis schema.',
        errors: validation.errors.slice(0, 10),
      },
      model: modelInfo({ modelIdUsed: invocation.modelId, viaToolUse: invocation.viaToolUse }),
      context: { bytes: contextBytes, issues: index.issueIds.size, resources: index.resourceNames.size },
      analysis: null,
    };
  }

  const { findings, rejectedFindings, grounding } = checkGrounding(invocation.raw, index);

  const payload = {
    generatedAt: new Date().toISOString(),
    ok: true,
    analysis: { ...invocation.raw, findings },
    rejectedFindings,
    grounding,
    model: modelInfo({
      modelIdUsed: invocation.modelId,
      viaToolUse: invocation.viaToolUse,
      stopReason: invocation.stopReason,
      latencyMs: invocation.latencyMs,
      usage: invocation.usage,
      attempts: invocation.attempts,
    }),
    context: {
      bytes: contextBytes,
      issues: index.issueIds.size,
      resources: index.resourceNames.size,
      windowHours: health?.window?.hours ?? null,
      costAvailable: Boolean(cost?.available),
    },
    sources: {
      discoveredAt: inventory.discoveredAt,
      healthGeneratedAt: health?.generatedAt ?? null,
      costGeneratedAt: cost?.generatedAt ?? null,
    },
    cached: false,
  };

  cache = { at: Date.now(), payload };
  return payload;
}

export default { runAiAnalysis, getAiStatus };

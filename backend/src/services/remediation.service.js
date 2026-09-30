import config from '../config/index.js';
import { discoverResources } from './discovery.service.js';
import { getHealthAnalysis } from './health.service.js';
import { getCachedAiAnalysis } from './bedrock.service.js';
import { lookupAction, RECOMMENDATION_ONLY_REASONS } from './remediation/registry.js';
import { evaluateSafety, REQUIRED_TAGS } from './remediation/safety.js';
import { listPlans, getPlan, upsertPlans, updatePlan } from './remediation/store.js';
import { AppError } from '../lib/errors.js';

/**
 * Remediation planning.
 *
 * Turns detected issues into plans that describe exactly one AWS change each. This
 * stage plans only: nothing here calls a mutating AWS API, and approving a plan changes
 * a status field and nothing else.
 *
 * The caller cannot choose a target. It may name issue ids; every resource, action and
 * parameter is re-derived from a fresh discovery of AWS in this request. That is the
 * property that makes "do not accept an arbitrary ARN from the frontend" structural
 * rather than a rule someone has to remember.
 */

/** Fields a caller might try to supply that the backend must own. */
const FORBIDDEN_REQUEST_FIELDS = [
  'resourceId',
  'resourceArn',
  'arn',
  'resourceName',
  'action',
  'actionType',
  'parameters',
  'awsOperation',
  'command',
  'desiredState',
];

export const PLAN_STATUSES = ['proposed', 'approved', 'executed', 'verified', 'failed'];

function assertRequestShape(body = {}) {
  const smuggled = FORBIDDEN_REQUEST_FIELDS.filter((field) => body[field] !== undefined);
  if (smuggled.length > 0) {
    throw new AppError(
      'Remediation targets and actions are derived by the backend and cannot be supplied by the caller.',
      {
        status: 400,
        code: 'caller_supplied_target',
        details: {
          rejectedFields: smuggled,
          accepted: ['issueIds (optional array of detected issue ids)'],
        },
      },
    );
  }

  if (body.issueIds !== undefined) {
    if (!Array.isArray(body.issueIds) || body.issueIds.some((id) => typeof id !== 'string')) {
      throw new AppError('issueIds must be an array of strings.', {
        status: 400,
        code: 'invalid_request',
      });
    }
  }
}

function buildAudit({ issue, resource, change, aiFinding, safety }) {
  return {
    issueId: issue.id,
    detectedBy: `deterministic rule ${issue.ruleId}`,
    detectedAt: issue.detectedAt,
    resourceVerifiedFrom: 'aws discovery performed during this request',
    resourceArn: resource?.arn ?? null,
    currentConfiguration: change?.currentState ?? null,
    proposedConfiguration: change?.desiredState ?? null,
    reasonForChange: change?.rationale ?? null,
    evidenceUsed: (issue.evidence ?? []).map((fact) => ({
      label: fact.label,
      value: fact.value,
      unit: fact.unit,
      source: fact.source,
    })),
    bedrockContributed: Boolean(aiFinding),
    bedrockReasoning: aiFinding
      ? {
          rootCause: aiFinding.rootCause,
          impact: aiFinding.impact,
          recommendation: aiFinding.recommendation,
          confidence: aiFinding.confidence,
          note: 'Advisory context only. The action, its parameters and its rollback come from the backend registry.',
        }
      : null,
    safetyChecks: safety?.checks ?? [],
    requiredTags: REQUIRED_TAGS,
  };
}

function planFor({ issue, resource, aiFinding, createdAt }) {
  const base = {
    id: `plan--${issue.id}`,
    issueId: issue.id,
    ruleId: issue.ruleId,
    resourceId: issue.resourceId ?? null,
    resourceName: issue.resource,
    service: issue.service,
    severity: issue.severity,
    category: issue.category,
    issue: issue.title,
    evidence: (issue.evidence ?? []).map((fact) => ({
      label: fact.label,
      value: fact.value,
      unit: fact.unit,
      source: fact.source,
      available: fact.available,
    })),
    status: 'proposed',
    createdAt,
  };

  // The resource must have been seen in AWS during this request. A finding about a
  // resource we cannot currently verify does not become an actionable plan.
  if (!resource) {
    return {
      ...base,
      planType: 'blocked',
      executable: false,
      blockedReason:
        'The affected resource could not be verified in AWS during this request, so no plan was created for it.',
      audit: buildAudit({ issue, resource: null, change: null, aiFinding, safety: null }),
    };
  }

  const registryEntry = lookupAction(issue.ruleId);
  if (!registryEntry) {
    return {
      ...base,
      planType: 'recommendation-only',
      executable: false,
      recommendationOnlyReason:
        RECOMMENDATION_ONLY_REASONS[issue.ruleId] ??
        'No allowlisted remediation action maps to this issue type, and inventing one would be unsafe.',
      audit: buildAudit({ issue, resource, change: null, aiFinding, safety: null }),
    };
  }

  const change = registryEntry.computeChange({ issue, resource });
  if (!change.supported) {
    return {
      ...base,
      planType: 'recommendation-only',
      executable: false,
      actionType: registryEntry.actionType,
      recommendationOnlyReason: `The mapped action could not be parameterised from the available evidence: ${change.reason}`,
      audit: buildAudit({ issue, resource, change: null, aiFinding, safety: null }),
    };
  }

  const safety = evaluateSafety({
    resource,
    actionType: registryEntry.actionType,
    parameters: change.parameters,
    reversible: registryEntry.reversible,
  });

  const plan = {
    ...base,
    planType: safety.safe ? 'executable' : 'blocked',
    executable: safety.safe,
    action: registryEntry.title,
    actionType: registryEntry.actionType,
    awsOperation: registryEntry.awsOperation,
    parameters: change.parameters,
    currentState: change.currentState,
    desiredState: change.desiredState,
    risk: registryEntry.risk,
    expectedImpact: registryEntry.expectedImpact,
    rationale: change.rationale,
    prerequisites: registryEntry.prerequisites,
    warnings: change.warnings ?? [],
    rollbackAction: {
      awsOperation: change.rollbackParameters?.operation ?? registryEntry.awsOperation,
      parameters: change.rollbackParameters,
      description: 'Restores the configuration observed before the change.',
    },
    safety: { safe: safety.safe, checks: safety.checks, failedChecks: safety.failedChecks },
    audit: buildAudit({ issue, resource, change, aiFinding, safety }),
  };

  if (!safety.safe) {
    plan.blockedReason = `Safety validation failed: ${safety.failedChecks.join(', ')}`;
  }

  return plan;
}

export async function createRemediationPlans(body = {}) {
  assertRequestShape(body);

  // Observations are re-collected here rather than accepted from the caller.
  const [health, inventory] = await Promise.all([getHealthAnalysis(), discoverResources()]);

  const resourcesById = new Map(
    (inventory.services ?? [])
      .filter((entry) => entry.status !== 'failed')
      .flatMap((entry) => entry.resources ?? [])
      .map((resource) => [resource.id, resource]),
  );

  let issues = health.issues ?? [];
  if (body.issueIds?.length) {
    const known = new Set(issues.map((issue) => issue.id));
    const unknown = body.issueIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new AppError('One or more issue ids are not among the currently detected issues.', {
        status: 400,
        code: 'unknown_issue',
        details: { unknown, detected: [...known] },
      });
    }
    issues = issues.filter((issue) => body.issueIds.includes(issue.id));
  }

  // Bedrock reasoning is attached when a recent analysis is already cached. Planning
  // never triggers a billed invocation on its own.
  const ai = getCachedAiAnalysis();
  const aiByIssue = new Map((ai?.analysis?.findings ?? []).map((finding) => [finding.issueId, finding]));

  const createdAt = new Date().toISOString();
  const plans = issues.map((issue) =>
    planFor({
      issue,
      resource: issue.resourceId ? resourcesById.get(issue.resourceId) : undefined,
      aiFinding: aiByIssue.get(issue.id),
      createdAt,
    }),
  );

  await upsertPlans(plans);
  const stored = await listPlans();
  const byId = new Map(stored.map((plan) => [plan.id, plan]));
  const returned = plans.map((plan) => byId.get(plan.id) ?? plan);

  return {
    generatedAt: createdAt,
    region: config.aws.region,
    summary: {
      issuesConsidered: issues.length,
      executable: returned.filter((plan) => plan.planType === 'executable').length,
      recommendationOnly: returned.filter((plan) => plan.planType === 'recommendation-only').length,
      blocked: returned.filter((plan) => plan.planType === 'blocked').length,
      awaitingApproval: returned.filter((plan) => plan.executable && plan.status === 'proposed').length,
      approved: returned.filter((plan) => plan.status === 'approved').length,
    },
    guardrails: {
      requiredTags: REQUIRED_TAGS,
      namingPrefix: config.aws.labPrefix,
      region: config.aws.region,
      callerMaySupplyTargets: false,
      allowlistedActionTypesOnly: true,
      executionPerformed: false,
      note: 'Planning stage only. No mutating AWS API is called by this endpoint.',
    },
    ai: ai
      ? {
          used: true,
          modelId: ai.model?.modelIdUsed ?? null,
          analysisAgeSeconds: ai.cacheAgeSeconds,
          role: 'advisory context attached to plans; it cannot choose or alter an action',
        }
      : {
          used: false,
          reason: 'No recent Bedrock analysis is cached. Run the AI analysis to attach its reasoning to plans.',
        },
    plans: returned,
  };
}

export async function getRemediationPlans() {
  const plans = await listPlans();
  return {
    generatedAt: new Date().toISOString(),
    count: plans.length,
    summary: {
      executable: plans.filter((plan) => plan.planType === 'executable').length,
      recommendationOnly: plans.filter((plan) => plan.planType === 'recommendation-only').length,
      blocked: plans.filter((plan) => plan.planType === 'blocked').length,
      approved: plans.filter((plan) => plan.status === 'approved').length,
    },
    plans,
  };
}

export async function getRemediationPlan(id) {
  return getPlan(id);
}

/**
 * Approval is a state transition and nothing else. No AWS client is constructed here,
 * and no AWS API is called - execution arrives as a separate, explicit capability.
 */
export async function approveRemediationPlan(id, { approvedBy = 'dashboard-user', note = null } = {}) {
  const existing = await getPlan(id);
  if (!existing) return null;

  if (!existing.executable) {
    throw new AppError('This plan is not executable and cannot be approved.', {
      status: 409,
      code: 'not_executable',
      details: {
        planType: existing.planType,
        reason: existing.recommendationOnlyReason ?? existing.blockedReason ?? null,
      },
    });
  }

  if (existing.status !== 'proposed') {
    throw new AppError(`Only a proposed plan can be approved; this plan is ${existing.status}.`, {
      status: 409,
      code: 'invalid_transition',
      details: { currentStatus: existing.status },
    });
  }

  return updatePlan(id, (plan) => ({
    ...plan,
    status: 'approved',
    approval: {
      approvedAt: new Date().toISOString(),
      approvedBy,
      note,
      executionPerformed: false,
      awsCallsMade: 0,
    },
  }));
}

export default { createRemediationPlans, getRemediationPlans, getRemediationPlan, approveRemediationPlan };

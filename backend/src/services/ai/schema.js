/**
 * The analysis contract.
 *
 * The same schema is sent to Bedrock as a forced tool definition and used to validate
 * what comes back. One definition, so the model cannot be asked for one shape and
 * checked against another.
 */

const CONFIDENCE = ['high', 'medium', 'low'];
const EFFORT = ['low', 'medium', 'high'];

export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Two or three sentences an on-call engineer could read first.' },
    overallAssessment: {
      type: 'string',
      description: 'The state of the environment overall, grounded only in the supplied observations.',
    },
    findings: {
      type: 'array',
      description: 'One entry per supplied issue that the evidence actually supports. Do not invent issues.',
      items: {
        type: 'object',
        properties: {
          issueId: { type: 'string', description: 'Must exactly match an id from the supplied issues.' },
          title: { type: 'string' },
          rootCause: { type: 'string', description: 'Why this is happening, derived from the evidence.' },
          impact: { type: 'string', description: 'What it means operationally or financially.' },
          evidence: {
            type: 'array',
            description: 'Quote the supplied observations this rests on. Do not invent numbers.',
            items: { type: 'string' },
          },
          recommendation: { type: 'string' },
          confidence: { type: 'string', enum: CONFIDENCE },
          evidenceGaps: {
            type: 'string',
            description: 'State what further evidence is needed, or an empty string if none is.',
          },
        },
        required: ['issueId', 'title', 'rootCause', 'impact', 'evidence', 'recommendation', 'confidence'],
      },
    },
    costOptimization: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          rationale: { type: 'string' },
          resource: { type: 'string' },
          estimatedImpact: { type: 'string', description: 'Only what the supplied cost data supports.' },
          effort: { type: 'string', enum: EFFORT },
          confidence: { type: 'string', enum: CONFIDENCE },
        },
        required: ['title', 'rationale', 'confidence'],
      },
    },
    reliabilityRecommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          rationale: { type: 'string' },
          resource: { type: 'string' },
          confidence: { type: 'string', enum: CONFIDENCE },
        },
        required: ['title', 'rationale', 'confidence'],
      },
    },
    performanceRecommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          rationale: { type: 'string' },
          resource: { type: 'string' },
          confidence: { type: 'string', enum: CONFIDENCE },
        },
        required: ['title', 'rationale', 'confidence'],
      },
    },
    insufficientEvidence: {
      type: 'array',
      description: 'Anything that could not be concluded because the observations do not support it.',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'overallAssessment', 'findings'],
};

export const TOOL_NAME = 'report_cloud_operations_analysis';

/**
 * Validation, hand written against this one schema.
 *
 * A generic validator would accept a technically-valid document that is useless to the
 * UI. This checks the shapes the frontend actually renders and reports the exact path
 * that failed, so a bad response produces a diagnosable error rather than a blank panel.
 */
export function validateAnalysis(candidate) {
  const errors = [];

  const isString = (value) => typeof value === 'string';
  const requireString = (value, path, { allowEmpty = false } = {}) => {
    if (!isString(value)) errors.push(`${path}: expected string, received ${typeof value}`);
    else if (!allowEmpty && value.trim() === '') errors.push(`${path}: must not be empty`);
  };
  const requireEnum = (value, path, allowed) => {
    if (!allowed.includes(value)) errors.push(`${path}: expected one of ${allowed.join('|')}, received ${JSON.stringify(value)}`);
  };

  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { valid: false, errors: ['root: expected an object'] };
  }

  requireString(candidate.summary, 'summary');
  requireString(candidate.overallAssessment, 'overallAssessment');

  if (!Array.isArray(candidate.findings)) {
    errors.push('findings: expected an array');
  } else {
    candidate.findings.forEach((finding, index) => {
      const at = `findings[${index}]`;
      if (finding === null || typeof finding !== 'object') {
        errors.push(`${at}: expected an object`);
        return;
      }
      requireString(finding.issueId, `${at}.issueId`);
      requireString(finding.title, `${at}.title`);
      requireString(finding.rootCause, `${at}.rootCause`);
      requireString(finding.impact, `${at}.impact`);
      requireString(finding.recommendation, `${at}.recommendation`);
      requireEnum(finding.confidence, `${at}.confidence`, CONFIDENCE);
      if (!Array.isArray(finding.evidence)) errors.push(`${at}.evidence: expected an array`);
      else finding.evidence.forEach((line, position) => requireString(line, `${at}.evidence[${position}]`));
    });
  }

  for (const key of ['costOptimization', 'reliabilityRecommendations', 'performanceRecommendations']) {
    if (candidate[key] === undefined) continue;
    if (!Array.isArray(candidate[key])) {
      errors.push(`${key}: expected an array`);
      continue;
    }
    candidate[key].forEach((entry, index) => {
      const at = `${key}[${index}]`;
      if (entry === null || typeof entry !== 'object') {
        errors.push(`${at}: expected an object`);
        return;
      }
      requireString(entry.title, `${at}.title`);
      requireString(entry.rationale, `${at}.rationale`);
      requireEnum(entry.confidence, `${at}.confidence`, CONFIDENCE);
    });
  }

  if (candidate.insufficientEvidence !== undefined && !Array.isArray(candidate.insufficientEvidence)) {
    errors.push('insufficientEvidence: expected an array');
  }

  return { valid: errors.length === 0, errors };
}

export { CONFIDENCE, EFFORT };

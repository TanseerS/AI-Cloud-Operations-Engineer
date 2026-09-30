/** Severity is ordered, and its colour is a status colour - never reused for anything else. */
export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

export const SEVERITY_TONE = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'info',
  info: 'neutral',
};

export const CATEGORY_LABEL = {
  reliability: 'Reliability',
  performance: 'Performance',
  cost: 'Cost',
  configuration: 'Configuration',
};

export default SEVERITY_TONE;

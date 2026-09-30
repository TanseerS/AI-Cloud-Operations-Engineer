import { EMPTY, formatBytes, formatRetention, formatValue } from '../../lib/format.js';

/**
 * Per-service presentation: the icon for the service card, and the two or three facts
 * worth showing on a collapsed resource row. Everything else lives behind the expander.
 *
 * Adding a service to discovery means adding one entry here; an unknown service still
 * renders, just without highlights.
 */
export const SERVICE_PRESENTATION = {
  lambda: {
    icon: 'activity',
    shortLabel: 'Lambda',
    highlights: (attributes) => [
      { label: 'Memory', value: attributes.memorySizeMb ? `${attributes.memorySizeMb} MB` : EMPTY },
      { label: 'Timeout', value: attributes.timeoutSeconds ? `${attributes.timeoutSeconds}s` : EMPTY },
      { label: 'Runtime', value: formatValue(attributes.runtime) },
    ],
  },
  logs: {
    icon: 'logs',
    shortLabel: 'Log groups',
    highlights: (attributes) => [
      { label: 'Retention', value: formatRetention(attributes.retentionInDays) },
      { label: 'Stored', value: formatBytes(attributes.storedBytes) },
    ],
  },
  apigateway: {
    icon: 'cloud',
    shortLabel: 'APIs',
    highlights: (attributes) => [
      { label: 'Protocol', value: formatValue(attributes.protocol) },
      { label: 'Routes', value: formatValue(attributes.routeCount) },
    ],
  },
  ssm: {
    icon: 'key',
    shortLabel: 'Parameters',
    highlights: (attributes) => [
      { label: 'Type', value: formatValue(attributes.parameterType) },
      { label: 'Tier', value: formatValue(attributes.tier) },
      { label: 'Version', value: formatValue(attributes.version) },
    ],
  },
  iam: {
    icon: 'server',
    shortLabel: 'IAM roles',
    highlights: (attributes) => [
      { label: 'Inline policies', value: formatValue(attributes.inlinePolicyNames?.length ?? 0) },
      { label: 'Attached', value: formatValue(attributes.attachedPolicyNames?.length ?? 0) },
    ],
  },
};

export function presentationFor(service) {
  return SERVICE_PRESENTATION[service] ?? { icon: 'cloud', shortLabel: service, highlights: () => [] };
}

export default SERVICE_PRESENTATION;

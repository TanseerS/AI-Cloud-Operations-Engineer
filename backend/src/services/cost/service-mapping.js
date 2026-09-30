/**
 * Maps Cost Explorer's billing service names onto the service keys used by resource
 * discovery.
 *
 * This is the seam for the correlation work that comes later:
 *   AWS service -> discovered resources -> cost -> metrics -> issues
 *
 * Cost Explorer names are inconsistent ("AWS Lambda", "AmazonCloudWatch", "Amazon
 * API Gateway"), so the mapping is explicit rather than derived from string munging.
 * An unmapped service still reports its cost; it simply has no resources to join to
 * yet, which is honest about what the application can currently correlate.
 */

export const BILLING_TO_DISCOVERY = {
  'AWS Lambda': 'lambda',
  AmazonCloudWatch: 'logs',
  'Amazon CloudWatch': 'logs',
  'CloudWatch Events': 'logs',
  'Amazon API Gateway': 'apigateway',
  'AWS Systems Manager': 'ssm',
  'AWS Identity and Access Management': 'iam',
};

/** A stable slug for the billing service, safe to use as a key or a DOM id. */
export function billingServiceKey(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function discoveryServiceFor(billingServiceName) {
  return BILLING_TO_DISCOVERY[billingServiceName] ?? null;
}

export default { BILLING_TO_DISCOVERY, billingServiceKey, discoveryServiceFor };

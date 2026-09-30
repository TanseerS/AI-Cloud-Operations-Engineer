/**
 * The relationship model.
 *
 * Every edge in the architecture graph comes from one of these rules, and every rule
 * names the AWS field it read. Nothing is inferred from resources merely sharing a
 * prefix, a tag, or a naming pattern - a line between two boxes is a claim, and a wrong
 * claim about production topology is worse than no line at all.
 *
 * A rule may only emit an edge when the target is itself present in the discovered
 * inventory, so the graph never points at something nobody verified exists.
 *
 * Adding a service means adding a rule here; the graph builder and the frontend need no
 * changes.
 */

/**
 * Confidence describes where the edge came from, not how likely it is to be true:
 *   declared - an explicit field in the resource's own AWS configuration
 *   default  - a documented AWS behaviour that holds when nothing overrides it
 */
export const CONFIDENCE = { DECLARED: 'declared', DEFAULT: 'default' };

export const RELATIONSHIP_RULES = [
  {
    id: 'apigateway-invokes-lambda',
    from: 'apigateway',
    to: 'lambda',
    kind: 'invokes',
    label: 'invokes',
    description: 'An HTTP API proxy integration whose target is a Lambda function.',
    resolve(api, lookup) {
      const edges = [];
      for (const integration of api.attributes?.integrations ?? []) {
        if (integration.type !== 'AWS_PROXY') continue;
        const target =
          lookup.byArn.get(integration.targetArn) ?? lookup.byName.get(`lambda:${integration.target}`);
        if (!target) continue;
        edges.push({
          target: target.id,
          confidence: CONFIDENCE.DECLARED,
          evidence: 'apigatewayv2:GetIntegrations IntegrationUri',
          detail: integration.timeoutMs ? `${integration.timeoutMs} ms timeout` : null,
        });
      }
      return edges;
    },
  },
  {
    id: 'lambda-writes-logs',
    from: 'lambda',
    to: 'logs',
    kind: 'writes-logs',
    label: 'writes to',
    description: "A function's log group, from its logging configuration or the AWS default.",
    resolve(fn, lookup) {
      const name = fn.attributes?.logGroup;
      if (!name) return [];
      const target = lookup.byName.get(`logs:${name}`);
      if (!target) return [];
      const declared = fn.attributes?.logGroupSource === 'configuration';
      return [
        {
          target: target.id,
          confidence: declared ? CONFIDENCE.DECLARED : CONFIDENCE.DEFAULT,
          evidence: declared
            ? 'lambda:GetFunctionConfiguration LoggingConfig.LogGroup'
            : 'AWS default log group naming, confirmed to exist in CloudWatch',
          detail: null,
        },
      ];
    },
  },
  {
    id: 'lambda-assumes-role',
    from: 'lambda',
    to: 'iam',
    kind: 'assumes-role',
    label: 'runs as',
    description: "A function's execution role.",
    resolve(fn, lookup) {
      const roleArn = fn.attributes?.roleArn;
      if (!roleArn) return [];
      const target = lookup.byArn.get(roleArn);
      if (!target) return [];
      return [
        {
          target: target.id,
          confidence: CONFIDENCE.DECLARED,
          evidence: 'lambda:GetFunctionConfiguration Role',
          detail: null,
        },
      ];
    },
  },
];

export default RELATIONSHIP_RULES;

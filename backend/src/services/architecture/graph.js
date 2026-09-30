import { RELATIONSHIP_RULES } from './relationships.js';

/**
 * Turns a discovery inventory into a node/edge graph.
 *
 * The builder knows nothing about specific AWS services. It indexes whatever discovery
 * returned, runs every relationship rule that applies, and groups whatever is left
 * unconnected so a long tail of standalone resources does not bury the topology.
 */

const GROUP_THRESHOLD = 3;

/** "7 parameters" reads better on a diagram box than "7 Parameter resources". */
function pluralise(count, noun) {
  const lower = noun.toLowerCase();
  return `${count} ${lower}${count === 1 ? '' : 's'}`;
}

function buildLookup(resources) {
  const byArn = new Map();
  const byName = new Map();
  for (const resource of resources) {
    if (resource.arn) byArn.set(resource.arn, resource);
    byName.set(`${resource.service}:${resource.name}`, resource);
  }
  return { byArn, byName };
}

export function buildGraph(inventory) {
  const resources = (inventory.services ?? [])
    .filter((entry) => entry.status !== 'failed')
    .flatMap((entry) => entry.resources ?? []);

  const lookup = buildLookup(resources);

  const nodes = resources.map((resource) => ({
    id: resource.id,
    kind: 'resource',
    service: resource.service,
    type: resource.type,
    name: resource.name,
    region: resource.region,
    arn: resource.arn,
    status: resource.status,
    tags: resource.tags,
    attributes: resource.attributes,
  }));

  const edges = [];
  const rulesApplied = [];

  for (const rule of RELATIONSHIP_RULES) {
    const sources = resources.filter((resource) => resource.service === rule.from);
    let emitted = 0;

    for (const source of sources) {
      for (const result of rule.resolve(source, lookup)) {
        edges.push({
          id: `${rule.id}:${source.id}->${result.target}`,
          source: source.id,
          target: result.target,
          kind: rule.kind,
          label: rule.label,
          confidence: result.confidence,
          evidence: result.evidence,
          detail: result.detail ?? null,
        });
        emitted += 1;
      }
    }

    rulesApplied.push({
      id: rule.id,
      from: rule.from,
      to: rule.to,
      kind: rule.kind,
      description: rule.description,
      // A rule that found nothing is reported rather than hidden: "no edges" and
      // "we never looked" are different answers.
      candidateSources: sources.length,
      edgesFound: emitted,
    });
  }

  // Anything with no edge in either direction is unconnected. A handful of those are
  // fine as their own boxes; a long tail of them is collapsed into one labelled group
  // so the topology stays readable. Nothing is hidden - the group carries its members.
  const connected = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  const isolatedByService = new Map();
  for (const node of nodes) {
    if (connected.has(node.id)) continue;
    if (!isolatedByService.has(node.service)) isolatedByService.set(node.service, []);
    isolatedByService.get(node.service).push(node);
  }

  const groups = [];
  const groupedIds = new Set();
  for (const [service, members] of isolatedByService) {
    if (members.length < GROUP_THRESHOLD) continue;
    groups.push({
      id: `group:${service}`,
      kind: 'group',
      service,
      type: members[0].type,
      name: pluralise(members.length, members[0].type.split('::').pop()),
      region: members[0].region,
      status: { level: 'healthy', label: `${members.length} resources` },
      memberCount: members.length,
      members: members.map((member) => ({
        id: member.id,
        name: member.name,
        status: member.status,
        attributes: member.attributes,
        tags: member.tags,
        arn: member.arn,
      })),
    });
    for (const member of members) groupedIds.add(member.id);
  }

  const visibleNodes = [...nodes.filter((node) => !groupedIds.has(node.id)), ...groups];

  const byService = {};
  for (const node of nodes) {
    byService[node.service] = (byService[node.service] ?? 0) + 1;
  }

  const attention = nodes.filter((node) => ['warning', 'failing'].includes(node.status?.level));

  return {
    nodes: visibleNodes,
    edges,
    summary: {
      totalResources: nodes.length,
      servicesDetected: Object.keys(byService).length,
      byService,
      healthyResources: nodes.filter((node) => node.status?.level === 'healthy').length,
      resourcesRequiringAttention: attention.length,
      attentionResources: attention.map((node) => ({
        id: node.id,
        name: node.name,
        service: node.service,
        reason: node.status?.label ?? null,
      })),
      connectedResources: connected.size,
      unconnectedResources: nodes.length - connected.size,
      relationshipCount: edges.length,
      groupedNodes: groups.length,
    },
    relationshipRules: rulesApplied,
  };
}

export default buildGraph;

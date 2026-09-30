import config from '../config/index.js';
import { discoverResources } from './discovery.service.js';
import { buildGraph } from './architecture/graph.js';

/**
 * Architecture analysis.
 *
 * Reads the same live discovery inventory the Infrastructure page uses and derives the
 * topology from it, so the two views can never disagree about what exists. Discovery's
 * partial-failure reporting is passed straight through: a graph built from four of five
 * services says so rather than quietly looking complete.
 */
export async function getArchitectureGraph() {
  const inventory = await discoverResources();
  const graph = buildGraph(inventory);

  return {
    generatedAt: new Date().toISOString(),
    region: config.aws.region,
    discovery: {
      discoveredAt: inventory.discoveredAt,
      durationMs: inventory.durationMs,
      partial: inventory.partial,
      summary: inventory.summary,
      services: inventory.services.map(({ service, label, status, resourceCount, error }) => ({
        service,
        label,
        status,
        resourceCount,
        error,
      })),
      errors: inventory.errors,
    },
    ...graph,
  };
}

export default { getArchitectureGraph };

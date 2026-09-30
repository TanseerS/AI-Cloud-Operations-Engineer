import dagre from '@dagrejs/dagre';

/**
 * Layered layout for the architecture graph.
 *
 * Dagre ranks nodes by their edges, so the topology decides the columns rather than any
 * hardcoded idea of which AWS service belongs where. Unconnected nodes get their own
 * rank and sit alongside rather than floating over the diagram.
 */

export const NODE_WIDTH = 264;
export const NODE_HEIGHT = 76;

export function layoutGraph(nodes, edges, direction = 'LR') {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: direction,
    nodesep: direction === 'LR' ? 28 : 40,
    ranksep: direction === 'LR' ? 96 : 72,
    marginx: 24,
    marginy: 24,
  });

  for (const node of nodes) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      graph.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(graph);

  return nodes.map((node) => {
    const positioned = graph.node(node.id);
    return {
      ...node,
      position: {
        x: (positioned?.x ?? 0) - NODE_WIDTH / 2,
        y: (positioned?.y ?? 0) - NODE_HEIGHT / 2,
      },
    };
  });
}

export default layoutGraph;

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import ResourceNode from './ResourceNode.jsx';
import NodeDetailPanel from './NodeDetailPanel.jsx';
import { layoutGraph } from './layout.js';

const NODE_TYPES = { resource: ResourceNode };

/** Narrow viewports read a vertical stack far better than a wide left-to-right chain. */
function useLayoutDirection() {
  const [direction, setDirection] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 900 ? 'TB' : 'LR',
  );

  useEffect(() => {
    const query = window.matchMedia('(max-width: 899px)');
    const update = (event) => setDirection(event.matches ? 'TB' : 'LR');
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return direction;
}

export function ArchitectureGraph({ graph, serviceLabels, resourceHealth = [], focusId = null }) {
  const direction = useLayoutDirection();
  const [selectedId, setSelectedId] = useState(focusId);

  // A link from a finding opens the graph with that resource already selected.
  useEffect(() => {
    if (focusId) setSelectedId(focusId);
  }, [focusId]);

  const healthByResource = useMemo(
    () => new Map(resourceHealth.map((entry) => [entry.resourceId, entry])),
    [resourceHealth],
  );

  const { flowNodes, flowEdges } = useMemo(() => {
    const positioned = layoutGraph(graph.nodes, graph.edges, direction);

    return {
      flowNodes: positioned.map((node) => ({
        id: node.id,
        type: 'resource',
        position: node.position,
        data: {
          ...node,
          // A node's dot reflects its worst finding, so the diagram and the issue list
          // can never disagree about which resource is in trouble.
          health: healthByResource.get(node.id) ?? null,
          serviceLabel: serviceLabels[node.service] ?? node.service,
          sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
          targetPosition: direction === 'LR' ? Position.Left : Position.Top,
        },
        sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
        targetPosition: direction === 'LR' ? Position.Left : Position.Top,
      })),
      flowEdges: graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        label: edge.label,
        // A relationship that rests on an AWS default rather than an explicit setting is
        // drawn dashed, so the diagram never overstates what it knows.
        style: edge.confidence === 'declared' ? undefined : { strokeDasharray: '5 4' },
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        data: edge,
      })),
    };
  }, [graph, direction, serviceLabels, healthByResource]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedId)?.data ?? null,
    [nodes, selectedId],
  );

  // React Flow reads `selected` off the node, so our selection has to be projected onto
  // it - otherwise the panel opens while the node stays unhighlighted.
  const renderedNodes = useMemo(
    () => nodes.map((node) => ({ ...node, selected: node.id === selectedId })),
    [nodes, selectedId],
  );

  const connections = useMemo(() => {
    if (!selectedId) return [];
    const nameFor = (id) => nodes.find((node) => node.id === id)?.data?.name ?? id;
    return graph.edges
      .filter((edge) => edge.source === selectedId || edge.target === selectedId)
      .map((edge) => ({
        id: edge.id,
        direction: edge.source === selectedId ? 'out' : 'in',
        label: edge.label,
        confidence: edge.confidence,
        evidence: edge.evidence,
        otherName: nameFor(edge.source === selectedId ? edge.target : edge.source),
      }));
  }, [graph.edges, nodes, selectedId]);

  const onNodeClick = useCallback((_event, node) => setSelectedId(node.id), []);

  // Escape closes the panel, matching the drawer behaviour elsewhere in the app.
  useEffect(() => {
    if (!selectedId) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId]);

  return (
    <div className={`arch-canvas${selectedNode ? ' arch-canvas--with-panel' : ''}`}>
      <ReactFlow
        nodes={renderedNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={() => setSelectedId(null)}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: false }}
        nodesConnectable={false}
        edgesFocusable={false}
        selectNodesOnDrag={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>

      <NodeDetailPanel
        node={selectedNode}
        connections={connections}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

export default ArchitectureGraph;

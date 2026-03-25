import * as dagre from 'dagre';
import { Node, Edge } from 'reactflow';

export function getLayoutedElements(nodes: Node[], edges: Edge[], direction = 'LR') {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const isHorizontal = direction === 'LR';
  // Tighter spacing for a more dense, connected feel
  dagreGraph.setGraph({ rankdir: direction, nodesep: 30, ranksep: 60, marginx: 20, marginy: 20 });

  nodes.forEach((node) => {
    // Smaller dimensions for a more compact, enterprise look
    const width = 180;
    const height = 45;
    dagreGraph.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 180 / 2,
        y: nodeWithPosition.y - 45 / 2,
      },
    };
  });

  return { nodes: newNodes, edges };
}

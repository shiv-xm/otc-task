import { GraphNodeData, GraphEdgeData, GraphPayload } from "@/types/graph";

export interface GraphStructure {
  nodes: Map<string, GraphNodeData>;
  edges: Map<string, GraphEdgeData>;
  adjacency: Map<string, string[]>;
  reverseAdjacency: Map<string, string[]>;
  nodeGroups: Map<string, string[]>;
}

export function buildGraph(nodes: GraphNodeData[], edges: GraphEdgeData[]): GraphStructure {
  const nodeMap = new Map<string, GraphNodeData>();
  const edgeMap = new Map<string, GraphEdgeData>();
  const adjacency = new Map<string, string[]>();
  const reverseAdjacency = new Map<string, string[]>();
  const nodeGroups = new Map<string, string[]>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
    adjacency.set(node.id, []);
    reverseAdjacency.set(node.id, []);

    if (!nodeGroups.has(node.entityType)) {
      nodeGroups.set(node.entityType, []);
    }
    nodeGroups.get(node.entityType)!.push(node.id);
  }

  for (const edge of edges) {
    edgeMap.set(edge.id, edge);
    if (!adjacency.has(edge.fromNodeId)) adjacency.set(edge.fromNodeId, []);
    if (!reverseAdjacency.has(edge.toNodeId)) reverseAdjacency.set(edge.toNodeId, []);

    adjacency.get(edge.fromNodeId)!.push(edge.toNodeId);
    reverseAdjacency.get(edge.toNodeId)!.push(edge.fromNodeId);
  }

  return { nodes: nodeMap, edges: edgeMap, adjacency, reverseAdjacency, nodeGroups };
}

export interface BrokenFlowsResult {
  brokenNodes: string[];
  brokenEdges: string[];
  count: number;
}

export function detectBrokenFlows(graph: GraphStructure): BrokenFlowsResult {
  const brokenNodes = new Set<string>();

  const orders = graph.nodeGroups.get("SalesOrder") || [];

  for (const orderId of orders) {
    let hasDelivery = false;
    let hasBilling = false;
    let hasPayment = false;

    const queue = [orderId];
    const visited = new Set<string>([orderId]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const node = graph.nodes.get(current);
      if (node) {
        if (node.entityType === "DeliveryHeader") hasDelivery = true;
        if (node.entityType === "BillingDocument") hasBilling = true;
        if (node.entityType === "Payment" || node.entityType === "JournalEntry") hasPayment = true;
      }

      for (const neighbor of (graph.adjacency.get(current) || [])) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    if (!hasDelivery || !hasBilling || !hasPayment) {
      brokenNodes.add(orderId);
    }
  }

  return {
    brokenNodes: Array.from(brokenNodes),
    brokenEdges: [],
    count: brokenNodes.size,
  };
}

export function findBottlenecks(graph: GraphStructure, topK: number = 5): string[] {
  const incomingCounts: { id: string; count: number }[] = [];

  for (const [nodeId, incoming] of graph.reverseAdjacency.entries()) {
    incomingCounts.push({ id: nodeId, count: incoming.length });
  }

  incomingCounts.sort((a, b) => b.count - a.count);

  return incomingCounts.slice(0, topK).filter(n => n.count > 1).map(n => n.id);
}

export function longestFlowPath(graph: GraphStructure): string[] {
  let maxPath: string[] = [];
  const memo = new Map<string, string[]>();

  function dfs(nodeId: string, visited: Set<string>): string[] {
    if (memo.has(nodeId)) return memo.get(nodeId)!;

    let longestFromHere: string[] = [];
    visited.add(nodeId);

    for (const neighbor of (graph.adjacency.get(nodeId) || [])) {
      if (!visited.has(neighbor)) {
        const path = dfs(neighbor, visited);
        if (path.length > longestFromHere.length) {
          longestFromHere = path;
        }
      }
    }

    visited.delete(nodeId);
    const result = [nodeId, ...longestFromHere];
    memo.set(nodeId, result);
    return result;
  }

  for (const nodeId of graph.nodes.keys()) {
    const path = dfs(nodeId, new Set<string>());
    if (path.length > maxPath.length) {
      maxPath = path;
    }
  }

  return maxPath;
}

export function orphanNodes(graph: GraphStructure): string[] {
  const orphans: string[] = [];
  for (const nodeId of graph.nodes.keys()) {
    const inDegree = graph.reverseAdjacency.get(nodeId)?.length || 0;
    const outDegree = graph.adjacency.get(nodeId)?.length || 0;
    if (inDegree === 0 && outDegree === 0) {
      orphans.push(nodeId);
    }
  }
  return orphans;
}

export interface Cluster {
  id: string;
  nodes: string[];
  edges: string[];
}

export function clusterGraph(graph: GraphStructure): { clusters: Cluster[] } {
  // Connected components
  const visitedNodes = new Set<string>();
  const clusters: Cluster[] = [];
  let clusterIndex = 1;

  // Build undirected adjacency just for connected components
  const undirectedAdjacency = new Map<string, string[]>();
  for (const nodeId of graph.nodes.keys()) {
    undirectedAdjacency.set(nodeId, []);
  }
  for (const [fromId, neighbors] of graph.adjacency.entries()) {
    for (const toId of neighbors) {
      undirectedAdjacency.get(fromId)!.push(toId);
      undirectedAdjacency.get(toId)!.push(fromId);
    }
  }

  for (const nodeId of graph.nodes.keys()) {
    if (!visitedNodes.has(nodeId)) {
      const clusterNodes: string[] = [];
      const clusterEdges = new Set<string>(); // avoid duplicate edges if undirected
      const queue = [nodeId];
      visitedNodes.add(nodeId);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        clusterNodes.push(curr);

        for (const neighbor of (undirectedAdjacency.get(curr) || [])) {
          if (!visitedNodes.has(neighbor)) {
            visitedNodes.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      // Find all edges strictly within this cluster
      for (const [edgeId, edge] of graph.edges.entries()) {
        if (clusterNodes.includes(edge.fromNodeId) && clusterNodes.includes(edge.toNodeId)) {
          clusterEdges.add(edgeId);
        }
      }

      clusters.push({
        id: `cluster-${clusterIndex++}`,
        nodes: clusterNodes,
        edges: Array.from(clusterEdges)
      });
    }
  }

  // Sort clusters by size (descending)
  clusters.sort((a, b) => b.nodes.length - a.nodes.length);

  return { clusters };
}

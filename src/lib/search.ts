import { GraphPayload } from "@/types/graph";

export function searchNodes(graph: GraphPayload, query: string): { matchedNodes: string[] } {
  const searchTerm = query.toLowerCase();
  
  const matchedNodes = graph.nodes.filter(node => {
    return (
      node.label.toLowerCase().includes(searchTerm) ||
      node.businessKey.toLowerCase().includes(searchTerm) ||
      node.entityType.toLowerCase().includes(searchTerm) ||
      (node.subtitle && node.subtitle.toLowerCase().includes(searchTerm))
    );
  }).map(node => node.id);

  return { matchedNodes };
}

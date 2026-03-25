
import { PrismaClient } from "@prisma/client";
import type {
  GraphNodeData,
  GraphEdgeData,
  GraphPayload,
  NeighborhoodPayload,
  MetadataCard,
  MetadataField,
  RelatedEntityRef,
  EntityType,
  RelationType,
} from "@/types/graph";
import { getFieldDisplayName } from "./labels";

const prisma = new PrismaClient();


function toNodeData(row: {
  id: string;
  entityType: string;
  businessKey: string;
  label: string;
  subtitle: string | null;
  metadata: string;
  searchText: string;
}): GraphNodeData {
  let meta: Record<string, unknown> = {};
  try { meta = JSON.parse(row.metadata); } catch { /* empty */ }
  return {
    id: row.id,
    entityType: row.entityType as EntityType,
    businessKey: row.businessKey,
    label: row.label,
    subtitle: row.subtitle ?? undefined,
    metadata: meta,
    searchText: row.searchText,
  };
}

function toEdgeData(row: {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relationType: string;
  metadata: string;
}): GraphEdgeData {
  let meta: Record<string, unknown> = {};
  try { meta = JSON.parse(row.metadata); } catch { /* empty */ }
  return {
    id: row.id,
    fromNodeId: row.fromNodeId,
    toNodeId: row.toNodeId,
    relationType: row.relationType as RelationType,
    metadata: meta,
  };
}

// ── Overview ─────────────────────────────────────────────────

export async function getGraphOverview(opts?: {
  entityTypes?: EntityType[];
  limit?: number;
}): Promise<GraphPayload> {
  const limit = opts?.limit ?? 300;
  
  // 1. Pick top Sales Orders as seeds (hubs)
  const seeds = await prisma.graphNode.findMany({
    where: { entityType: "SalesOrder" },
    take: Math.floor(limit / 5),
    orderBy: { id: "asc" },
  });

  const seedIds = seeds.map(s => s.id);
  const visitedNodeIds = new Set<string>(seedIds);
  const allEdges: any[] = [];

  // 2. Find 1-hop neighbors (Delivery, Customer, Product)
  const hop1Edges = await prisma.graphEdge.findMany({
    where: {
      OR: [
        { fromNodeId: { in: seedIds } },
        { toNodeId: { in: seedIds } }
      ]
    },
    take: limit
  });

  for (const e of hop1Edges) {
    allEdges.push(e);
    visitedNodeIds.add(e.fromNodeId);
    visitedNodeIds.add(e.toNodeId);
  }

  // 3. Find 2-hop neighbors (Billing, Journal, Payment)
  const hop2Ids = Array.from(visitedNodeIds).filter(id => !seedIds.includes(id));
  if (hop2Ids.length > 0 && visitedNodeIds.size < limit) {
    const hop2Edges = await prisma.graphEdge.findMany({
      where: {
        OR: [
          { fromNodeId: { in: hop2Ids } },
          { toNodeId: { in: hop2Ids } }
        ]
      },
      take: Math.floor(limit / 2)
    });

    for (const e of hop2Edges) {
      if (visitedNodeIds.size < limit) {
        allEdges.push(e);
        visitedNodeIds.add(e.fromNodeId);
        visitedNodeIds.add(e.toNodeId);
      }
    }
  }

  // 4. Fetch all accumulated nodes
  const nodes = await prisma.graphNode.findMany({
    where: { id: { in: Array.from(visitedNodeIds) } }
  });

  const [totalNodes, totalEdges] = await Promise.all([
    prisma.graphNode.count(),
    prisma.graphEdge.count(),
  ]);

  return {
    nodes: nodes.map(toNodeData),
    edges: allEdges.map(toEdgeData),
    totalNodes,
    totalEdges,
  };
}

// ── Neighborhood (BFS subgraph) ───────────────────────────────

/**
 * BFS expansion from a single node up to `depth` hops.
 * `limit` caps total returned nodes to keep the UI fast.
 */
export async function getNeighborhood(
  centerId: string,
  depth = 2,
  limit = 80
): Promise<NeighborhoodPayload | null> {
  const centerRow = await prisma.graphNode.findUnique({ where: { id: centerId } });
  if (!centerRow) return null;

  const visited = new Set<string>([centerId]);
  const frontier: string[] = [centerId];
  const allEdgeIds = new Set<string>();
  const allEdges: GraphEdgeData[] = [];

  for (let d = 0; d < depth && frontier.length > 0 && visited.size < limit; d++) {
    const outEdges = await prisma.graphEdge.findMany({
      where: { fromNodeId: { in: frontier } },
    });
    const inEdges = await prisma.graphEdge.findMany({
      where: { toNodeId: { in: frontier } },
    });
    const nextFrontier: string[] = [];

    for (const e of [...outEdges, ...inEdges]) {
      if (!allEdgeIds.has(e.id)) {
        allEdgeIds.add(e.id);
        allEdges.push(toEdgeData(e));
      }
      const other = e.fromNodeId === frontier[0] || frontier.includes(e.fromNodeId)
        ? e.toNodeId
        : e.fromNodeId;
      if (!visited.has(other) && visited.size < limit) {
        visited.add(other);
        nextFrontier.push(other);
      }
    }
    frontier.splice(0, frontier.length, ...nextFrontier);
  }

  const nodeRows = await prisma.graphNode.findMany({
    where: { id: { in: [...visited] } },
  });

  return {
    center: toNodeData(centerRow),
    nodes: nodeRows.map(toNodeData),
    edges: allEdges,
    depth,
  };
}

// ── O2C Flow Trace ────────────────────────────────────────────

/**
 * Given a document ID (any type), returns the full O2C chain:
 * SalesOrder → Delivery → BillingDocument → JournalEntry → Payment
 *
 * Strategy: Find the start node, then walk edges in both
 * directions across the O2C edge types.
 */
export async function traceDocumentFlow(
  businessKey: string
): Promise<GraphPayload> {
  // Resolve the starting node (try all document types)
  const startNode = await prisma.graphNode.findFirst({
    where: {
      businessKey,
      entityType: {
        in: [
          "SalesOrder",
          "DeliveryHeader",
          "BillingDocument",
          "JournalEntry",
          "Payment",
        ],
      },
    },
  });

  if (!startNode) {
    return { nodes: [], edges: [], totalNodes: 0, totalEdges: 0 };
  }

  // BFS through O2C edges only (no master data hops)
  const o2cRelations: RelationType[] = [
    "HAS_DELIVERY",
    "BILLED_FROM_DELIVERY",
    "POSTED_TO_JOURNAL",
    "CLEARED_BY",
  ];

  const visited = new Set<string>([startNode.id]);
  const frontier = [startNode.id];
  const allEdgeIds = new Set<string>();
  const allEdges: GraphEdgeData[] = [];

  // Walk forward and backward along O2C edges
  for (let hop = 0; hop < 6 && frontier.length > 0; hop++) {
    const outEdges = await prisma.graphEdge.findMany({
      where: {
        fromNodeId: { in: frontier },
        relationType: { in: o2cRelations },
      },
    });
    const inEdges = await prisma.graphEdge.findMany({
      where: {
        toNodeId: { in: frontier },
        relationType: { in: o2cRelations },
      },
    });

    const nextFrontier: string[] = [];
    for (const e of [...outEdges, ...inEdges]) {
      if (!allEdgeIds.has(e.id)) {
        allEdgeIds.add(e.id);
        allEdges.push(toEdgeData(e));
      }
      for (const nid of [e.fromNodeId, e.toNodeId]) {
        if (!visited.has(nid)) {
          visited.add(nid);
          nextFrontier.push(nid);
        }
      }
    }
    frontier.splice(0, frontier.length, ...nextFrontier);
  }

  // Also pull the customer node for context
  const docNodes = await prisma.graphNode.findMany({
    where: { id: { in: [...visited] } },
  });

  const custEdges = await prisma.graphEdge.findMany({
    where: {
      fromNodeId: { in: [...visited] },
      relationType: "PLACED_BY",
    },
  });
  for (const e of custEdges) {
    if (!allEdgeIds.has(e.id)) {
      allEdgeIds.add(e.id);
      allEdges.push(toEdgeData(e));
    }
    if (!visited.has(e.toNodeId)) {
      visited.add(e.toNodeId);
    }
  }

  const allNodes = await prisma.graphNode.findMany({
    where: { id: { in: [...visited] } },
  });

  return {
    nodes: allNodes.map(toNodeData),
    edges: allEdges,
    totalNodes: allNodes.length,
    totalEdges: allEdges.length,
  };
}

// ── Metadata Card ─────────────────────────────────────────────

/**
 * Returns a rich inspection-panel payload for one node.
 * Includes all metadata fields formatted for display, plus
 * a list of directly connected entities.
 */
export async function getMetadataCard(nodeId: string): Promise<MetadataCard | null> {
  const row = await prisma.graphNode.findUnique({ where: { id: nodeId } });
  if (!row) return null;

  const node = toNodeData(row);

  // Build metadata fields
  const fields: MetadataField[] = Object.entries(node.metadata).map(([key, val]) => ({
    key,
    displayName: getFieldDisplayName(key),
    value: val != null ? String(val) : null,
    highlight: ["totalNetAmount", "totalAmount", "currency", "postingDate", "clearingDate", "billingDocumentDate"].includes(key),
  }));

  // Related entities (outgoing)
  const outEdgeRows = await prisma.graphEdge.findMany({
    where: { fromNodeId: nodeId },
    include: { target: true },
  });
  const inEdgeRows = await prisma.graphEdge.findMany({
    where: { toNodeId: nodeId },
    include: { source: true },
  });

  const relatedEntities: RelatedEntityRef[] = [
    ...outEdgeRows.map((e) => ({
      nodeId: e.toNodeId,
      entityType: e.target.entityType as EntityType,
      label: e.target.label,
      relation: e.relationType as RelationType,
      direction: "outgoing" as const,
    })),
    ...inEdgeRows.map((e) => ({
      nodeId: e.fromNodeId,
      entityType: e.source.entityType as EntityType,
      label: e.source.label,
      relation: e.relationType as RelationType,
      direction: "incoming" as const,
    })),
  ];

  return {
    nodeId,
    entityType: node.entityType,
    label: node.label,
    subtitle: node.subtitle,
    fields,
    relatedEntities,
  };
}

// ── Free-text entity search ───────────────────────────────────

export async function searchEntities(
  query: string,
  limit = 20
): Promise<GraphNodeData[]> {
  const rows = await prisma.graphNode.findMany({
    where: {
      searchText: { contains: query },
    },
    take: limit,
  });
  return rows.map(toNodeData);
}

// ── Entity lookup by businessKey ──────────────────────────────

export async function findNodeByBusinessKey(
  businessKey: string,
  entityType?: string
): Promise<GraphNodeData | null> {
  const row = await prisma.graphNode.findFirst({
    where: {
      businessKey,
      ...(entityType ? { entityType } : {}),
    },
  });
  return row ? toNodeData(row) : null;
}

// ── Nodes by entity type ──────────────────────────────────────

export async function getNodesByType(
  entityType: EntityType,
  limit = 100
): Promise<GraphNodeData[]> {
  const rows = await prisma.graphNode.findMany({
    where: { entityType },
    take: limit,
    orderBy: { businessKey: "asc" },
  });
  return rows.map(toNodeData);
}

// ── Edges for node ────────────────────────────────────────────

export async function getEdgesForNode(nodeId: string): Promise<GraphEdgeData[]> {
  const [out, inc] = await Promise.all([
    prisma.graphEdge.findMany({ where: { fromNodeId: nodeId } }),
    prisma.graphEdge.findMany({ where: { toNodeId: nodeId } }),
  ]);
  return [...out, ...inc].map(toEdgeData);
}


export type EntityType =
  | "SalesOrder"
  | "DeliveryHeader"
  | "BillingDocument"
  | "JournalEntry"
  | "Payment"
  | "Customer"
  | "Product"
  | "Plant"
  | "Address";

export type RelationType =
  | "PLACED_BY"
  | "HAS_DELIVERY"
  | "BILLED_FROM_DELIVERY"
  | "POSTED_TO_JOURNAL"
  | "CLEARED_BY"
  | "REFERENCES_PRODUCT"
  | "LOCATED_AT_PLANT"
  | "SHIPS_FROM"
  | "HAS_ADDRESS"
  | "CANCELLED_BY";

// ── Node ─────────────────────────────────────────────────────

export interface GraphNodeData {
  id: string;
  entityType: EntityType;
  businessKey: string;
  label: string;
  subtitle?: string;
  metadata: Record<string, unknown>;
  searchText: string;
}

// ── Edge ─────────────────────────────────────────────────────

export interface GraphEdgeData {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relationType: RelationType;
  metadata: Record<string, unknown>;
}

// ── Graph payload (returned to UI) ────────────────────────────

export interface GraphPayload {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
  totalNodes: number;
  totalEdges: number;
}

// ── Neighborhood (subgraph around one node) ───────────────────

export interface NeighborhoodPayload {
  center: GraphNodeData;
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
  depth: number;
}

// ── Metadata card (inspection panel) ─────────────────────────

export interface MetadataCard {
  nodeId: string;
  entityType: EntityType;
  label: string;
  subtitle?: string;
  fields: MetadataField[];
  relatedEntities: RelatedEntityRef[];
}

export interface MetadataField {
  key: string;
  displayName: string;
  value: string | null;
  highlight?: boolean;
}

export interface RelatedEntityRef {
  nodeId: string;
  entityType: EntityType;
  label: string;
  relation: RelationType;
  direction: "outgoing" | "incoming";
}

// ── Visual node/edge for ReactFlow ───────────────────────────

export interface FlowNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: {
    label: string;
    subtitle?: string;
    entityType: EntityType;
    businessKey: string;
    metadata: Record<string, unknown>;
    highlighted?: boolean;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
  animated?: boolean;
  style?: Record<string, unknown>;
}

// ============================================================
// src/types/query.ts
// Query engine types — plans, results, and response payloads.
// ============================================================

// ── Intent / Plan Kind ────────────────────────────────────────

export type QueryPlanKind =
  | "TRACE_DOCUMENT_FLOW"
  | "FIND_JOURNAL_FOR_BILLING"
  | "FIND_PAYMENT_FOR_BILLING"
  | "TOP_PRODUCTS_BY_BILLING_COUNT"
  | "TOP_CUSTOMERS_BY_BILLED_VOLUME"
  | "FIND_BROKEN_SALES_FLOWS"
  | "FIND_DELIVERED_NOT_BILLED"
  | "FIND_BILLED_WITHOUT_DELIVERY"
  | "BILLING_CANCELLATION_LOOKUP"
  | "LOOKUP_ENTITY"
  | "NEIGHBORHOOD_EXPANSION"
  | "CUSTOMER_ORDER_SUMMARY"
  | "COUNT_AGGREGATION"
  | "RELATIONSHIP_LOOKUP"
  | "OUT_OF_SCOPE";


export interface TraceDocumentFlowPlan {
  kind: "TRACE_DOCUMENT_FLOW";
  documentId: string;
  documentType: "SalesOrder" | "BillingDocument" | "DeliveryHeader" | "JournalEntry" | "Payment";
}

export interface FindJournalForBillingPlan {
  kind: "FIND_JOURNAL_FOR_BILLING";
  billingDocumentId: string;
}

export interface FindPaymentForBillingPlan {
  kind: "FIND_PAYMENT_FOR_BILLING";
  billingDocumentId: string;
}

export interface TopProductsByBillingCountPlan {
  kind: "TOP_PRODUCTS_BY_BILLING_COUNT";
  topN: number;
  customerId?: string;
}

export interface TopCustomersByBilledVolumePlan {
  kind: "TOP_CUSTOMERS_BY_BILLED_VOLUME";
  topN: number;
}

export interface FindBrokenSalesFlowsPlan {
  kind: "FIND_BROKEN_SALES_FLOWS";
  filter?: "no_delivery" | "no_billing" | "no_payment" | "all";
  limit: number;
}

export interface FindDeliveredNotBilledPlan {
  kind: "FIND_DELIVERED_NOT_BILLED";
  limit: number;
}

export interface FindBilledWithoutDeliveryPlan {
  kind: "FIND_BILLED_WITHOUT_DELIVERY";
  limit: number;
}

export interface BillingCancellationLookupPlan {
  kind: "BILLING_CANCELLATION_LOOKUP";
  billingDocumentId?: string;
  limit: number;
}

export interface LookupEntityPlan {
  kind: "LOOKUP_ENTITY";
  entityType: string;
  businessKey: string;
}

export interface NeighborhoodExpansionPlan {
  kind: "NEIGHBORHOOD_EXPANSION";
  nodeId: string;
  depth: number;
  limit: number;
}

export interface CustomerOrderSummaryPlan {
  kind: "CUSTOMER_ORDER_SUMMARY";
  customerId: string;
}

export interface CountAggregationPlan {
  kind: "COUNT_AGGREGATION";
  target: "SalesOrder" | "BillingDocument" | "DeliveryHeader" | "JournalEntry" | "Payment" | "Customer" | "Product";
  filter?: Record<string, string>;
}

export interface RelationshipLookupPlan {
  kind: "RELATIONSHIP_LOOKUP";
  fromEntityType: string;
  fromBusinessKey: string;
  relationType?: string;
}

export interface OutOfScopePlan {
  kind: "OUT_OF_SCOPE";
  reason: string;
}

export type QueryPlan =
  | TraceDocumentFlowPlan
  | FindJournalForBillingPlan
  | FindPaymentForBillingPlan
  | TopProductsByBillingCountPlan
  | TopCustomersByBilledVolumePlan
  | FindBrokenSalesFlowsPlan
  | FindDeliveredNotBilledPlan
  | FindBilledWithoutDeliveryPlan
  | BillingCancellationLookupPlan
  | LookupEntityPlan
  | NeighborhoodExpansionPlan
  | CustomerOrderSummaryPlan
  | CountAggregationPlan
  | RelationshipLookupPlan
  | OutOfScopePlan;


export interface EvidenceRow {
  label: string;
  value: string | number | null;
  entityType?: string;
  businessKey?: string;
  nodeId?: string;
}


export interface RelatedEntity {
  nodeId: string;
  entityType: string;
  businessKey: string;
  label: string;
}


export interface FollowUpSuggestion {
  text: string;
  queryHint?: string;
}


export interface QueryResponse {
  question: string;
  planKind: QueryPlanKind;
  answerText: string;
  evidenceRows: EvidenceRow[];
  relatedEntities: RelatedEntity[];
  highlightNodeIds: string[];
  followUpSuggestions: FollowUpSuggestion[];
  wasRejected: boolean;
  rejectionReason?: string;
  durationMs: number;
}


export interface ClassificationResult {
  planKind: QueryPlanKind;
  documentId?: string;
  documentType?: string;
  customerId?: string;
  businessKey?: string;
  entityType?: string;
  nodeId?: string;
  topN?: number;
  depth?: number;
  filter?: string;
  confidence: "high" | "medium" | "low";
  outOfScopeReason?: string;
}

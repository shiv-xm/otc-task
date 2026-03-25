// ============================================================
// src/lib/query/planner.ts
// Converts a ClassificationResult into a deterministic QueryPlan.
// All entity type inference here uses database lookups — no LLM.
// ============================================================

import { PrismaClient } from "@prisma/client";
import type { ClassificationResult, QueryPlan } from "@/types/query";

const prisma = new PrismaClient();

// ── Main planner entry point ──────────────────────────────────

export async function buildQueryPlan(
  classification: ClassificationResult,
  originalQuestion: string
): Promise<QueryPlan> {
  const { planKind } = classification;

  switch (planKind) {
    // ─── Trace plans ───────────────────────────────────────
    case "TRACE_DOCUMENT_FLOW": {
      const docId = classification.documentId ?? classification.businessKey ?? "";
      const resolvedType = await inferEntityType(docId);
      return {
        kind: "TRACE_DOCUMENT_FLOW",
        documentId: docId,
        documentType: (classification.documentType as any) ?? resolvedType ?? "SalesOrder",
      };
    }

    case "FIND_JOURNAL_FOR_BILLING": {
      const billingId = classification.documentId ?? classification.businessKey ?? "";
      return { kind: "FIND_JOURNAL_FOR_BILLING", billingDocumentId: billingId };
    }

    case "FIND_PAYMENT_FOR_BILLING": {
      const billingId = classification.documentId ?? classification.businessKey ?? "";
      return { kind: "FIND_PAYMENT_FOR_BILLING", billingDocumentId: billingId };
    }

    // ─── Analytics ────────────────────────────────────────
    case "TOP_PRODUCTS_BY_BILLING_COUNT": {
      const topN = classification.topN ?? extractTopN(originalQuestion) ?? 10;
      return { kind: "TOP_PRODUCTS_BY_BILLING_COUNT", topN };
    }

    case "TOP_CUSTOMERS_BY_BILLED_VOLUME": {
      const topN = classification.topN ?? extractTopN(originalQuestion) ?? 10;
      return { kind: "TOP_CUSTOMERS_BY_BILLED_VOLUME", topN };
    }

    case "FIND_BROKEN_SALES_FLOWS": {
      const q = originalQuestion.toLowerCase();
      let filter: "no_delivery" | "no_billing" | "no_payment" | "all" = "all";
      if (q.includes("no delivery") || q.includes("without delivery")) filter = "no_delivery";
      else if (q.includes("not billed") || q.includes("no billing") || q.includes("no bill")) filter = "no_billing";
      else if (q.includes("no payment") || q.includes("unpaid")) filter = "no_payment";
      return { kind: "FIND_BROKEN_SALES_FLOWS", filter, limit: 20 };
    }

    case "FIND_DELIVERED_NOT_BILLED":
      return { kind: "FIND_DELIVERED_NOT_BILLED", limit: 20 };

    case "FIND_BILLED_WITHOUT_DELIVERY":
      return { kind: "FIND_BILLED_WITHOUT_DELIVERY", limit: 20 };

    case "BILLING_CANCELLATION_LOOKUP": {
      const billingId = classification.documentId ?? classification.businessKey;
      return { kind: "BILLING_CANCELLATION_LOOKUP", billingDocumentId: billingId, limit: 20 };
    }

    // ─── Lookup ────────────────────────────────────────────
    case "LOOKUP_ENTITY": {
      const key = classification.businessKey ?? classification.documentId ?? "";
      const type = classification.entityType ?? (await inferEntityType(key)) ?? "SalesOrder";
      return { kind: "LOOKUP_ENTITY", entityType: type, businessKey: key };
    }

    case "NEIGHBORHOOD_EXPANSION": {
      const nid = classification.nodeId ?? classification.businessKey ?? "";
      return {
        kind: "NEIGHBORHOOD_EXPANSION",
        nodeId: nid,
        depth: classification.depth ?? 2,
        limit: 80,
      };
    }

    case "CUSTOMER_ORDER_SUMMARY": {
      const custId = classification.customerId ?? classification.businessKey ?? "";
      return { kind: "CUSTOMER_ORDER_SUMMARY", customerId: custId };
    }

    case "COUNT_AGGREGATION": {
      const target = (classification.entityType as any) ?? "SalesOrder";
      return { kind: "COUNT_AGGREGATION", target };
    }

    case "RELATIONSHIP_LOOKUP": {
      const key = classification.businessKey ?? "";
      const type = classification.entityType ?? (await inferEntityType(key)) ?? "SalesOrder";
      return {
        kind: "RELATIONSHIP_LOOKUP",
        fromEntityType: type,
        fromBusinessKey: key,
        relationType: classification.filter,
      };
    }

    case "OUT_OF_SCOPE":
      return { kind: "OUT_OF_SCOPE", reason: classification.outOfScopeReason ?? "Unrelated to O2C dataset" };

    default:
      return { kind: "OUT_OF_SCOPE", reason: "Unrecognized plan kind" };
  }
}

// ── Entity type inference from business key ───────────────────
// Tries all tables in FK dependency order. Returns first match.

export async function inferEntityType(key: string): Promise<string | null> {
  if (!key) return null;

  const [so, dl, bd, cancel, cust, prod, je, pay] = await Promise.all([
    prisma.salesOrderHeader.findUnique({ where: { salesOrder: key }, select: { salesOrder: true } }),
    prisma.outboundDeliveryHeader.findUnique({ where: { deliveryDocument: key }, select: { deliveryDocument: true } }),
    prisma.billingDocumentHeader.findUnique({ where: { billingDocument: key }, select: { billingDocument: true } }),
    prisma.billingDocumentCancellation.findUnique({ where: { billingDocument: key }, select: { billingDocument: true } }),
    prisma.businessPartner.findFirst({
      where: { OR: [{ businessPartner: key }, { customer: key }] },
      select: { businessPartner: true },
    }),
    prisma.product.findUnique({ where: { product: key }, select: { product: true } }),
    prisma.journalEntryItemAR.findFirst({
      where: { accountingDocument: key },
      select: { accountingDocument: true },
    }),
    prisma.paymentAR.findFirst({
      where: { accountingDocument: key },
      select: { accountingDocument: true },
    }),
  ]);

  if (so) return "SalesOrder";
  if (dl) return "DeliveryHeader";
  if (bd) return "BillingDocument";
  if (cancel) return "BillingDocument"; // cancellation is still a billing doc
  if (cust) return "Customer";
  if (prod) return "Product";
  if (je) return "JournalEntry";
  if (pay) return "Payment";

  return null; // not found in any table
}

// ── Utility — extract number from "top 5", "top 10", etc ─────

function extractTopN(q: string): number | null {
  const match = q.match(/\btop\s+(\d+)\b/i);
  return match ? parseInt(match[1]) : null;
}

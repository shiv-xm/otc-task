// ============================================================
// src/lib/query/fallback-intent.ts
//
// When the LLM classification is uncertain or unavailable,
// this module uses deterministic keyword + entity-probe logic
// to classify valid in-domain questions.
//
// Priority order:
//   1. Exact numeric ID detection → resolve entity type → plan
//   2. Keyword patterns for analytics
//   3. Keyword patterns for broken flows
//   4. Count patterns
//   5. Return null (LLM result stands)
// ============================================================

import { PrismaClient } from "@prisma/client";
import type { ClassificationResult } from "@/types/query";

const prisma = new PrismaClient();

// ── Main entry ────────────────────────────────────────────────

export async function runFallbackIntent(
  question: string
): Promise<ClassificationResult | null> {
  const text = question.toLowerCase().trim();

  // ── 1. Extract numeric IDs  ───────────────────────────────
  // Match standalone numbers or alphanumeric codes that look like doc IDs
  const numericIds = text.match(/\b\d{4,}\b/g) ?? [];

  if (numericIds.length > 0) {
    for (const rawId of numericIds) {
      const entityTypes = await probeEntityType(rawId);

      if (entityTypes.length === 0) continue;

      // Choose most specific entity type
      const primaryType = entityTypes[0];

      // Journal entry lookups
      if (
        primaryType === "JournalEntry" ||
        text.includes("journal") ||
        text.includes("accounting doc") ||
        text.includes("fi doc") ||
        text.includes("je")
      ) {
        // "find journal entry for billing X"
        if (text.includes("journal") && (entityTypes.includes("BillingDocument") || primaryType === "BillingDocument")) {
          return { planKind: "FIND_JOURNAL_FOR_BILLING", documentId: rawId, confidence: "high" };
        }
        return { planKind: "TRACE_DOCUMENT_FLOW", documentId: rawId, documentType: "JournalEntry", confidence: "high" };
      }

      // Payment lookups
      if (text.includes("payment") || text.includes("cleared") || text.includes("paid")) {
        if (entityTypes.includes("BillingDocument")) {
          return { planKind: "FIND_PAYMENT_FOR_BILLING", documentId: rawId, confidence: "high" };
        }
      }

      // Journal for billing
      if (
        text.includes("journal") &&
        entityTypes.includes("BillingDocument")
      ) {
        return { planKind: "FIND_JOURNAL_FOR_BILLING", documentId: rawId, confidence: "high" };
      }

      // Cancellation check
      if (text.includes("cancel") || text.includes("reverse")) {
        return { planKind: "BILLING_CANCELLATION_LOOKUP", documentId: rawId, confidence: "high" };
      }

      // Default trace for known entity types
      const typeMap: Record<string, string> = {
        SalesOrder: "SalesOrder",
        DeliveryHeader: "DeliveryHeader",
        BillingDocument: "BillingDocument",
        JournalEntry: "JournalEntry",
        Payment: "Payment",
        Customer: "Customer",
        Product: "Product",
      };

      return {
        planKind: "TRACE_DOCUMENT_FLOW",
        documentId: rawId,
        documentType: typeMap[primaryType] as any,
        confidence: "high",
      };
    }
  }

  // ── 2. Journal entry keyword without numeric ID ───────────

  if (
    (text.includes("journal") || text.includes("accounting document") || text.includes("fi doc")) &&
    numericIds.length === 0
  ) {
    return null; // Let LLM handle it
  }

  // ── 3. Analytics patterns ─────────────────────────────────

  if (
    text.match(/top.*(product|material).*(billing|invoice)/) ||
    text.match(/(product|material).*(most|highest|frequent).*(bill)/) ||
    text.match(/which products.*(billing|invoice)/)
  ) {
    return { planKind: "TOP_PRODUCTS_BY_BILLING_COUNT", topN: 10, confidence: "high" };
  }

  if (
    text.match(/(top|most).*(customer).*(bill|volume|amount)/) ||
    text.match(/customer.*(highest|most|top).*(bill|invoice)/)
  ) {
    return { planKind: "TOP_CUSTOMERS_BY_BILLED_VOLUME", topN: 10, confidence: "high" };
  }

  // ── 4. Broken flow patterns ───────────────────────────────

  if (
    text.includes("broken") ||
    text.includes("incomplete") ||
    text.includes("broken flow") ||
    text.includes("missing link")
  ) {
    return { planKind: "FIND_BROKEN_SALES_FLOWS", filter: "all", confidence: "high" };
  }

  if (
    (text.includes("delivered") && (text.includes("not billed") || text.includes("no billing") || text.includes("no bill"))) ||
    text.includes("delivered but not billed") ||
    text.includes("shipped but not invoiced")
  ) {
    return { planKind: "FIND_DELIVERED_NOT_BILLED", confidence: "high" };
  }

  if (
    text.includes("sales order") && (text.includes("no delivery") || text.includes("without delivery") || text.includes("not delivered"))
  ) {
    return { planKind: "FIND_BROKEN_SALES_FLOWS", filter: "no_delivery", confidence: "high" };
  }

  if (
    (text.includes("billed") || text.includes("billing")) &&
    (text.includes("no delivery") || text.includes("without delivery"))
  ) {
    return { planKind: "FIND_BILLED_WITHOUT_DELIVERY", confidence: "high" };
  }

  if (text.includes("cancelled billing") || text.includes("billing cancellation") || text.includes("reversed billing")) {
    return { planKind: "BILLING_CANCELLATION_LOOKUP", confidence: "high" };
  }

  // ── 5. Count patterns ─────────────────────────────────────

  if (text.match(/how many.*(sales order|order)/)) {
    return { planKind: "COUNT_AGGREGATION", entityType: "SalesOrder", confidence: "high" };
  }
  if (text.match(/how many.*(billing|invoice)/)) {
    return { planKind: "COUNT_AGGREGATION", entityType: "BillingDocument", confidence: "high" };
  }
  if (text.match(/how many.*(customer|partner)/)) {
    return { planKind: "COUNT_AGGREGATION", entityType: "Customer", confidence: "high" };
  }
  if (text.match(/how many.*(product|material)/)) {
    return { planKind: "COUNT_AGGREGATION", entityType: "Product", confidence: "high" };
  }
  if (text.match(/how many.*(delivery|deliver)/)) {
    return { planKind: "COUNT_AGGREGATION", entityType: "DeliveryHeader", confidence: "high" };
  }

  return null;
}

// ── Entity type probe ─────────────────────────────────────────
// Checks all tables in parallel and returns all matching types

async function probeEntityType(key: string): Promise<string[]> {
  const [so, dl, bd, cancel, cust, prod, je, pay] = await Promise.all([
    prisma.salesOrderHeader.findUnique({ where: { salesOrder: key }, select: { salesOrder: true } }),
    prisma.outboundDeliveryHeader.findUnique({ where: { deliveryDocument: key }, select: { deliveryDocument: true } }),
    prisma.billingDocumentHeader.findUnique({ where: { billingDocument: key }, select: { billingDocument: true } }),
    prisma.billingDocumentCancellation.findUnique({ where: { billingDocument: key }, select: { billingDocument: true } }),
    prisma.businessPartner.findFirst({ where: { OR: [{ businessPartner: key }, { customer: key }] }, select: { businessPartner: true } }),
    prisma.product.findUnique({ where: { product: key }, select: { product: true } }),
    prisma.journalEntryItemAR.findFirst({ where: { accountingDocument: key }, select: { accountingDocument: true } }),
    prisma.paymentAR.findFirst({ where: { accountingDocument: key }, select: { accountingDocument: true } }),
  ]);

  const matches: string[] = [];
  if (so) matches.push("SalesOrder");
  if (dl) matches.push("DeliveryHeader");
  if (bd) matches.push("BillingDocument");
  if (cancel && !bd) matches.push("BillingDocument"); // cancellation is a kind of billing doc
  if (cust) matches.push("Customer");
  if (prod) matches.push("Product");
  if (je) matches.push("JournalEntry");
  if (pay) matches.push("Payment");
  return matches;
}

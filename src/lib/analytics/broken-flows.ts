import { PrismaClient } from "@prisma/client";
import { nodeId } from "@/lib/graph/ids";
import type { EvidenceRow } from "@/types/query";

const prisma = new PrismaClient();

export interface AnalyticsResult {
  title: string;
  explanation: string;
  count: number;
  affectedIds: string[];
  evidenceRows: EvidenceRow[];
  highlightNodeIds: string[];
  sampleEvidence: Record<string, unknown>[];
}

// ── 1. Sales orders with items but no delivery ────────────────

export async function findOrdersWithNoDelivery(limit = 25): Promise<AnalyticsResult> {
  const allOrders = await prisma.salesOrderHeader.findMany({
    where: {
      OR: [
        { overallDeliveryStatus: "A" },
        { overallDeliveryStatus: "B" },
        { overallDeliveryStatus: null },
      ],
    },
    take: limit * 3,
    orderBy: { creationDate: "desc" },
    select: {
      salesOrder: true,
      soldToParty: true,
      totalNetAmount: true,
      transactionCurrency: true,
      overallDeliveryStatus: true,
      creationDate: true,
    },
  });

  // Cross-check: verify that the delivery item table has no reference
  const deliveryRefs = await prisma.outboundDeliveryItem.findMany({
    where: { referenceSdDocument: { in: allOrders.map((o) => o.salesOrder) } },
    select: { referenceSdDocument: true },
    distinct: ["referenceSdDocument"],
  });

  const ordersWithDelivery = new Set(deliveryRefs.map((d) => d.referenceSdDocument));
  const broken = allOrders.filter((o) => !ordersWithDelivery.has(o.salesOrder)).slice(0, limit);

  const evidenceRows: EvidenceRow[] = broken.map((so) => ({
    label: `SO ${so.salesOrder}`,
    value: `Cust: ${so.soldToParty ?? "—"} | Net: ${so.totalNetAmount ?? "0"} ${so.transactionCurrency ?? ""} | Del. status: ${so.overallDeliveryStatus ?? "null"}`,
    entityType: "SalesOrder",
    businessKey: so.salesOrder,
    nodeId: nodeId.salesOrder(so.salesOrder),
  }));

  return {
    title: "Sales Orders with No Delivery",
    explanation:
      `Found ${broken.length} sales order(s) that have no linked delivery document. ` +
      "These are stuck in order-placed state and require follow-up.",
    count: broken.length,
    affectedIds: broken.map((o) => o.salesOrder),
    evidenceRows,
    highlightNodeIds: broken.map((o) => nodeId.salesOrder(o.salesOrder)),
    sampleEvidence: broken.slice(0, 5) as unknown as Record<string, unknown>[],
  };
}

// ── 2. Delivered orders with no billing ──────────────────────

export async function findDeliveriesWithNoBilling(limit = 25): Promise<AnalyticsResult> {
  const deliveries = await prisma.outboundDeliveryHeader.findMany({
    where: {
      overallGoodsMovementStatus: { in: ["C", "B"] }, // goods moved
    },
    take: limit * 3,
    orderBy: { actualGoodsMovementDate: "desc" },
    select: {
      deliveryDocument: true,
      overallGoodsMovementStatus: true,
      actualGoodsMovementDate: true,
      shippingPoint: true,
    },
  });

  const billingRefs = await prisma.billingDocumentItem.findMany({
    where: { referenceSdDocument: { in: deliveries.map((d) => d.deliveryDocument) } },
    select: { referenceSdDocument: true },
    distinct: ["referenceSdDocument"],
  });

  const dlWithBilling = new Set(billingRefs.map((b) => b.referenceSdDocument));
  const broken = deliveries.filter((d) => !dlWithBilling.has(d.deliveryDocument)).slice(0, limit);

  const evidenceRows: EvidenceRow[] = broken.map((dl) => ({
    label: `Delivery ${dl.deliveryDocument}`,
    value: `GI: ${dl.actualGoodsMovementDate?.split("T")[0] ?? "—"} | Plant: ${dl.shippingPoint ?? "—"}`,
    entityType: "DeliveryHeader",
    businessKey: dl.deliveryDocument,
    nodeId: nodeId.delivery(dl.deliveryDocument),
  }));

  return {
    title: "Delivered Orders with No Billing",
    explanation:
      `Found ${broken.length} delivery document(s) where goods have been issued but no billing document exists. ` +
      "Revenue has not been recognized for these shipments.",
    count: broken.length,
    affectedIds: broken.map((d) => d.deliveryDocument),
    evidenceRows,
    highlightNodeIds: broken.map((d) => nodeId.delivery(d.deliveryDocument)),
    sampleEvidence: broken.slice(0, 5) as unknown as Record<string, unknown>[],
  };
}

// ── 3. Billing documents without a delivery reference ─────────

export async function findBillingsWithNoDelivery(limit = 25): Promise<AnalyticsResult> {
  const billings = await prisma.billingDocumentHeader.findMany({
    where: { billingDocumentIsCancelled: { not: "X" } },
    take: limit * 3,
    orderBy: { billingDocumentDate: "desc" },
    select: {
      billingDocument: true,
      soldToParty: true,
      totalNetAmount: true,
      transactionCurrency: true,
      billingDocumentDate: true,
    },
  });

  const bdIds = billings.map((b) => b.billingDocument);

  const itemsWithDelivery = await prisma.billingDocumentItem.findMany({
    where: {
      billingDocument: { in: bdIds },
      referenceSdDocument: { not: null },
    },
    select: { billingDocument: true },
    distinct: ["billingDocument"],
  });

  const bdWithDelivery = new Set(itemsWithDelivery.map((i) => i.billingDocument));
  const broken = billings.filter((b) => !bdWithDelivery.has(b.billingDocument)).slice(0, limit);

  const evidenceRows: EvidenceRow[] = broken.map((bd) => ({
    label: `Billing ${bd.billingDocument}`,
    value: `Cust: ${bd.soldToParty ?? "—"} | Net: ${bd.totalNetAmount ?? "0"} ${bd.transactionCurrency ?? ""} | Date: ${bd.billingDocumentDate?.split("T")[0] ?? "—"}`,
    entityType: "BillingDocument",
    businessKey: bd.billingDocument,
    nodeId: nodeId.billing(bd.billingDocument),
  }));

  return {
    title: "Billing Documents Without Delivery Reference",
    explanation:
      `Found ${broken.length} billing document(s) that have no linked delivery reference. ` +
      "This may indicate direct billing, cancelled flows, or data gaps.",
    count: broken.length,
    affectedIds: broken.map((b) => b.billingDocument),
    evidenceRows,
    highlightNodeIds: broken.map((b) => nodeId.billing(b.billingDocument)),
    sampleEvidence: broken.slice(0, 5) as unknown as Record<string, unknown>[],
  };
}

// ── 4. Journal entries without clean billing reference ────────

export async function findJournalsWithoutBilling(limit = 25): Promise<AnalyticsResult> {
  const journals = await prisma.journalEntryItemAR.findMany({
    where: { referenceDocument: null },
    take: limit,
    select: {
      accountingDocument: true,
      companyCode: true,
      fiscalYear: true,
      customer: true,
      postingDate: true,
      amountInCompanyCodeCurrency: true,
      companyCodeCurrency: true,
    },
    distinct: ["accountingDocument"],
  });

  const evidenceRows: EvidenceRow[] = journals.map((je) => ({
    label: `Journal ${je.accountingDocument}`,
    value: `Cust: ${je.customer ?? "—"} | ${je.amountInCompanyCodeCurrency ?? "—"} ${je.companyCodeCurrency ?? ""} | Posted: ${je.postingDate?.split("T")[0] ?? "—"}`,
    entityType: "JournalEntry",
    businessKey: je.accountingDocument,
    nodeId: nodeId.journalEntry(je.companyCode, je.fiscalYear, je.accountingDocument),
  }));

  return {
    title: "Journal Entries Without Billing Reference",
    explanation:
      `Found ${journals.length} journal entry(ies) that have no reference to a billing document. ` +
      "These may represent manual postings or data gaps in the chain.",
    count: journals.length,
    affectedIds: journals.map((j) => j.accountingDocument),
    evidenceRows,
    highlightNodeIds: journals.map((j) => nodeId.journalEntry(j.companyCode, j.fiscalYear, j.accountingDocument)),
    sampleEvidence: journals.slice(0, 5) as unknown as Record<string, unknown>[],
  };
}

// ── 5. Cancelled billing patterns ────────────────────────────

export async function findCancelledBillings(limit = 25): Promise<AnalyticsResult> {
  const cancelled = await prisma.billingDocumentHeader.findMany({
    where: { billingDocumentIsCancelled: "X" },
    take: limit,
    orderBy: { billingDocumentDate: "desc" },
    select: {
      billingDocument: true,
      soldToParty: true,
      totalNetAmount: true,
      transactionCurrency: true,
      billingDocumentDate: true,
      billingDocumentIsCancelled: true,
    },
  });

  const evidenceRows: EvidenceRow[] = cancelled.map((bd) => ({
    label: `[CANCELLED] Billing ${bd.billingDocument}`,
    value: `Cust: ${bd.soldToParty ?? "—"} | Net: ${bd.totalNetAmount ?? "0"} ${bd.transactionCurrency ?? ""} | Date: ${bd.billingDocumentDate?.split("T")[0] ?? "—"}`,
    entityType: "BillingDocument",
    businessKey: bd.billingDocument,
    nodeId: nodeId.billing(bd.billingDocument),
  }));

  return {
    title: "Cancelled Billing Documents",
    explanation:
      `Found ${cancelled.length} cancelled billing document(s). ` +
      "These may indicate returned goods, disputes, or order corrections.",
    count: cancelled.length,
    affectedIds: cancelled.map((b) => b.billingDocument),
    evidenceRows,
    highlightNodeIds: cancelled.map((b) => nodeId.billing(b.billingDocument)),
    sampleEvidence: cancelled.slice(0, 5) as unknown as Record<string, unknown>[],
  };
}

// ── 6. Customer flows with missing downstream records ─────────

export async function findCustomersWithMissingDownstream(limit = 10): Promise<AnalyticsResult> {
  const customers = await prisma.businessPartner.findMany({
    where: { customer: { not: null } },
    take: limit * 4,
    select: { customer: true, businessPartnerFullName: true, organizationBpName1: true },
  });

  const incomplete: { key: string; label: string; issue: string }[] = [];

  for (const cust of customers) {
    const custId = cust.customer!;
    const ordsCount = await prisma.salesOrderHeader.count({ where: { soldToParty: custId } });
    if (ordsCount === 0) continue; // no orders, skip

    const billCount = await prisma.billingDocumentHeader.count({ where: { soldToParty: custId } });
    if (billCount === 0) {
      incomplete.push({
        key: custId,
        label: cust.businessPartnerFullName ?? cust.organizationBpName1 ?? custId,
        issue: `Has ${ordsCount} sales order(s) but 0 billing documents`,
      });
    }
    if (incomplete.length >= limit) break;
  }

  const evidenceRows: EvidenceRow[] = incomplete.map((c) => ({
    label: c.label,
    value: c.issue,
    entityType: "Customer",
    businessKey: c.key,
    nodeId: nodeId.customer(c.key),
  }));

  return {
    title: "Customers with Missing Downstream Flow",
    explanation:
      `Found ${incomplete.length} customer(s) who placed sales orders but have no billing document — ` +
      "revenue not yet recognized.",
    count: incomplete.length,
    affectedIds: incomplete.map((c) => c.key),
    evidenceRows,
    highlightNodeIds: incomplete.map((c) => nodeId.customer(c.key)),
    sampleEvidence: incomplete.slice(0, 5) as unknown as Record<string, unknown>[],
  };
}

// ── Combined broken-flow report ────────────────────────────────

export async function runBrokenFlowReport(): Promise<AnalyticsResult[]> {
  const [a, b, c, d, e, f] = await Promise.all([
    findOrdersWithNoDelivery(20),
    findDeliveriesWithNoBilling(20),
    findBillingsWithNoDelivery(20),
    findJournalsWithoutBilling(20),
    findCancelledBillings(20),
    findCustomersWithMissingDownstream(10),
  ]);
  return [a, b, c, d, e, f];
}

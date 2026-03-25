
import { PrismaClient } from "@prisma/client";
import { nodeId } from "@/lib/graph/ids";
import type { EvidenceRow, RelatedEntity } from "@/types/query";

const prisma = new PrismaClient();

// ── Types ────────────────────────────────────────────────────

export interface TraceStep {
  order: number;
  entityType: string;
  businessKey: string;
  label: string;
  status: "found" | "missing";
  details?: Record<string, unknown>;
}

export interface TraceLink {
  from: string;   // businessKey of source
  to: string;     // businessKey of target
  relationType: string;
  status: "present" | "broken";
}

export interface TraceResult {
  entryType: string;
  entryKey: string;
  steps: TraceStep[];
  links: TraceLink[];
  highlightNodeIds: string[];
  evidenceRows: EvidenceRow[];
  relatedEntities: RelatedEntity[];
  missingLinks: string[];
  summary: string;
  isComplete: boolean;
}

// ── Helpers ──────────────────────────────────────────────────

function step(
  order: number,
  entityType: string,
  businessKey: string,
  label: string,
  details?: Record<string, unknown>
): TraceStep {
  return { order, entityType, businessKey, label, status: "found", details };
}

function missingStep(order: number, entityType: string): TraceStep {
  return { order, entityType, businessKey: "", label: `(no ${entityType})`, status: "missing" };
}

function link(from: string, to: string, relationType: string): TraceLink {
  return { from, to, relationType, status: "present" };
}

function brokenLink(from: string, toType: string, relationType: string): TraceLink {
  return { from, to: `(missing ${toType})`, relationType, status: "broken" };
}

// ── traceBySalesOrder ─────────────────────────────────────────

export async function traceBySalesOrder(salesOrderId: string): Promise<TraceResult> {
  const steps: TraceStep[] = [];
  const links: TraceLink[] = [];
  const highlightNodeIds: string[] = [];
  const evidenceRows: EvidenceRow[] = [];
  const relatedEntities: RelatedEntity[] = [];
  const missingLinks: string[] = [];

  // 1. Sales Order Header
  const soHeader = await prisma.salesOrderHeader.findUnique({
    where: { salesOrder: salesOrderId },
  });

  if (!soHeader) {
    return {
      entryType: "SalesOrder",
      entryKey: salesOrderId,
      steps: [missingStep(1, "SalesOrder")],
      links: [],
      highlightNodeIds: [],
      evidenceRows: [],
      relatedEntities: [],
      missingLinks: [`SalesOrder ${salesOrderId} not found in dataset`],
      summary: `Sales order "${salesOrderId}" was not found in the dataset.`,
      isComplete: false,
    };
  }

  steps.push(step(1, "SalesOrder", salesOrderId, `Sales Order ${salesOrderId}`, {
    soldToParty: soHeader.soldToParty,
    totalNetAmount: soHeader.totalNetAmount,
    currency: soHeader.transactionCurrency,
    deliveryStatus: soHeader.overallDeliveryStatus,
    billingStatus: soHeader.overallOrdReltdBillgStatus,
    creationDate: soHeader.creationDate,
  }));
  highlightNodeIds.push(nodeId.salesOrder(salesOrderId));
  evidenceRows.push({
    label: "Sales Order",
    value: `${salesOrderId} — ${soHeader.soldToParty ?? "—"} — ${soHeader.totalNetAmount ?? "0"} ${soHeader.transactionCurrency ?? ""}`,
    entityType: "SalesOrder",
    businessKey: salesOrderId,
    nodeId: nodeId.salesOrder(salesOrderId),
  });
  relatedEntities.push({ nodeId: nodeId.salesOrder(salesOrderId), entityType: "SalesOrder", businessKey: salesOrderId, label: `Sales Order ${salesOrderId}` });

  // 2. Sales Order Items
  const soItems = await prisma.salesOrderItem.findMany({
    where: { salesOrder: salesOrderId },
    take: 5,
    orderBy: { salesOrderItem: "asc" },
  });

  for (const item of soItems) {
    evidenceRows.push({
      label: `  Item ${item.salesOrderItem}`,
      value: `${item.material ?? "—"} | qty ${item.requestedQuantity ?? "—"} | net ${item.netAmount ?? "—"}`,
      entityType: "SalesOrder",
      businessKey: salesOrderId,
    });
  }

  // 3. Customer
  if (soHeader.soldToParty) {
    const customer = await prisma.businessPartner.findFirst({
      where: { OR: [{ customer: soHeader.soldToParty }, { businessPartner: soHeader.soldToParty }] },
    });
    const custKey = soHeader.soldToParty;
    if (customer) {
      steps.push(step(0, "Customer", custKey,
        customer.businessPartnerFullName ?? customer.organizationBpName1 ?? custKey, {
        customer: customer.customer,
      }));
      highlightNodeIds.push(nodeId.customer(custKey));
      relatedEntities.push({ nodeId: nodeId.customer(custKey), entityType: "Customer", businessKey: custKey, label: customer.businessPartnerFullName ?? custKey });
      links.push(link(salesOrderId, custKey, "PLACED_BY"));
    }
  }

  // 4. Delivery Documents linked to this sales order
  const deliveryItems = await prisma.outboundDeliveryItem.findMany({
    where: { referenceSdDocument: salesOrderId },
    select: { deliveryDocument: true },
    distinct: ["deliveryDocument"],
    take: 5,
  });

  const deliveryDocIds = deliveryItems.map((d) => d.deliveryDocument);

  if (deliveryDocIds.length === 0) {
    missingLinks.push("No delivery documents linked to this sales order");
    links.push(brokenLink(salesOrderId, "DeliveryHeader", "HAS_DELIVERY"));
    steps.push(missingStep(2, "DeliveryHeader"));
  }

  for (const dlId of deliveryDocIds) {
    const dlHeader = await prisma.outboundDeliveryHeader.findUnique({
      where: { deliveryDocument: dlId },
    });
    if (!dlHeader) continue;

    steps.push(step(2, "DeliveryHeader", dlId, `Delivery ${dlId}`, {
      actualGoodsMovement: dlHeader.actualGoodsMovementDate,
      deliveryStatus: dlHeader.overallGoodsMovementStatus,
      shippingPoint: dlHeader.shippingPoint,
    }));
    highlightNodeIds.push(nodeId.delivery(dlId));
    links.push(link(salesOrderId, dlId, "HAS_DELIVERY"));
    evidenceRows.push({
      label: "Delivery",
      value: `${dlId} — status ${dlHeader.overallGoodsMovementStatus ?? "—"}`,
      entityType: "DeliveryHeader",
      businessKey: dlId,
      nodeId: nodeId.delivery(dlId),
    });
    relatedEntities.push({ nodeId: nodeId.delivery(dlId), entityType: "DeliveryHeader", businessKey: dlId, label: `Delivery ${dlId}` });

    // 5. Billing Documents linked to this delivery
    const billingItems = await prisma.billingDocumentItem.findMany({
      where: { referenceSdDocument: dlId },
      select: { billingDocument: true },
      distinct: ["billingDocument"],
      take: 5,
    });

    const billingDocIds = billingItems.map((b) => b.billingDocument);

    if (billingDocIds.length === 0) {
      missingLinks.push(`Delivery ${dlId} has no billing document`);
      links.push(brokenLink(dlId, "BillingDocument", "BILLED_FROM_DELIVERY"));
      steps.push(missingStep(3, "BillingDocument"));
    }

    for (const bdId of billingDocIds) {
      const bdHeader = await prisma.billingDocumentHeader.findUnique({
        where: { billingDocument: bdId },
      });
      if (!bdHeader) continue;

      steps.push(step(3, "BillingDocument", bdId, `Billing ${bdId}`, {
        billingDate: bdHeader.billingDocumentDate,
        netAmount: bdHeader.totalNetAmount,
        currency: bdHeader.transactionCurrency,
        cancelled: bdHeader.billingDocumentIsCancelled === "X",
      }));
      highlightNodeIds.push(nodeId.billing(bdId));
      links.push(link(dlId, bdId, "BILLED_FROM_DELIVERY"));
      evidenceRows.push({
        label: "Billing",
        value: `${bdId} — ${bdHeader.totalNetAmount ?? "0"} ${bdHeader.transactionCurrency ?? ""}${bdHeader.billingDocumentIsCancelled === "X" ? " [CANCELLED]" : ""}`,
        entityType: "BillingDocument",
        businessKey: bdId,
        nodeId: nodeId.billing(bdId),
      });
      relatedEntities.push({ nodeId: nodeId.billing(bdId), entityType: "BillingDocument", businessKey: bdId, label: `Billing ${bdId}` });

      // 6. Journal Entries for this billing document
      const journalEntries = await prisma.journalEntryItemAR.findMany({
        where: { referenceDocument: bdId },
        select: { accountingDocument: true, postingDate: true, amountInCompanyCodeCurrency: true, companyCodeCurrency: true, companyCode: true, fiscalYear: true },
        distinct: ["accountingDocument"],
        take: 5,
      });

      if (journalEntries.length === 0) {
        missingLinks.push(`Billing document ${bdId} has no journal entry`);
        links.push(brokenLink(bdId, "JournalEntry", "POSTED_TO_JOURNAL"));
        steps.push(missingStep(4, "JournalEntry"));
      }

      for (const je of journalEntries) {
        steps.push(step(4, "JournalEntry", je.accountingDocument, `Journal ${je.accountingDocument}`, {
          postingDate: je.postingDate,
          amount: je.amountInCompanyCodeCurrency,
          currency: je.companyCodeCurrency,
        }));
        highlightNodeIds.push(nodeId.journal(je.companyCode, je.fiscalYear, je.accountingDocument));
        links.push(link(bdId, je.accountingDocument, "POSTED_TO_JOURNAL"));
        evidenceRows.push({
          label: "Journal Entry",
          value: `${je.accountingDocument} — ${je.amountInCompanyCodeCurrency ?? "—"} ${je.companyCodeCurrency ?? ""}`,
          entityType: "JournalEntry",
          businessKey: je.accountingDocument,
          nodeId: nodeId.journal(je.companyCode, je.fiscalYear, je.accountingDocument),
        });

        // 7. Payment / Clearing for this journal
        const payments = await prisma.paymentAR.findMany({
          where: { assignmentReference: je.accountingDocument },
          take: 3,
        });

        if (payments.length === 0) {
          // Try by billing amount reference
          const altPayments = await prisma.paymentAR.findMany({
            where: { invoiceReference: bdId },
            take: 3,
          });
          payments.push(...altPayments);
        }

        if (payments.length === 0) {
          missingLinks.push(`No payment found for journal ${je.accountingDocument}`);
          links.push(brokenLink(je.accountingDocument, "Payment", "CLEARED_BY"));
          steps.push(missingStep(5, "Payment"));
        }

        for (const pay of payments) {
          steps.push(step(5, "Payment", pay.accountingDocument, `Payment ${pay.accountingDocument}`, {
            clearingDate: pay.clearingDate,
            amount: pay.amountInCompanyCodeCurrency,
            currency: pay.companyCodeCurrency,
            customer: pay.customer,
          }));
          highlightNodeIds.push(nodeId.payment(pay.companyCode, pay.fiscalYear, pay.accountingDocument));
          links.push(link(je.accountingDocument, pay.accountingDocument, "CLEARED_BY"));
          evidenceRows.push({
            label: "Payment",
            value: `${pay.accountingDocument} — ${pay.amountInCompanyCodeCurrency ?? "—"} ${pay.companyCodeCurrency ?? ""}`,
            entityType: "Payment",
            businessKey: pay.accountingDocument,
            nodeId: nodeId.payment(pay.companyCode, pay.fiscalYear, pay.accountingDocument),
          });
          relatedEntities.push({ nodeId: nodeId.payment(pay.companyCode, pay.fiscalYear, pay.accountingDocument), entityType: "Payment", businessKey: pay.accountingDocument, label: `Payment ${pay.accountingDocument}` });
        }
      }
    }
  }

  const orderedSteps = steps.sort((a, b) => a.order - b.order);
  const isComplete = missingLinks.length === 0;
  const chainStr = orderedSteps.filter(s => s.status === "found").map(s => s.label).join(" → ");
  const summary = isComplete
    ? `Full O2C chain found: ${chainStr}`
    : `Partial O2C chain for ${salesOrderId}: ${chainStr}. Missing: ${missingLinks.join("; ")}.`;

  return {
    entryType: "SalesOrder",
    entryKey: salesOrderId,
    steps: orderedSteps,
    links,
    highlightNodeIds: [...new Set(highlightNodeIds)],
    evidenceRows,
    relatedEntities,
    missingLinks,
    summary,
    isComplete,
  };
}

// ── traceByDelivery ───────────────────────────────────────────

export async function traceByDelivery(deliveryId: string): Promise<TraceResult> {
  const dlHeader = await prisma.outboundDeliveryHeader.findUnique({
    where: { deliveryDocument: deliveryId },
  });

  if (!dlHeader) {
    return buildMissingResult("DeliveryHeader", deliveryId);
  }

  // Walk backward to Sales Order
  const dlItem = await prisma.outboundDeliveryItem.findFirst({
    where: { deliveryDocument: deliveryId },
    select: { referenceSdDocument: true },
  });

  if (dlItem?.referenceSdDocument) {
    return traceBySalesOrder(dlItem.referenceSdDocument);
  }

  // No sales order found, trace forward only
  return traceBySalesOrder(deliveryId); // will return not-found gracefully
}

// ── traceByBillingDocument ────────────────────────────────────

export async function traceByBillingDocument(billingId: string): Promise<TraceResult> {
  const bdHeader = await prisma.billingDocumentHeader.findUnique({
    where: { billingDocument: billingId },
  });

  if (!bdHeader) {
    return buildMissingResult("BillingDocument", billingId);
  }

  // Walk backward to delivery → sales order
  const bdItem = await prisma.billingDocumentItem.findFirst({
    where: { billingDocument: billingId },
    select: { referenceSdDocument: true },
  });

  if (bdItem?.referenceSdDocument) {
    // reference could be delivery doc
    const dlHeader = await prisma.outboundDeliveryHeader.findUnique({
      where: { deliveryDocument: bdItem.referenceSdDocument },
    });
    if (dlHeader) {
      return traceByDelivery(bdItem.referenceSdDocument);
    }
  }

  // Try to find sales order via soldToParty
  if (bdHeader.soldToParty) {
    const soHeader = await prisma.salesOrderHeader.findFirst({
      where: { soldToParty: bdHeader.soldToParty },
      orderBy: { creationDate: "desc" },
    });
    if (soHeader) {
      return traceBySalesOrder(soHeader.salesOrder);
    }
  }

  return buildMissingResult("BillingDocument", billingId);
}

// ── traceByJournalEntry ───────────────────────────────────────

export async function traceByJournalEntry(journalDocId: string): Promise<TraceResult> {
  const je = await prisma.journalEntryItemAR.findFirst({
    where: { accountingDocument: journalDocId },
    select: { referenceDocument: true, customer: true },
  });

  if (!je) {
    return buildMissingResult("JournalEntry", journalDocId);
  }

  if (je.referenceDocument) {
    return traceByBillingDocument(je.referenceDocument);
  }

  return buildMissingResult("JournalEntry", journalDocId);
}

// ── traceByCustomer ───────────────────────────────────────────

export async function traceByCustomer(customerId: string): Promise<TraceResult[]> {
  const orders = await prisma.salesOrderHeader.findMany({
    where: { soldToParty: customerId },
    take: 5,
    orderBy: { creationDate: "desc" },
    select: { salesOrder: true },
  });

  if (orders.length === 0) {
    return [buildMissingResult("Customer", customerId)];
  }

  const results = await Promise.all(orders.map((o) => traceBySalesOrder(o.salesOrder)));
  return results;
}

// ── Helpers ───────────────────────────────────────────────────

function buildMissingResult(entityType: string, key: string): TraceResult {
  return {
    entryType: entityType,
    entryKey: key,
    steps: [{ order: 1, entityType, businessKey: key, label: `(${entityType} ${key} not found)`, status: "missing" }],
    links: [],
    highlightNodeIds: [],
    evidenceRows: [],
    relatedEntities: [],
    missingLinks: [`${entityType} "${key}" not found in dataset`],
    summary: `${entityType} "${key}" was not found in the dataset. Please verify the document number.`,
    isComplete: false,
  };
}

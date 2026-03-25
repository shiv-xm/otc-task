import { PrismaClient } from "@prisma/client";
import type { QueryPlan, EvidenceRow, RelatedEntity, FollowUpSuggestion } from "@/types/query";
import { nodeId } from "@/lib/graph/ids";
import {
  traceBySalesOrder,
  traceByDelivery,
  traceByBillingDocument,
  traceByJournalEntry,
} from "@/lib/trace/trace-engine";
import {
  getNeighborhood,
  findNodeByBusinessKey,
} from "@/lib/graph/graph-service";
import {
  topProductsByBillingCount,
  topCustomersByBilledVolume,
} from "@/lib/analytics/top-queries";
import {
  findOrdersWithNoDelivery,
  findDeliveriesWithNoBilling,
  findBillingsWithNoDelivery,
  findCancelledBillings,
  runBrokenFlowReport,
} from "@/lib/analytics/broken-flows";

const prisma = new PrismaClient();

export interface ExecutionResult {
  answerText: string;
  evidenceRows: EvidenceRow[];
  relatedEntities: RelatedEntity[];
  highlightNodeIds: string[];
  followUpSuggestions: FollowUpSuggestion[];
  rawData?: unknown;
}


export async function executePlan(plan: QueryPlan): Promise<ExecutionResult> {
  switch (plan.kind) {
    case "TRACE_DOCUMENT_FLOW":
      return executeTraceDocumentFlow(plan.documentId, plan.documentType);

    case "FIND_JOURNAL_FOR_BILLING":
      return executeFindJournalForBilling(plan.billingDocumentId);

    case "FIND_PAYMENT_FOR_BILLING":
      return executeFindPaymentForBilling(plan.billingDocumentId);

    case "TOP_PRODUCTS_BY_BILLING_COUNT":
      return executeTopProducts(plan.topN);

    case "TOP_CUSTOMERS_BY_BILLED_VOLUME":
      return executeTopCustomers(plan.topN);

    case "FIND_BROKEN_SALES_FLOWS":
      return executeFindBrokenFlows(plan.filter ?? "all", plan.limit);

    case "FIND_DELIVERED_NOT_BILLED":
      return executeFindDeliveredNotBilled(plan.limit);

    case "FIND_BILLED_WITHOUT_DELIVERY":
      return executeFindBilledWithoutDelivery(plan.limit);

    case "BILLING_CANCELLATION_LOOKUP":
      return executeBillingCancellationLookup(plan.billingDocumentId, plan.limit);

    case "LOOKUP_ENTITY":
      return executeLookupEntity(plan.entityType, plan.businessKey);

    case "NEIGHBORHOOD_EXPANSION":
      return executeNeighborhoodExpansion(plan.nodeId, plan.depth, plan.limit);

    case "CUSTOMER_ORDER_SUMMARY":
      return executeCustomerOrderSummary(plan.customerId);

    case "COUNT_AGGREGATION":
      return executeCountAggregation(plan.target, plan.filter);

    case "RELATIONSHIP_LOOKUP":
      return executeRelationshipLookup(plan.fromEntityType, plan.fromBusinessKey, plan.relationType);

    case "OUT_OF_SCOPE":
      return {
        answerText:
          "This question is outside the scope of the Order-to-Cash dataset. I can help with sales orders, deliveries, billing documents, journal entries, payments, customers, and products.",
        evidenceRows: [],
        relatedEntities: [],
        highlightNodeIds: [],
        followUpSuggestions: [
          { text: "Trace a sales order", queryHint: "Trace sales order 9000" },
          { text: "Find broken O2C flows", queryHint: "Find broken flows" },
          { text: "Top products by billing", queryHint: "Top products by billing count" },
        ],
      };
  }
}


async function executeTraceDocumentFlow(
  docId: string,
  documentType?: string
): Promise<ExecutionResult> {
  let traceResult;

  if (documentType === "SalesOrder") {
    traceResult = await traceBySalesOrder(docId);
  } else if (documentType === "DeliveryHeader") {
    traceResult = await traceByDelivery(docId);
  } else if (documentType === "BillingDocument") {
    traceResult = await traceByBillingDocument(docId);
  } else if (documentType === "JournalEntry") {
    traceResult = await traceByJournalEntry(docId);
  } else {
    // Auto-detect: try each in O2C order
    const so = await prisma.salesOrderHeader.findUnique({ where: { salesOrder: docId }, select: { salesOrder: true } });
    if (so) { traceResult = await traceBySalesOrder(docId); }
    else {
      const dl = await prisma.outboundDeliveryHeader.findUnique({ where: { deliveryDocument: docId }, select: { deliveryDocument: true } });
      if (dl) { traceResult = await traceByDelivery(docId); }
      else {
        const bd = await prisma.billingDocumentHeader.findUnique({ where: { billingDocument: docId }, select: { billingDocument: true } });
        if (bd) { traceResult = await traceByBillingDocument(docId); }
        else {
          const je = await prisma.journalEntryItemAR.findFirst({ where: { accountingDocument: docId }, select: { accountingDocument: true } });
          if (je) { traceResult = await traceByJournalEntry(docId); }
          else {
            return {
              answerText: `Document "${docId}" was not found in the dataset. Please verify the document number and try again.`,
              evidenceRows: [],
              relatedEntities: [],
              highlightNodeIds: [],
              followUpSuggestions: [],
            };
          }
        }
      }
    }
  }

  return {
    answerText: traceResult.summary,
    evidenceRows: traceResult.evidenceRows,
    relatedEntities: traceResult.relatedEntities,
    highlightNodeIds: traceResult.highlightNodeIds,
    followUpSuggestions: buildTraceFollowUps(traceResult),
    rawData: traceResult,
  };
}

function buildTraceFollowUps(trace: { steps: any[]; missingLinks: string[]; isComplete: boolean }): FollowUpSuggestion[] {
  const suggestions: FollowUpSuggestion[] = [];
  if (!trace.isComplete) {
    suggestions.push({ text: "Show broken flows in the dataset", queryHint: "Find broken flows" });
  }
  const billing = trace.steps.find((s: any) => s.entityType === "BillingDocument" && s.status === "found");
  if (billing) {
    suggestions.push({ text: `Find journal entry for billing ${billing.businessKey}`, queryHint: `Find journal entry for billing document ${billing.businessKey}` });
    suggestions.push({ text: `Find payment for billing ${billing.businessKey}`, queryHint: `Find payment for billing document ${billing.businessKey}` });
  }
  return suggestions;
}


async function executeFindJournalForBilling(billingId: string): Promise<ExecutionResult> {
  if (!billingId) {
    return noDataResult("No billing document ID provided.");
  }

  const bdHeader = await prisma.billingDocumentHeader.findUnique({
    where: { billingDocument: billingId },
  });

  if (!bdHeader) {
    return noDataResult(`Billing document "${billingId}" was not found in the dataset.`);
  }

  const evidenceRows: EvidenceRow[] = [];
  const relatedEntities: RelatedEntity[] = [];
  const highlightNodeIds: string[] = [nodeId.billing(billingId)];

  if (bdHeader.accountingDocument) {
    const jeItems = await prisma.journalEntryItemAR.findMany({
      where: { accountingDocument: bdHeader.accountingDocument },
      take: 5,
      select: {
        accountingDocument: true,
        companyCode: true,
        fiscalYear: true,
        postingDate: true,
        amountInCompanyCodeCurrency: true,
        companyCodeCurrency: true,
        customer: true,
      },
      distinct: ["accountingDocument"],
    });

    for (const je of jeItems) {
      const jnId = nodeId.journal(je.companyCode, je.fiscalYear, je.accountingDocument);
      highlightNodeIds.push(jnId);
      evidenceRows.push({
        label: `Journal Entry ${je.accountingDocument}`,
        value: `Posted: ${je.postingDate ?? "—"} | ${je.amountInCompanyCodeCurrency ?? "—"} ${je.companyCodeCurrency ?? ""}`,
        entityType: "JournalEntry",
        businessKey: je.accountingDocument,
        nodeId: jnId,
      });
      relatedEntities.push({
        nodeId: jnId,
        entityType: "JournalEntry",
        businessKey: je.accountingDocument,
        label: `Journal Entry ${je.accountingDocument}`,
      });
    }

    if (jeItems.length > 0) {
      const je = jeItems[0];
      const answerText =
        `The journal entry number linked to billing document ${billingId} is **${je.accountingDocument}**.\n` +
        `Company Code: ${bdHeader.companyCode ?? "—"} | Fiscal Year: ${bdHeader.fiscalYear ?? "—"} | ` +
        `Posted: ${je.postingDate ?? "—"} | Amount: ${je.amountInCompanyCodeCurrency ?? "—"} ${je.companyCodeCurrency ?? ""}`;

      return {
        answerText,
        evidenceRows,
        relatedEntities,
        highlightNodeIds,
        followUpSuggestions: [
          { text: `Find payment for billing ${billingId}`, queryHint: `Find payment for billing document ${billingId}` },
          { text: `Trace full flow for billing ${billingId}`, queryHint: `Trace billing document ${billingId}` },
        ],
      };
    }
  }

  const jeByRef = await prisma.journalEntryItemAR.findMany({
    where: { referenceDocument: billingId },
    take: 5,
    select: {
      accountingDocument: true,
      companyCode: true,
      fiscalYear: true,
      postingDate: true,
      amountInCompanyCodeCurrency: true,
      companyCodeCurrency: true,
    },
    distinct: ["accountingDocument"],
  });

  for (const je of jeByRef) {
    const jnId = nodeId.journal(je.companyCode, je.fiscalYear, je.accountingDocument);
    highlightNodeIds.push(jnId);
    evidenceRows.push({
      label: `Journal Entry ${je.accountingDocument}`,
      value: `Posted: ${je.postingDate ?? "—"} | ${je.amountInCompanyCodeCurrency ?? "—"} ${je.companyCodeCurrency ?? ""}`,
      entityType: "JournalEntry",
      businessKey: je.accountingDocument,
      nodeId: jnId,
    });
    relatedEntities.push({
      nodeId: jnId,
      entityType: "JournalEntry",
      businessKey: je.accountingDocument,
      label: `Journal Entry ${je.accountingDocument}`,
    });
  }

  if (jeByRef.length > 0) {
    const je = jeByRef[0];
    return {
      answerText: `The journal entry linked to billing document ${billingId} is **${je.accountingDocument}** (found via reference document lookup).`,
      evidenceRows,
      relatedEntities,
      highlightNodeIds,
      followUpSuggestions: [
        { text: `Find payment for billing ${billingId}`, queryHint: `Find payment for billing document ${billingId}` },
      ],
    };
  }

  return {
    answerText: `No journal entry was found linked to billing document ${billingId}. The billing document exists (${bdHeader.billingDocumentType ?? ""}) but has no accounting document reference or matching journal entry in the dataset.`,
    evidenceRows: [{ label: `Billing ${billingId}`, value: `Type: ${bdHeader.billingDocumentType ?? "—"} | Cancelled: ${bdHeader.billingDocumentIsCancelled === "X" ? "Yes" : "No"}`, entityType: "BillingDocument", businessKey: billingId, nodeId: nodeId.billing(billingId) }],
    relatedEntities: [],
    highlightNodeIds,
    followUpSuggestions: [],
  };
}


async function executeFindPaymentForBilling(billingId: string): Promise<ExecutionResult> {
  if (!billingId) return noDataResult("No billing document ID provided.");

  const bdHeader = await prisma.billingDocumentHeader.findUnique({
    where: { billingDocument: billingId },
  });

  if (!bdHeader) {
    return noDataResult(`Billing document "${billingId}" was not found.`);
  }

  const highlightNodeIds: string[] = [nodeId.billing(billingId)];
  const evidenceRows: EvidenceRow[] = [];
  const relatedEntities: RelatedEntity[] = [];

  const payments = await prisma.paymentAR.findMany({
    where: { invoiceReference: billingId },
    take: 5,
    select: {
      accountingDocument: true,
      companyCode: true,
      fiscalYear: true,
      clearingDate: true,
      amountInCompanyCodeCurrency: true,
      companyCodeCurrency: true,
      customer: true,
    },
    distinct: ["accountingDocument"],
  });


  if (payments.length === 0 && bdHeader.accountingDocument) {
    const jeItems = await prisma.journalEntryItemAR.findMany({
      where: {
        accountingDocument: bdHeader.accountingDocument,
        clearingAccountingDocument: { not: null },
      },
      take: 5,
      select: { clearingAccountingDocument: true, clearingDocFiscalYear: true },
      distinct: ["clearingAccountingDocument"],
    });

    for (const je of jeItems) {
      if (!je.clearingAccountingDocument) continue;
      const payItems = await prisma.paymentAR.findMany({
        where: { accountingDocument: je.clearingAccountingDocument },
        take: 3,
        select: {
          accountingDocument: true,
          companyCode: true,
          fiscalYear: true,
          clearingDate: true,
          amountInCompanyCodeCurrency: true,
          companyCodeCurrency: true,
          customer: true,
        },
        distinct: ["accountingDocument"],
      });
      payments.push(...payItems);
    }
  }

  if (payments.length === 0) {
    return {
      answerText: `No payment (AR clearing document) was found for billing document ${billingId}. This may indicate an open invoice still awaiting payment.`,
      evidenceRows: [{ label: `Billing ${billingId}`, value: `${bdHeader.totalNetAmount ?? "—"} ${bdHeader.transactionCurrency ?? ""} — Unpaid`, entityType: "BillingDocument", businessKey: billingId, nodeId: nodeId.billing(billingId) }],
      relatedEntities: [],
      highlightNodeIds,
      followUpSuggestions: [{ text: `Find journal entry for billing ${billingId}`, queryHint: `Find journal entry for billing document ${billingId}` }],
    };
  }

  for (const pay of payments) {
    const payNid = nodeId.payment(pay.companyCode, pay.fiscalYear, pay.accountingDocument);
    highlightNodeIds.push(payNid);
    evidenceRows.push({
      label: `Payment ${pay.accountingDocument}`,
      value: `Cleared: ${pay.clearingDate ?? "—"} | ${pay.amountInCompanyCodeCurrency ?? "—"} ${pay.companyCodeCurrency ?? ""}`,
      entityType: "Payment",
      businessKey: pay.accountingDocument,
      nodeId: payNid,
    });
    relatedEntities.push({
      nodeId: payNid,
      entityType: "Payment",
      businessKey: pay.accountingDocument,
      label: `Payment ${pay.accountingDocument}`,
    });
  }

  const first = payments[0];
  return {
    answerText: `The payment linked to billing document ${billingId} is **${first.accountingDocument}**.\nCleared: ${first.clearingDate ?? "—"} | Amount: ${first.amountInCompanyCodeCurrency ?? "—"} ${first.companyCodeCurrency ?? ""}`,
    evidenceRows,
    relatedEntities,
    highlightNodeIds,
    followUpSuggestions: [
      { text: `Trace full flow for billing ${billingId}`, queryHint: `Trace billing document ${billingId}` },
    ],
  };
}


async function executeTopProducts(topN = 10): Promise<ExecutionResult> {
  const result = await topProductsByBillingCount(topN);
  return {
    answerText: result.answerText,
    evidenceRows: result.evidenceRows,
    relatedEntities: result.relatedEntities,
    highlightNodeIds: result.highlightNodeIds,
    followUpSuggestions: [
      { text: "Top customers by billed volume", queryHint: "Top customers by billed volume" },
    ],
  };
}


async function executeTopCustomers(topN = 10): Promise<ExecutionResult> {
  const result = await topCustomersByBilledVolume(topN);
  return {
    answerText: result.answerText,
    evidenceRows: result.evidenceRows,
    relatedEntities: result.relatedEntities,
    highlightNodeIds: result.highlightNodeIds,
    followUpSuggestions: [
      { text: "Top products by billing count", queryHint: "Top products by billing count" },
    ],
  };
}


async function executeFindBrokenFlows(
  filter: string,
  limit = 20
): Promise<ExecutionResult> {
  const evidenceRows: EvidenceRow[] = [];
  const highlightNodeIds: string[] = [];
  const relatedEntities: RelatedEntity[] = [];
  const summaryLines: string[] = [];

  if (filter === "all") {
    const report = await runBrokenFlowReport();
    for (const r of report) {
      if (r.count > 0) {
        summaryLines.push(`**${r.title}**: ${r.count} affected`);
        evidenceRows.push(...r.evidenceRows.slice(0, 5));
        highlightNodeIds.push(...r.highlightNodeIds.slice(0, 10));
      }
    }
    return {
      answerText: summaryLines.length > 0
        ? `Broken flow analysis across the O2C dataset:\n\n${summaryLines.join("\n")}`
        : "No broken flows detected in the current dataset.",
      evidenceRows,
      relatedEntities,
      highlightNodeIds,
      followUpSuggestions: [
        { text: "Sales orders with no delivery", queryHint: "Sales orders with no delivery" },
        { text: "Delivered but not billed", queryHint: "Delivered but not billed" },
        { text: "Cancelled billing documents", queryHint: "Show cancelled billings" },
      ],
    };
  }

  if (filter === "no_delivery") {
    const r = await findOrdersWithNoDelivery(limit);
    return {
      answerText: r.explanation,
      evidenceRows: r.evidenceRows,
      relatedEntities: [],
      highlightNodeIds: r.highlightNodeIds,
      followUpSuggestions: [{ text: "Show delivered but not billed", queryHint: "Delivered but not billed" }],
    };
  }

  if (filter === "no_billing") {
    const r = await findDeliveriesWithNoBilling(limit);
    return {
      answerText: r.explanation,
      evidenceRows: r.evidenceRows,
      relatedEntities: [],
      highlightNodeIds: r.highlightNodeIds,
      followUpSuggestions: [{ text: "Show all broken flows", queryHint: "Find broken flows" }],
    };
  }

  // Default: all
  const r = await runBrokenFlowReport();
  for (const item of r) {
    summaryLines.push(`${item.title}: ${item.count} affected`);
    evidenceRows.push(...item.evidenceRows.slice(0, 3));
    highlightNodeIds.push(...item.highlightNodeIds.slice(0, 5));
  }
  return {
    answerText: summaryLines.join("\n"),
    evidenceRows,
    relatedEntities,
    highlightNodeIds,
    followUpSuggestions: [],
  };
}


async function executeFindDeliveredNotBilled(limit: number): Promise<ExecutionResult> {
  const r = await findDeliveriesWithNoBilling(limit);
  return {
    answerText: r.explanation,
    evidenceRows: r.evidenceRows,
    relatedEntities: [],
    highlightNodeIds: r.highlightNodeIds,
    followUpSuggestions: [
      { text: "Show sales orders with no delivery", queryHint: "Sales orders with no delivery" },
    ],
  };
}

async function executeFindBilledWithoutDelivery(limit: number): Promise<ExecutionResult> {
  const r = await findBillingsWithNoDelivery(limit);
  return {
    answerText: r.explanation,
    evidenceRows: r.evidenceRows,
    relatedEntities: [],
    highlightNodeIds: r.highlightNodeIds,
    followUpSuggestions: [],
  };
}



async function executeBillingCancellationLookup(
  billingId: string | undefined,
  limit: number
): Promise<ExecutionResult> {
  if (billingId) {
    // Single billing document cancellation check
    const cancel = await prisma.billingDocumentCancellation.findUnique({
      where: { billingDocument: billingId },
    });
    const bdHeader = await prisma.billingDocumentHeader.findUnique({
      where: { billingDocument: billingId },
    });
    const isCancelled = bdHeader?.billingDocumentIsCancelled === "X";
    const cancelDoc = bdHeader?.cancelledBillingDocument;

    if (!bdHeader && !cancel) {
      return noDataResult(`Billing document "${billingId}" not found.`);
    }

    let answerText = "";
    if (cancel) {
      answerText = `Billing document ${billingId} is a cancellation document for original billing **${cancel.cancelledBillingDocument ?? "unknown"}**.`;
    } else if (isCancelled) {
      answerText = `Billing document ${billingId} has been cancelled. The cancellation document is **${cancelDoc ?? "unknown"}**.`;
    } else {
      answerText = `Billing document ${billingId} is active and has not been cancelled.`;
    }

    return {
      answerText,
      evidenceRows: [{ label: `Billing ${billingId}`, value: isCancelled ? `CANCELLED — ${cancelDoc ?? "—"}` : "Active", entityType: "BillingDocument", businessKey: billingId, nodeId: nodeId.billing(billingId) }],
      relatedEntities: [],
      highlightNodeIds: [nodeId.billing(billingId)],
      followUpSuggestions: [],
    };
  }

  // No specific billing — show general cancellations list
  const r = await findCancelledBillings(limit);
  return {
    answerText: r.explanation,
    evidenceRows: r.evidenceRows,
    relatedEntities: [],
    highlightNodeIds: r.highlightNodeIds,
    followUpSuggestions: [],
  };
}


async function executeLookupEntity(entityType: string, key: string): Promise<ExecutionResult> {
  const node = await findNodeByBusinessKey(key, entityType);

  if (!node) {
    return noDataResult(`${entityType} "${key}" was not found in the graph.`);
  }

  return {
    answerText: `Found ${entityType}: **${node.label}** (${node.businessKey})\n${node.subtitle ?? ""}`,
    evidenceRows: Object.entries(node.metadata)
      .filter(([, v]) => v != null)
      .slice(0, 8)
      .map(([k, v]) => ({
        label: k,
        value: String(v),
        entityType: node.entityType,
        businessKey: node.businessKey,
        nodeId: node.id,
      })),
    relatedEntities: [{ nodeId: node.id, entityType: node.entityType, businessKey: node.businessKey, label: node.label }],
    highlightNodeIds: [node.id],
    followUpSuggestions: [
      { text: `Trace full flow for ${key}`, queryHint: `Trace ${key}` },
    ],
  };
}


async function executeNeighborhoodExpansion(
  nId: string,
  depth = 2,
  limit = 80
): Promise<ExecutionResult> {
  const result = await getNeighborhood(nId, depth, limit);

  if (!result) {
    return noDataResult(`Node "${nId}" was not found in the graph.`);
  }

  return {
    answerText: `Graph neighborhood for **${result.center.label}** (${depth} hops): ${result.nodes.length} nodes, ${result.edges.length} edges.`,
    evidenceRows: result.nodes.slice(0, 10).map((n) => ({
      label: n.label,
      value: n.entityType,
      entityType: n.entityType,
      businessKey: n.businessKey,
      nodeId: n.id,
    })),
    relatedEntities: result.nodes.map((n) => ({
      nodeId: n.id,
      entityType: n.entityType,
      businessKey: n.businessKey,
      label: n.label,
    })),
    highlightNodeIds: result.nodes.map((n) => n.id),
    followUpSuggestions: [],
  };
}


async function executeCustomerOrderSummary(customerId: string): Promise<ExecutionResult> {
  const partner = await prisma.businessPartner.findFirst({
    where: { OR: [{ customer: customerId }, { businessPartner: customerId }] },
    include: { addresses: { take: 1 } },
  });

  if (!partner) {
    return noDataResult(`Customer "${customerId}" was not found.`);
  }

  const [orders, billings] = await Promise.all([
    prisma.salesOrderHeader.count({ where: { soldToParty: customerId } }),
    prisma.billingDocumentHeader.count({ where: { soldToParty: customerId } }),
  ]);

  const name = partner.businessPartnerFullName ?? partner.organizationBpName1 ?? customerId;
  const custNodeId = nodeId.customer(partner.customer ?? partner.businessPartner);

  return {
    answerText:
      `Customer **${name}** (${customerId}):\n` +
      `Sales Orders: ${orders}\n` +
      `Billing Documents: ${billings}\n` +
      `Location: ${partner.addresses[0]?.cityName ?? "—"}, ${partner.addresses[0]?.country ?? "—"}`,
    evidenceRows: [
      { label: "Customer Name", value: name, entityType: "Customer", businessKey: customerId, nodeId: custNodeId },
      { label: "Sales Orders", value: orders, entityType: "Customer", businessKey: customerId },
      { label: "Billing Documents", value: billings, entityType: "Customer", businessKey: customerId },
      { label: "City", value: partner.addresses[0]?.cityName ?? "—" },
      { label: "Country", value: partner.addresses[0]?.country ?? "—" },
    ],
    relatedEntities: [{ nodeId: custNodeId, entityType: "Customer", businessKey: customerId, label: name }],
    highlightNodeIds: [custNodeId],
    followUpSuggestions: [
      { text: `View orders for customer ${customerId}`, queryHint: `Show orders for customer ${customerId}` },
    ],
  };
}


async function executeCountAggregation(
  target: string,
  filter?: Record<string, string>
): Promise<ExecutionResult> {
  const modelMap: Record<string, keyof typeof prisma> = {
    SalesOrder: "salesOrderHeader" as any,
    BillingDocument: "billingDocumentHeader" as any,
    DeliveryHeader: "outboundDeliveryHeader" as any,
    JournalEntry: "journalEntryItemAR" as any,
    Payment: "paymentAR" as any,
    Customer: "businessPartner" as any,
    Product: "product" as any,
  };

  const modelName = modelMap[target];
  if (!modelName) {
    return noDataResult(`Count for ${target} is not supported.`);
  }

  const count = await (prisma[modelName] as any).count({ where: filter ?? {} });

  return {
    answerText: `There are **${count}** ${target} records in the dataset.`,
    evidenceRows: [{ label: target, value: count }],
    relatedEntities: [],
    highlightNodeIds: [],
    followUpSuggestions: [],
  };
}


async function executeRelationshipLookup(
  fromEntityType: string,
  fromBusinessKey: string,
  relationType?: string
): Promise<ExecutionResult> {
  const node = await findNodeByBusinessKey(fromBusinessKey, fromEntityType);

  if (!node) {
    return noDataResult(`${fromEntityType} "${fromBusinessKey}" was not found.`);
  }

  const edges = await prisma.graphEdge.findMany({
    where: {
      OR: [{ fromNodeId: node.id }, { toNodeId: node.id }],
      ...(relationType ? { relationType } : {}),
    },
    include: { source: true, target: true },
    take: 20,
  });

  const highlightNodeIds: string[] = [node.id];
  const evidenceRows: EvidenceRow[] = edges.map((e) => {
    const other = e.fromNodeId === node.id ? e.target : e.source;
    highlightNodeIds.push(other.id);
    return {
      label: `${e.relationType}`,
      value: other.label,
      entityType: other.entityType,
      businessKey: other.businessKey,
      nodeId: other.id,
    };
  });

  return {
    answerText: `Found ${edges.length} relationship(s) for **${node.label}**.`,
    evidenceRows,
    relatedEntities: edges.map((e) => {
      const other = e.fromNodeId === node.id ? e.target : e.source;
      return { nodeId: other.id, entityType: other.entityType, businessKey: other.businessKey, label: other.label };
    }),
    highlightNodeIds: [...new Set(highlightNodeIds)],
    followUpSuggestions: [],
  };
}


function noDataResult(message: string): ExecutionResult {
  return {
    answerText: message,
    evidenceRows: [],
    relatedEntities: [],
    highlightNodeIds: [],
    followUpSuggestions: [
      { text: "Find broken flows", queryHint: "Find broken flows" },
      { text: "Top products by billing", queryHint: "Top products by billing count" },
    ],
  };
}

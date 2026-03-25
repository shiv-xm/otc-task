
import { PrismaClient } from "@prisma/client";
import { nodeId } from "@/lib/graph/ids";
import type { EvidenceRow, RelatedEntity } from "@/types/query";

const prisma = new PrismaClient();

export interface AnalyticQueryResult {
  title: string;
  answerText: string;
  evidenceRows: EvidenceRow[];
  relatedEntities: RelatedEntity[];
  highlightNodeIds: string[];
}

// ── 1. Top products by billing document count ─────────────────

export async function topProductsByBillingCount(topN = 10): Promise<AnalyticQueryResult> {
  const items = await prisma.billingDocumentItem.findMany({
    select: { material: true },
  });

  const countMap = new Map<string, number>();
  for (const item of items) {
    if (!item.material) continue;
    countMap.set(item.material, (countMap.get(item.material) ?? 0) + 1);
  }

  const sorted = [...countMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);

  const productIds = sorted.map(([pid]) => pid);
  const descriptions = await prisma.productDescription.findMany({
    where: { product: { in: productIds }, language: "EN" },
  });
  const descMap = new Map(descriptions.map((d) => [d.product, d.productDescription]));

  const evidenceRows: EvidenceRow[] = sorted.map(([pid, count], i) => ({
    label: `#${i + 1} ${descMap.get(pid) ?? pid}`,
    value: `${count} billing line(s)`,
    entityType: "Product",
    businessKey: pid,
    nodeId: nodeId.product(pid),
  }));

  const relatedEntities: RelatedEntity[] = sorted.map(([pid]) => ({
    nodeId: nodeId.product(pid),
    entityType: "Product",
    businessKey: pid,
    label: descMap.get(pid) ?? pid,
  }));

  return {
    title: `Top ${topN} Products by Billing Document Count`,
    answerText:
      `The ${topN} products with the highest number of billing document lines are:\n` +
      sorted.map(([pid, c], i) => `${i + 1}. ${descMap.get(pid) ?? pid} — ${c} billing line(s)`).join("\n"),
    evidenceRows,
    relatedEntities,
    highlightNodeIds: sorted.map(([pid]) => nodeId.product(pid)),
  };
}

// ── 2. Top customers by billed volume ─────────────────────────

export async function topCustomersByBilledVolume(topN = 10): Promise<AnalyticQueryResult> {
  const billings = await prisma.billingDocumentHeader.findMany({
    where: {
      billingDocumentIsCancelled: { not: "X" },
      soldToParty: { not: null },
    },
    select: { soldToParty: true, totalNetAmount: true, transactionCurrency: true },
  });

  const customerMap = new Map<string, { total: number; count: number; currency: string }>();
  for (const b of billings) {
    if (!b.soldToParty) continue;
    const cur = customerMap.get(b.soldToParty) ?? { total: 0, count: 0, currency: b.transactionCurrency ?? "" };
    cur.total += parseFloat(b.totalNetAmount ?? "0");
    cur.count += 1;
    customerMap.set(b.soldToParty, cur);
  }

  const sorted = [...customerMap.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, topN);

  // Enrich with customer names
  const custIds = sorted.map(([cid]) => cid);
  const partners = await prisma.businessPartner.findMany({
    where: { OR: [{ customer: { in: custIds } }, { businessPartner: { in: custIds } }] },
    select: { customer: true, businessPartner: true, businessPartnerFullName: true, organizationBpName1: true },
  });
  const nameMap = new Map<string, string>();
  for (const p of partners) {
    const name = p.businessPartnerFullName ?? p.organizationBpName1 ?? "";
    if (p.customer) nameMap.set(p.customer, name);
    if (p.businessPartner) nameMap.set(p.businessPartner, name);
  }

  const evidenceRows: EvidenceRow[] = sorted.map(([cid, stats], i) => ({
    label: `#${i + 1} ${nameMap.get(cid) ?? cid}`,
    value: `${stats.count} billing doc(s) — ${stats.total.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${stats.currency}`,
    entityType: "Customer",
    businessKey: cid,
    nodeId: nodeId.customer(cid),
  }));

  const relatedEntities: RelatedEntity[] = sorted.map(([cid]) => ({
    nodeId: nodeId.customer(cid),
    entityType: "Customer",
    businessKey: cid,
    label: nameMap.get(cid) ?? cid,
  }));

  return {
    title: `Top ${topN} Customers by Billed Volume`,
    answerText:
      `The top ${topN} customers by total billed amount are:\n` +
      sorted
        .map(([cid, stats], i) => `${i + 1}. ${nameMap.get(cid) ?? cid} — ${stats.total.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${stats.currency}`)
        .join("\n"),
    evidenceRows,
    relatedEntities,
    highlightNodeIds: sorted.map(([cid]) => nodeId.customer(cid)),
  };
}

// ── 3. Most common plants in delivery items ───────────────────

export async function topPlantsByDeliveryItems(topN = 10): Promise<AnalyticQueryResult> {
  const items = await prisma.outboundDeliveryItem.findMany({
    select: { plant: true },
    where: { plant: { not: null } },
  });

  const plantMap = new Map<string, number>();
  for (const item of items) {
    if (!item.plant) continue;
    plantMap.set(item.plant, (plantMap.get(item.plant) ?? 0) + 1);
  }

  const sorted = [...plantMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);

  // Enrich with plant names
  const plantIds = sorted.map(([pid]) => pid);
  const plants = await prisma.plant.findMany({
    where: { plant: { in: plantIds } },
    select: { plant: true, plantName: true },
  });
  const plantNameMap = new Map(plants.map((p) => [p.plant, p.plantName]));

  const evidenceRows: EvidenceRow[] = sorted.map(([pid, count], i) => ({
    label: `#${i + 1} ${plantNameMap.get(pid) ?? pid}`,
    value: `${count} delivery item(s)`,
    entityType: "Plant",
    businessKey: pid,
    nodeId: nodeId.plant(pid),
  }));

  const relatedEntities: RelatedEntity[] = sorted.map(([pid]) => ({
    nodeId: nodeId.plant(pid),
    entityType: "Plant",
    businessKey: pid,
    label: plantNameMap.get(pid) ?? pid,
  }));

  return {
    title: `Top ${topN} Plants by Delivery Item Count`,
    answerText:
      `The ${topN} plants appearing most often in delivery items:\n` +
      sorted.map(([pid, c], i) => `${i + 1}. ${plantNameMap.get(pid) ?? pid} — ${c} item(s)`).join("\n"),
    evidenceRows,
    relatedEntities,
    highlightNodeIds: sorted.map(([pid]) => nodeId.plant(pid)),
  };
}

// ── 4. Top products by delivered quantity ─────────────────────

export async function topProductsByDeliveredQuantity(topN = 10): Promise<AnalyticQueryResult> {
  const items = await prisma.billingDocumentItem.findMany({
    select: { material: true, billingQuantity: true },
    where: { material: { not: null } },
  });

  const qtyMap = new Map<string, number>();
  for (const item of items) {
    if (!item.material) continue;
    qtyMap.set(item.material, (qtyMap.get(item.material) ?? 0) + parseFloat(item.billingQuantity ?? "0"));
  }

  const sorted = [...qtyMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);

  const productIds = sorted.map(([pid]) => pid);
  const descriptions = await prisma.productDescription.findMany({
    where: { product: { in: productIds }, language: "EN" },
  });
  const descMap = new Map(descriptions.map((d) => [d.product, d.productDescription]));

  const evidenceRows: EvidenceRow[] = sorted.map(([pid, qty], i) => ({
    label: `#${i + 1} ${descMap.get(pid) ?? pid}`,
    value: `${qty.toLocaleString(undefined, { maximumFractionDigits: 2 })} units delivered`,
    entityType: "Product",
    businessKey: pid,
    nodeId: nodeId.product(pid),
  }));

  const relatedEntities: RelatedEntity[] = sorted.map(([pid]) => ({
    nodeId: nodeId.product(pid),
    entityType: "Product",
    businessKey: pid,
    label: descMap.get(pid) ?? pid,
  }));

  return {
    title: `Top ${topN} Products by Delivered Quantity`,
    answerText:
      `The top ${topN} products by total delivered quantity:\n` +
      sorted
        .map(([pid, qty], i) => `${i + 1}. ${descMap.get(pid) ?? pid} — ${qty.toLocaleString(undefined, { maximumFractionDigits: 2 })} units`)
        .join("\n"),
    evidenceRows,
    relatedEntities,
    highlightNodeIds: sorted.map(([pid]) => nodeId.product(pid)),
  };
}

// ── 5. Top sales orders by total net amount ───────────────────

export async function topSalesOrdersByNetAmount(topN = 10): Promise<AnalyticQueryResult> {
  const orders = await prisma.salesOrderHeader.findMany({
    orderBy: { totalNetAmount: "desc" },
    take: topN * 3,
    select: {
      salesOrder: true,
      soldToParty: true,
      totalNetAmount: true,
      transactionCurrency: true,
      creationDate: true,
      overallDeliveryStatus: true,
      overallOrdReltdBillgStatus: true,
    },
  });

  const valid = orders
    .filter((o) => parseFloat(o.totalNetAmount ?? "0") > 0)
    .slice(0, topN);

  const custIds = [...new Set(valid.map((o) => o.soldToParty).filter(Boolean) as string[])];
  const partners = await prisma.businessPartner.findMany({
    where: { OR: [{ customer: { in: custIds } }, { businessPartner: { in: custIds } }] },
    select: { customer: true, businessPartner: true, businessPartnerFullName: true, organizationBpName1: true },
  });
  const nameMap = new Map<string, string>();
  for (const p of partners) {
    const name = p.businessPartnerFullName ?? p.organizationBpName1 ?? "";
    if (p.customer) nameMap.set(p.customer, name);
    if (p.businessPartner) nameMap.set(p.businessPartner, name);
  }

  const evidenceRows: EvidenceRow[] = valid.map((so, i) => ({
    label: `#${i + 1} SO ${so.salesOrder}`,
    value: `${so.totalNetAmount} ${so.transactionCurrency ?? ""} | Cust: ${nameMap.get(so.soldToParty ?? "") ?? so.soldToParty ?? "—"} | DlvStatus: ${so.overallDeliveryStatus ?? "—"}`,
    entityType: "SalesOrder",
    businessKey: so.salesOrder,
    nodeId: nodeId.salesOrder(so.salesOrder),
  }));

  const relatedEntities: RelatedEntity[] = valid.map((so) => ({
    nodeId: nodeId.salesOrder(so.salesOrder),
    entityType: "SalesOrder",
    businessKey: so.salesOrder,
    label: `Sales Order ${so.salesOrder}`,
  }));

  return {
    title: `Top ${topN} Sales Orders by Net Amount`,
    answerText:
      `The top ${topN} sales orders by total net amount:\n` +
      valid
        .map((so, i) => `${i + 1}. SO ${so.salesOrder} — ${so.totalNetAmount} ${so.transactionCurrency ?? ""}`)
        .join("\n"),
    evidenceRows,
    relatedEntities,
    highlightNodeIds: valid.map((so) => nodeId.salesOrder(so.salesOrder)),
  };
}

// ── 6. Dispatcher — routes natural language to analytics ──────

export async function routeAnalyticQuery(question: string): Promise<AnalyticQueryResult | null> {
  const q = question.toLowerCase();

  if (q.match(/top.*(product|material).*(billing|invoice)/)) {
    const match = q.match(/top\s?(\d+)/);
    return topProductsByBillingCount(match ? parseInt(match[1]) : 10);
  }

  if (q.match(/(top|most).*(customer).*(bill|volume|amount)/)) {
    const match = q.match(/top\s?(\d+)/);
    return topCustomersByBilledVolume(match ? parseInt(match[1]) : 10);
  }

  if (q.match(/plant.*(deliver|most|frequen|common)/)) {
    const match = q.match(/top\s?(\d+)/);
    return topPlantsByDeliveryItems(match ? parseInt(match[1]) : 10);
  }

  if (q.match(/(product|material).*(deliver|quantity|qty)/)) {
    const match = q.match(/top\s?(\d+)/);
    return topProductsByDeliveredQuantity(match ? parseInt(match[1]) : 10);
  }

  if (q.match(/(sales order|order).*(amount|value|net)/)) {
    const match = q.match(/top\s?(\d+)/);
    return topSalesOrdersByNetAmount(match ? parseInt(match[1]) : 10);
  }

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// ─── ID helpers (stable / deterministic) ─────────────────────
const id = {
  so: (k: string) => `SO-${k}`,
  dl: (k: string) => `DL-${k}`,
  bd: (k: string) => `BD-${k}`,
  je: (cc: string, fy: string, ad: string) => `JE-${cc}-${fy}-${ad}`,
  pay: (cc: string, fy: string, ad: string) => `PAY-${cc}-${fy}-${ad}`,
  cust: (k: string) => `CUST-${k}`,
  prod: (k: string) => `PROD-${k}`,
  plant: (k: string) => `PLT-${k}`,
  addr: (bp: string, addr: string) => `ADDR-${bp}-${addr}`,
};

function edgeId(rel: string, from: string, to: string): string {
  return `EDGE-${rel}-${from}->${to}`;
}

async function upsertNode(data: {
  id: string;
  entityType: string;
  businessKey: string;
  label: string;
  subtitle?: string;
  metadata: object;
  searchText: string;
}) {
  await prisma.graphNode.upsert({
    where: { id: data.id },
    create: {
      id: data.id,
      entityType: data.entityType,
      businessKey: data.businessKey,
      label: data.label,
      subtitle: data.subtitle ?? null,
      metadata: JSON.stringify(data.metadata),
      searchText: data.searchText,
    },
    update: {
      label: data.label,
      subtitle: data.subtitle ?? null,
      metadata: JSON.stringify(data.metadata),
      searchText: data.searchText,
    },
  });
}

async function upsertEdge(
  fromNodeId: string,
  toNodeId: string,
  relationType: string,
  metadata: object = {}
) {
  const [from, to] = await Promise.all([
    prisma.graphNode.findUnique({ where: { id: fromNodeId } }),
    prisma.graphNode.findUnique({ where: { id: toNodeId } }),
  ]);
  if (!from || !to) return;

  const eid = edgeId(relationType, fromNodeId, toNodeId);
  await prisma.graphEdge.upsert({
    where: { id: eid },
    create: {
      id: eid,
      fromNodeId,
      toNodeId,
      relationType,
      metadata: JSON.stringify(metadata),
    },
    update: {
      metadata: JSON.stringify(metadata),
    },
  });
}


async function buildCustomerNodes() {
  const partners = await prisma.businessPartner.findMany({
    include: { addresses: true },
  });
  for (const bp of partners) {
    const name =
      bp.businessPartnerFullName ??
      bp.organizationBpName1 ??
      bp.businessPartnerName ??
      `BP ${bp.businessPartner}`;
    const custId = bp.customer ?? bp.businessPartner;
    await upsertNode({
      id: id.cust(custId),
      entityType: "Customer",
      businessKey: custId,
      label: name,
      subtitle: `Customer ${custId}`,
      metadata: {
        businessPartner: bp.businessPartner,
        customer: bp.customer,
        fullName: bp.businessPartnerFullName,
        industry: bp.industry,
        country: bp.addresses[0]?.country,
        city: bp.addresses[0]?.cityName,
        isBlocked: bp.businessPartnerIsBlocked,
      },
      searchText: [name, bp.businessPartner, bp.customer, bp.industry].filter(Boolean).join(" "),
    });

    // Address nodes
    for (const addr of bp.addresses) {
      const addrNodeId = id.addr(bp.businessPartner, addr.addressId);
      await upsertNode({
        id: addrNodeId,
        entityType: "Address",
        businessKey: addr.addressId,
        label: [addr.streetName, addr.cityName, addr.country].filter(Boolean).join(", "),
        subtitle: `${addr.cityName ?? ""} ${addr.country ?? ""}`.trim(),
        metadata: {
          city: addr.cityName,
          country: addr.country,
          postalCode: addr.postalCode,
          region: addr.region,
          street: addr.streetName,
        },
        searchText: [addr.streetName, addr.cityName, addr.country, addr.region].filter(Boolean).join(" "),
      });
      await upsertEdge(id.cust(custId), addrNodeId, "HAS_ADDRESS");
    }
  }
  console.log(`  ✓ Customer nodes: ${partners.length}`);
}

async function buildProductNodes() {
  const products = await prisma.product.findMany({
    include: { descriptions: true },
  });
  for (const p of products) {
    const desc =
      p.descriptions.find((d: { language: string; productDescription: string | null }) => d.language === "EN")?.productDescription ??
      p.descriptions[0]?.productDescription ??
      p.product;
    await upsertNode({
      id: id.prod(p.product),
      entityType: "Product",
      businessKey: p.product,
      label: desc,
      subtitle: `Product ${p.product}`,
      metadata: {
        product: p.product,
        productType: p.productType,
        productGroup: p.productGroup,
        baseUnit: p.baseUnit,
        grossWeight: p.grossWeight,
        weightUnit: p.weightUnit,
        division: p.division,
      },
      searchText: [desc, p.product, p.productOldId, p.productGroup].filter(Boolean).join(" "),
    });
  }
  console.log(`  ✓ Product nodes: ${products.length}`);
}

async function buildPlantNodes() {
  const plants = await prisma.plant.findMany();
  for (const p of plants) {
    await upsertNode({
      id: id.plant(p.plant),
      entityType: "Plant",
      businessKey: p.plant,
      label: p.plantName ?? `Plant ${p.plant}`,
      subtitle: p.plant,
      metadata: {
        plant: p.plant,
        plantName: p.plantName,
        salesOrganization: p.salesOrganization,
        distributionChannel: p.distributionChannel,
        division: p.division,
      },
      searchText: [p.plant, p.plantName, p.salesOrganization].filter(Boolean).join(" "),
    });
  }
  console.log(`  ✓ Plant nodes: ${plants.length}`);
}

async function buildProductPlantEdges() {
  const productPlants = await prisma.productPlant.findMany();
  for (const pp of productPlants) {
    await upsertEdge(
      id.prod(pp.product),
      id.plant(pp.plant),
      "LOCATED_AT_PLANT",
      { profitCenter: pp.profitCenter }
    );
  }
  console.log(`  ✓ Product→Plant edges: ${productPlants.length}`);
}

async function buildSalesOrderNodes() {
  const orders = await prisma.salesOrderHeader.findMany({
    include: { items: true },
  });
  for (const so of orders) {
    await upsertNode({
      id: id.so(so.salesOrder),
      entityType: "SalesOrder",
      businessKey: so.salesOrder,
      label: `Sales Order ${so.salesOrder}`,
      subtitle: `${so.salesOrderType ?? ""} · ${so.transactionCurrency ?? ""} ${so.totalNetAmount ?? ""}`.trim(),
      metadata: {
        salesOrder: so.salesOrder,
        salesOrderType: so.salesOrderType,
        salesOrganization: so.salesOrganization,
        soldToParty: so.soldToParty,
        totalNetAmount: so.totalNetAmount,
        currency: so.transactionCurrency,
        creationDate: so.creationDate,
        overallDeliveryStatus: so.overallDeliveryStatus,
        overallBillingStatus: so.overallOrdReltdBillgStatus,
        requestedDeliveryDate: so.requestedDeliveryDate,
      },
      searchText: [so.salesOrder, so.salesOrderType, so.soldToParty, so.salesOrganization].filter(Boolean).join(" "),
    });

    // Customer edge
    if (so.soldToParty) {
      await upsertEdge(id.so(so.salesOrder), id.cust(so.soldToParty), "PLACED_BY");
    }

    // Product edges (via items)
    for (const item of so.items) {
      if (item.material) {
        await upsertEdge(id.so(so.salesOrder), id.prod(item.material), "REFERENCES_PRODUCT", {
          item: item.salesOrderItem,
          quantity: item.requestedQuantity,
          unit: item.requestedQuantityUnit,
        });
      }
      if (item.productionPlant) {
        await upsertEdge(id.so(so.salesOrder), id.plant(item.productionPlant), "LOCATED_AT_PLANT");
      }
    }
  }
  console.log(`  ✓ SalesOrder nodes: ${orders.length}`);
}

async function buildDeliveryNodes() {
  const deliveries = await prisma.outboundDeliveryHeader.findMany({
    include: { items: true },
  });
  for (const dh of deliveries) {
    await upsertNode({
      id: id.dl(dh.deliveryDocument),
      entityType: "DeliveryHeader",
      businessKey: dh.deliveryDocument,
      label: `Delivery ${dh.deliveryDocument}`,
      subtitle: `GI: ${dh.actualGoodsMovementDate ?? "pending"} · Status: ${dh.overallGoodsMovementStatus ?? "?"}`,
      metadata: {
        deliveryDocument: dh.deliveryDocument,
        actualGoodsMovementDate: dh.actualGoodsMovementDate,
        overallGoodsMovementStatus: dh.overallGoodsMovementStatus,
        overallPickingStatus: dh.overallPickingStatus,
        shippingPoint: dh.shippingPoint,
        creationDate: dh.creationDate,
      },
      searchText: [dh.deliveryDocument, dh.shippingPoint, dh.overallGoodsMovementStatus].filter(Boolean).join(" "),
    });

    // Link delivery items → sales orders
    const linkedSOs = new Set<string>();
    for (const di of dh.items) {
      if (di.referenceSdDocument && !linkedSOs.has(di.referenceSdDocument)) {
        linkedSOs.add(di.referenceSdDocument);
        await upsertEdge(
          id.so(di.referenceSdDocument),
          id.dl(dh.deliveryDocument),
          "HAS_DELIVERY",
          { deliveryItem: di.deliveryDocumentItem, quantity: di.actualDeliveryQuantity }
        );
      }
      if (di.plant) {
        await upsertEdge(id.dl(dh.deliveryDocument), id.plant(di.plant), "SHIPS_FROM");
      }
    }
  }
  console.log(`  ✓ DeliveryHeader nodes: ${deliveries.length}`);
}

async function buildBillingDocumentNodes() {
  const billings = await prisma.billingDocumentHeader.findMany({
    include: { items: true },
  });
  for (const bd of billings) {
    await upsertNode({
      id: id.bd(bd.billingDocument),
      entityType: "BillingDocument",
      businessKey: bd.billingDocument,
      label: `Billing Doc ${bd.billingDocument}`,
      subtitle: `${bd.billingDocumentType ?? ""} · ${bd.transactionCurrency ?? ""} ${bd.totalNetAmount ?? ""}`.trim(),
      metadata: {
        billingDocument: bd.billingDocument,
        billingDocumentType: bd.billingDocumentType,
        billingDocumentDate: bd.billingDocumentDate,
        totalNetAmount: bd.totalNetAmount,
        currency: bd.transactionCurrency,
        companyCode: bd.companyCode,
        fiscalYear: bd.fiscalYear,
        accountingDocument: bd.accountingDocument,
        soldToParty: bd.soldToParty,
        isCancelled: bd.billingDocumentIsCancelled,
      },
      searchText: [bd.billingDocument, bd.billingDocumentType, bd.soldToParty, bd.accountingDocument].filter(Boolean).join(" "),
    });

    // Customer edge
    if (bd.soldToParty) {
      await upsertEdge(id.bd(bd.billingDocument), id.cust(bd.soldToParty), "PLACED_BY");
    }

    // Delivery → Billing edges (via items)
    const linkedDeliveries = new Set<string>();
    for (const bi of bd.items) {
      if (bi.referenceSdDocument && !linkedDeliveries.has(bi.referenceSdDocument)) {
        linkedDeliveries.add(bi.referenceSdDocument);
        await upsertEdge(
          id.dl(bi.referenceSdDocument),
          id.bd(bd.billingDocument),
          "BILLED_FROM_DELIVERY",
          { billingItem: bi.billingDocumentItem, netAmount: bi.netAmount }
        );
      }
    }
  }
  console.log(`  ✓ BillingDocument nodes: ${billings.length}`);
}

async function buildJournalEntryNodes() {
  const items = await prisma.journalEntryItemAR.findMany();
  const grouped = new Map<string, typeof items>();
  for (const item of items) {
    const key = `${item.companyCode}-${item.fiscalYear}-${item.accountingDocument}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  for (const [, groupItems] of grouped) {
    const first = groupItems[0];
    const jeNodeId = id.je(first.companyCode, first.fiscalYear, first.accountingDocument);
    const totalAmount = groupItems
      .reduce((sum: number, i: { amountInCompanyCodeCurrency: string | null }) => sum + parseFloat(i.amountInCompanyCodeCurrency ?? "0"), 0)
      .toFixed(2);

    await upsertNode({
      id: jeNodeId,
      entityType: "JournalEntry",
      businessKey: first.accountingDocument,
      label: `Journal Entry ${first.accountingDocument}`,
      subtitle: `${first.companyCodeCurrency ?? ""} ${totalAmount} · ${first.postingDate ?? ""}`,
      metadata: {
        accountingDocument: first.accountingDocument,
        companyCode: first.companyCode,
        fiscalYear: first.fiscalYear,
        postingDate: first.postingDate,
        documentDate: first.documentDate,
        totalAmount,
        currency: first.companyCodeCurrency,
        customer: first.customer,
        clearingAccountingDocument: first.clearingAccountingDocument,
        accountingDocumentType: first.accountingDocumentType,
      },
      searchText: [first.accountingDocument, first.companyCode, first.customer, first.fiscalYear].filter(Boolean).join(" "),
    });

    // Link billing → journal via accountingDocument field on billing header
    const billings = await prisma.billingDocumentHeader.findMany({
      where: { accountingDocument: first.accountingDocument },
    });
    for (const bd of billings) {
      await upsertEdge(id.bd(bd.billingDocument), jeNodeId, "POSTED_TO_JOURNAL");
    }
  }
  console.log(`  ✓ JournalEntry nodes: ${grouped.size}`);
}

async function buildPaymentNodes() {
  // Group payments by accountingDocument
  const payments = await prisma.paymentAR.findMany();
  const grouped = new Map<string, typeof payments>();
  for (const p of payments) {
    const key = `${p.companyCode}-${p.fiscalYear}-${p.accountingDocument}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  }

  for (const [, groupItems] of grouped) {
    const first = groupItems[0];
    const payNodeId = id.pay(first.companyCode, first.fiscalYear, first.accountingDocument);
    const totalAmount = groupItems
      .reduce((sum: number, i: { amountInCompanyCodeCurrency: string | null }) => sum + parseFloat(i.amountInCompanyCodeCurrency ?? "0"), 0)
      .toFixed(2);

    await upsertNode({
      id: payNodeId,
      entityType: "Payment",
      businessKey: first.accountingDocument,
      label: `Payment ${first.accountingDocument}`,
      subtitle: `${first.companyCodeCurrency ?? ""} ${totalAmount} · ${first.clearingDate ?? ""}`,
      metadata: {
        accountingDocument: first.accountingDocument,
        companyCode: first.companyCode,
        fiscalYear: first.fiscalYear,
        clearingDate: first.clearingDate,
        totalAmount,
        currency: first.companyCodeCurrency,
        customer: first.customer,
        invoiceReference: first.invoiceReference,
        salesDocument: first.salesDocument,
      },
      searchText: [first.accountingDocument, first.companyCode, first.customer, first.invoiceReference].filter(Boolean).join(" "),
    });


    if (first.clearingAccountingDocument) {
      const journalItems = await prisma.journalEntryItemAR.findMany({
        where: {
          companyCode: first.companyCode,
          clearingAccountingDocument: first.accountingDocument,
        },
        take: 1,
      });
      if (journalItems.length > 0) {
        const ji = journalItems[0];
        const jeNodeId = id.je(ji.companyCode, ji.fiscalYear, ji.accountingDocument);
        await upsertEdge(jeNodeId, payNodeId, "CLEARED_BY", { clearingDate: first.clearingDate });
      }
    }

    // Link customer
    if (first.customer) {
      await upsertEdge(payNodeId, id.cust(first.customer), "PLACED_BY");
    }

    // Direct Payment → BillingDocument link via invoiceReference
    if (first.invoiceReference) {
      await upsertEdge(payNodeId, id.bd(first.invoiceReference), "CLEARED_BY", {
        clearingDate: first.clearingDate,
        directLink: true,
      });
    }
  }
  console.log(`  ✓ Payment nodes: ${grouped.size}`);
}


async function resetGraphLayer() {
  console.log("  Clearing existing graph data...");
  await prisma.graphEdge.deleteMany();
  await prisma.graphNode.deleteMany();
  console.log("  ✓ Graph layer cleared.");
}


async function printSummary() {
  const nodesByType = await prisma.graphNode.groupBy({
    by: ["entityType"],
    _count: { id: true },
  });
  const edgesByType = await prisma.graphEdge.groupBy({
    by: ["relationType"],
    _count: { id: true },
  });

  console.log("\n  ── Node Summary ────────────────────────────────────");
  for (const g of nodesByType) {
    console.log(`    ${g.entityType.padEnd(20)} ${g._count.id}`);
  }
  console.log("\n  ── Edge Summary ────────────────────────────────────");
  for (const g of edgesByType) {
    console.log(`    ${g.relationType.padEnd(25)} ${g._count.id}`);
  }
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║   O2C Graph — Graph Construction Pipeline            ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const start = Date.now();
  await resetGraphLayer();

  console.log("\n  Building nodes...\n");
  await buildCustomerNodes();
  await buildProductNodes();
  await buildPlantNodes();
  await buildProductPlantEdges();
  await buildSalesOrderNodes();
  await buildDeliveryNodes();
  await buildBillingDocumentNodes();
  await buildJournalEntryNodes();
  await buildPaymentNodes();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  await printSummary();
}

main()
  .catch((e) => { console.error("Fatal:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());

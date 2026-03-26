
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

const prisma = new PrismaClient();


function str(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v).trim();
}

function num(v: unknown): number | null {
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

function bool(v: unknown): boolean {
  return v === true || v === "true" || v === "X" || v === "1";
}

async function readJsonlFile(filePath: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      // skip malformed lines silently
    }
  }
  return rows;
}

async function readAllJsonlInDir(dir: string): Promise<Record<string, unknown>[]> {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  const all: Record<string, unknown>[] = [];
  for (const file of files) {
    const rows = await readJsonlFile(path.join(dir, file));
    all.push(...rows);
  }
  return all;
}

function logResult(table: string, inserted: number, skipped: number, errors: number) {
  console.log(
    `  ✓ ${table.padEnd(45)} inserted: ${String(inserted).padStart(5)}  skipped: ${String(skipped).padStart(5)}  errors: ${String(errors).padStart(4)}`
  );
}

// ─── Per-table ingestors ─────────────────────────────────────

async function ingestSalesOrderHeaders(
  rows: Record<string, unknown>[]
): Promise<{ inserted: number; skipped: number; errors: number }> {
  let inserted = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    const key = str(r.salesOrder);
    if (!key) { skipped++; continue; }
    try {
      await prisma.salesOrderHeader.upsert({
        where: { salesOrder: key },
        create: {
          salesOrder: key,
          salesOrderType: str(r.salesOrderType),
          salesOrganization: str(r.salesOrganization),
          distributionChannel: str(r.distributionChannel),
          organizationDivision: str(r.organizationDivision),
          salesGroup: str(r.salesGroup),
          salesOffice: str(r.salesOffice),
          soldToParty: str(r.soldToParty),
          creationDate: str(r.creationDate),
          createdByUser: str(r.createdByUser),
          lastChangeDateTime: str(r.lastChangeDateTime),
          totalNetAmount: str(r.totalNetAmount),
          overallDeliveryStatus: str(r.overallDeliveryStatus),
          overallOrdReltdBillgStatus: str(r.overallOrdReltdBillgStatus),
          overallSdDocReferenceStatus: str(r.overallSdDocReferenceStatus),
          transactionCurrency: str(r.transactionCurrency),
          pricingDate: str(r.pricingDate),
          requestedDeliveryDate: str(r.requestedDeliveryDate),
          headerBillingBlockReason: str(r.headerBillingBlockReason),
          deliveryBlockReason: str(r.deliveryBlockReason),
          incotermsClassification: str(r.incotermsClassification),
          incotermsLocation1: str(r.incotermsLocation1),
          customerPaymentTerms: str(r.customerPaymentTerms),
          totalCreditCheckStatus: str(r.totalCreditCheckStatus),
        },
        update: {},
      });
      inserted++;
    } catch { errors++; }
  }
  return { inserted, skipped, errors };
}

async function ingestSalesOrderItems(rows: Record<string, unknown>[]) {
  let inserted = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    const key = str(r.salesOrder);
    const item = str(r.salesOrderItem);
    if (!key || !item) { skipped++; continue; }
    // Ensure parent exists
    try {
      await prisma.salesOrderHeader.upsert({
        where: { salesOrder: key },
        create: { salesOrder: key },
        update: {},
      });
      await prisma.salesOrderItem.upsert({
        where: { salesOrder_salesOrderItem: { salesOrder: key, salesOrderItem: item } },
        create: {
          salesOrder: key,
          salesOrderItem: item,
          salesOrderItemCategory: str(r.salesOrderItemCategory),
          material: str(r.material),
          requestedQuantity: str(r.requestedQuantity),
          requestedQuantityUnit: str(r.requestedQuantityUnit),
          transactionCurrency: str(r.transactionCurrency),
          netAmount: str(r.netAmount),
          materialGroup: str(r.materialGroup),
          productionPlant: str(r.productionPlant),
          storageLocation: str(r.storageLocation),
          salesDocumentRjcnReason: str(r.salesDocumentRjcnReason),
          itemBillingBlockReason: str(r.itemBillingBlockReason),
        },
        update: {},
      });
      inserted++;
    } catch { errors++; }
  }
  return { inserted, skipped, errors };
}

async function ingestSalesOrderScheduleLines(rows: Record<string, unknown>[]) {
  let inserted = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    const so = str(r.salesOrder);
    const item = str(r.salesOrderItem);
    const sl = str(r.scheduleLine);
    if (!so || !item || !sl) { skipped++; continue; }
    try {
      await prisma.salesOrderScheduleLine.upsert({
        where: { salesOrder_salesOrderItem_scheduleLine: { salesOrder: so, salesOrderItem: item, scheduleLine: sl } },
        create: {
          salesOrder: so,
          salesOrderItem: item,
          scheduleLine: sl,
          confirmedDeliveryDate: str(r.confirmedDeliveryDate),
          orderQuantityUnit: str(r.orderQuantityUnit),
          confdOrderQtyByMatlAvailCheck: str(r.confdOrderQtyByMatlAvailCheck),
        },
        update: {},
      });
      inserted++;
    } catch { errors++; }
  }
  return { inserted, skipped, errors };
}

async function ingestOutboundDeliveryHeaders(rows: Record<string, unknown>[]) {
  let inserted = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    const key = str(r.deliveryDocument);
    if (!key) { skipped++; continue; }
    try {
      await prisma.outboundDeliveryHeader.upsert({
        where: { deliveryDocument: key },
        create: {
          deliveryDocument: key,
          actualGoodsMovementDate: str(r.actualGoodsMovementDate),
          actualGoodsMovementTime: str(r.actualGoodsMovementTime),
          creationDate: str(r.creationDate),
          creationTime: str(r.creationTime),
          deliveryBlockReason: str(r.deliveryBlockReason),
          hdrGeneralIncompletionStatus: str(r.hdrGeneralIncompletionStatus),
          headerBillingBlockReason: str(r.headerBillingBlockReason),
          lastChangeDate: str(r.lastChangeDate),
          overallGoodsMovementStatus: str(r.overallGoodsMovementStatus),
          overallPickingStatus: str(r.overallPickingStatus),
          overallProofOfDeliveryStatus: str(r.overallProofOfDeliveryStatus),
          shippingPoint: str(r.shippingPoint),
        },
        update: {},
      });
      inserted++;
    } catch { errors++; }
  }
  return { inserted, skipped, errors };
}

async function ingestOutboundDeliveryItems(rows: Record<string, unknown>[]) {
  let inserted = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    const doc = str(r.deliveryDocument);
    const item = str(r.deliveryDocumentItem);
    if (!doc || !item) { skipped++; continue; }
    try {
      await prisma.outboundDeliveryHeader.upsert({
        where: { deliveryDocument: doc },
        create: { deliveryDocument: doc },
        update: {},
      });
      await prisma.outboundDeliveryItem.upsert({
        where: { deliveryDocument_deliveryDocumentItem: { deliveryDocument: doc, deliveryDocumentItem: item } },
        create: {
          deliveryDocument: doc,
          deliveryDocumentItem: item,
          actualDeliveryQuantity: str(r.actualDeliveryQuantity),
          batch: str(r.batch),
          deliveryQuantityUnit: str(r.deliveryQuantityUnit),
          itemBillingBlockReason: str(r.itemBillingBlockReason),
          lastChangeDate: str(r.lastChangeDate),
          plant: str(r.plant),
          referenceSdDocument: str(r.referenceSdDocument),
          referenceSdDocumentItem: str(r.referenceSdDocumentItem),
          storageLocation: str(r.storageLocation),
        },
        update: {},
      });
      inserted++;
    } catch { errors++; }
  }
  return { inserted, skipped, errors };
}

async function ingestBillingDocumentHeaders(rows: Record<string, unknown>[]) {
  let inserted = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    const key = str(r.billingDocument);
    if (!key) { skipped++; continue; }
    try {
      await prisma.billingDocumentHeader.upsert({
        where: { billingDocument: key },
        create: {
          billingDocument: key,
          billingDocumentType: str(r.billingDocumentType),
          creationDate: str(r.creationDate),
          creationTime: str(r.creationTime),
          lastChangeDateTime: str(r.lastChangeDateTime),
          billingDocumentDate: str(r.billingDocumentDate),
          billingDocumentIsCancelled: str(r.billingDocumentIsCancelled),
          cancelledBillingDocument: str(r.cancelledBillingDocument),
          totalNetAmount: str(r.totalNetAmount),
          transactionCurrency: str(r.transactionCurrency),
          companyCode: str(r.companyCode),
          fiscalYear: str(r.fiscalYear),
          accountingDocument: str(r.accountingDocument),
          soldToParty: str(r.soldToParty),
        },
        update: {},
      });
      inserted++;
    } catch { errors++; }
  }
  return { inserted, skipped, errors };
}

async function ingestBillingDocumentItems(rows: Record<string, unknown>[]) {
  let inserted = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    const doc = str(r.billingDocument);
    const item = str(r.billingDocumentItem);
    if (!doc || !item) { skipped++; continue; }
    try {
      await prisma.billingDocumentHeader.upsert({
        where: { billingDocument: doc },
        create: { billingDocument: doc },
        update: {},
      });
      await prisma.billingDocumentItem.upsert({
        where: { billingDocument_billingDocumentItem: { billingDocument: doc, billingDocumentItem: item } },
        create: {
          billingDocument: doc,
          billingDocumentItem: item,
          material: str(r.material),
          billingQuantity: str(r.billingQuantity),
          billingQuantityUnit: str(r.billingQuantityUnit),
          netAmount: str(r.netAmount),
          transactionCurrency: str(r.transactionCurrency),
          referenceSdDocument: str(r.referenceSdDocument),
          referenceSdDocumentItem: str(r.referenceSdDocumentItem),
        },
        update: {},
      });
      inserted++;
    } catch { errors++; }
  }
  return { inserted, skipped, errors };
}

async function ingestBillingDocumentCancellations(rows: Record<string, unknown>[]) {
  let inserted = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    const key = str(r.billingDocument);
    if (!key) { skipped++; continue; }
    try {
      await prisma.billingDocumentCancellation.upsert({
        where: { billingDocument: key },
        create: {
          billingDocument: key,
          billingDocumentType: str(r.billingDocumentType),
          creationDate: str(r.creationDate),
          creationTime: str(r.creationTime),
          lastChangeDateTime: str(r.lastChangeDateTime),
          billingDocumentDate: str(r.billingDocumentDate),
          billingDocumentIsCancelled: str(r.billingDocumentIsCancelled),
          cancelledBillingDocument: str(r.cancelledBillingDocument),
          totalNetAmount: str(r.totalNetAmount),
          transactionCurrency: str(r.transactionCurrency),
          companyCode: str(r.companyCode),
          fiscalYear: str(r.fiscalYear),
          accountingDocument: str(r.accountingDocument),
          soldToParty: str(r.soldToParty),
        },
        update: {},
      });
      inserted++;
    } catch { errors++; }
  }
  return { inserted, skipped, errors };
}

async function ingestJournalEntryItemsAR(rows: Record<string, unknown>[]) {
  let inserted = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    const cc = str(r.companyCode);
    const fy = str(r.fiscalYear);
    const ad = str(r.accountingDocument);
    const ai = str(r.accountingDocumentItem);
    if (!cc || !fy || !ad || !ai) { skipped++; continue; }
    try {
      await prisma.journalEntryItemAR.upsert({
        where: {
          companyCode_fiscalYear_accountingDocument_accountingDocumentItem: {
            companyCode: cc, fiscalYear: fy, accountingDocument: ad, accountingDocumentItem: ai,
          },
        },
        create: {
          companyCode: cc, fiscalYear: fy,
          accountingDocument: ad, accountingDocumentItem: ai,
          glAccount: str(r.glAccount),
          referenceDocument: str(r.referenceDocument),
          costCenter: str(r.costCenter),
          profitCenter: str(r.profitCenter),
          transactionCurrency: str(r.transactionCurrency),
          amountInTransactionCurrency: str(r.amountInTransactionCurrency),
          companyCodeCurrency: str(r.companyCodeCurrency),
          amountInCompanyCodeCurrency: str(r.amountInCompanyCodeCurrency),
          postingDate: str(r.postingDate),
          documentDate: str(r.documentDate),
          accountingDocumentType: str(r.accountingDocumentType),
          assignmentReference: str(r.assignmentReference),
          lastChangeDateTime: str(r.lastChangeDateTime),
          customer: str(r.customer),
          financialAccountType: str(r.financialAccountType),
          clearingDate: str(r.clearingDate),
          clearingAccountingDocument: str(r.clearingAccountingDocument),
          clearingDocFiscalYear: str(r.clearingDocFiscalYear),
        },
        update: {},
      });
      inserted++;
    } catch { errors++; }
  }
  return { inserted, skipped, errors };
}

async function ingestPaymentsAR(rows: Record<string, unknown>[]) {
  let inserted = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    const cc = str(r.companyCode);
    const fy = str(r.fiscalYear);
    const ad = str(r.accountingDocument);
    const ai = str(r.accountingDocumentItem);
    if (!cc || !fy || !ad || !ai) { skipped++; continue; }
    try {
      await prisma.paymentAR.upsert({
        where: {
          companyCode_fiscalYear_accountingDocument_accountingDocumentItem: {
            companyCode: cc, fiscalYear: fy, accountingDocument: ad, accountingDocumentItem: ai,
          },
        },
        create: {
          companyCode: cc, fiscalYear: fy,
          accountingDocument: ad, accountingDocumentItem: ai,
          clearingDate: str(r.clearingDate),
          clearingAccountingDocument: str(r.clearingAccountingDocument),
          clearingDocFiscalYear: str(r.clearingDocFiscalYear),
          amountInTransactionCurrency: str(r.amountInTransactionCurrency),
          transactionCurrency: str(r.transactionCurrency),
          amountInCompanyCodeCurrency: str(r.amountInCompanyCodeCurrency),
          companyCodeCurrency: str(r.companyCodeCurrency),
          customer: str(r.customer),
          invoiceReference: str(r.invoiceReference),
          invoiceReferenceFiscalYear: str(r.invoiceReferenceFiscalYear),
          salesDocument: str(r.salesDocument),
          salesDocumentItem: str(r.salesDocumentItem),
          postingDate: str(r.postingDate),
          documentDate: str(r.documentDate),
          assignmentReference: str(r.assignmentReference),
          glAccount: str(r.glAccount),
          financialAccountType: str(r.financialAccountType),
          profitCenter: str(r.profitCenter),
          costCenter: str(r.costCenter),
        },
        update: {},
      });
      inserted++;
    } catch { errors++; }
  }
  return { inserted, skipped, errors };
}

async function ingestBusinessPartners(rows: Record<string, unknown>[]) {
  let inserted = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    const key = str(r.businessPartner);
    if (!key) { skipped++; continue; }
    try {
      await prisma.businessPartner.upsert({
        where: { businessPartner: key },
        create: {
          businessPartner: key,
          customer: str(r.customer),
          businessPartnerCategory: str(r.businessPartnerCategory),
          businessPartnerFullName: str(r.businessPartnerFullName),
          businessPartnerGrouping: str(r.businessPartnerGrouping),
          businessPartnerName: str(r.businessPartnerName),
          correspondenceLanguage: str(r.correspondenceLanguage),
          createdByUser: str(r.createdByUser),
          creationDate: str(r.creationDate),
          creationTime: str(r.creationTime),
          firstName: str(r.firstName),
          formOfAddress: str(r.formOfAddress),
          industry: str(r.industry),
          lastChangeDate: str(r.lastChangeDate),
          lastName: str(r.lastName),
          organizationBpName1: str(r.organizationBpName1),
          organizationBpName2: str(r.organizationBpName2),
          businessPartnerIsBlocked: str(r.businessPartnerIsBlocked),
          isMarkedForArchiving: str(r.isMarkedForArchiving),
        },
        update: {},
      });
      inserted++;
    } catch { errors++; }
  }
  return { inserted, skipped, errors };
}

async function ingestBusinessPartnerAddresses(rows: Record<string, unknown>[]) {
  let inserted = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    const bp = str(r.businessPartner);
    const addr = str(r.addressId);
    if (!bp || !addr) { skipped++; continue; }
    try {
      await prisma.businessPartner.upsert({ where: { businessPartner: bp }, create: { businessPartner: bp }, update: {} });
      await prisma.businessPartnerAddress.upsert({
        where: { businessPartner_addressId: { businessPartner: bp, addressId: addr } },
        create: {
          businessPartner: bp, addressId: addr,
          validityStartDate: str(r.validityStartDate),
          validityEndDate: str(r.validityEndDate),
          addressUuid: str(r.addressUuid),
          addressTimeZone: str(r.addressTimeZone),
          cityName: str(r.cityName),
          country: str(r.country),
          poBox: str(r.poBox),
          poBoxDeviatingCityName: str(r.poBoxDeviatingCityName),
          poBoxDeviatingCountry: str(r.poBoxDeviatingCountry),
          poBoxDeviatingRegion: str(r.poBoxDeviatingRegion),
          poBoxIsWithoutNumber: str(r.poBoxIsWithoutNumber),
          poBoxLobbyName: str(r.poBoxLobbyName),
          poBoxPostalCode: str(r.poBoxPostalCode),
          postalCode: str(r.postalCode),
          region: str(r.region),
          streetName: str(r.streetName),
          taxJurisdiction: str(r.taxJurisdiction),
          transportZone: str(r.transportZone),
        },
        update: {},
      });
      inserted++;
    } catch { errors++; }
  }
  return { inserted, skipped, errors };
}

async function ingestCustomerCompanyAssignments(rows: Record<string, unknown>[]) {
  let inserted = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    const cust = str(r.customer);
    const cc = str(r.companyCode);
    if (!cust || !cc) { skipped++; continue; }
    try {
      await prisma.customerCompanyAssignment.upsert({
        where: { customer_companyCode: { customer: cust, companyCode: cc } },
        create: {
          customer: cust, companyCode: cc,
          accountingClerk: str(r.accountingClerk),
          accountingClerkFaxNumber: str(r.accountingClerkFaxNumber),
          accountingClerkInternetAddress: str(r.accountingClerkInternetAddress),
          accountingClerkPhoneNumber: str(r.accountingClerkPhoneNumber),
          alternativePayerAccount: str(r.alternativePayerAccount),
          paymentBlockingReason: str(r.paymentBlockingReason),
          paymentMethodsList: str(r.paymentMethodsList),
          paymentTerms: str(r.paymentTerms),
          reconciliationAccount: str(r.reconciliationAccount),
          deletionIndicator: str(r.deletionIndicator),
          customerAccountGroup: str(r.customerAccountGroup),
        },
        update: {},
      });
      inserted++;
    } catch { errors++; }
  }
  return { inserted, skipped, errors };
}

async function ingestCustomerSalesAreaAssignments(rows: Record<string, unknown>[]) {
  let inserted = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    const cust = str(r.customer);
    const sorg = str(r.salesOrganization);
    const dc = str(r.distributionChannel);
    const div = str(r.division);
    if (!cust || !sorg || !dc || !div) { skipped++; continue; }
    try {
      await prisma.customerSalesAreaAssignment.upsert({
        where: { customer_salesOrganization_distributionChannel_division: { customer: cust, salesOrganization: sorg, distributionChannel: dc, division: div } },
        create: {
          customer: cust, salesOrganization: sorg, distributionChannel: dc, division: div,
          billingIsBlockedForCustomer: str(r.billingIsBlockedForCustomer),
          completeDeliveryIsDefined: str(r.completeDeliveryIsDefined),
          creditControlArea: str(r.creditControlArea),
          currency: str(r.currency),
          customerPaymentTerms: str(r.customerPaymentTerms),
          deliveryPriority: str(r.deliveryPriority),
          incotermsClassification: str(r.incotermsClassification),
          incotermsLocation1: str(r.incotermsLocation1),
          salesGroup: str(r.salesGroup),
          salesOffice: str(r.salesOffice),
          shippingCondition: str(r.shippingCondition),
          slsUnlmtdOvrdelivIsAllwd: str(r.slsUnlmtdOvrdelivIsAllwd),
          supplyingPlant: str(r.supplyingPlant),
          salesDistrict: str(r.salesDistrict),
          exchangeRateType: str(r.exchangeRateType),
        },
        update: {},
      });
      inserted++;
    } catch { errors++; }
  }
  return { inserted, skipped, errors };
}

async function ingestProducts(rows: Record<string, unknown>[]) {
  let inserted = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    const key = str(r.product);
    if (!key) { skipped++; continue; }
    try {
      await prisma.product.upsert({
        where: { product: key },
        create: {
          product: key,
          productType: str(r.productType),
          crossPlantStatus: str(r.crossPlantStatus),
          crossPlantStatusValidityDate: str(r.crossPlantStatusValidityDate),
          creationDate: str(r.creationDate),
          createdByUser: str(r.createdByUser),
          lastChangeDate: str(r.lastChangeDate),
          lastChangeDateTime: str(r.lastChangeDateTime),
          isMarkedForDeletion: str(r.isMarkedForDeletion),
          productOldId: str(r.productOldId),
          grossWeight: str(r.grossWeight),
          weightUnit: str(r.weightUnit),
          netWeight: str(r.netWeight),
          productGroup: str(r.productGroup),
          baseUnit: str(r.baseUnit),
          division: str(r.division),
          industrySector: str(r.industrySector),
        },
        update: {},
      });
      inserted++;
    } catch { errors++; }
  }
  return { inserted, skipped, errors };
}

async function ingestProductDescriptions(rows: Record<string, unknown>[]) {
  let inserted = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    const prod = str(r.product);
    const lang = str(r.language);
    if (!prod || !lang) { skipped++; continue; }
    try {
      await prisma.product.upsert({ where: { product: prod }, create: { product: prod }, update: {} });
      await prisma.productDescription.upsert({
        where: { product_language: { product: prod, language: lang } },
        create: { product: prod, language: lang, productDescription: str(r.productDescription) },
        update: {},
      });
      inserted++;
    } catch { errors++; }
  }
  return { inserted, skipped, errors };
}

async function ingestPlants(rows: Record<string, unknown>[]) {
  let inserted = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    const key = str(r.plant);
    if (!key) { skipped++; continue; }
    try {
      await prisma.plant.upsert({
        where: { plant: key },
        create: {
          plant: key,
          plantName: str(r.plantName),
          valuationArea: str(r.valuationArea),
          plantCustomer: str(r.plantCustomer),
          plantSupplier: str(r.plantSupplier),
          factoryCalendar: str(r.factoryCalendar),
          defaultPurchasingOrganization: str(r.defaultPurchasingOrganization),
          salesOrganization: str(r.salesOrganization),
          addressId: str(r.addressId),
          plantCategory: str(r.plantCategory),
          distributionChannel: str(r.distributionChannel),
          division: str(r.division),
          language: str(r.language),
          isMarkedForArchiving: str(r.isMarkedForArchiving),
        },
        update: {},
      });
      inserted++;
    } catch { errors++; }
  }
  return { inserted, skipped, errors };
}

async function ingestProductPlants(rows: Record<string, unknown>[]) {
  let inserted = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    const prod = str(r.product);
    const plant = str(r.plant);
    if (!prod || !plant) { skipped++; continue; }
    try {
      await prisma.product.upsert({ where: { product: prod }, create: { product: prod }, update: {} });
      await prisma.plant.upsert({ where: { plant }, create: { plant }, update: {} });
      await prisma.productPlant.upsert({
        where: { product_plant: { product: prod, plant } },
        create: {
          product: prod, plant,
          countryOfOrigin: str(r.countryOfOrigin),
          regionOfOrigin: str(r.regionOfOrigin),
          productionInvtryManagedLoc: str(r.productionInvtryManagedLoc),
          availabilityCheckType: str(r.availabilityCheckType),
          fiscalYearVariant: str(r.fiscalYearVariant),
          profitCenter: str(r.profitCenter),
          mrpType: str(r.mrpType),
        },
        update: {},
      });
      inserted++;
    } catch { errors++; }
  }
  return { inserted, skipped, errors };
}

async function ingestProductStorageLocations(rows: Record<string, unknown>[]) {
  let inserted = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    const prod = str(r.product);
    const plant = str(r.plant);
    const sl = str(r.storageLocation);
    if (!prod || !plant || !sl) { skipped++; continue; }
    try {
      await prisma.productStorageLocation.upsert({
        where: { product_plant_storageLocation: { product: prod, plant, storageLocation: sl } },
        create: { product: prod, plant, storageLocation: sl },
        update: {},
      });
      inserted++;
    } catch { errors++; }
  }
  return { inserted, skipped, errors };
}

// ─── Reset ────────────────────────────────────────────────────

async function resetAllTables() {
  console.log("\n⚠️  --reset flag detected. Wiping all tables...");
  // Graph layer first (FK deps)
  await prisma.graphEdge.deleteMany();
  await prisma.graphNode.deleteMany();
  // Operational
  await prisma.queryLog.deleteMany();
  // Derived / leaf
  await prisma.salesOrderScheduleLine.deleteMany();
  await prisma.salesOrderItem.deleteMany();
  await prisma.salesOrderHeader.deleteMany();
  await prisma.outboundDeliveryItem.deleteMany();
  await prisma.outboundDeliveryHeader.deleteMany();
  await prisma.billingDocumentItem.deleteMany();
  await prisma.billingDocumentHeader.deleteMany();
  await prisma.billingDocumentCancellation.deleteMany();
  await prisma.journalEntryItemAR.deleteMany();
  await prisma.paymentAR.deleteMany();
  await prisma.productDescription.deleteMany();
  await prisma.productPlant.deleteMany();
  await prisma.productStorageLocation.deleteMany();
  await prisma.product.deleteMany();
  await prisma.businessPartnerAddress.deleteMany();
  await prisma.businessPartner.deleteMany();
  await prisma.customerCompanyAssignment.deleteMany();
  await prisma.customerSalesAreaAssignment.deleteMany();
  await prisma.plant.deleteMany();
  console.log("  ✓ All tables cleared.\n");
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const reset = args.includes("--reset");
  const dataDir = args.find((a) => !a.startsWith("--")) ?? "./sap-o2c-data";

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║   O2C Graph — Data Ingestion Pipeline                ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Data directory : ${path.resolve(dataDir)}`);
  console.log(`  Reset mode     : ${reset}`);
  console.log();

  if (reset) await resetAllTables();

  const start = Date.now();

  // Ordered to respect FK constraints:
  // 1. Parents before children
  console.log("  Loading datasets...\n");

  const tasks: [string, string, (rows: Record<string, unknown>[]) => Promise<{ inserted: number; skipped: number; errors: number }>][] = [
    ["Plants", "plants", ingestPlants],
    ["Products", "products", ingestProducts],
    ["ProductDescriptions", "product_descriptions", ingestProductDescriptions],
    ["ProductPlants", "product_plants", ingestProductPlants],
    ["ProductStorageLocations", "product_storage_locations", ingestProductStorageLocations],
    ["BusinessPartners", "business_partners", ingestBusinessPartners],
    ["BusinessPartnerAddresses", "business_partner_addresses", ingestBusinessPartnerAddresses],
    ["CustomerCompanyAssignments", "customer_company_assignments", ingestCustomerCompanyAssignments],
    ["CustomerSalesAreaAssignments", "customer_sales_area_assignments", ingestCustomerSalesAreaAssignments],
    ["SalesOrderHeaders", "sales_order_headers", ingestSalesOrderHeaders],
    ["SalesOrderItems", "sales_order_items", ingestSalesOrderItems],
    ["SalesOrderScheduleLines", "sales_order_schedule_lines", ingestSalesOrderScheduleLines],
    ["OutboundDeliveryHeaders", "outbound_delivery_headers", ingestOutboundDeliveryHeaders],
    ["OutboundDeliveryItems", "outbound_delivery_items", ingestOutboundDeliveryItems],
    ["BillingDocumentHeaders", "billing_document_headers", ingestBillingDocumentHeaders],
    ["BillingDocumentCancellations", "billing_document_cancellations", ingestBillingDocumentCancellations],
    ["BillingDocumentItems", "billing_document_items", ingestBillingDocumentItems],
    ["JournalEntryItemsAR", "journal_entry_items_accounts_receivable", ingestJournalEntryItemsAR],
    ["PaymentsAR", "payments_accounts_receivable", ingestPaymentsAR],
  ];

  let totalInserted = 0;
  let totalErrors = 0;

  for (const [label, dirname, fn] of tasks) {
    console.log(`Starting ${label}...`);
    const dir = path.join(dataDir, dirname);
    const rows = await readAllJsonlInDir(dir);
    const result = await fn(rows);
    logResult(label, result.inserted, result.skipped, result.errors);
    totalInserted += result.inserted;
    totalErrors += result.errors;
    console.log(`Finished ${label}`);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n  ─────────────────────────────────────────────────────`);
  console.log(`  Total inserted: ${totalInserted}  |  Total errors: ${totalErrors}  |  Time: ${elapsed}s`);
  console.log(`\n  Ingestion complete. Run 'npm run build-graph' next.`);
  console.log();
}

main()
  .catch((e) => { console.error("Fatal:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());

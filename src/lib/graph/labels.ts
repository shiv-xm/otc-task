// ============================================================
// src/lib/graph/labels.ts
// Entity label and subtitle formatting helpers.
// ============================================================

import type { EntityType, RelationType } from "@/types/graph";

// ── Human-readable entity type labels ────────────────────────

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  SalesOrder:       "Sales Order",
  DeliveryHeader:   "Delivery",
  BillingDocument:  "Billing Document",
  JournalEntry:     "Journal Entry",
  Payment:          "Payment",
  Customer:         "Customer",
  Product:          "Product",
  Plant:            "Plant",
  Address:          "Address",
};

// ── Human-readable relation type labels ──────────────────────

export const RELATION_LABELS: Record<RelationType, string> = {
  PLACED_BY:              "Placed By",
  HAS_DELIVERY:           "Has Delivery",
  BILLED_FROM_DELIVERY:   "Billed From",
  POSTED_TO_JOURNAL:      "Posted to Journal",
  CLEARED_BY:             "Cleared By",
  REFERENCES_PRODUCT:     "References Product",
  LOCATED_AT_PLANT:       "Located at Plant",
  SHIPS_FROM:             "Ships From",
  HAS_ADDRESS:            "Has Address",
  CANCELLED_BY:           "Cancelled By",
};

// ── Status badge display ──────────────────────────────────────

export function formatDeliveryStatus(status: string | null | undefined): string {
  const map: Record<string, string> = {
    A: "Not Yet Processed",
    B: "Partially Processed",
    C: "Fully Processed",
    "": "—",
  };
  return map[status ?? ""] ?? (status ?? "—");
}

export function formatBillingStatus(status: string | null | undefined): string {
  const map: Record<string, string> = {
    A: "Not Billed",
    B: "Partially Billed",
    C: "Fully Billed",
    "": "—",
  };
  return map[status ?? ""] ?? (status ?? "—");
}

// ── Currency amount ───────────────────────────────────────────

export function formatAmount(amount: string | null | undefined, currency: string | null | undefined): string {
  if (!amount) return "—";
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  return `${currency ?? ""} ${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
}

// ── Metadata field display names ──────────────────────────────

export const FIELD_DISPLAY_NAMES: Record<string, string> = {
  salesOrder:                "Sales Order",
  salesOrderType:            "Order Type",
  salesOrganization:         "Sales Org",
  soldToParty:               "Sold-To Party",
  totalNetAmount:            "Net Amount",
  currency:                  "Currency",
  creationDate:              "Created",
  overallDeliveryStatus:     "Delivery Status",
  overallBillingStatus:      "Billing Status",
  requestedDeliveryDate:     "Requested Delivery",
  billingDocument:           "Billing Document",
  billingDocumentType:       "Billing Type",
  billingDocumentDate:       "Billing Date",
  companyCode:               "Company Code",
  fiscalYear:                "Fiscal Year",
  accountingDocument:        "Accounting Doc",
  isCancelled:               "Cancelled",
  deliveryDocument:          "Delivery Document",
  actualGoodsMovementDate:   "Goods Issue Date",
  overallGoodsMovementStatus:"GI Status",
  overallPickingStatus:      "Picking Status",
  shippingPoint:             "Shipping Point",
  postingDate:               "Posting Date",
  documentDate:              "Document Date",
  totalAmount:               "Total Amount",
  clearingDate:              "Clearing Date",
  clearingAccountingDocument:"Clearing Doc",
  customer:                  "Customer",
  businessPartner:           "Business Partner",
  fullName:                  "Full Name",
  industry:                  "Industry",
  country:                   "Country",
  city:                      "City",
  isBlocked:                 "Blocked",
  product:                   "Product",
  productType:               "Product Type",
  productGroup:              "Product Group",
  baseUnit:                  "Base Unit",
  grossWeight:               "Gross Weight",
  weightUnit:                "Weight Unit",
  division:                  "Division",
  plant:                     "Plant",
  plantName:                 "Plant Name",
  salesOrg:                  "Sales Org",
  street:                    "Street",
  postalCode:                "Postal Code",
  region:                    "Region",
};

export function getFieldDisplayName(key: string): string {
  return FIELD_DISPLAY_NAMES[key] ?? key.replace(/([A-Z])/g, " $1").trim();
}

"use client";

import { X, ExternalLink, Activity, Info, ChevronRight, Hash, Calendar, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useGraphStore } from '@/lib/store/graph-store';

const DISPLAY_NAMES: Record<string, string> = {
  salesOrder: "Sales Order",
  deliveryDocument: "Delivery Document",
  billingDocument: "Billing Document",
  accountingDocument: "Accounting Document",
  companyCode: "Company Code",
  fiscalYear: "Fiscal Year",
  totalNetAmount: "Net Amount",
  totalAmount: "Total Amount",
  currency: "Currency",
  transactionCurrency: "Currency",
  companyCodeCurrency: "Company Code Currency",
  soldToParty: "Sold-To Party",
  customer: "Customer",
  businessPartner: "Business Partner",
  billingDocumentType: "Billing Type",
  billingDocumentDate: "Billing Date",
  billingDocumentDate_: "Billing Date",
  postingDate: "Posting Date",
  documentDate: "Document Date",
  creationDate: "Creation Date",
  clearingDate: "Clearing Date",
  actualGoodsMovementDate: "Goods Movement Date",
  overallDeliveryStatus: "Delivery Status",
  overallGoodsMovementStatus: "GI Status",
  overallBillingStatus: "Billing Status",
  overallPickingStatus: "Picking Status",
  shippingPoint: "Shipping Point",
  salesOrganization: "Sales Org",
  distributionChannel: "Dist. Channel",
  salesOrderType: "Order Type",
  product: "Product",
  material: "Material",
  productType: "Product Type",
  baseUnit: "Base Unit",
  grossWeight: "Gross Weight",
  weightUnit: "Weight Unit",
  division: "Division",
  plant: "Plant",
  plantName: "Plant Name",
  industry: "Industry",
  fullName: "Full Name",
  businessPartnerName: "BP Name",
  city: "City",
  country: "Country",
  isBlocked: "Blocked",
  isCancelled: "Cancelled",
  invoiceReference: "Invoice Reference",
  salesDocument: "Reference Sales Order",
  requestedDeliveryDate: "Req. Delivery Date",
  accountingDocumentType: "Document Type",
  clearingAccountingDocument: "Clearing Document",
};

const HIGHLIGHT_KEYS = new Set([
  "totalNetAmount", "totalAmount", "currency", "postingDate", "clearingDate",
  "billingDocumentDate", "creationDate", "actualGoodsMovementDate", "accountingDocument",
  "companyCode", "fiscalYear"
]);

function getDisplayName(key: string): string {
  return DISPLAY_NAMES[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}

function formatValue(key: string, val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  const s = String(val);
  // Amounts
  if (key.toLowerCase().includes("amount") && !isNaN(parseFloat(s))) {
    return parseFloat(s).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (s === "X" || s === "true") return "Yes";
  if (s === "false" || s === "") return "No";
  return s;
}

const ENTITY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  SalesOrder: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  DeliveryHeader: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
  BillingDocument: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  JournalEntry: { bg: "bg-teal-50", text: "text-teal-700", dot: "bg-teal-500" },
  Payment: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
  Customer: { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500" },
  Product: { bg: "bg-pink-50", text: "text-pink-700", dot: "bg-pink-500" },
  Plant: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  Address: { bg: "bg-zinc-50", text: "text-zinc-700", dot: "bg-zinc-400" },
};

export function NodeDetail() {
  const { selectedNodeId, selectedNodeData, setSelectedNode } = useGraphStore();
  const [activeTab, setActiveTab] = useState<'properties' | 'relations'>('properties');

  if (!selectedNodeId || !selectedNodeData) return null;

  const entityType: string = selectedNodeData.type ?? selectedNodeData.entityType ?? "Unknown";
  const colors = ENTITY_COLORS[entityType] ?? ENTITY_COLORS.SalesOrder;
  const properties: Record<string, unknown> = selectedNodeData.properties ?? selectedNodeData.metadata ?? {};
  const propEntries = Object.entries(properties).filter(([, v]) => v !== null && v !== undefined && v !== "");
  const highlightedProps = propEntries.filter(([k]) => HIGHLIGHT_KEYS.has(k));
  const regularProps = propEntries.filter(([k]) => !HIGHLIGHT_KEYS.has(k));

  return (
    <div className={cn(
      "absolute right-4 top-16 bottom-4 w-80 bg-white shadow-[0_4px_40px_rgba(0,0,0,0.12)] rounded-2xl border border-zinc-100 overflow-hidden flex flex-col z-20",
      "animate-in slide-in-from-right-4 fade-in duration-200 ease-out"
    )}>
      {/* Header */}
      <div className={cn("flex items-start justify-between p-4 border-b border-zinc-100", colors.bg)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className={cn("w-2 h-2 rounded-full shrink-0", colors.dot)} />
            <span className={cn("text-xs font-semibold uppercase tracking-wider", colors.text)}>
              {entityType}
            </span>
          </div>
          <h3 className="text-sm font-bold text-zinc-900 truncate">{selectedNodeId}</h3>
          <p className="text-xs text-zinc-500 mt-0.5 truncate">{selectedNodeData.subtitle ?? selectedNodeData.label ?? ""}</p>
        </div>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          <button
            onClick={() => setSelectedNode(null)}
            className="p-1.5 hover:bg-white/70 text-zinc-400 hover:text-zinc-700 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex border-b border-zinc-100 shrink-0 bg-white">
        <button
          onClick={() => setActiveTab('properties')}
          className={cn(
            "flex-1 text-xs font-medium py-2.5 transition-colors",
            activeTab === 'properties'
              ? "border-b-2 border-zinc-900 text-zinc-900"
              : "border-b-2 border-transparent text-zinc-400 hover:text-zinc-600"
          )}
        >
          Properties
        </button>
        <button
          onClick={() => setActiveTab('relations')}
          className={cn(
            "flex-1 text-xs font-medium py-2.5 transition-colors",
            activeTab === 'relations'
              ? "border-b-2 border-zinc-900 text-zinc-900"
              : "border-b-2 border-transparent text-zinc-400 hover:text-zinc-600"
          )}
        >
          Details
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'properties' ? (
          <div className="p-4 space-y-4">
            {/* Highlighted key fields */}
            {highlightedProps.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {highlightedProps.map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-zinc-50 border border-zinc-100 p-2.5">
                    <div className="text-[9px] uppercase font-bold text-zinc-400 tracking-widest mb-1">
                      {getDisplayName(k)}
                    </div>
                    <div className="text-sm font-bold text-zinc-800 truncate">
                      {formatValue(k, v)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {regularProps.length > 0 && (
              <div className="space-y-2.5">
                {regularProps.map(([k, v]) => (
                  <div key={k} className="flex justify-between items-start gap-2 py-1.5 border-b border-zinc-50">
                    <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider shrink-0">
                      {getDisplayName(k)}
                    </span>
                    <span className="text-xs font-semibold text-zinc-700 text-right break-words max-w-[55%]">
                      {formatValue(k, v)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {propEntries.length === 0 && (
              <div className="text-xs text-zinc-400 text-center py-8">
                No properties available for this node.
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-700 border-b border-zinc-100 pb-3">
              <Info className="w-3.5 h-3.5 text-blue-500" />
              Node Information
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs py-2 bg-zinc-50 rounded-lg px-3">
                <span className="text-zinc-500 flex items-center gap-1.5">
                  <Hash className="w-3 h-3" /> Node ID
                </span>
                <span className="text-zinc-800 font-mono font-medium text-[10px] max-w-[55%] text-right break-all">{selectedNodeId}</span>
              </div>

              <div className="flex justify-between items-center text-xs py-2 bg-zinc-50 rounded-lg px-3">
                <span className="text-zinc-500">Entity Type</span>
                <span className={cn("font-semibold text-xs", colors.text)}>{entityType}</span>
              </div>

              {selectedNodeData.businessKey && selectedNodeData.businessKey !== selectedNodeId && (
                <div className="flex justify-between items-center text-xs py-2 bg-zinc-50 rounded-lg px-3">
                  <span className="text-zinc-500">Business Key</span>
                  <span className="text-zinc-800 font-medium">{selectedNodeData.businessKey}</span>
                </div>
              )}
            </div>

            <div className="text-[10px] text-zinc-400 mt-2 leading-relaxed">
              Click any highlighted node on the graph to inspect it, or use the Chat panel to trace connections.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

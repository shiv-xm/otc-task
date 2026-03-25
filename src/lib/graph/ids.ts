
export const nodeId = {
  salesOrder: (key: string) => `SO-${key}`,
  delivery: (key: string) => `DL-${key}`,
  billing: (key: string) => `BD-${key}`,
  journalEntry: (cc: string, fy: string, doc: string) => `JE-${cc}-${fy}-${doc}`,
  journal: (cc: string, fy: string, doc: string) => `JE-${cc}-${fy}-${doc}`,
  payment: (cc: string, fy: string, doc: string) => `PAY-${cc}-${fy}-${doc}`,
  customer: (key: string) => `CUST-${key}`,
  product: (key: string) => `PROD-${key}`,
  plant: (key: string) => `PLT-${key}`,
  address: (bp: string, addr: string) => `ADDR-${bp}-${addr}`,
};


export function buildEdgeId(
  relationType: string,
  fromNodeId: string,
  toNodeId: string
): string {
  return `EDGE-${relationType}-${fromNodeId}->${toNodeId}`;
}

export function entityTypeFromNodeId(id: string): string {
  if (id.startsWith("SO-")) return "SalesOrder";
  if (id.startsWith("DL-")) return "DeliveryHeader";
  if (id.startsWith("BD-")) return "BillingDocument";
  if (id.startsWith("JE-")) return "JournalEntry";
  if (id.startsWith("PAY-")) return "Payment";
  if (id.startsWith("CUST-")) return "Customer";
  if (id.startsWith("PROD-")) return "Product";
  if (id.startsWith("PLT-")) return "Plant";
  if (id.startsWith("ADDR-")) return "Address";
  return "Unknown";
}

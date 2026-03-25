// ============================================================
// src/app/api/trace/route.ts
// POST /api/trace
// Body: { entryType: "SalesOrder"|"Delivery"|"Billing"|"Journal"|"Customer", key: string }
// Returns a full TraceResult from the trace engine.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import {
  traceBySalesOrder,
  traceByDelivery,
  traceByBillingDocument,
  traceByJournalEntry,
  traceByCustomer,
} from "@/lib/trace/trace-engine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const entryType: string = body?.entryType ?? "SalesOrder";
    const key: string = body?.key ?? "";

    if (!key) {
      return NextResponse.json({ error: "Missing key" }, { status: 400 });
    }

    switch (entryType) {
      case "SalesOrder":
        return NextResponse.json(await traceBySalesOrder(key));
      case "Delivery":
      case "DeliveryHeader":
        return NextResponse.json(await traceByDelivery(key));
      case "Billing":
      case "BillingDocument":
        return NextResponse.json(await traceByBillingDocument(key));
      case "Journal":
      case "JournalEntry":
        return NextResponse.json(await traceByJournalEntry(key));
      case "Customer":
        return NextResponse.json(await traceByCustomer(key));
      default:
        return NextResponse.json({ error: `Unknown entryType: ${entryType}` }, { status: 400 });
    }
  } catch (err) {
    console.error("[POST /api/trace]", err);
    return NextResponse.json({ error: "Trace failed" }, { status: 500 });
  }
}

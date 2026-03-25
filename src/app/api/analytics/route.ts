
import { NextRequest, NextResponse } from "next/server";
import {
  runBrokenFlowReport,
  findOrdersWithNoDelivery,
  findDeliveriesWithNoBilling,
  findBillingsWithNoDelivery,
  findJournalsWithoutBilling,
  findCancelledBillings,
  findCustomersWithMissingDownstream,
} from "@/lib/analytics/broken-flows";
import {
  topProductsByBillingCount,
  topCustomersByBilledVolume,
  topPlantsByDeliveryItems,
  topProductsByDeliveredQuantity,
  topSalesOrdersByNetAmount,
} from "@/lib/analytics/top-queries";

async function runAnalytics(type: string, topN: number) {
  switch (type) {
    case "broken-flows":
      return { results: await runBrokenFlowReport() };
    case "orders-no-delivery":
      return await findOrdersWithNoDelivery(topN);
    case "deliveries-no-billing":
      return await findDeliveriesWithNoBilling(topN);
    case "billings-no-delivery":
      return await findBillingsWithNoDelivery(topN);
    case "journals-no-billing":
      return await findJournalsWithoutBilling(topN);
    case "cancelled-billings":
      return await findCancelledBillings(topN);
    case "customers-missing-downstream":
      return await findCustomersWithMissingDownstream(topN);
    case "top-products":
      return await topProductsByBillingCount(topN);
    case "top-customers":
      return await topCustomersByBilledVolume(topN);
    case "top-plants":
      return await topPlantsByDeliveryItems(topN);
    case "top-delivered-products":
      return await topProductsByDeliveredQuantity(topN);
    case "top-orders":
      return await topSalesOrdersByNetAmount(topN);
    default:
      return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const type = searchParams.get("type") ?? "broken-flows";
    const topN = Math.min(parseInt(searchParams.get("topN") ?? "10", 10), 50);

    const result = await runAnalytics(type, topN);
    if (!result) {
      return NextResponse.json({ error: `Unknown analytics type: ${type}` }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET /api/analytics]", err);
    return NextResponse.json({ error: "Analytics query failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const type: string = body?.type ?? "broken-flows";
    const topN = Math.min(parseInt(body?.topN ?? 10, 10), 50);

    const result = await runAnalytics(type, topN);
    if (!result) {
      return NextResponse.json({ error: `Unknown analytics type: ${type}` }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/analytics]", err);
    return NextResponse.json({ error: "Analytics query failed" }, { status: 500 });
  }
}

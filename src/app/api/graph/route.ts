// ============================================================
// src/app/api/graph/route.ts
// GET /api/graph — returns graph overview or filtered subgraph
//
// Query params:
//   ?entityTypes=SalesOrder,Customer  (comma-separated filter)
//   ?limit=300                        (max nodes)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getGraphOverview } from "@/lib/graph/graph-service";
import type { EntityType } from "@/types/graph";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const typesParam = searchParams.get("entityTypes");
    const limit = parseInt(searchParams.get("limit") ?? "300", 10);

    const entityTypes = typesParam
      ? (typesParam.split(",").map((t) => t.trim()) as EntityType[])
      : undefined;

    const graph = await getGraphOverview({ entityTypes, limit });
    return NextResponse.json(graph);
  } catch (err) {
    console.error("[GET /api/graph]", err);
    return NextResponse.json({ error: "Failed to load graph" }, { status: 500 });
  }
}

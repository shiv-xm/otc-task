// ============================================================
// src/app/api/graph/expand/route.ts
// POST /api/graph/expand
// Body: { nodeId: string, depth?: number, limit?: number }
// Expands a subgraph from the given node.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getNeighborhood, findNodeByBusinessKey } from "@/lib/graph/graph-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawId: string = body?.nodeId ?? body?.businessKey ?? "";
    if (!rawId) {
      return NextResponse.json({ error: "Missing nodeId" }, { status: 400 });
    }

    const depth = Math.min(parseInt(body?.depth ?? 1, 10), 3);
    const limit = Math.min(parseInt(body?.limit ?? 60, 10), 150);

    let result = await getNeighborhood(rawId, depth, limit);

    if (!result) {
      const node = await findNodeByBusinessKey(rawId);
      if (node) result = await getNeighborhood(node.id, depth, limit);
    }

    if (!result) {
      return NextResponse.json({ error: `Node "${rawId}" not found` }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/graph/expand]", err);
    return NextResponse.json({ error: "Expand failed" }, { status: 500 });
  }
}

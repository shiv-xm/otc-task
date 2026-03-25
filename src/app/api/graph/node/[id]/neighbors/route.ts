// ============================================================
// src/app/api/graph/node/[id]/neighbors/route.ts
// GET /api/graph/node/:id/neighbors?depth=1&limit=50
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getNeighborhood, findNodeByBusinessKey } from "@/lib/graph/graph-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const decodedId = decodeURIComponent(id);
    const { searchParams } = req.nextUrl;
    const depth = Math.min(parseInt(searchParams.get("depth") ?? "1", 10), 3);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 150);

    let result = await getNeighborhood(decodedId, depth, limit);

    if (!result) {
      // Try business key lookup
      const node = await findNodeByBusinessKey(decodedId);
      if (node) {
        result = await getNeighborhood(node.id, depth, limit);
      }
    }

    if (!result) {
      return NextResponse.json(
        { error: `Node "${decodedId}" not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET /api/graph/node/:id/neighbors]", err);
    return NextResponse.json({ error: "Failed to fetch neighbors" }, { status: 500 });
  }
}

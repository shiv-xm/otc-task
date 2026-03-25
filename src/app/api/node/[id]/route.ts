// ============================================================
// src/app/api/node/[id]/route.ts
// GET /api/node/<nodeId>
// Returns the metadata card for a single node (inspection panel).
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getMetadataCard, getNeighborhood } from "@/lib/graph/graph-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const nodeId = decodeURIComponent(id);

    const [card, neighborhood] = await Promise.all([
      getMetadataCard(nodeId),
      getNeighborhood(nodeId, 1, 30),
    ]);

    if (!card) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    return NextResponse.json({ card, neighborhood });
  } catch (err) {
    console.error("[GET /api/node/:id]", err);
    return NextResponse.json({ error: "Node fetch failed" }, { status: 500 });
  }
}

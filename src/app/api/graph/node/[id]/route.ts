// ============================================================
// src/app/api/graph/node/[id]/route.ts
// GET /api/graph/node/:id  — fetch single node with metadata card
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getMetadataCard, findNodeByBusinessKey } from "@/lib/graph/graph-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const decodedId = decodeURIComponent(id);

    // Try by node ID first
    let card = await getMetadataCard(decodedId);

    // Fall back to business key lookup
    if (!card) {
      const node = await findNodeByBusinessKey(decodedId);
      if (node) {
        card = await getMetadataCard(node.id);
      }
    }

    if (!card) {
      return NextResponse.json(
        { error: `Node "${decodedId}" not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(card);
  } catch (err) {
    console.error("[GET /api/graph/node/:id]", err);
    return NextResponse.json({ error: "Failed to fetch node" }, { status: 500 });
  }
}

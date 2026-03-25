// ============================================================
// src/app/api/graph/trace/route.ts
// GET /api/graph/trace?id=<docId>
// Returns the full O2C chain for a given document.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { traceDocumentFlow } from "@/lib/graph/graph-service";

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing ?id= parameter" }, { status: 400 });
    }

    const graph = await traceDocumentFlow(id);
    return NextResponse.json(graph);
  } catch (err) {
    console.error("[GET /api/graph/trace]", err);
    return NextResponse.json({ error: "Trace failed" }, { status: 500 });
  }
}

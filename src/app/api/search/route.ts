// ============================================================
// src/app/api/search/route.ts
// GET /api/search?q=<term>&limit=20
// Search entities by business key, label, or alias.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { searchEntities } from "@/lib/graph/graph-service";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const q = searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);

    if (!q || q.length < 2) {
      return NextResponse.json(
        { error: "Query must be at least 2 characters" },
        { status: 400 }
      );
    }

    const results = await searchEntities(q, limit);

    return NextResponse.json({
      query: q,
      count: results.length,
      results,
    });
  } catch (err) {
    console.error("[GET /api/search]", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}

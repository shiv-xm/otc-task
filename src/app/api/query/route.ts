// ============================================================
// src/app/api/query/route.ts
// POST /api/query
// Body: { question: string }
// Returns: QueryResponse (structured answer + graph highlights)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { runQuery } from "@/lib/query/query-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question = typeof body?.question === "string" ? body.question.trim() : "";

    if (!question) {
      return NextResponse.json(
        { error: "Missing required field: question" },
        { status: 400 }
      );
    }

    const result = await runQuery(question);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/query]", err);
    return NextResponse.json({ error: "Query execution failed" }, { status: 500 });
  }
}

// ── GET /api/query — returns recent query logs ────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const logs = await prisma.queryLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json(logs);
  } catch (err) {
    console.error("[GET /api/query]", err);
    return NextResponse.json({ error: "Failed to load query logs" }, { status: 500 });
  }
}

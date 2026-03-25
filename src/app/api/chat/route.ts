import { NextRequest, NextResponse } from "next/server";
import { runQuery } from "@/lib/query/query-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question = typeof body?.question === "string" ? body.question.trim() : "";

    if (!question) {
      return NextResponse.json({ error: "Missing required field: question" }, { status: 400 });
    }

    const result = await runQuery(question);

    return NextResponse.json({
      message: result.answerText,
      highlight: {
        nodes: result.highlightNodeIds ?? [],
        edges: [],
      },
      planKind: result.planKind,
      evidenceRows: result.evidenceRows ?? [],
      relatedEntities: result.relatedEntities ?? [],
      followUpSuggestions: result.followUpSuggestions ?? [],
      metrics: {},
    });
  } catch (err) {
    console.error("[POST /api/chat]", err);
    return NextResponse.json({ error: "Query execution failed" }, { status: 500 });
  }
}

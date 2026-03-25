import { NextRequest, NextResponse } from "next/server";
import { getGraphOverview } from "@/lib/graph/graph-service";
import type { EntityType } from "@/types/graph";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const typesParam = searchParams.get("entityTypes");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "200", 10), 500);

    const entityTypes = typesParam
      ? (typesParam.split(",").map((t) => t.trim()) as EntityType[])
      : undefined;

    const graph = await getGraphOverview({ entityTypes, limit });

    return NextResponse.json({
      ...graph,
      meta: {
        returned: graph.nodes.length,
        totalInDb: graph.totalNodes,
        totalEdges: graph.totalEdges,
        note:
          graph.nodes.length < graph.totalNodes
            ? `Showing ${graph.nodes.length} of ${graph.totalNodes} nodes. Use search or trace for specific entities.`
            : "Full graph returned.",
      },
    });
  } catch (err) {
    console.error("[GET /api/graph/overview]", err);
    return NextResponse.json({ error: "Failed to load graph overview" }, { status: 500 });
  }
}

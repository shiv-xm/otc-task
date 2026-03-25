// ============================================================
// src/app/api/guardrail/test/route.ts
// GET /api/guardrail/test
// Runs all guardrail test cases and returns results.
// ============================================================

import { NextResponse } from "next/server";
import { runGuardrail, GUARDRAIL_TEST_CASES } from "@/lib/guardrails/guardrail";

export async function GET() {
  const results = GUARDRAIL_TEST_CASES.map((tc) => {
    const verdict = runGuardrail(tc.input);
    const passed = verdict.ok === tc.expectedOk;
    return {
      label: tc.label,
      input: tc.input,
      expectedOk: tc.expectedOk,
      actualOk: verdict.ok,
      passed,
      verdict: verdict.ok ? "ALLOWED" : `REJECTED (${(verdict as { code: string }).code})`,
      message: verdict.ok ? null : (verdict as { message: string }).message,
    };
  });

  const allPassed = results.every((r) => r.passed);

  return NextResponse.json({
    summary: `${results.filter((r) => r.passed).length}/${results.length} test cases passed`,
    allPassed,
    results,
  });
}

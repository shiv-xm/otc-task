import { PrismaClient } from "@prisma/client";
import { classifyQuery, synthesizeAnswer } from "@/lib/llm/gemini-client";
import { buildQueryPlan } from "./planner";
import { executePlan } from "./executor";
import type { QueryResponse } from "@/types/query";
import { runFallbackIntent } from "./fallback-intent";

const prisma = new PrismaClient();

export async function runQuery(question: string): Promise<QueryResponse> {
  const start = Date.now();

  const guardrailResult = domainGuardrailCheck(question);
  if (guardrailResult.rejected) {
    const duration = Date.now() - start;
    await logQuery({
      question,
      intent: null,
      answer: guardrailResult.message,
      rowCount: 0,
      durationMs: duration,
      wasRejected: true,
      rejectionReason: guardrailResult.message,
    });
    return {
      question,
      planKind: "OUT_OF_SCOPE",
      answerText: guardrailResult.message,
      evidenceRows: [],
      relatedEntities: [],
      highlightNodeIds: [],
      followUpSuggestions: [
        { text: "Trace an O2C flow", queryHint: "trace flow for sales order" },
        { text: "Find top products", queryHint: "top 10 products by billing count" },
        { text: "Find broken flows", queryHint: "find broken sales flows" },
      ],
      wasRejected: true,
      rejectionReason: guardrailResult.message,
      durationMs: duration,
    };
  }

  let classification = await classifyQuery(question);

  if (
    classification.planKind === "OUT_OF_SCOPE" ||
    classification.confidence === "low" ||
    classification.confidence === "medium"
  ) {
    const fallback = await runFallbackIntent(question);
    if (fallback) {
      classification = fallback;
    }
  }

  if (classification.planKind === "OUT_OF_SCOPE") {
    const rejection =
      classification.outOfScopeReason ??
      "This system is designed to answer questions related to the provided Order-to-Cash dataset only. I can help with sales orders, deliveries, billing documents, journal entries, payments, customers, and products.";
    const duration = Date.now() - start;
    await logQuery({
      question,
      intent: JSON.stringify(classification),
      answer: rejection,
      rowCount: 0,
      durationMs: duration,
      wasRejected: true,
      rejectionReason: rejection,
    });
    return {
      question,
      planKind: "OUT_OF_SCOPE",
      answerText: rejection,
      evidenceRows: [],
      relatedEntities: [],
      highlightNodeIds: [],
      followUpSuggestions: [
        { text: "Trace a billing document", queryHint: "Trace billing document 91150187" },
        { text: "Top products by billing", queryHint: "Top products by billing count" },
        { text: "Find broken flows", queryHint: "Find broken flows" },
      ],
      wasRejected: true,
      rejectionReason: rejection,
      durationMs: duration,
    };
  }

  const plan = await buildQueryPlan(classification, question);
  const execResult = await executePlan(plan);
  let finalAnswerText = execResult.answerText;
  if (
    execResult.evidenceRows.length > 0 &&
    plan.kind !== "OUT_OF_SCOPE" &&
    process.env.GEMINI_API_KEY
  ) {
    finalAnswerText = await synthesizeAnswer({
      question,
      planKind: plan.kind,
      answerText: execResult.answerText,
      evidenceRows: execResult.evidenceRows,
    });
  }

  const duration = Date.now() - start;
  await logQuery({
    question,
    intent: JSON.stringify(classification),
    answer: finalAnswerText,
    rowCount: execResult.evidenceRows.length,
    durationMs: duration,
    wasRejected: false,
    rejectionReason: null,
  });

  return {
    question,
    planKind: plan.kind,
    answerText: finalAnswerText,
    evidenceRows: execResult.evidenceRows,
    relatedEntities: execResult.relatedEntities,
    highlightNodeIds: execResult.highlightNodeIds,
    followUpSuggestions: execResult.followUpSuggestions,
    wasRejected: false,
    durationMs: duration,
  };
}

interface GuardrailResult {
  rejected: boolean;
  message: string;
}

const REJECTION_MESSAGE =
  "This system is designed to answer questions related to the provided Order-to-Cash dataset only. " +
  "Please ask about sales orders, deliveries, billing documents, payments, customers, or products.";

const BANNED_PATTERNS = [
  /what is the capital of/i,
  /tell me a (joke|story|poem)/i,
  /help me (write|code|program|debug)/i,
  /what is \d+\s*[\+\-\*\/]\s*\d+/i,
  /translate (this|the following) to/i,
  /\bChatGPT\b|\bGPT-4\b|\bClaude\b/i,
  /\bfortnite\b|\bminecraft\b/i,
  /what (should|do) I (eat|wear|do|watch)/i,
];

function domainGuardrailCheck(question: string): GuardrailResult {
  if (question.trim().length < 3) {
    return { rejected: true, message: "Please enter a valid question." };
  }
  if (question.length > 2000) {
    return { rejected: true, message: "Question too long. Please be concise." };
  }
  if (BANNED_PATTERNS.some((p) => p.test(question))) {
    return { rejected: true, message: REJECTION_MESSAGE };
  }
  return { rejected: false, message: "" };
}

// ── Query logging ─────────────────────────────────────────────

async function logQuery(opts: {
  question: string;
  intent: string | null;
  answer: string;
  rowCount: number;
  durationMs: number;
  wasRejected: boolean;
  rejectionReason: string | null;
}) {
  try {
    await prisma.queryLog.create({
      data: {
        question: opts.question,
        intent: opts.intent,
        answer: opts.answer,
        rowCount: opts.rowCount,
        durationMs: opts.durationMs,
        wasRejected: opts.wasRejected,
        rejectionReason: opts.rejectionReason,
      },
    });
  } catch (e) {
    console.error("[QueryService] Failed to log query:", e);
  }
}

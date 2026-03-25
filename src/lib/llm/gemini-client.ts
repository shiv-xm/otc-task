// ============================================================
// src/lib/llm/gemini-client.ts
// Safe Gemini LLM client wrapper.
//
// IMPORTANT CONSTRAINTS:
//   - LLM is NOT the source of truth.
//   - It is only used for:
//       1. Classifying user language into an allowed query plan
//       2. Phrasing structured results into natural language
//   - LLM must not invent facts, SQL joins, or unsupported answers.
//   - All domain restrictions are enforced by strict system prompts.
// ============================================================

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ClassificationResult } from "@/types/query";

// ── Client init ───────────────────────────────────────────────

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to your .env.local file. " +
      "Get a free key at https://aistudio.google.com/app/apikey"
    );
  }
  return new GoogleGenerativeAI(apiKey);
}

// ── System prompt for classification ─────────────────────────

const CLASSIFICATION_SYSTEM_PROMPT = `
You are a query classifier for an Order-to-Cash (O2C) business data system.
Your ONLY job is to analyze the user's question and output a JSON classification
that maps it to one of the allowed query plan kinds.

ALLOWED QUERY PLAN KINDS:
- TRACE_DOCUMENT_FLOW: User wants to trace the O2C chain for a specific document (sales order, billing doc, delivery, journal entry, payment)
- FIND_JOURNAL_FOR_BILLING: User asks for the journal entry or accounting document linked to a billing document
- FIND_PAYMENT_FOR_BILLING: User asks for the payment or clearing document for a billing document
- TOP_PRODUCTS_BY_BILLING_COUNT: User wants top N products by billing activity
- TOP_CUSTOMERS_BY_BILLED_VOLUME: User wants top N customers by billed amount or volume
- FIND_BROKEN_SALES_FLOWS: User wants to find incomplete or broken O2C flows (any kind)
- FIND_DELIVERED_NOT_BILLED: User asks for deliveries or orders that were shipped but not billed
- FIND_BILLED_WITHOUT_DELIVERY: User asks for billing documents that have no delivery linkage
- BILLING_CANCELLATION_LOOKUP: User asks about cancelled or reversed billing documents
- LOOKUP_ENTITY: User wants details about one specific entity (customer, product, order, etc.)
- NEIGHBORHOOD_EXPANSION: User wants to see all connected entities around a node
- CUSTOMER_ORDER_SUMMARY: User wants a summary of a customer's orders, billings, and payments
- COUNT_AGGREGATION: User wants a count or total of entities
- RELATIONSHIP_LOOKUP: User wants to see relationships from one entity
- OUT_OF_SCOPE: Question is not about the O2C dataset

DOMAIN RESTRICTION:
This system ONLY answers questions about the Order-to-Cash dataset which includes:
SalesOrders, OutboundDeliveries, BillingDocuments, BillingCancellations, JournalEntries (AR),
Payments (AR), BusinessPartners/Customers, Products, Plants, and Addresses.

OUT OF SCOPE examples (must return OUT_OF_SCOPE):
- General knowledge, coding, creative writing, advice, weather, news
- Any data not in the O2C dataset categories above

EXAMPLES:
- "Find the journal entry for billing 91150187" → FIND_JOURNAL_FOR_BILLING, documentId: "91150187"
- "91150187 - what journal entry is linked?" → FIND_JOURNAL_FOR_BILLING, documentId: "91150187"
- "Show payment for billing document 91150187" → FIND_PAYMENT_FOR_BILLING, documentId: "91150187"
- "Trace billing document 91150187" → TRACE_DOCUMENT_FLOW, documentId: "91150187", documentType: "BillingDocument"
- "Which products have the most billing documents?" → TOP_PRODUCTS_BY_BILLING_COUNT
- "Top customers by billed volume" → TOP_CUSTOMERS_BY_BILLED_VOLUME
- "Delivered but not billed" → FIND_DELIVERED_NOT_BILLED
- "Find broken flows" → FIND_BROKEN_SALES_FLOWS
- "What is the weather?" → OUT_OF_SCOPE

OUTPUT FORMAT (strict JSON, no markdown, no explanation):
{
  "planKind": "<one of the allowed kinds>",
  "documentId": "<if applicable, e.g. 91150187>",
  "documentType": "<SalesOrder|BillingDocument|DeliveryHeader|JournalEntry|Payment if applicable>",
  "customerId": "<customer ID if mentioned>",
  "businessKey": "<the primary key identifier if mentioned>",
  "entityType": "<entity type if mentioned>",
  "nodeId": "<graph node id if user provides one>",
  "topN": <number if applicable, default 10>,
  "depth": <BFS depth if applicable, default 2>,
  "filter": "<no_delivery|no_billing|no_payment|all if applicable>",
  "confidence": "<high|medium|low>",
  "outOfScopeReason": "<brief reason if OUT_OF_SCOPE>"
}

Only output valid JSON. No other text.
`.trim();

// ── System prompt for answer synthesis ───────────────────────

const SYNTHESIS_SYSTEM_PROMPT = `
You are an answer writer for an Order-to-Cash (O2C) business data system.
You will be given structured data results from database queries.
Your job is to write a clear, concise, professional summary of the results.

RULES:
1. Only describe what is in the structured data provided. Do not invent facts.
2. Do not add information not present in the evidence rows.
3. Use business language appropriate for a SAP O2C analyst.
4. Keep the answer under 4 sentences.
5. If the data shows an issue (e.g. broken flow, missing payment), mention it explicitly.
6. Do not explain your reasoning — just provide the answer.
`.trim();

// ── Classification ────────────────────────────────────────────

export async function classifyQuery(
  question: string
): Promise<ClassificationResult> {
  // Fast-path: obvious out-of-scope triggers
  if (isObviouslyOutOfScope(question)) {
    return {
      planKind: "OUT_OF_SCOPE",
      confidence: "high",
      outOfScopeReason: "Question is not related to the Order-to-Cash dataset.",
    };
  }

  try {
    const client = getClient();
    const model = client.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: CLASSIFICATION_SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.0,
        maxOutputTokens: 512,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent(question);
    const text = result.response.text().trim();
    const parsed = parseClassificationJson(text);
    return parsed;
  } catch (err) {
    console.error("[LLM] Classification failed:", err);
    return {
      planKind: "OUT_OF_SCOPE",
      confidence: "low",
      outOfScopeReason: undefined,
    };
  }
}

// ── Answer synthesis ──────────────────────────────────────────

export async function synthesizeAnswer(opts: {
  question: string;
  planKind: string;
  answerText: string;
  evidenceRows: Array<{ label: string; value: string | number | null }>;
}): Promise<string> {
  try {
    const client = getClient();
    const model = client.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: SYNTHESIS_SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 256,
      },
    });

    const prompt = `
User question: ${opts.question}

Query type: ${opts.planKind}

Structured answer: ${opts.answerText}

Evidence:
${opts.evidenceRows
  .slice(0, 20)
  .map((r) => `- ${r.label}: ${r.value ?? "—"}`)
  .join("\n")}

Write a professional 1-3 sentence summary of these results.
`.trim();

    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    console.error("[LLM] Synthesis failed:", err);
    // Fall back to the pre-built structured answer
    return opts.answerText;
  }
}

// ── Helpers ───────────────────────────────────────────────────

const OUT_OF_SCOPE_PATTERNS = [
  /\bweather\b/i,
  /\brecipe\b/i,
  /\bcooking\b/i,
  /\bwrite (a |an )?(poem|story|email|essay|letter|joke)/i,
  /\bhow to code\b/i,
  /\bjavascript\b.*\btutorial\b/i,
  /\bpython\b.*\blearn\b/i,
  /\bwho (is|was) (the )?(president|prime minister|ceo)\b/i,
  /\bstock price\b/i,
  /\bcrypto\b/i,
  /\bgive me (a|an) (joke|riddle|quote)\b/i,
  /\badvise me on\b/i,
  /\blegal advice\b/i,
  /\bmedical advice\b/i,
  /\byour opinion\b/i,
  /\bwhat is the meaning of life\b/i,
];

function isObviouslyOutOfScope(question: string): boolean {
  return OUT_OF_SCOPE_PATTERNS.some((p) => p.test(question));
}

function parseClassificationJson(text: string): ClassificationResult {
  try {
    // Strip markdown fences if present
    const cleaned = text
      .replace(/^```json\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();
    const obj = JSON.parse(cleaned);
    return {
      planKind: obj.planKind ?? "OUT_OF_SCOPE",
      documentId: obj.documentId ?? undefined,
      documentType: obj.documentType ?? undefined,
      customerId: obj.customerId ?? undefined,
      businessKey: obj.businessKey ?? undefined,
      entityType: obj.entityType ?? undefined,
      nodeId: obj.nodeId ?? undefined,
      topN: typeof obj.topN === "number" ? obj.topN : 10,
      depth: typeof obj.depth === "number" ? obj.depth : 2,
      filter: obj.filter ?? undefined,
      confidence: obj.confidence ?? "medium",
      outOfScopeReason: obj.outOfScopeReason ?? undefined,
    };
  } catch {
    return {
      planKind: "OUT_OF_SCOPE",
      confidence: "low",
      outOfScopeReason: undefined,
    };
  }
}

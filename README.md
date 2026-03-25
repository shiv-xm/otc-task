# O2C Graph Agent

A production-grade, agentic Order-to-Cash (O2C) analytics system built with Next.js, Prisma, and Gemini LLM. This tool allows business analysts to explore complex SAP-style relational data through an interactive graph interface and a grounded natural language chat agent.

---

## Architecture Decisions

The system is built on a **Deterministic Query Pipeline** architecture. Unlike naive LLM agents that generate SQL directly (prone to hallucinations and fragile joins), this system follows a structured execution flow:

1.  **Unified API Entry**: All chat queries are routed through a single `/api/query` endpoint, ensuring consistent handling.
2.  **Intent Classification**: The LLM is used as a "Router" to classify user intent into one of 14 pre-defined `QueryPlanKind` types.
3.  **Entity Resolution via Probe**: A deterministic planner probes the 8 primary business tables to resolve business keys (e.g., "91150187") to specific entity types (e.g., `BillingDocument`) before building the plan.
4.  **Relational SQL Execution**: Data retrieval is performed by dedicated Prisma-based executors. This ensures 100% accuracy in O2C document tracing and analytical counts.
5.  **Graph-State Synchronization**: Chat responses return `highlightNodeIds` which the frontend uses to automatically zoom, filter, and style nodes (Red for broken flows, Blue for traces).

---

##  Database Choice: SQLite + Prisma

-   **Relational Integrity**: O2C data is inherently hierarchical (Sales Order → Delivery → Billing → Journal → Payment). SQLite provides the relational rigor needed for these many-to-many and one-to-one links.
-   **Performance**: Local SQLite file storage allows for ultra-low latency lookups and sub-millisecond trace executions.
-   **Developer Experience**: Prisma provides type-safe access to the 19 core dataset tables, allowing for robust query construction without raw SQL strings.

---

##  LLM Prompting Strategy

The system uses a **Dual-Prompt Strategy** to ensure groundedness:

1.  **Classification Prompt**: 
    -   **Task**: Map user query to a strict JSON structure.
    -   **Constraint**: Must output a `planKind` from a whitelist.
    -   **Deterministic Fallback**: If the LLM confidence is low or the question is ambiguous, a secondary keyword-based engine (`fallback-intent.ts`) takes over to probe the database for the ID mentioned.
2.  **Synthesis Prompt**:
    -   **Task**: Transform raw database results (Evidence Rows) into natural business language.
    -   **Constraint**: Strictly forbidden from adding information not present in the provided evidence.

---

## Guardrails

To prevent the agent from being used as a general-purpose LLM, several layers of protection are implemented:

-   **Domain Guardrail**: A regex-based fast check in `query-service.ts` rejects non-business queries (e.g., "What is the capital of France?") before hitting the LLM.
-   **Schema Strictness**: The LLM is never given the full database schema or the ability to run raw SQL; it only knows about high-level "Plan Kinds".
-   **Input Sanitization**: Basic cleanup of user input to prevent prompt injection and ensure stable business key extraction.

---

## Key Features

- **Bidirectional Graph Integration**: Chat queries drive graph states (highlights, filtering, and auto-focus).
- **Grounded O2C Trace**: High-fidelity tracing of document chains (Sales Order → Delivery → Billing → Journal Entry → Payment).
- **Anomaly Detection**: Automatic detection of "Broken Flows" (e.g., delivered but not billed, billed without delivery).
- **Dual Graph View**: Process-centric workflow view (React Flow) and analytical force-directed view (react-force-graph).
- **Rich Metadata Inspection**: Side panel for deep-diving into business entities with formatted SAP fields.

---

## Getting Started

### 1. Prerequisites
- Node.js 18+
- [Gemini API Key](https://aistudio.google.com/app/apikey) (set as `GEMINI_API_KEY` in `.env`)

### 2. Installation
```bash
npm install
npx prisma db push
```

### 3. Data Ingestion
Place your SAP dataset folders (CSV format) in a directory (e.g., `sap-o2c-data`) and run:
```bash
# Ingest raw CSVs into relational tables
npm run ingest -- --reset ./sap-o2c-data

# Derive graph nodes and edges from relational data
npm run build-graph
```

### 4. Running the App
```bash
npm run dev
```

---

## Example Queries

- **Document Tracing**: `Trace billing document 91150187`
- **Financial Audit**: `Find the journal entry number linked to billing 91150187`
- **Anomaly Search**: `Find broken flows`, `Delivered but not billed`
- **Analytics**: `Top products by billing count`, `Top customers by billed volume`

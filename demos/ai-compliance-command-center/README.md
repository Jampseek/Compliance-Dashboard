# AI Compliance Command Center — Demo App

A runnable prototype of the AI-assisted financial-crime compliance pipeline from
the [project architecture](../../README.md#-ai-compliance-system-architecture).
It simulates the full flow — from the core-banking transaction feed through AI
screening, risk scoring, human oversight, SAR filing, and an immutable audit
trail — entirely in the browser, with **zero backend setup required**.

> Built for the WICxAI Innovator Program 2026 capstone (Team Jampseek),
> Deliverable 4 — *AI Agent Demo*.

## Quick start

```bash
cd demos/ai-compliance-command-center
npm install
npm run dev      # open the printed http://localhost:5173 URL
```

Build / preview the production bundle:

```bash
npm run build && npm run preview
```

## How to drive the demo

1. The **feed is live by default** — synthetic transactions stream in every ~1.5s
   (toggle with the *Feed* button, or click *+ Ingest one*).
2. **Screening Monitor** — watch transactions get scored and auto-cleared or routed.
3. **Alert Queue** — see Semantic-Kernel-prioritised alerts (P1–P5).
4. Switch to the **Case Investigator** role (top-right), open the **Analyst
   Dashboard**, pick a high-risk alert, read the GPT-4o explanation, and
   **Escalate to case**.
5. In **Case Investigation**, add notes, **Draft SAR with GPT-4o**, **Approve**
   the draft (human approval gate), then **File** it with FinCEN/FCA.
6. Switch to the **Executive / MLRO** role for KPIs, and open **Immutable Audit**
   to see the hash-chained, append-only record of every action.

The **role switcher** (top-right) simulates Azure Entra ID + RBAC — navigation is
gated by each role's permissions.

## Architecture mapping

Each node of the [Mermaid diagram](../../README.md) maps to code here:

| Diagram node | Azure service (prod) | Code in this demo |
|---|---|---|
| Core Banking → Event Hubs | Kafka / Azure Event Hubs | [`Layout.tsx`](src/components/Layout.tsx) feed loop → [`mockData.ts`](src/lib/mockData.ts) |
| AI Screening / Comply Advantage | External API | [`screening.ts`](src/lib/screening.ts) |
| GPT-4o + XGBoost Risk Model | Azure OpenAI + ML | [`riskEngine.ts`](src/lib/riskEngine.ts) |
| Risk Score Engine | Azure Functions | [`riskEngine.ts`](src/lib/riskEngine.ts) `assess()` |
| High/Low risk branch | — | [`store.ts`](src/lib/store.ts) `ingest()` |
| Alert Queue | Azure Service Bus | [`AlertQueue.tsx`](src/pages/AlertQueue.tsx) |
| Semantic Kernel Orchestrator | Semantic Kernel | [`store.ts`](src/lib/store.ts) `triage()` |
| Compliance Analyst Dashboard | React + Supabase | [`AnalystDashboard.tsx`](src/pages/AnalystDashboard.tsx) |
| Case Investigation System | — | [`CaseInvestigation.tsx`](src/pages/CaseInvestigation.tsx) |
| SAR Drafting AI + Prompt Library | Azure OpenAI | [`sarDrafter.ts`](src/lib/sarDrafter.ts), [`promptLibrary.ts`](src/lib/promptLibrary.ts) |
| Human Approval Gate | — | `approveSar()` in [`store.ts`](src/lib/store.ts) |
| FinCEN/FCA Filing API | External API | `fileSar()` in [`store.ts`](src/lib/store.ts) |
| Immutable Audit Store | Azure Blob (WORM) | [`audit.ts`](src/lib/audit.ts), [`AuditStore.tsx`](src/pages/AuditStore.tsx) |
| Executive Dashboard | Power BI + React | [`ExecutiveDashboard.tsx`](src/pages/ExecutiveDashboard.tsx) |
| Entra ID + RBAC | Azure Entra ID | [`rbac.ts`](src/lib/rbac.ts) + role switcher in `Layout.tsx` |

## Wiring up real services (optional)

The demo uses deterministic, dependency-free stubs so it always runs. To connect
real infrastructure:

- **Supabase** — apply [`supabase/schema.sql`](supabase/schema.sql) and set
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (see [`.env.example`](.env.example)).
  [`supabase.ts`](src/lib/supabase.ts) exposes a ready client when those are set.
- **Azure OpenAI** — replace the body of `assess()` in `riskEngine.ts` and
  `draftSar()` in `sarDrafter.ts` with chat-completion calls to your GPT-4o
  deployment, using the templates in `promptLibrary.ts`.

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · Zustand · Recharts ·
React Router · Supabase JS (optional). Deployable to Vercel (set the project
root to `demos/ai-compliance-command-center`).

> ⚠️ All data is synthetic. This is a demonstration of workflow and governance
> design, not a production compliance system.

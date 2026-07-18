// AI Gateway — the single routed entry point for every AI model call.
//
//   1. Decision tree: task category → model tier → model (MODEL_TIERS / TASK_ROUTING)
//   2. Provider chain: Azure (Microsoft Foundry) → direct Anthropic API → stub
//   3. Governance: per-role policy check + monthly budget-cap check BEFORE the call,
//      token/cost/latency recording into the store AFTER it.
//
// Import-cycle note: store.ts → drafters → aiGateway.ts → store.ts is safe because
// this module only calls useStore.getState() inside functions — never at module scope.

import Anthropic from '@anthropic-ai/sdk'
import AnthropicFoundry from '@anthropic-ai/foundry-sdk'
import type { AiUseCase, ModelTier, TaskCategory } from './types'
import type { Role } from './rbac'
import { withRetry } from './retry'
import { useStore } from './store'

// ── Decision tree: model tiers ────────────────────────────────────────────────

export interface TierSpec {
  tier: ModelTier
  label: string
  model: string
  inputPerMTok: number   // USD per 1M input tokens
  outputPerMTok: number  // USD per 1M output tokens
  typicalCost: string
  criteria: string
  examples: string[]
}

export const MODEL_TIERS: Record<ModelTier, TierSpec> = {
  routine: {
    tier: 'routine',
    label: 'Routine',
    model: 'claude-haiku-4-5',
    inputPerMTok: 1,
    outputPerMTok: 5,
    typicalCost: '~$0.001–0.01 / task',
    criteria: 'Is this task repetitive and standardized?',
    examples: ['Alert triage summaries', 'Report summarization', 'Data formatting'],
  },
  complex: {
    tier: 'complex',
    label: 'Complex reasoning',
    model: 'claude-sonnet-4-6',
    inputPerMTok: 3,
    outputPerMTok: 15,
    typicalCost: '~$0.02–0.10 / task',
    criteria: 'Does this task require multi-step reasoning?',
    examples: ['SAR narrative drafting', 'EDD report synthesis', 'Case analysis'],
  },
  frontier: {
    tier: 'frontier',
    label: 'Novel / frontier',
    model: 'claude-opus-4-8',
    inputPerMTok: 5,
    outputPerMTok: 25,
    typicalCost: '~$0.50–2.00 / task',
    criteria: 'Is this novel, strategic, or high-stakes?',
    examples: ['Breakthrough ideation', 'Deep research', 'Unknown unknowns'],
  },
}

// ── Decision tree: task routing ───────────────────────────────────────────────

export interface RouteSpec {
  tier: ModelTier
  useCase: AiUseCase
  label: string
  rationale: string
}

export const TASK_ROUTING: Record<TaskCategory, RouteSpec> = {
  triage_summary: {
    tier: 'routine',
    useCase: 'triage_automation',
    label: 'Alert triage summary',
    rationale: 'Repetitive, standardized — one-line priority summaries at feed volume.',
  },
  report_summary: {
    tier: 'routine',
    useCase: 'analysis_reporting',
    label: 'Report summarization',
    rationale: 'Standardized condensation of KYC/executive reports.',
  },
  sar_drafting: {
    tier: 'complex',
    useCase: 'investigative_drafting',
    label: 'SAR narrative drafting',
    rationale: 'Multi-step reasoning over case evidence; regulator-ready output.',
  },
  edd_drafting: {
    tier: 'complex',
    useCase: 'investigative_drafting',
    label: 'EDD report drafting',
    rationale: 'Synthesis across multi-source OSINT findings with risk rating.',
  },
  experimentation: {
    tier: 'frontier',
    useCase: 'experimentation',
    label: 'Frontier experimentation',
    rationale: 'Novel problems and research — highest capability justified.',
  },
}

// ── Policy: which roles may use which tiers ──────────────────────────────────

export interface PolicyEntry {
  allowedTiers: ModelTier[]
  purposes: string[]
}

export const MODEL_POLICY: Record<Role, PolicyEntry> = {
  analyst: {
    allowedTiers: ['routine', 'complex'],
    purposes: ['Alert triage summaries', 'EDD report drafting', 'Report summarization'],
  },
  investigator: {
    allowedTiers: ['routine', 'complex', 'frontier'],
    purposes: ['SAR/EDD drafting', 'Case analysis', 'Frontier experimentation'],
  },
  executive: {
    allowedTiers: ['routine'],
    purposes: ['Report summarization only — no investigative drafting'],
  },
}

// ── Budget defaults ───────────────────────────────────────────────────────────

export const DEFAULT_BUDGET_CAPS: Record<Role, number> = {
  analyst: 10_000,
  investigator: 10_000,
  executive: 3_000,
}

/** Use-case budget split (% of total monthly AI spend). Must sum to 100. */
export const DEFAULT_ALLOCATIONS: Record<AiUseCase, number> = {
  investigative_drafting: 40,
  triage_automation: 25,
  analysis_reporting: 20,
  experimentation: 15,
}

export const USE_CASE_LABEL: Record<AiUseCase, string> = {
  investigative_drafting: 'Investigative drafting (SAR/EDD)',
  triage_automation: 'Triage automation',
  analysis_reporting: 'Analysis & reporting',
  experimentation: 'Experimentation & research',
}

export function monthKey(ts?: number): string {
  return new Date(ts ?? Date.now()).toISOString().slice(0, 7)
}

// ── Provider resolution: Foundry → Anthropic → null ─────────────────────────

interface LiveClient {
  provider: 'foundry' | 'anthropic'
  create: (params: {
    model: string
    max_tokens: number
    system: string
    messages: { role: 'user'; content: string }[]
  }) => Promise<Anthropic.Message>
}

let cachedClient: LiveClient | null | undefined

function resolveClient(): LiveClient | null {
  if (cachedClient !== undefined) return cachedClient

  const foundryBase = import.meta.env.VITE_ANTHROPIC_FOUNDRY_BASE_URL
  const foundryKey = import.meta.env.VITE_ANTHROPIC_FOUNDRY_API_KEY
  if (foundryBase && foundryKey) {
    const client = new AnthropicFoundry({
      baseURL: foundryBase,
      apiKey: foundryKey,
      dangerouslyAllowBrowser: true,
    })
    cachedClient = { provider: 'foundry', create: (p) => client.messages.create(p) }
    return cachedClient
  }

  const anthropicKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (anthropicKey) {
    const client = new Anthropic({ apiKey: anthropicKey, dangerouslyAllowBrowser: true })
    cachedClient = { provider: 'anthropic', create: (p) => client.messages.create(p) }
    return cachedClient
  }

  cachedClient = null
  return null
}

// ── Routed entry point ────────────────────────────────────────────────────────

export interface GatewayRequest {
  taskCategory: TaskCategory
  role: Role | 'system'
  actor: string
  system: string
  prompt: string
  maxTokens: number
}

export type GatewayResponse =
  | {
      ok: true
      text: string
      model: string
      provider: 'foundry' | 'anthropic'
      inputTokens: number
      outputTokens: number
      costUsd: number
      latencyMs: number
    }
  | { ok: false; reason: 'no_credentials' | 'budget_cap' | 'policy' | 'api_error' }

export async function invokeModel(req: GatewayRequest): Promise<GatewayResponse> {
  const route = TASK_ROUTING[req.taskCategory]
  const spec = MODEL_TIERS[route.tier]
  const store = useStore.getState()

  // Policy gate — system actors (simulated pipeline steps) bypass role policy.
  if (req.role !== 'system' && !MODEL_POLICY[req.role].allowedTiers.includes(route.tier)) {
    store.recordAiUsage({
      timestamp: new Date().toISOString(),
      actor: req.actor,
      role: req.role,
      taskCategory: req.taskCategory,
      useCase: route.useCase,
      tier: route.tier,
      model: spec.model,
      provider: 'stub',
      simulated: false,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: 0,
      blocked: 'policy',
    })
    return { ok: false, reason: 'policy' }
  }

  // Budget gate — real spend this month vs the role's hard cap.
  if (req.role !== 'system') {
    const spent = store.aiSpend[monthKey()]?.byRole[req.role] ?? 0
    if (spent >= store.budgetCaps[req.role]) {
      store.recordAiUsage({
        timestamp: new Date().toISOString(),
        actor: req.actor,
        role: req.role,
        taskCategory: req.taskCategory,
        useCase: route.useCase,
        tier: route.tier,
        model: spec.model,
        provider: 'stub',
        simulated: false,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: 0,
        blocked: 'budget_cap',
      })
      return { ok: false, reason: 'budget_cap' }
    }
  }

  const client = resolveClient()
  if (!client) return { ok: false, reason: 'no_credentials' }

  const started = performance.now()
  let message: Anthropic.Message
  try {
    message = await withRetry(
      () =>
        client.create({
          model: spec.model,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: [{ role: 'user', content: req.prompt }],
        }),
      { maxAttempts: 2, baseDelayMs: 800 },
    )
  } catch {
    return { ok: false, reason: 'api_error' }
  }
  const latencyMs = Math.round(performance.now() - started)

  const text = message.content[0]?.type === 'text' ? message.content[0].text : ''
  const inputTokens = message.usage.input_tokens
  const outputTokens = message.usage.output_tokens
  const costUsd =
    (inputTokens / 1e6) * spec.inputPerMTok + (outputTokens / 1e6) * spec.outputPerMTok

  useStore.getState().recordAiUsage({
    timestamp: new Date().toISOString(),
    actor: req.actor,
    role: req.role,
    taskCategory: req.taskCategory,
    useCase: route.useCase,
    tier: route.tier,
    model: message.model,
    provider: client.provider,
    simulated: false,
    inputTokens,
    outputTokens,
    costUsd,
    latencyMs,
  })

  return {
    ok: true,
    text,
    model: message.model,
    provider: client.provider,
    inputTokens,
    outputTokens,
    costUsd,
    latencyMs,
  }
}

// ── Simulated triage usage ────────────────────────────────────────────────────
// The Semantic Kernel triage step stays deterministic (real Haiku calls at the
// 1.5s feed cadence would be pointless spend), but each triage is logged as a
// synthetic routine-tier record so the governance dashboard reflects the volume.

export function estimateTriageUsage(): Omit<
  import('./types').AiUsageRecord,
  'id' | 'month'
> {
  const inputTokens = 300 + Math.round(Math.random() * 100)
  const outputTokens = 50 + Math.round(Math.random() * 20)
  const spec = MODEL_TIERS.routine
  return {
    timestamp: new Date().toISOString(),
    actor: 'system:semantic-kernel',
    role: 'system',
    taskCategory: 'triage_summary',
    useCase: 'triage_automation',
    tier: 'routine',
    model: spec.model,
    provider: 'stub',
    simulated: true,
    inputTokens,
    outputTokens,
    costUsd: (inputTokens / 1e6) * spec.inputPerMTok + (outputTokens / 1e6) * spec.outputPerMTok,
    latencyMs: 0,
  }
}

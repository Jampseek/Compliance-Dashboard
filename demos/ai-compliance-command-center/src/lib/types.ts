// Domain model for the AI Compliance Command Center.
// These types flow through the simulated Azure pipeline described in the
// architecture diagram: Core Banking -> Event Hubs -> AI Screening ->
// Risk Engine -> Service Bus -> Human Oversight -> Governance.

export type RiskBand = 'low' | 'medium' | 'high'

export type TxnType = 'wire' | 'ach' | 'card' | 'crypto' | 'cash' | 'cheque'

/** A raw banking transaction, as it arrives from the Core Banking System. */
export interface Transaction {
  id: string
  timestamp: string // ISO
  amount: number
  currency: string
  type: TxnType
  originator: string
  beneficiary: string
  originatorCountry: string
  beneficiaryCountry: string
  channel: string
}

/** Output of Comply Advantage style sanctions / PEP / adverse-media screening. */
export interface ScreeningHit {
  list: 'OFAC' | 'EU' | 'UN' | 'PEP' | 'Adverse Media' | 'Internal Watchlist'
  matchedName: string
  score: number // 0-100 match confidence
}

/** Output of the GPT-4o + XGBoost Risk Score Engine (Azure Functions). */
export interface RiskAssessment {
  score: number // 0-100
  band: RiskBand
  modelScore: number // XGBoost probability component (0-100)
  llmScore: number // GPT-4o reasoning component (0-100)
  reasons: string[]
  narrative: string // GPT-4o explanation
  screeningHits: ScreeningHit[]
}

export type AlertStatus =
  | 'queued' // sitting in the Service Bus alert queue
  | 'triaged' // Semantic Kernel orchestrator prioritised it
  | 'in_review' // analyst is looking at it
  | 'cleared' // dismissed as false positive
  | 'escalated' // promoted to a case

export interface Alert {
  id: string
  transaction: Transaction
  assessment: RiskAssessment
  status: AlertStatus
  priority: number // 1 (highest) .. 5, set by Semantic Kernel triage
  triageSummary?: string
  createdAt: string
  assignedTo?: string
}

export type CaseStatus = 'open' | 'sar_drafted' | 'pending_approval' | 'filed' | 'closed_no_action'

export interface Case {
  id: string
  alertId: string
  alert: Alert
  status: CaseStatus
  openedAt: string
  openedBy: string
  notes: string[]
  sar?: SarDraft
}

/** A Suspicious Activity Report drafted by the SAR Drafting AI. */
export interface SarDraft {
  id: string
  draftedAt: string
  narrative: string
  regulator: 'FinCEN' | 'FCA'
  approved: boolean
  approvedBy?: string
  filedAt?: string
  filingReference?: string
}

export type MediaCategory =
  | 'fraud'
  | 'corruption'
  | 'sanctions'
  | 'money_laundering'
  | 'legal'
  | 'regulatory'

export type MediaHitStatus = 'new' | 'under_review' | 'dismissed' | 'escalated'

/** A negative-news match surfaced by the NLP adverse-media scanning engine. */
export interface AdverseMediaHit {
  id: string
  detectedAt: string
  entityName: string
  source: string
  headline: string
  sentiment: 'negative' | 'highly_negative'
  confidence: number // 0-100 NLP match confidence
  category: MediaCategory
  status: MediaHitStatus
  url: string
  reviewedBy?: string
}

export type KycReportType = 'CTR' | 'STR'
export type KycReportStatus = 'pending' | 'submitted' | 'overdue'
export type KycRegulator = 'FinCEN' | 'FCA' | 'AUSTRAC' | 'MAS'

/** An auto-generated regulatory report (CTR or STR) pre-populated from KYC/transaction data. */
export interface KycReport {
  id: string
  type: KycReportType
  status: KycReportStatus
  generatedAt: string
  deadlineAt: string       // ISO — 15 days (CTR) or 30 days (STR) from generation
  submittedAt?: string
  filingReference?: string
  regulator: KycRegulator
  customer: string         // originator name from KYC record
  transactionId: string
  caseId?: string          // linked case for STR
  prePopulated: {
    customerName: string
    beneficiary: string
    transactionDate: string
    amount: number
    currency: string
    transactionType: string
    originatingCountry: string
    beneficiaryCountry: string
    channel: string
  }
}

// ── Perpetual KYC — Customer Risk Profiles ───────────────────────────────────

export type CustomerRiskTier = 'low' | 'medium' | 'high' | 'critical'

/** A risk tier transition logged when a compliance event elevates a customer's tier. */
export interface CustomerTierEvent {
  timestamp: string
  fromTier: CustomerRiskTier
  toTier: CustomerRiskTier
  trigger: string  // e.g. "High-risk WIRE USD 45,000 — sanctions hit (OFAC)"
}

/**
 * Perpetual KYC profile for a known customer entity.
 * Updated reactively by every compliance event (transaction ingestion, alert,
 * adverse media, EDD approval). Never computed at render time.
 * Tiers can only rise from automated events; downgrade requires human review.
 */
export interface CustomerProfile {
  id: string
  name: string
  riskTier: CustomerRiskTier
  nextReviewDue: string    // ISO — recalculated on every tier promotion
  firstSeenAt: string      // ISO
  lastEventAt: string      // ISO
  lastReviewedAt?: string  // ISO — set by human review action
  lastReviewedBy?: string
  totalTransactions: number
  totalAlerts: number
  totalMediaHits: number   // new + escalated; dismissed excluded
  sanctionsHits: number
  tierHistory: CustomerTierEvent[]  // most-recent-first; only tier-change events logged
}

// ── Enhanced Due Diligence (EDD) ─────────────────────────────────────────────

export type OsintSourceType =
  | 'corporate_registry'
  | 'beneficial_ownership'
  | 'court_records'
  | 'social_media'
  | 'regulatory_filings'
  | 'pep_database'
  | 'sanctions_cross_check'
  | 'news_aggregator'

export interface OsintFinding {
  sourceType: OsintSourceType
  source: string
  finding: string
  confidence: number // 0-100
  riskRelevance: 'high' | 'medium' | 'low'
  url?: string
  retrievedAt: string
}

export type EddStatus = 'drafting' | 'draft' | 'approved'
export type EddRiskRating = 'critical' | 'high' | 'medium' | 'low'

/** An AI-drafted Enhanced Due Diligence report, synthesised from OSINT findings
 *  triggered by an adverse media hit. The AI produces the draft; a human approves it. */
export interface EddReport {
  id: string
  mediaHitId: string
  entityName: string
  initiatedAt: string
  initiatedBy: string
  status: EddStatus
  osintFindings: OsintFinding[]
  narrative: string       // AI-generated EDD narrative
  riskRating: EddRiskRating
  approvedBy?: string
  approvedAt?: string
}

// ── AI Governance ─────────────────────────────────────────────────────────────

import type { Role } from './rbac'

/** Model tiers of the routing decision tree, cheapest to most capable. */
export type ModelTier = 'routine' | 'complex' | 'frontier'

/** Task categories the AI gateway can route. */
export type TaskCategory =
  | 'triage_summary'
  | 'sar_drafting'
  | 'edd_drafting'
  | 'report_summary'
  | 'experimentation'

/** Budget-allocation buckets — the org-level use-case split. */
export type AiUseCase =
  | 'investigative_drafting'
  | 'triage_automation'
  | 'analysis_reporting'
  | 'experimentation'

export type AiProvider = 'foundry' | 'anthropic' | 'stub'

/** One AI API call (or blocked/simulated attempt) — the unit of cost tracking. */
export interface AiUsageRecord {
  id: string
  timestamp: string
  month: string              // 'YYYY-MM' — the budget window key
  actor: string              // PRINCIPALS name or system actor
  role: Role | 'system'
  taskCategory: TaskCategory
  useCase: AiUseCase
  tier: ModelTier
  model: string
  provider: AiProvider
  simulated: boolean         // true for synthetic records (no real API call)
  inputTokens: number
  outputTokens: number
  costUsd: number
  latencyMs: number
  blocked?: 'budget_cap' | 'policy'  // set when the call was refused pre-flight
}

export type AuditAction =
  | 'transaction_ingested'
  | 'auto_cleared'
  | 'alert_created'
  | 'alert_triaged'
  | 'alert_cleared'
  | 'alert_escalated'
  | 'case_opened'
  | 'sar_drafted'
  | 'sar_approved'
  | 'sar_filed'
  | 'case_closed'
  | 'media_hit_detected'
  | 'media_hit_reviewed'
  | 'media_hit_dismissed'
  | 'media_hit_escalated'
  | 'ctr_generated'
  | 'str_generated'
  | 'kyc_report_submitted'
  | 'edd_initiated'
  | 'edd_drafted'
  | 'edd_approved'
  | 'customer_risk_changed'
  | 'customer_reviewed'
  | 'ai_call_completed'
  | 'budget_cap_reached'
  | 'ai_policy_blocked'
  | 'ai_budget_updated'

/** An append-only record destined for the Azure Blob Immutable Audit Store. */
export interface AuditEntry {
  id: string
  timestamp: string
  action: AuditAction
  actor: string
  subjectId: string
  detail: string
  prevHash: string
  hash: string
}

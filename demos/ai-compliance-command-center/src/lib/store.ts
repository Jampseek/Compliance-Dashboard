// Central orchestration store. This is the in-memory heart of the demo and
// wires together every zone of the architecture diagram:
//
//   ingest()      -> Core Banking -> Event Hubs -> Screening -> Risk Engine
//                    -> auto-clear (low) OR Service Bus alert queue (high)
//   triage        -> Semantic Kernel Orchestrator sets priority
//   escalate()    -> opens a Case in the investigation system
//   draftSar()    -> SAR Drafting AI
//   approveSar()  -> Human Approval Gate
//   fileSar()     -> FinCEN/FCA Regulatory Filing API
//   every step    -> appended to the immutable audit store
//
// State is held in memory (and optionally mirrored to Supabase, see supabase.ts)
// so the demo runs with zero backend setup.

import { create } from 'zustand'
import type { AdverseMediaHit, Alert, AuditEntry, Case, CustomerProfile, CustomerRiskTier, CustomerTierEvent, EddReport, KycRegulator, KycReport, Transaction } from './types'
import { makeMediaHit, makeTransaction } from './mockData'
import { screen } from './screening'
import { assess } from './riskEngine'
import { draftSarAI } from './aiSarDrafter'
import { draftEdd } from './aiEddDrafter'
import { generateOsintFindings } from './osintData'
import { appendAudit } from './audit'
import { id } from './random'
import { PRINCIPALS, type Role } from './rbac'

// ── KYC Report helpers ────────────────────────────────────────────────────────

function pickRegulator(txn: Transaction): KycRegulator {
  const cc = [txn.originatorCountry, txn.beneficiaryCountry]
  if (cc.includes('GB')) return 'FCA'
  if (cc.includes('AU')) return 'AUSTRAC'
  if (cc.includes('SG')) return 'MAS'
  return 'FinCEN'
}

function makeCtr(txn: Transaction, now: number): KycReport {
  return {
    id: id('ctr'),
    type: 'CTR',
    status: 'pending',
    generatedAt: new Date(now).toISOString(),
    deadlineAt: new Date(now + 15 * 24 * 60 * 60 * 1000).toISOString(),
    regulator: pickRegulator(txn),
    customer: txn.originator,
    transactionId: txn.id,
    prePopulated: {
      customerName: txn.originator,
      beneficiary: txn.beneficiary,
      transactionDate: txn.timestamp,
      amount: txn.amount,
      currency: txn.currency,
      transactionType: txn.type,
      originatingCountry: txn.originatorCountry,
      beneficiaryCountry: txn.beneficiaryCountry,
      channel: txn.channel,
    },
  }
}

function makeStrFromTxn(txn: Transaction, now: number): KycReport {
  return {
    id: id('str'),
    type: 'STR',
    status: 'pending',
    generatedAt: new Date(now).toISOString(),
    deadlineAt: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
    regulator: pickRegulator(txn),
    customer: txn.originator,
    transactionId: txn.id,
    prePopulated: {
      customerName: txn.originator,
      beneficiary: txn.beneficiary,
      transactionDate: txn.timestamp,
      amount: txn.amount,
      currency: txn.currency,
      transactionType: txn.type,
      originatingCountry: txn.originatorCountry,
      beneficiaryCountry: txn.beneficiaryCountry,
      channel: txn.channel,
    },
  }
}

function makeStr(c: Case, now: number): KycReport {
  const txn = c.alert.transaction
  return {
    id: id('str'),
    type: 'STR',
    status: 'pending',
    generatedAt: new Date(now).toISOString(),
    deadlineAt: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
    regulator: pickRegulator(txn),
    customer: txn.originator,
    transactionId: txn.id,
    caseId: c.id,
    prePopulated: {
      customerName: txn.originator,
      beneficiary: txn.beneficiary,
      transactionDate: txn.timestamp,
      amount: txn.amount,
      currency: txn.currency,
      transactionType: txn.type,
      originatingCountry: txn.originatorCountry,
      beneficiaryCountry: txn.beneficiaryCountry,
      channel: txn.channel,
    },
  }
}

// ── Perpetual KYC helpers ─────────────────────────────────────────────────────

const TIER_ORDER: CustomerRiskTier[] = ['low', 'medium', 'high', 'critical']

const REVIEW_DAYS: Record<CustomerRiskTier, number> = {
  low: 365, medium: 180, high: 90, critical: 30,
}

function higherTier(a: CustomerRiskTier, b: CustomerRiskTier): CustomerRiskTier {
  return TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b) ? a : b
}

function nextReviewDate(tier: CustomerRiskTier, now: number): string {
  return new Date(now + REVIEW_DAYS[tier] * 24 * 60 * 60 * 1000).toISOString()
}

function upsertCustomer(
  list: CustomerProfile[],
  name: string,
  proposedTier: CustomerRiskTier,
  triggerLabel: string,
  now: number,
  counters: { transactions?: number; alerts?: number; media?: number; sanctions?: number },
): CustomerProfile[] {
  const ts  = new Date(now).toISOString()
  const existing = list.find((c) => c.name === name)

  if (!existing) {
    const profile: CustomerProfile = {
      id: id('cust'),
      name,
      riskTier: proposedTier,
      nextReviewDue: nextReviewDate(proposedTier, now),
      firstSeenAt: ts,
      lastEventAt: ts,
      totalTransactions: counters.transactions ?? 0,
      totalAlerts:       counters.alerts       ?? 0,
      totalMediaHits:    counters.media        ?? 0,
      sanctionsHits:     counters.sanctions    ?? 0,
      tierHistory: proposedTier !== 'low' ? [{
        timestamp: ts,
        fromTier: 'low',
        toTier: proposedTier,
        trigger: triggerLabel,
      }] : [],
    }
    return [profile, ...list]
  }

  const newTier    = higherTier(existing.riskTier, proposedTier)
  const tierChanged = newTier !== existing.riskTier
  const newEvent: CustomerTierEvent | null = tierChanged
    ? { timestamp: ts, fromTier: existing.riskTier, toTier: newTier, trigger: triggerLabel }
    : null

  const updated: CustomerProfile = {
    ...existing,
    riskTier:          newTier,
    lastEventAt:       ts,
    nextReviewDue:     tierChanged ? nextReviewDate(newTier, now) : existing.nextReviewDue,
    totalTransactions: existing.totalTransactions + (counters.transactions ?? 0),
    totalAlerts:       existing.totalAlerts       + (counters.alerts       ?? 0),
    totalMediaHits:    existing.totalMediaHits    + (counters.media        ?? 0),
    sanctionsHits:     existing.sanctionsHits     + (counters.sanctions    ?? 0),
    tierHistory:       newEvent ? [newEvent, ...existing.tierHistory] : existing.tierHistory,
  }

  return list.map((c) => (c.name === name ? updated : c))
}

// ─────────────────────────────────────────────────────────────────────────────

function triage(alert: Alert): { priority: number; summary: string } {
  const s = alert.assessment.score
  const sanctioned = alert.assessment.screeningHits.some((h) =>
    ['OFAC', 'EU', 'UN'].includes(h.list),
  )
  const structuring = alert.assessment.reasons.some((r) => r.includes('structuring'))
  let priority = 5
  if (sanctioned) priority = 1
  else if (s >= 80 || structuring) priority = 2
  else if (s >= 65) priority = 3
  else if (s >= 50) priority = 4

  const summary = sanctioned
    ? 'Sanctions exposure — immediate analyst attention required.'
    : structuring
      ? 'Structuring pattern detected — prioritise for review.'
      : `Risk ${s}/100 — routed for ${priority <= 3 ? 'priority' : 'routine'} review.`
  return { priority, summary }
}

interface PipelineStats {
  ingested: number
  autoCleared: number
}

interface State {
  role: Role
  transactions: Transaction[]
  alerts: Alert[]
  cases: Case[]
  mediaHits: AdverseMediaHit[]
  kycReports: KycReport[]
  eddReports: EddReport[]
  customers: CustomerProfile[]
  audit: AuditEntry[]
  stats: PipelineStats

  setRole: (r: Role) => void
  ingest: () => void
  clearAlert: (alertId: string) => void
  escalateAlert: (alertId: string) => void
  addNote: (caseId: string, note: string) => void
  sarDraftingCaseId: string | null
  draftSarForCase: (caseId: string, regulator: 'FinCEN' | 'FCA') => Promise<void>
  approveSar: (caseId: string) => void
  fileSar: (caseId: string) => void
  closeCaseNoAction: (caseId: string) => void
  reviewMediaHit: (hitId: string) => void
  dismissMediaHit: (hitId: string) => void
  escalateMediaHit: (hitId: string) => void
  eddDraftingHitId: string | null
  generateEdd: (hitId: string) => Promise<void>
  approveEdd: (eddId: string) => void
  reviewCustomer: (customerId: string, newTier: CustomerRiskTier) => void
  submitKycReport: (reportId: string) => void
  reset: () => void
}

const SYSTEM_ACTOR = 'system:risk-engine'

export const useStore = create<State>((set, get) => ({
  role: 'analyst',
  transactions: [],
  alerts: [],
  cases: [],
  mediaHits: [],
  kycReports: [],
  eddReports: [],
  customers: [],
  audit: [],
  stats: { ingested: 0, autoCleared: 0 },
  sarDraftingCaseId: null,
  eddDraftingHitId: null,

  setRole: (r) => set({ role: r }),

  ingest: () => {
    const now = Date.now()
    const txn = makeTransaction(now)
    const hits = screen(txn)
    const assessment = assess(txn, hits)
    const mediaHit = makeMediaHit(now)
    const ctr = txn.amount >= 10000 ? makeCtr(txn, now) : null
    const autoStr = assessment.band === 'high' ? makeStrFromTxn(txn, now) : null

    set((s) => {
      const audit = [...s.audit]
      const ts = new Date(now).toISOString()
      audit.push(
        appendAudit(audit, 'transaction_ingested', SYSTEM_ACTOR, txn.id, `${txn.currency} ${txn.amount}`, ts),
      )

      const stats = { ...s.stats, ingested: s.stats.ingested + 1 }

      // Adverse media hit — independent of transaction risk band.
      const mediaHits = [...s.mediaHits]
      if (mediaHit) {
        audit.push(
          appendAudit(audit, 'media_hit_detected', 'system:nlp-media-scanner', mediaHit.id, mediaHit.entityName, ts),
        )
        mediaHits.unshift(mediaHit)
      }

      // CTR — generated for any transaction >= $10,000 regardless of risk band.
      // STR — auto-generated for high-risk transactions by the KYC reporting engine.
      const kycReports = [...s.kycReports]
      if (ctr) {
        audit.push(appendAudit(audit, 'ctr_generated', 'system:kyc-reporting', ctr.id, `${txn.currency} ${txn.amount}`, ts))
        kycReports.unshift(ctr)
      }
      if (autoStr) {
        audit.push(appendAudit(audit, 'str_generated', 'system:kyc-reporting', autoStr.id, `high-risk txn ${txn.id}`, ts))
        kycReports.unshift(autoStr)
      }

      // ── pKYC: upsert originator profile ─────────────────────────────────────
      const hasSanctions = assessment.screeningHits.some((h) =>
        ['OFAC', 'EU', 'UN'].includes(h.list),
      )
      const originatorTier: CustomerRiskTier = hasSanctions
        ? 'critical'
        : assessment.band === 'high' ? 'high'
        : assessment.band === 'medium' ? 'medium'
        : 'low'

      const triggerDesc = hasSanctions
        ? `${txn.type.toUpperCase()} ${txn.currency} ${txn.amount.toLocaleString()} — sanctions hit`
        : `${txn.type.toUpperCase()} ${txn.currency} ${txn.amount.toLocaleString()} — ${assessment.band} risk (score ${assessment.score})`

      let customers = upsertCustomer(
        s.customers,
        txn.originator,
        originatorTier,
        triggerDesc,
        now,
        {
          transactions: 1,
          alerts: assessment.band !== 'low' ? 1 : 0,
          sanctions: hasSanctions ? 1 : 0,
        },
      )

      // If a customer_risk_changed audit event is warranted, log it
      const origProfile = s.customers.find((c) => c.name === txn.originator)
      if (originatorTier !== 'low' && (!origProfile || higherTier(origProfile.riskTier, originatorTier) !== origProfile?.riskTier)) {
        audit.push(appendAudit(audit, 'customer_risk_changed', SYSTEM_ACTOR, txn.originator, `→ ${originatorTier}`, ts))
      }

      // pKYC: upsert media hit entity if name matches a known customer
      if (mediaHit) {
        const mediaProfile = customers.find((c) => c.name === mediaHit.entityName)
        if (mediaProfile) {
          customers = upsertCustomer(customers, mediaHit.entityName, 'medium', `Adverse media: ${mediaHit.category}`, now, { media: 1 })
          const after = customers.find((c) => c.name === mediaHit.entityName)
          if (after && after.riskTier !== mediaProfile.riskTier) {
            audit.push(appendAudit(audit, 'customer_risk_changed', 'system:nlp-media-scanner', mediaHit.entityName, `→ ${after.riskTier}`, ts))
          }
        }
      }

      // Low risk -> auto-cleared with an audit record (diagram: D ->|Low Risk| G).
      if (assessment.band === 'low') {
        audit.push(
          appendAudit(audit, 'auto_cleared', SYSTEM_ACTOR, txn.id, `score ${assessment.score}`, ts),
        )
        return {
          transactions: [txn, ...s.transactions].slice(0, 200),
          stats: { ...stats, autoCleared: stats.autoCleared + 1 },
          mediaHits,
          kycReports,
          customers,
          audit,
        }
      }

      // Medium/High -> Service Bus alert queue, then Semantic Kernel triage.
      const baseAlert: Alert = {
        id: id('alert'),
        transaction: txn,
        assessment,
        status: 'queued',
        priority: 5,
        createdAt: ts,
      }
      const { priority, summary } = triage(baseAlert)
      const alert: Alert = { ...baseAlert, status: 'triaged', priority, triageSummary: summary }

      audit.push(appendAudit(audit, 'alert_created', SYSTEM_ACTOR, alert.id, `score ${assessment.score}`, ts))
      audit.push(
        appendAudit(audit, 'alert_triaged', 'system:semantic-kernel', alert.id, `priority ${priority}`, ts),
      )

      return {
        transactions: [txn, ...s.transactions].slice(0, 200),
        alerts: [alert, ...s.alerts],
        mediaHits,
        kycReports,
        customers,
        stats,
        audit,
      }
    })
  },

  fetchTransactionsFromApi: async () => {
    try {
      const response = await fetch('http://localhost:5082/api/transactions');
      if (!response.ok) throw new Error('Network error');
      const data = await response.json();
      set((s) => ({ ...s, transactions: data }));
    } catch (error) {
      console.error('Failed to fetch transactions from API:', error);
      // keep existing mock data (no state change)
    }
  },
clearAlert: (alertId) => {
    const actor = PRINCIPALS[get().role].name
    set((s) => {
      const ts = new Date().toISOString()
      const audit = [...s.audit]
      audit.push(appendAudit(audit, 'alert_cleared', actor, alertId, 'false positive', ts))
      return {
        alerts: s.alerts.map((a) => (a.id === alertId ? { ...a, status: 'cleared', assignedTo: actor } : a)),
        audit,
      }
    })
  },

  escalateAlert: (alertId) => {
    const actor = PRINCIPALS[get().role].name
    set((s) => {
      const alert = s.alerts.find((a) => a.id === alertId)
      if (!alert) return s
      const ts = new Date().toISOString()
      const audit = [...s.audit]
      const newCase: Case = {
        id: id('case'),
        alertId,
        alert: { ...alert, status: 'escalated', assignedTo: actor },
        status: 'open',
        openedAt: ts,
        openedBy: actor,
        notes: [],
      }
      audit.push(appendAudit(audit, 'alert_escalated', actor, alertId, `case ${newCase.id}`, ts))
      audit.push(appendAudit(audit, 'case_opened', actor, newCase.id, `from ${alertId}`, ts))
      return {
        alerts: s.alerts.map((a) => (a.id === alertId ? { ...a, status: 'escalated', assignedTo: actor } : a)),
        cases: [newCase, ...s.cases],
        audit,
      }
    })
  },

  addNote: (caseId, note) => {
    if (!note.trim()) return
    set((s) => ({
      cases: s.cases.map((c) => (c.id === caseId ? { ...c, notes: [...c.notes, note.trim()] } : c)),
    }))
  },

  draftSarForCase: async (caseId, regulator) => {
    const c = get().cases.find((x) => x.id === caseId)
    if (!c) return
    set({ sarDraftingCaseId: caseId })
    try {
      const now = Date.now()
      const sar = await draftSarAI(c, now, regulator)
      const str = makeStr(c, now)
      const ts = new Date(now).toISOString()
      set((s) => {
        const audit = [...s.audit]
        audit.push(appendAudit(audit, 'sar_drafted', 'system:sar-ai', caseId, sar.id, ts))
        audit.push(appendAudit(audit, 'str_generated', 'system:kyc-reporting', str.id, `linked to ${caseId}`, ts))
        return {
          cases: s.cases.map((x) =>
            x.id === caseId ? { ...x, sar, status: 'pending_approval' } : x,
          ),
          kycReports: [str, ...s.kycReports],
          audit,
          sarDraftingCaseId: null,
        }
      })
    } catch {
      set({ sarDraftingCaseId: null })
    }
  },

  approveSar: (caseId) => {
    const actor = PRINCIPALS[get().role].name
    set((s) => {
      const c = s.cases.find((x) => x.id === caseId)
      if (!c || !c.sar) return s
      const ts = new Date().toISOString()
      const audit = [...s.audit]
      audit.push(appendAudit(audit, 'sar_approved', actor, c.sar.id, 'human approval gate', ts))
      return {
        cases: s.cases.map((x) =>
          x.id === caseId && x.sar
            ? { ...x, sar: { ...x.sar, approved: true, approvedBy: actor }, status: 'sar_drafted' }
            : x,
        ),
        audit,
      }
    })
  },

  fileSar: (caseId) => {
    const actor = PRINCIPALS[get().role].name
    set((s) => {
      const c = s.cases.find((x) => x.id === caseId)
      if (!c || !c.sar || !c.sar.approved) return s
      const now = Date.now()
      const ts = new Date(now).toISOString()
      const ref = `${c.sar.regulator}-${id('ref').toUpperCase()}`
      const audit = [...s.audit]
      audit.push(appendAudit(audit, 'sar_filed', actor, c.sar.id, ref, ts))
      return {
        cases: s.cases.map((x) =>
          x.id === caseId && x.sar
            ? { ...x, sar: { ...x.sar, filedAt: ts, filingReference: ref }, status: 'filed' }
            : x,
        ),
        audit,
      }
    })
  },

  closeCaseNoAction: (caseId) => {
    const actor = PRINCIPALS[get().role].name
    set((s) => {
      const ts = new Date().toISOString()
      const audit = [...s.audit]
      audit.push(appendAudit(audit, 'case_closed', actor, caseId, 'no action', ts))
      return {
        cases: s.cases.map((x) => (x.id === caseId ? { ...x, status: 'closed_no_action' } : x)),
        audit,
      }
    })
  },

  reviewMediaHit: (hitId) => {
    const actor = PRINCIPALS[get().role].name
    set((s) => {
      const ts = new Date().toISOString()
      const audit = [...s.audit]
      audit.push(appendAudit(audit, 'media_hit_reviewed', actor, hitId, 'under review', ts))
      return {
        mediaHits: s.mediaHits.map((h) =>
          h.id === hitId ? { ...h, status: 'under_review', reviewedBy: actor } : h,
        ),
        audit,
      }
    })
  },

  dismissMediaHit: (hitId) => {
    const actor = PRINCIPALS[get().role].name
    set((s) => {
      const ts = new Date().toISOString()
      const audit = [...s.audit]
      audit.push(appendAudit(audit, 'media_hit_dismissed', actor, hitId, 'false positive', ts))
      return {
        mediaHits: s.mediaHits.map((h) =>
          h.id === hitId ? { ...h, status: 'dismissed', reviewedBy: actor } : h,
        ),
        audit,
      }
    })
  },

  escalateMediaHit: (hitId) => {
    const actor = PRINCIPALS[get().role].name
    set((s) => {
      const hit = s.mediaHits.find((h) => h.id === hitId)
      if (!hit) return s
      const now = Date.now()
      const ts = new Date(now).toISOString()
      const audit = [...s.audit]
      audit.push(
        appendAudit(audit, 'media_hit_escalated', actor, hitId, `CDD review — ${hit.entityName}`, ts),
      )
      // pKYC: escalated adverse media promotes the entity to at least High
      const prior = s.customers.find((c) => c.name === hit.entityName)
      const customers = upsertCustomer(
        s.customers,
        hit.entityName,
        hit.category === 'sanctions' || hit.sentiment === 'highly_negative' ? 'critical' : 'high',
        `Adverse media escalated: ${hit.category} — "${hit.headline.slice(0, 60)}"`,
        now,
        { media: prior ? 0 : 1 },
      )
      const after = customers.find((c) => c.name === hit.entityName)
      if (after && after.riskTier !== prior?.riskTier) {
        audit.push(appendAudit(audit, 'customer_risk_changed', actor, hit.entityName, `→ ${after.riskTier}`, ts))
      }
      return {
        mediaHits: s.mediaHits.map((h) =>
          h.id === hitId ? { ...h, status: 'escalated', reviewedBy: actor } : h,
        ),
        customers,
        audit,
      }
    })
  },

  generateEdd: async (hitId) => {
    const state = get()
    const hit = state.mediaHits.find((h) => h.id === hitId)
    if (!hit) return
    const actor = PRINCIPALS[state.role].name
    set({ eddDraftingHitId: hitId })
    try {
      const now = Date.now()
      const ts  = new Date(now).toISOString()
      const findings = generateOsintFindings(hit.entityName, hit.category, now)
      set((s) => {
        const audit = [...s.audit]
        audit.push(appendAudit(audit, 'edd_initiated', actor, hitId, `OSINT scan — ${hit.entityName}`, ts))
        return { audit }
      })
      const report = await draftEdd(hit, findings, actor, now)
      set((s) => {
        const audit = [...s.audit]
        audit.push(appendAudit(audit, 'edd_drafted', 'system:edd-ai', report.id, `${hit.entityName} — ${report.riskRating}`, ts))
        return {
          eddReports: [report, ...s.eddReports],
          audit,
          eddDraftingHitId: null,
        }
      })
    } catch {
      set({ eddDraftingHitId: null })
    }
  },

  approveEdd: (eddId) => {
    const actor = PRINCIPALS[get().role].name
    set((s) => {
      const report = s.eddReports.find((r) => r.id === eddId)
      if (!report) return s
      const now = Date.now()
      const ts  = new Date(now).toISOString()
      const audit = [...s.audit]
      audit.push(appendAudit(audit, 'edd_approved', actor, eddId, 'human approval gate', ts))
      // pKYC: approved EDD risk rating feeds into the customer tier
      const eddTier: CustomerRiskTier =
        report.riskRating === 'critical' ? 'critical'
        : report.riskRating === 'high'   ? 'high'
        : report.riskRating === 'medium' ? 'medium'
        : 'low'
      const prior = s.customers.find((c) => c.name === report.entityName)
      const customers = upsertCustomer(
        s.customers,
        report.entityName,
        eddTier,
        `EDD approved: ${report.riskRating.toUpperCase()} rating`,
        now,
        {},
      )
      const after = customers.find((c) => c.name === report.entityName)
      if (after && after.riskTier !== prior?.riskTier) {
        audit.push(appendAudit(audit, 'customer_risk_changed', actor, report.entityName, `→ ${after.riskTier} (EDD)`, ts))
      }
      return {
        eddReports: s.eddReports.map((r) =>
          r.id === eddId ? { ...r, status: 'approved', approvedBy: actor, approvedAt: ts } : r,
        ),
        customers,
        audit,
      }
    })
  },

  reviewCustomer: (customerId, newTier) => {
    const actor = PRINCIPALS[get().role].name
    set((s) => {
      const profile = s.customers.find((c) => c.id === customerId)
      if (!profile) return s
      const now = Date.now()
      const ts  = new Date(now).toISOString()
      const audit = [...s.audit]
      const tierChanged = newTier !== profile.riskTier
      const event = tierChanged
        ? [{ timestamp: ts, fromTier: profile.riskTier, toTier: newTier, trigger: `Manual review by ${actor}` }, ...profile.tierHistory]
        : profile.tierHistory
      if (tierChanged) {
        audit.push(appendAudit(audit, 'customer_risk_changed', actor, profile.name, `→ ${newTier} (review)`, ts))
      }
      audit.push(appendAudit(audit, 'customer_reviewed', actor, profile.name, `tier confirmed: ${newTier}`, ts))
      return {
        customers: s.customers.map((c) =>
          c.id === customerId
            ? {
                ...c,
                riskTier: newTier,
                nextReviewDue: nextReviewDate(newTier, now),
                lastReviewedAt: ts,
                lastReviewedBy: actor,
                tierHistory: event,
              }
            : c,
        ),
        audit,
      }
    })
  },

  submitKycReport: (reportId) => {
    const actor = PRINCIPALS[get().role].name
    set((s) => {
      const report = s.kycReports.find((r) => r.id === reportId)
      if (!report || report.status === 'submitted') return s
      const ts = new Date().toISOString()
      const ref = `${report.regulator}-${report.type}-${id('ref').toUpperCase()}`
      const audit = [...s.audit]
      audit.push(appendAudit(audit, 'kyc_report_submitted', actor, reportId, ref, ts))
      return {
        kycReports: s.kycReports.map((r) =>
          r.id === reportId ? { ...r, status: 'submitted', submittedAt: ts, filingReference: ref } : r,
        ),
        audit,
      }
    })
  },

  reset: () =>
    set({
      transactions: [],
      alerts: [],
      cases: [],
      mediaHits: [],
      kycReports: [],
      eddReports: [],
      customers: [],
      audit: [],
      stats: { ingested: 0, autoCleared: 0 },
    }),
}))

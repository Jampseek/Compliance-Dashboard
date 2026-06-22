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
import type { AdverseMediaHit, Alert, AuditEntry, Case, EddReport, KycRegulator, KycReport, Transaction } from './types'
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
      const ts = new Date().toISOString()
      const audit = [...s.audit]
      audit.push(
        appendAudit(audit, 'media_hit_escalated', actor, hitId, `CDD review — ${hit.entityName}`, ts),
      )
      return {
        mediaHits: s.mediaHits.map((h) =>
          h.id === hitId ? { ...h, status: 'escalated', reviewedBy: actor } : h,
        ),
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
      const ts = new Date().toISOString()
      const audit = [...s.audit]
      audit.push(appendAudit(audit, 'edd_approved', actor, eddId, 'human approval gate', ts))
      return {
        eddReports: s.eddReports.map((r) =>
          r.id === eddId ? { ...r, status: 'approved', approvedBy: actor, approvedAt: ts } : r,
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
      audit: [],
      stats: { ingested: 0, autoCleared: 0 },
    }),
}))

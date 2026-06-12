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
import type { Alert, AuditEntry, Case, Transaction } from './types'
import { makeTransaction } from './mockData'
import { screen } from './screening'
import { assess } from './riskEngine'
import { draftSar } from './sarDrafter'
import { appendAudit } from './audit'
import { id } from './random'
import { PRINCIPALS, type Role } from './rbac'

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
  audit: AuditEntry[]
  stats: PipelineStats

  setRole: (r: Role) => void
  ingest: () => void
  clearAlert: (alertId: string) => void
  escalateAlert: (alertId: string) => void
  addNote: (caseId: string, note: string) => void
  draftSarForCase: (caseId: string, regulator: 'FinCEN' | 'FCA') => void
  approveSar: (caseId: string) => void
  fileSar: (caseId: string) => void
  closeCaseNoAction: (caseId: string) => void
  reset: () => void
}

const SYSTEM_ACTOR = 'system:risk-engine'

export const useStore = create<State>((set, get) => ({
  role: 'analyst',
  transactions: [],
  alerts: [],
  cases: [],
  audit: [],
  stats: { ingested: 0, autoCleared: 0 },

  setRole: (r) => set({ role: r }),

  ingest: () => {
    const now = Date.now()
    const txn = makeTransaction(now)
    const hits = screen(txn)
    const assessment = assess(txn, hits)

    set((s) => {
      const audit = [...s.audit]
      const ts = new Date(now).toISOString()
      audit.push(
        appendAudit(audit, 'transaction_ingested', SYSTEM_ACTOR, txn.id, `${txn.currency} ${txn.amount}`, ts),
      )

      const stats = { ...s.stats, ingested: s.stats.ingested + 1 }

      // Low risk -> auto-cleared with an audit record (diagram: D ->|Low Risk| G).
      if (assessment.band === 'low') {
        audit.push(
          appendAudit(audit, 'auto_cleared', SYSTEM_ACTOR, txn.id, `score ${assessment.score}`, ts),
        )
        return {
          transactions: [txn, ...s.transactions].slice(0, 200),
          stats: { ...stats, autoCleared: stats.autoCleared + 1 },
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
        stats,
        audit,
      }
    })
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

  draftSarForCase: (caseId, regulator) => {
    set((s) => {
      const c = s.cases.find((x) => x.id === caseId)
      if (!c) return s
      const now = Date.now()
      const sar = draftSar(c, now, regulator)
      const ts = new Date(now).toISOString()
      const audit = [...s.audit]
      audit.push(appendAudit(audit, 'sar_drafted', 'system:sar-ai', caseId, sar.id, ts))
      return {
        cases: s.cases.map((x) =>
          x.id === caseId ? { ...x, sar, status: 'pending_approval' } : x,
        ),
        audit,
      }
    })
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

  reset: () =>
    set({
      transactions: [],
      alerts: [],
      cases: [],
      audit: [],
      stats: { ingested: 0, autoCleared: 0 },
    }),
}))

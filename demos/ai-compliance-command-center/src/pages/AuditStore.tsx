// Governance Zone — Azure Blob Immutable Audit Store. Every material event is a
// hash-chained, append-only record. The chain is re-verified on render so any
// tampering would be visible.
import { useStore } from '../lib/store'
import { verifyChain } from '../lib/audit'
import { Card, Empty, PageHeader } from '../components/ui'
import { clock } from '../lib/format'
import type { AuditAction } from '../lib/types'

const actionColor: Record<AuditAction, string> = {
  transaction_ingested: 'text-slate-400',
  auto_cleared: 'text-emerald-400',
  alert_created: 'text-amber-400',
  alert_triaged: 'text-sky-400',
  alert_cleared: 'text-emerald-400',
  alert_escalated: 'text-rose-400',
  case_opened: 'text-rose-400',
  sar_drafted: 'text-sky-400',
  sar_approved: 'text-emerald-400',
  sar_filed: 'text-emerald-300',
  case_closed: 'text-slate-400',
  media_hit_detected: 'text-orange-400',
  media_hit_reviewed: 'text-amber-400',
  media_hit_dismissed: 'text-slate-400',
  media_hit_escalated: 'text-rose-400',
  ctr_generated: 'text-sky-400',
  str_generated: 'text-violet-400',
  kyc_report_submitted: 'text-emerald-300',
  edd_initiated: 'text-orange-400',
  edd_drafted: 'text-sky-400',
  edd_approved: 'text-emerald-400',
  customer_risk_changed: 'text-amber-400',
  customer_reviewed: 'text-emerald-400',
  ai_call_completed: 'text-slate-400',
  budget_cap_reached: 'text-rose-400',
  ai_policy_blocked: 'text-rose-400',
  ai_budget_updated: 'text-violet-400',
}

export default function AuditStore() {
  const audit = useStore((s) => s.audit)
  const intact = verifyChain(audit)
  const recent = audit.slice(-200).reverse()

  return (
    <div>
      <PageHeader title="Immutable Audit Store" zone="Governance Zone · Azure Blob (WORM)">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
            intact
              ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30'
              : 'bg-rose-500/10 text-rose-300 ring-rose-500/30'
          }`}
        >
          {intact ? '✓ Hash chain verified' : '✗ Chain integrity broken'}
        </span>
      </PageHeader>

      {recent.length === 0 ? (
        <Empty>No audit records yet. Events appear here as the pipeline runs.</Empty>
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">Action</th>
                  <th className="px-4 py-2">Actor</th>
                  <th className="px-4 py-2">Subject</th>
                  <th className="px-4 py-2">Detail</th>
                  <th className="px-4 py-2">Hash</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id} className="border-t border-slate-800/60">
                    <td className="px-4 py-1.5 font-mono text-xs text-slate-500">{clock(e.timestamp)}</td>
                    <td className={`px-4 py-1.5 font-medium ${actionColor[e.action]}`}>{e.action}</td>
                    <td className="px-4 py-1.5 text-xs text-slate-400">{e.actor}</td>
                    <td className="px-4 py-1.5 font-mono text-xs text-slate-400">{e.subjectId}</td>
                    <td className="px-4 py-1.5 text-xs text-slate-400">{e.detail}</td>
                    <td className="px-4 py-1.5 font-mono text-xs text-slate-600">{e.hash}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

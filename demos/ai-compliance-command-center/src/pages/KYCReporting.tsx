// Governance Zone — Automated KYC Regulatory Reporting.
// CTRs are auto-generated for transactions >= $10,000 (15-day filing deadline).
// STRs are auto-generated alongside every SAR draft (30-day deadline).
// Pre-populated fields are drawn directly from KYC / transaction data —
// eliminating the final manual step in the compliance chain.
import { useState } from 'react'
import { useStore } from '../lib/store'
import { Button, Card, Empty, PageHeader, Stat } from '../components/ui'
import { clock, money } from '../lib/format'
import type { KycReport, KycReportType } from '../lib/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function effectiveStatus(r: KycReport): 'pending' | 'overdue' | 'submitted' {
  if (r.status === 'submitted') return 'submitted'
  if (Date.now() > new Date(r.deadlineAt).getTime()) return 'overdue'
  return 'pending'
}

function daysRemaining(deadlineAt: string): number {
  return Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

// ── Styling maps ─────────────────────────────────────────────────────────────

const TYPE_STYLE: Record<KycReportType, string> = {
  CTR: 'bg-sky-500/10 text-sky-300 ring-sky-500/20',
  STR: 'bg-violet-500/10 text-violet-300 ring-violet-500/20',
}

const STATUS_STYLE: Record<'pending' | 'overdue' | 'submitted', string> = {
  pending: 'bg-amber-500/10 text-amber-300',
  overdue: 'bg-rose-500/15 text-rose-300',
  submitted: 'bg-emerald-500/10 text-emerald-300',
}

const STATUS_LABEL: Record<'pending' | 'overdue' | 'submitted', string> = {
  pending: 'Pending',
  overdue: 'Overdue',
  submitted: 'Submitted',
}

function DeadlinePill({ deadlineAt }: { deadlineAt: string }) {
  const days = daysRemaining(deadlineAt)
  if (days < 0)
    return <span className="text-xs font-semibold text-rose-300">{Math.abs(days)}d overdue</span>
  if (days <= 3)
    return <span className="text-xs font-semibold text-amber-300">{days}d left</span>
  return <span className="text-xs text-slate-400">{days}d left</span>
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function KYCReporting() {
  const reports = useStore((s) => s.kycReports)
  const submitReport = useStore((s) => s.submitKycReport)

  const [selected, setSelected] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<KycReportType | 'all'>('all')

  const filtered = typeFilter === 'all' ? reports : reports.filter((r) => r.type === typeFilter)
  const current: KycReport | undefined = filtered.find((r) => r.id === selected) ?? filtered[0]

  const pending = reports.filter((r) => effectiveStatus(r) === 'pending')
  const overdue = reports.filter((r) => effectiveStatus(r) === 'overdue')
  const submitted = reports.filter((r) => r.status === 'submitted')
  const ctrs = reports.filter((r) => r.type === 'CTR')
  const strs = reports.filter((r) => r.type === 'STR')

  return (
    <div>
      <PageHeader title="KYC Regulatory Reporting" zone="Governance Zone">
        {overdue.length > 0 && (
          <span className="flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 ring-1 ring-rose-500/20">
            ⚠ {overdue.length} overdue
          </span>
        )}
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Total reports" value={reports.length} sub="auto-generated" />
        <Stat label="CTRs" value={ctrs.length} accent="text-sky-400" sub="≥ $10,000 txns" />
        <Stat label="STRs" value={strs.length} accent="text-violet-400" sub="linked to SARs" />
        <Stat label="Pending" value={pending.length} accent="text-amber-400" sub="awaiting submission" />
        <Stat label="Submitted" value={submitted.length} accent="text-emerald-400" sub={`${overdue.length} overdue`} />
      </div>

      {reports.length === 0 ? (
        <Empty>
          No reports yet. CTRs are auto-generated for transactions ≥ $10,000. STRs are generated
          when a SAR is drafted in Case Investigation.
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
          {/* Report list */}
          <div className="space-y-2">
            <div className="flex gap-1 rounded-lg bg-slate-900/60 p-1">
              {(['all', 'CTR', 'STR'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setTypeFilter(f)}
                  className={`flex-1 rounded px-2 py-1 text-xs font-medium transition ${
                    typeFilter === f ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f === 'all' ? 'All' : f}
                </button>
              ))}
            </div>

            <div className="max-h-[65vh] space-y-1.5 overflow-y-auto pr-0.5">
              {filtered.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-600">No reports in this filter.</p>
              )}
              {filtered.map((r) => {
                const status = effectiveStatus(r)
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelected(r.id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      current?.id === r.id
                        ? 'border-sky-500/50 bg-sky-600/10'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-bold ring-1 ${TYPE_STYLE[r.type]}`}>
                          {r.type}
                        </span>
                        <span className="text-sm font-semibold text-slate-200 truncate">{r.customer}</span>
                      </div>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[status]}`}>
                        {STATUS_LABEL[status]}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                      <span>{money(r.prePopulated.amount, r.prePopulated.currency)} · {r.regulator}</span>
                      <DeadlinePill deadlineAt={r.deadlineAt} />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Detail panel */}
          {current && (() => {
            const status = effectiveStatus(current)
            const days = daysRemaining(current.deadlineAt)
            return (
              <div className="space-y-4">
                <Card className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded px-2 py-0.5 text-xs font-bold ring-1 ${TYPE_STYLE[current.type]}`}>
                          {current.type}
                        </span>
                        <span className="font-mono text-xs text-slate-500">{current.id}</span>
                      </div>
                      <div className="mt-1 text-lg font-bold text-slate-100">{current.customer}</div>
                      <div className="text-sm text-slate-500">
                        {current.regulator} · generated {clock(current.generatedAt)}
                        {current.caseId && ` · linked to ${current.caseId}`}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}>
                      {STATUS_LABEL[status]}
                    </span>
                  </div>

                  {/* Deadline banner */}
                  <div className={`mt-4 flex items-center justify-between rounded-lg px-4 py-3 ${
                    status === 'overdue'
                      ? 'bg-rose-500/10 ring-1 ring-rose-500/20'
                      : status === 'submitted'
                      ? 'bg-emerald-500/10 ring-1 ring-emerald-500/20'
                      : 'bg-amber-500/10 ring-1 ring-amber-500/20'
                  }`}>
                    <div>
                      <div className="text-xs uppercase text-slate-400">
                        {current.type === 'CTR' ? '15-day' : '30-day'} filing deadline
                      </div>
                      <div className="mt-0.5 text-sm font-semibold text-slate-200">
                        {new Date(current.deadlineAt).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'long', year: 'numeric',
                        })}
                      </div>
                    </div>
                    {status === 'submitted' ? (
                      <span className="text-sm font-semibold text-emerald-300">✓ Filed</span>
                    ) : status === 'overdue' ? (
                      <span className="text-sm font-semibold text-rose-300">{Math.abs(days)}d overdue</span>
                    ) : (
                      <span className="text-sm font-semibold text-amber-300">{days} day{days !== 1 ? 's' : ''} remaining</span>
                    )}
                  </div>
                </Card>

                {/* Pre-populated fields */}
                <Card className="p-5">
                  <div className="mb-3 text-sm font-semibold text-slate-200">
                    Pre-populated from KYC &amp; Transaction Data
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      { label: 'Customer (Originator)', value: current.prePopulated.customerName },
                      { label: 'Beneficiary', value: current.prePopulated.beneficiary },
                      { label: 'Transaction date', value: clock(current.prePopulated.transactionDate) },
                      { label: 'Amount', value: money(current.prePopulated.amount, current.prePopulated.currency) },
                      { label: 'Transaction type', value: current.prePopulated.transactionType.toUpperCase() },
                      { label: 'Channel', value: current.prePopulated.channel },
                      { label: 'Originating country', value: current.prePopulated.originatingCountry },
                      { label: 'Beneficiary country', value: current.prePopulated.beneficiaryCountry },
                      { label: 'Regulator', value: current.regulator },
                      { label: 'Transaction ID', value: current.transactionId },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-lg bg-slate-800/40 p-3">
                        <div className="text-xs uppercase text-slate-500">{label}</div>
                        <div className="mt-0.5 font-medium text-slate-200">{value}</div>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Actions */}
                <Card className="p-4">
                  {status === 'submitted' ? (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-emerald-300">
                        ✓ Submitted to {current.regulator} · ref {current.filingReference}
                      </span>
                      <span className="text-xs text-slate-500">{current.submittedAt && clock(current.submittedAt)}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      {status === 'overdue' && (
                        <span className="text-sm text-rose-300">⚠ Past deadline — submit immediately</span>
                      )}
                      <Button variant="primary" onClick={() => submitReport(current.id)}>
                        Submit to {current.regulator} →
                      </Button>
                    </div>
                  )}
                </Card>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

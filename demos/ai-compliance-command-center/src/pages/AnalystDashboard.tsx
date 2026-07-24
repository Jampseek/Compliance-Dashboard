// Human Oversight Zone — Compliance Analyst Dashboard (React + Supabase).
// The analyst reviews triaged alerts with the GPT-4o explanation, then either
// clears the false positive or escalates to a case (the diagram's Escalate edge).
import { useState } from 'react'
import { useStore } from '../lib/store'
import { Button, Card, Empty, PageHeader, RiskBadge } from '../components/ui'
import { clock, money } from '../lib/format'

export default function AnalystDashboard() {
  const alerts = useStore((s) => s.alerts)
  const clearAlert = useStore((s) => s.clearAlert)
  const escalateAlert = useStore((s) => s.escalateAlert)
  const [selected, setSelected] = useState<string | null>(null)

  const open = alerts
    .filter((a) => a.status === 'triaged' || a.status === 'in_review')
    .sort((a, b) => a.priority - b.priority)

  const current = open.find((a) => a.id === selected) ?? open[0]

  return (
    <div>
      <PageHeader title="Compliance Analyst Dashboard" zone="Human Oversight Zone" />

      {open.length === 0 ? (
        <Empty>Queue is clear. New high-risk alerts will appear here for review.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
          {/* List */}
          <div className="space-y-2">
            {open.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelected(a.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  current?.id === a.id
                    ? 'border-sky-500/50 bg-sky-600/10'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">P{a.priority}</span>
                  <RiskBadge band={a.assessment.band} score={a.assessment.score} />
                </div>
                <div className="mt-1 truncate text-sm text-slate-200">
                  {a.transaction.originator} → {a.transaction.beneficiary}
                </div>
                <div className="text-xs text-slate-500">
                  {money(a.transaction.amount, a.transaction.currency)} · {clock(a.createdAt)}
                </div>
              </button>
            ))}
          </div>

          {/* Detail */}
          {current && (
            <Card className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-semibold text-slate-100">
                    {current.transaction.originator} → {current.transaction.beneficiary}
                  </div>
                  <div className="text-sm text-slate-500">
                    {money(current.transaction.amount, current.transaction.currency)} ·{' '}
                    {current.transaction.type} · {current.transaction.originatorCountry}→
                    {current.transaction.beneficiaryCountry} · {current.transaction.channel}
                  </div>
                </div>
                <RiskBadge band={current.assessment.band} score={current.assessment.score} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-slate-800/40 p-3">
                  <div className="text-xs uppercase text-slate-500">XGBoost model</div>
                  <div className="text-xl font-bold text-slate-200">{current.assessment.modelScore}</div>
                </div>
                <div className="rounded-lg bg-slate-800/40 p-3">
                  <div className="text-xs uppercase text-slate-500">GPT-4o reasoning</div>
                  <div className="text-xl font-bold text-slate-200">{current.assessment.llmScore}</div>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-xs font-semibold uppercase text-slate-500">GPT-4o explanation</div>
                <p className="mt-1 rounded-lg bg-slate-800/30 p-3 text-sm leading-relaxed text-slate-300">
                  {current.assessment.narrative}
                </p>
              </div>

              <div className="mt-4">
                <div className="text-xs font-semibold uppercase text-slate-500">Risk indicators</div>
                <ul className="mt-1 space-y-1">
                  {current.assessment.reasons.map((r, i) => (
                    <li key={i} className="text-sm text-slate-300">
                      • {r}
                    </li>
                  ))}
                </ul>
              </div>

              {current.assessment.screeningHits.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs font-semibold uppercase text-slate-500">Screening hits</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {current.assessment.screeningHits.map((h, i) => (
                      <span
                        key={i}
                        className="rounded bg-rose-500/10 px-2 py-1 text-xs text-rose-300 ring-1 ring-rose-500/20"
                      >
                        {h.list}: {h.matchedName} ({h.score}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <Button variant="danger" onClick={() => escalateAlert(current.id)}>
                  Escalate to case →
                </Button>
                <Button variant="ghost" onClick={() => clearAlert(current.id)}>
                  Clear (false positive)
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

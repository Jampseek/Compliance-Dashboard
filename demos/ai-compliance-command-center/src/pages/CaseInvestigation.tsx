// Human Oversight Zone — Case Investigation + SAR Drafting AI + Human Approval
// Gate + Regulatory Filing. Walks an escalated alert through:
//   open -> draft SAR (GPT-4o) -> human approval -> file with FinCEN/FCA.
import { useState } from 'react'
import { useStore } from '../lib/store'
import { Button, Card, Empty, PageHeader, RiskBadge } from '../components/ui'
import { clock, money } from '../lib/format'
import type { CaseStatus } from '../lib/types'

const statusLabel: Record<CaseStatus, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'text-amber-300 bg-amber-500/10' },
  pending_approval: { label: 'SAR pending approval', cls: 'text-sky-300 bg-sky-500/10' },
  sar_drafted: { label: 'SAR approved', cls: 'text-emerald-300 bg-emerald-500/10' },
  filed: { label: 'Filed', cls: 'text-emerald-300 bg-emerald-500/10' },
  closed_no_action: { label: 'Closed — no action', cls: 'text-slate-400 bg-slate-700/30' },
}

export default function CaseInvestigation() {
  const cases = useStore((s) => s.cases)
  const draftSar = useStore((s) => s.draftSarForCase)
  const approveSar = useStore((s) => s.approveSar)
  const fileSar = useStore((s) => s.fileSar)
  const closeCase = useStore((s) => s.closeCaseNoAction)
  const addNote = useStore((s) => s.addNote)
  const sarDraftingCaseId = useStore((s) => s.sarDraftingCaseId)

  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [regulator, setRegulator] = useState<'FinCEN' | 'FCA'>('FinCEN')

  const current = cases.find((c) => c.id === selected) ?? cases[0]

  if (cases.length === 0) {
    return (
      <div>
        <PageHeader title="Case Investigation" zone="Human Oversight Zone" />
        <Empty>No open cases. Escalate an alert from the Analyst Dashboard to start one.</Empty>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Case Investigation System" zone="Human Oversight Zone" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        {/* List */}
        <div className="space-y-2">
          {cases.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className={`w-full rounded-lg border p-3 text-left transition ${
                current?.id === c.id
                  ? 'border-sky-500/50 bg-sky-600/10'
                  : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-slate-500">{c.id}</span>
                <RiskBadge band={c.alert.assessment.band} score={c.alert.assessment.score} />
              </div>
              <div className="mt-1 truncate text-sm text-slate-200">
                {c.alert.transaction.originator} → {c.alert.transaction.beneficiary}
              </div>
              <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-xs ${statusLabel[c.status].cls}`}>
                {statusLabel[c.status].label}
              </span>
            </button>
          ))}
        </div>

        {/* Detail */}
        {current && (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-xs text-slate-500">{current.id}</div>
                  <div className="text-lg font-semibold text-slate-100">
                    {current.alert.transaction.originator} → {current.alert.transaction.beneficiary}
                  </div>
                  <div className="text-sm text-slate-500">
                    {money(current.alert.transaction.amount, current.alert.transaction.currency)} ·
                    opened by {current.openedBy} · {clock(current.openedAt)}
                  </div>
                </div>
                <span className={`rounded px-2 py-1 text-xs ${statusLabel[current.status].cls}`}>
                  {statusLabel[current.status].label}
                </span>
              </div>

              {/* Investigation notes */}
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase text-slate-500">Investigation notes</div>
                <ul className="mt-1 space-y-1">
                  {current.notes.length === 0 && (
                    <li className="text-sm text-slate-600">No notes yet.</li>
                  )}
                  {current.notes.map((n, i) => (
                    <li key={i} className="rounded bg-slate-800/30 px-3 py-1.5 text-sm text-slate-300">
                      {n}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex gap-2">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        addNote(current.id, note)
                        setNote('')
                      }
                    }}
                    placeholder="Add an investigation note…"
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-sky-500"
                  />
                  <Button
                    onClick={() => {
                      addNote(current.id, note)
                      setNote('')
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </Card>

            {/* SAR drafting + approval gate */}
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-200">SAR Drafting AI · Human Approval Gate</div>
                {!current.sar && (
                  <div className="flex items-center gap-2">
                    <select
                      value={regulator}
                      onChange={(e) => setRegulator(e.target.value as 'FinCEN' | 'FCA')}
                      disabled={sarDraftingCaseId === current.id}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-200 disabled:opacity-40"
                    >
                      <option value="FinCEN">FinCEN (US)</option>
                      <option value="FCA">FCA (UK)</option>
                    </select>
                    <Button
                      variant="primary"
                      disabled={sarDraftingCaseId === current.id}
                      onClick={() => draftSar(current.id, regulator)}
                    >
                      {sarDraftingCaseId === current.id ? (
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          Generating SAR…
                        </span>
                      ) : (
                        'Generate SAR with AI'
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {current.sar && (
                <div className="mt-4">
                  <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-950/70 p-4 text-xs leading-relaxed text-slate-300">
                    {current.sar.narrative}
                  </pre>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {!current.sar.approved ? (
                      <>
                        <span className="text-sm text-amber-300">⚠ Awaiting human approval before filing</span>
                        <Button variant="primary" onClick={() => approveSar(current.id)}>
                          Approve draft
                        </Button>
                      </>
                    ) : current.sar.filedAt ? (
                      <span className="text-sm text-emerald-300">
                        ✓ Filed with {current.sar.regulator} · ref {current.sar.filingReference}
                      </span>
                    ) : (
                      <>
                        <span className="text-sm text-emerald-300">
                          ✓ Approved by {current.sar.approvedBy}
                        </span>
                        <Button variant="primary" onClick={() => fileSar(current.id)}>
                          File with {current.sar.regulator} →
                        </Button>
                      </>
                    )}
                    {current.status !== 'filed' && current.status !== 'closed_no_action' && (
                      <Button variant="ghost" onClick={() => closeCase(current.id)}>
                        Close — no action
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {!current.sar && current.status !== 'closed_no_action' && (
                <div className="mt-3">
                  <Button variant="ghost" onClick={() => closeCase(current.id)}>
                    Close — no action
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

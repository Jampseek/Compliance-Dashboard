// Orchestration Zone — the Azure Service Bus alert queue after Semantic Kernel
// triage. Shows priority ordering and triage summaries.
import { useStore } from '../lib/store'
import { Card, Empty, PageHeader, RiskBadge } from '../components/ui'
import { clock, money } from '../lib/format'

const priorityColor: Record<number, string> = {
  1: 'bg-rose-500/20 text-rose-300 ring-rose-500/30',
  2: 'bg-orange-500/20 text-orange-300 ring-orange-500/30',
  3: 'bg-amber-500/20 text-amber-300 ring-amber-500/30',
  4: 'bg-slate-600/30 text-slate-300 ring-slate-500/30',
  5: 'bg-slate-700/30 text-slate-400 ring-slate-600/30',
}

export default function AlertQueue() {
  const alerts = useStore((s) => s.alerts)
  const queue = alerts
    .filter((a) => a.status === 'triaged' || a.status === 'queued')
    .sort((a, b) => a.priority - b.priority)

  return (
    <div>
      <PageHeader title="Alert Queue" zone="Orchestration Zone · Service Bus + Semantic Kernel" />

      {queue.length === 0 ? (
        <Empty>No alerts in the queue. The feed auto-clears low-risk transactions.</Empty>
      ) : (
        <div className="space-y-3">
          {queue.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1 ${priorityColor[a.priority]}`}
                    title={`Semantic Kernel priority ${a.priority}`}
                  >
                    P{a.priority}
                  </span>
                  <div>
                    <div className="font-medium text-slate-200">
                      {a.transaction.originator} → {a.transaction.beneficiary}
                    </div>
                    <div className="text-xs text-slate-500">
                      {money(a.transaction.amount, a.transaction.currency)} · {a.transaction.type} ·{' '}
                      {a.transaction.originatorCountry}→{a.transaction.beneficiaryCountry} ·{' '}
                      {clock(a.createdAt)}
                    </div>
                    <div className="mt-2 text-sm text-sky-300/90">⚡ {a.triageSummary}</div>
                  </div>
                </div>
                <RiskBadge band={a.assessment.band} score={a.assessment.score} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

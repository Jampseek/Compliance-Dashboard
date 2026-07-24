// AI Detection Zone — live view of the Event Hubs feed flowing through the
// GPT-4o + XGBoost risk engine and Comply Advantage screening.
import { useStore } from '../lib/store'
import { Card, PageHeader, RiskBadge, Stat } from '../components/ui'
import { assess } from '../lib/riskEngine'
import { screen } from '../lib/screening'
import { clock, money } from '../lib/format'

export default function ScreeningMonitor() {
  const transactions = useStore((s) => s.transactions)
  const stats = useStore((s) => s.stats)

  // Recompute the live assessment for display (deterministic for a given txn).
  const rows = transactions.slice(0, 40).map((t) => {
    const a = assess(t, screen(t))
    return { t, a }
  })

  const clearRate = stats.ingested ? Math.round((stats.autoCleared / stats.ingested) * 100) : 0

  return (
    <div>
      <PageHeader title="Screening Monitor" zone="AI Detection Zone" />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Ingested" value={stats.ingested} sub="via Event Hubs" />
        <Stat label="Auto-cleared" value={stats.autoCleared} accent="text-emerald-400" sub={`${clearRate}% of volume`} />
        <Stat
          label="Flagged"
          value={stats.ingested - stats.autoCleared}
          accent="text-amber-400"
          sub="routed to Service Bus"
        />
        <Stat label="Engine" value="GPT-4o + XGBoost" accent="text-sky-400" sub="0.6 / 0.4 fusion" />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-300">
          Live transaction stream
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-900 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Time</th>
                <th className="px-4 py-2">Txn</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">Route</th>
                <th className="px-4 py-2">Risk</th>
                <th className="px-4 py-2">Screening</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ t, a }) => (
                <tr key={t.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{clock(t.timestamp)}</td>
                  <td className="px-4 py-2">
                    <div className="text-slate-300">
                      {t.originator} → {t.beneficiary}
                    </div>
                    <div className="text-xs text-slate-500">
                      {t.type} · {t.originatorCountry}→{t.beneficiaryCountry} · {t.channel}
                    </div>
                  </td>
                  <td className="px-4 py-2 font-mono text-slate-300">{money(t.amount, t.currency)}</td>
                  <td className="px-4 py-2">
                    {a.band === 'low' ? (
                      <span className="text-xs text-emerald-400">auto-cleared</span>
                    ) : (
                      <span className="text-xs text-amber-400">→ alert queue</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <RiskBadge band={a.band} score={a.score} />
                  </td>
                  <td className="px-4 py-2">
                    {a.screeningHits.length === 0 ? (
                      <span className="text-xs text-slate-600">clear</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {a.screeningHits.map((h, i) => (
                          <span
                            key={i}
                            className="rounded bg-rose-500/10 px-1.5 py-0.5 text-xs text-rose-300 ring-1 ring-rose-500/20"
                          >
                            {h.list}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

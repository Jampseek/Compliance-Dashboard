// Governance Zone — Executive Dashboard (Power BI + React). Program KPIs and
// trend charts fed from the audit store and live pipeline state.
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useStore } from '../lib/store'
import { Card, PageHeader, Stat } from '../components/ui'

const BAND_COLORS = { low: '#34d399', medium: '#fbbf24', high: '#fb7185' }

export default function ExecutiveDashboard() {
  const stats = useStore((s) => s.stats)
  const alerts = useStore((s) => s.alerts)
  const cases = useStore((s) => s.cases)

  const bandData = (['high', 'medium', 'low'] as const).map((b) => ({
    name: b,
    value: alerts.filter((a) => a.assessment.band === b).length,
  }))

  const filed = cases.filter((c) => c.status === 'filed').length
  const pending = cases.filter((c) => c.status === 'pending_approval').length

  const funnel = [
    { stage: 'Ingested', count: stats.ingested },
    { stage: 'Flagged', count: alerts.length },
    { stage: 'Escalated', count: cases.length },
    { stage: 'SAR filed', count: filed },
  ]

  const clearRate = stats.ingested ? Math.round((stats.autoCleared / stats.ingested) * 100) : 0
  const escalationRate = alerts.length ? Math.round((cases.length / alerts.length) * 100) : 0

  return (
    <div>
      <PageHeader title="Executive Dashboard" zone="Governance Zone · Power BI + React" />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Transactions screened" value={stats.ingested} sub="this session" />
        <Stat label="Auto-clear rate" value={`${clearRate}%`} accent="text-emerald-400" sub="analyst load avoided" />
        <Stat label="Escalation rate" value={`${escalationRate}%`} accent="text-amber-400" sub="alerts → cases" />
        <Stat label="SARs filed" value={filed} accent="text-sky-400" sub={`${pending} pending approval`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 text-sm font-semibold text-slate-200">Compliance funnel</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={funnel}>
              <XAxis dataKey="stage" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                labelStyle={{ color: '#e2e8f0' }}
              />
              <Bar dataKey="count" fill="#38bdf8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <div className="mb-4 text-sm font-semibold text-slate-200">Alert risk distribution</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={bandData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={3}>
                {bandData.map((d) => (
                  <Cell key={d.name} fill={BAND_COLORS[d.name]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                labelStyle={{ color: '#e2e8f0' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 flex justify-center gap-4 text-xs">
            {bandData.map((d) => (
              <span key={d.name} className="flex items-center gap-1 capitalize text-slate-400">
                <span className="h-2 w-2 rounded-full" style={{ background: BAND_COLORS[d.name] }} />
                {d.name}: {d.value}
              </span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

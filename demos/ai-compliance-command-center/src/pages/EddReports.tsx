// Human Oversight Zone — EDD Reports.
// Displays all Enhanced Due Diligence reports generated from adverse media hits.
// AI produces the EDD draft from multi-source OSINT; the analyst approves before action.
import { useState } from 'react'
import { useStore } from '../lib/store'
import { Button, Card, Empty, PageHeader, Stat } from '../components/ui'
import { clock, timeAgo } from '../lib/format'
import type { EddRiskRating, OsintSourceType } from '../lib/types'

const RATING_STYLE: Record<EddRiskRating, string> = {
  critical: 'bg-rose-500/15 text-rose-200 ring-rose-500/30',
  high:     'bg-orange-500/10 text-orange-300 ring-orange-500/20',
  medium:   'bg-amber-500/10 text-amber-300 ring-amber-500/20',
  low:      'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20',
}

const OSINT_SOURCE_LABEL: Record<OsintSourceType, string> = {
  corporate_registry:    'Corporate Registry',
  beneficial_ownership:  'Beneficial Ownership',
  court_records:         'Court Records',
  social_media:          'Social Media',
  regulatory_filings:    'Regulatory Filings',
  pep_database:          'PEP Database',
  sanctions_cross_check: 'Sanctions Cross-check',
  news_aggregator:       'News Aggregator',
}

const RELEVANCE_DOT: Record<string, string> = {
  high:   'bg-rose-400',
  medium: 'bg-amber-400',
  low:    'bg-slate-500',
}

export default function EddReports() {
  const eddReports   = useStore((s) => s.eddReports)
  const approveEdd   = useStore((s) => s.approveEdd)
  const mediaHits    = useStore((s) => s.mediaHits)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<'narrative' | 'osint'>('narrative')
  const [ratingFilter, setRatingFilter] = useState<EddRiskRating | 'all'>('all')

  const filtered = ratingFilter === 'all'
    ? eddReports
    : eddReports.filter((r) => r.riskRating === ratingFilter)

  const current = filtered.find((r) => r.id === selectedId) ?? filtered[0]

  const criticalCount  = eddReports.filter((r) => r.riskRating === 'critical').length
  const highCount      = eddReports.filter((r) => r.riskRating === 'high').length
  const pendingCount   = eddReports.filter((r) => r.status === 'draft').length
  const approvedCount  = eddReports.filter((r) => r.status === 'approved').length

  return (
    <div>
      <PageHeader title="EDD Reports" zone="Human Oversight">
        <span className="flex items-center gap-1.5 rounded-lg bg-sky-600/10 px-3 py-1.5 text-xs font-medium text-sky-300 ring-1 ring-sky-500/20">
          AI drafts · human approves
        </span>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Total reports"   value={eddReports.length}  sub="generated from OSINT" />
        <Stat label="Critical"        value={criticalCount}       accent="text-rose-400"    sub="immediate action required" />
        <Stat label="High"            value={highCount}           accent="text-orange-400"  sub="elevated risk" />
        <Stat label="Awaiting review" value={pendingCount}        accent="text-amber-400"   sub={`${approvedCount} approved`} />
      </div>

      {eddReports.length === 0 ? (
        <Empty>
          No EDD reports yet. Escalate an adverse media hit and click "Generate EDD — run OSINT" to produce the first report.
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          {/* List */}
          <div className="space-y-2">
            {/* Rating filter */}
            <div className="flex gap-1 rounded-lg bg-slate-900/60 p-1">
              {(['all', 'critical', 'high', 'medium', 'low'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setRatingFilter(f)}
                  className={`flex-1 rounded px-1.5 py-1 text-xs font-medium transition ${
                    ratingFilter === f
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            <div className="max-h-[65vh] space-y-1.5 overflow-y-auto pr-0.5">
              {filtered.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-600">No reports in this filter.</p>
              )}
              {filtered.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setSelectedId(r.id); setTab('narrative') }}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    current?.id === r.id
                      ? 'border-sky-500/50 bg-sky-600/10'
                      : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-200">
                      {r.entityName}
                    </span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ring-1 ${RATING_STYLE[r.riskRating]}`}>
                      {r.riskRating.toUpperCase()}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className={`text-xs ${r.status === 'approved' ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {r.status === 'approved' ? '✓ Approved' : 'Draft'}
                    </span>
                    <span className="text-xs text-slate-600">{timeAgo(r.initiatedAt)}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    {r.osintFindings.length} sources · {r.osintFindings.filter((f) => f.riskRelevance === 'high').length} high-relevance
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Detail */}
          {current && (() => {
            const triggerHit = mediaHits.find((h) => h.id === current.mediaHitId)
            return (
              <Card className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-mono text-xs text-slate-500">{current.id}</div>
                    <div className="mt-1 text-lg font-bold text-slate-100">{current.entityName}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Generated {clock(current.initiatedAt)} · {timeAgo(current.initiatedAt)} by {current.initiatedBy}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded px-2 py-1 text-xs font-semibold ring-1 ${RATING_STYLE[current.riskRating]}`}>
                    {current.riskRating.toUpperCase()}
                  </span>
                </div>

                {/* Triggering media hit reference */}
                {triggerHit && (
                  <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                    <div className="text-xs font-semibold uppercase text-slate-500">Triggering adverse media</div>
                    <p className="mt-1 text-sm text-slate-300">{triggerHit.headline}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {triggerHit.source} · {triggerHit.category.replace('_', ' ')} · {triggerHit.confidence}% NLP confidence
                    </p>
                  </div>
                )}

                {/* OSINT stats */}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {(['high', 'medium', 'low'] as const).map((rel) => {
                    const count = current.osintFindings.filter((f) => f.riskRelevance === rel).length
                    return (
                      <div key={rel} className="rounded-lg bg-slate-800/40 p-3 text-center">
                        <div className={`text-lg font-bold ${rel === 'high' ? 'text-rose-400' : rel === 'medium' ? 'text-amber-400' : 'text-slate-400'}`}>
                          {count}
                        </div>
                        <div className="text-xs text-slate-500 capitalize">{rel} relevance</div>
                      </div>
                    )
                  })}
                </div>

                {/* Tab switcher */}
                <div className="mt-4 flex gap-0 border-b border-slate-800">
                  {(['narrative', 'osint'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`px-4 pb-2 text-sm font-medium transition border-b-2 ${
                        tab === t
                          ? 'border-sky-400 text-sky-300'
                          : 'border-transparent text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {t === 'narrative' ? 'AI Narrative' : `OSINT Findings (${current.osintFindings.length})`}
                    </button>
                  ))}
                </div>

                <div className="mt-4">
                  {tab === 'narrative' && (
                    <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-300">
                      {current.narrative}
                    </pre>
                  )}

                  {tab === 'osint' && (
                    <div className="max-h-80 space-y-2 overflow-y-auto">
                      {current.osintFindings.map((f, i) => (
                        <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${RELEVANCE_DOT[f.riskRelevance]}`} />
                            <span className="text-xs font-semibold text-slate-300">{f.source}</span>
                            <span className="text-xs text-slate-600">·</span>
                            <span className="text-xs text-slate-500">{OSINT_SOURCE_LABEL[f.sourceType]}</span>
                            <span className="ml-auto shrink-0 text-xs text-slate-600">{f.confidence}% confidence</span>
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{f.finding}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Approval gate */}
                <div className="mt-5 border-t border-slate-800 pt-4">
                  {current.status === 'draft' && (
                    <div className="flex items-start gap-3">
                      <div className="flex-1 rounded-lg bg-amber-500/5 px-3 py-2 text-xs text-amber-200 ring-1 ring-amber-500/15">
                        AI-drafted EDD — human approval required before compliance action can be taken. Review the narrative and OSINT findings above.
                      </div>
                      <Button variant="primary" onClick={() => approveEdd(current.id)}>
                        Approve EDD
                      </Button>
                    </div>
                  )}
                  {current.status === 'approved' && (
                    <div className="flex items-center gap-2 text-sm text-emerald-300">
                      <span>✓ Approved by {current.approvedBy}</span>
                      {current.approvedAt && (
                        <span className="text-xs text-slate-500">· {timeAgo(current.approvedAt)}</span>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )
          })()}
        </div>
      )}
    </div>
  )
}

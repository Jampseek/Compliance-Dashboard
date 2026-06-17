// AI Detection Zone — Adverse Media Monitor.
// An NLP engine continuously scans global news sources, regulatory announcements,
// and court records for negative mentions of known customer entities.
// Hits appear here in real-time for analyst review, replacing periodic manual
// re-screening with continuous, event-driven monitoring.
import { useState } from 'react'
import { useStore } from '../lib/store'
import { Button, Card, Empty, PageHeader, Stat } from '../components/ui'
import { clock, timeAgo } from '../lib/format'
import type { AdverseMediaHit, MediaCategory, MediaHitStatus } from '../lib/types'

const CATEGORY_STYLE: Record<MediaCategory, string> = {
  fraud: 'bg-rose-500/10 text-rose-300 ring-rose-500/20',
  corruption: 'bg-orange-500/10 text-orange-300 ring-orange-500/20',
  sanctions: 'bg-rose-500/15 text-rose-200 ring-rose-500/25',
  money_laundering: 'bg-amber-500/10 text-amber-300 ring-amber-500/20',
  legal: 'bg-slate-500/10 text-slate-300 ring-slate-500/20',
  regulatory: 'bg-sky-500/10 text-sky-300 ring-sky-500/20',
}

const STATUS_STYLE: Record<MediaHitStatus, string> = {
  new: 'bg-rose-500/10 text-rose-300',
  under_review: 'bg-amber-500/10 text-amber-300',
  dismissed: 'bg-slate-700/40 text-slate-500',
  escalated: 'bg-emerald-500/10 text-emerald-300',
}

const STATUS_LABEL: Record<MediaHitStatus, string> = {
  new: 'New',
  under_review: 'Under review',
  dismissed: 'Dismissed',
  escalated: 'Escalated',
}

function CategoryBadge({ category }: { category: MediaCategory }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ring-1 ${CATEGORY_STYLE[category]}`}
    >
      {category.replace('_', ' ')}
    </span>
  )
}

function ConfidenceMeter({ value }: { value: number }) {
  const color = value >= 80 ? 'bg-rose-500' : value >= 65 ? 'bg-amber-500' : 'bg-sky-500'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-slate-800">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-8 text-right text-xs text-slate-400">{value}%</span>
    </div>
  )
}

export default function AdverseMediaMonitor() {
  const mediaHits = useStore((s) => s.mediaHits)
  const reviewMediaHit = useStore((s) => s.reviewMediaHit)
  const dismissMediaHit = useStore((s) => s.dismissMediaHit)
  const escalateMediaHit = useStore((s) => s.escalateMediaHit)

  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState<MediaHitStatus | 'all'>('all')

  const filtered =
    filter === 'all' ? mediaHits : mediaHits.filter((h) => h.status === filter)

  const current: AdverseMediaHit | undefined =
    filtered.find((h) => h.id === selected) ?? filtered[0]

  const newCount = mediaHits.filter((h) => h.status === 'new').length
  const reviewCount = mediaHits.filter((h) => h.status === 'under_review').length
  const escalatedCount = mediaHits.filter((h) => h.status === 'escalated').length
  const dismissedCount = mediaHits.filter((h) => h.status === 'dismissed').length

  return (
    <div>
      <PageHeader title="Adverse Media Monitor" zone="AI Detection Zone">
        <span className="flex items-center gap-1.5 rounded-lg bg-emerald-600/10 px-3 py-1.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/20">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          NLP scanner live
        </span>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Total detected" value={mediaHits.length} sub="across all sources" />
        <Stat label="New" value={newCount} accent="text-rose-400" sub="awaiting review" />
        <Stat label="Under review" value={reviewCount} accent="text-amber-400" sub="in progress" />
        <Stat label="Escalated" value={escalatedCount} accent="text-emerald-400" sub={`${dismissedCount} dismissed`} />
      </div>

      {mediaHits.length === 0 ? (
        <Empty>No adverse media hits yet. The NLP scanner will surface matches as transactions are ingested.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
          {/* Hit list */}
          <div className="space-y-2">
            {/* Filter tabs */}
            <div className="flex gap-1 rounded-lg bg-slate-900/60 p-1">
              {(['all', 'new', 'under_review', 'escalated', 'dismissed'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`flex-1 rounded px-2 py-1 text-xs font-medium transition ${
                    filter === f
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f === 'all' ? 'All' : STATUS_LABEL[f]}
                </button>
              ))}
            </div>

            <div className="max-h-[65vh] space-y-1.5 overflow-y-auto pr-0.5">
              {filtered.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-600">No hits in this filter.</p>
              )}
              {filtered.map((h) => (
                <button
                  key={h.id}
                  onClick={() => setSelected(h.id)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    current?.id === h.id
                      ? 'border-sky-500/50 bg-sky-600/10'
                      : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-200">
                      {h.entityName}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[h.status]}`}
                    >
                      {STATUS_LABEL[h.status]}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">
                    {h.headline}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <CategoryBadge category={h.category} />
                    <span className="text-xs text-slate-600">{timeAgo(h.detectedAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Detail panel */}
          {current && (
            <Card className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-mono text-xs text-slate-500">{current.id}</div>
                  <div className="mt-1 text-lg font-bold text-slate-100">{current.entityName}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Detected {clock(current.detectedAt)} · {timeAgo(current.detectedAt)}
                  </div>
                </div>
                <span className={`shrink-0 rounded px-2 py-1 text-xs ${STATUS_STYLE[current.status]}`}>
                  {STATUS_LABEL[current.status]}
                </span>
              </div>

              {/* Headline */}
              <div className="mt-5 rounded-lg border border-slate-700 bg-slate-950/60 p-4">
                <div className="text-xs font-semibold uppercase text-slate-500">Headline</div>
                <p className="mt-1 text-sm leading-relaxed text-slate-200">{current.headline}</p>
              </div>

              {/* Metadata grid */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-800/40 p-3">
                  <div className="text-xs uppercase text-slate-500">Source</div>
                  <div className="mt-1 text-sm font-semibold text-slate-200">{current.source}</div>
                  {current.url && (
                    <a
                      href={current.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block truncate text-xs text-sky-400 hover:text-sky-300 hover:underline"
                    >
                      {current.url}
                    </a>
                  )}
                </div>
                <div className="rounded-lg bg-slate-800/40 p-3">
                  <div className="text-xs uppercase text-slate-500">Category</div>
                  <div className="mt-1.5">
                    <CategoryBadge category={current.category} />
                  </div>
                </div>
                <div className="rounded-lg bg-slate-800/40 p-3">
                  <div className="text-xs uppercase text-slate-500">Sentiment</div>
                  <div
                    className={`mt-1 text-sm font-semibold ${
                      current.sentiment === 'highly_negative' ? 'text-rose-300' : 'text-amber-300'
                    }`}
                  >
                    {current.sentiment === 'highly_negative' ? 'Highly negative' : 'Negative'}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-800/40 p-3">
                  <div className="mb-2 text-xs uppercase text-slate-500">NLP confidence</div>
                  <ConfidenceMeter value={current.confidence} />
                </div>
              </div>

              {current.reviewedBy && (
                <p className="mt-3 text-xs text-slate-500">
                  Actioned by <span className="text-slate-300">{current.reviewedBy}</span>
                </p>
              )}

              {/* Actions */}
              <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-800 pt-4">
                {current.status === 'new' && (
                  <Button variant="default" onClick={() => reviewMediaHit(current.id)}>
                    Mark under review
                  </Button>
                )}
                {(current.status === 'new' || current.status === 'under_review') && (
                  <>
                    <Button variant="primary" onClick={() => escalateMediaHit(current.id)}>
                      Escalate — open CDD review
                    </Button>
                    <Button variant="ghost" onClick={() => dismissMediaHit(current.id)}>
                      Dismiss — false positive
                    </Button>
                  </>
                )}
                {current.status === 'escalated' && (
                  <span className="text-sm text-emerald-300">
                    ✓ Escalated for Customer Due Diligence review
                  </span>
                )}
                {current.status === 'dismissed' && (
                  <span className="text-sm text-slate-500">Dismissed as false positive</span>
                )}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

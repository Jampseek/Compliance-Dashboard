// AI Detection Zone — Adverse Media Monitor.
// An NLP engine continuously scans global news sources, regulatory announcements,
// and court records for negative mentions of known customer entities.
// Hits appear here in real-time for analyst review, replacing periodic manual
// re-screening with continuous, event-driven monitoring.
// EDD Integration: escalated hits can trigger OSINT collection + AI-drafted EDD reports.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { Button, Card, Empty, PageHeader, Stat } from '../components/ui'
import { clock, timeAgo } from '../lib/format'
import type { AdverseMediaHit, EddReport, EddRiskRating, MediaCategory, MediaHitStatus, OsintSourceType } from '../lib/types'

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

// ── Sandboxed URL viewer ──────────────────────────────────────────────────────
// Opens external URLs inside a locked-down iframe to protect against malicious
// redirects, popups, and top-level navigation. Sandbox attributes deny:
//   - Top-level navigation  (no allow-top-navigation)
//   - Popups / new windows  (no allow-popups)
//   - Form submission       (no allow-forms)
//   - Plugins               (implicit)
// Scripts and same-origin are permitted so modern news sites can render.
//
// Many sites set X-Frame-Options: DENY or CSP frame-ancestors, which prevents
// iframe embedding regardless of sandbox. We detect this via a load timeout
// and show a clear error state with the "Open in browser" CTA promoted.
function SandboxedViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'blocked'>('loading')
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    setStatus('loading')
    // If the iframe hasn't fired onLoad within 6s, assume the site blocked embedding.
    timeoutRef.current = window.setTimeout(() => setStatus('blocked'), 6000)
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    }
  }, [url])

  function handleLoad() {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    setStatus('loaded')
  }

  function handleError() {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    setStatus('blocked')
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-800 bg-slate-900 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-300 ring-1 ring-amber-500/20">
              Sandboxed
            </span>
            <span className="truncate font-mono text-xs text-slate-400">{url}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Protected sandbox — top-level navigation, popups, and form submission blocked
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500 hover:text-slate-100"
          >
            Open in browser ↗
          </a>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
          >
            Close
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="relative flex-1 overflow-hidden">
        {/* Loading state */}
        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-sky-400" />
            <p className="text-sm text-slate-400">Loading sandboxed content…</p>
          </div>
        )}

        {/* Blocked / error state */}
        {status === 'blocked' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950 p-8 text-center">
            <div className="rounded-full bg-amber-500/10 p-4">
              <svg className="h-8 w-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="text-base font-semibold text-slate-200">Site cannot be embedded</p>
              <p className="mt-1 max-w-sm text-sm text-slate-400">
                This source has set <code className="rounded bg-slate-800 px-1 text-xs text-amber-300">X-Frame-Options</code> or
                a Content Security Policy that blocks iframe embedding — a common security measure on news and regulatory sites.
              </p>
            </div>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
            >
              Open in browser ↗
            </a>
            <p className="text-xs text-slate-600">Opens with noopener noreferrer in a new tab</p>
          </div>
        )}

        {/* Sandboxed iframe — always mounted so onLoad/onError fire */}
        <iframe
          src={url}
          title="Sandboxed external content"
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
          onLoad={handleLoad}
          onError={handleError}
          className={`h-full w-full border-0 bg-white ${status !== 'loaded' ? 'invisible' : ''}`}
        />
      </div>
    </div>
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

// ── EDD components ────────────────────────────────────────────────────────────

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

const EDD_RATING_STYLE: Record<EddRiskRating, string> = {
  critical: 'bg-rose-500/15 text-rose-200 ring-rose-500/30',
  high:     'bg-orange-500/10 text-orange-300 ring-orange-500/20',
  medium:   'bg-amber-500/10 text-amber-300 ring-amber-500/20',
  low:      'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20',
}

const RELEVANCE_DOT: Record<string, string> = {
  high:   'bg-rose-400',
  medium: 'bg-amber-400',
  low:    'bg-slate-500',
}

function EddPanel({ report, onApprove }: { report: EddReport; onApprove: () => void }) {
  const [tab, setTab] = useState<'narrative' | 'osint'>('narrative')

  const highCount   = report.osintFindings.filter((f) => f.riskRelevance === 'high').length
  const mediumCount = report.osintFindings.filter((f) => f.riskRelevance === 'medium').length

  return (
    <div className="mt-5 rounded-xl border border-sky-500/20 bg-sky-950/20">
      {/* EDD header */}
      <div className="flex items-center justify-between gap-3 border-b border-sky-500/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-sky-400">EDD Report</span>
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ring-1 ${EDD_RATING_STYLE[report.riskRating]}`}>
            {report.riskRating.toUpperCase()}
          </span>
          {report.status === 'approved' && (
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/20">
              ✓ Approved
            </span>
          )}
          {report.status === 'draft' && (
            <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-300 ring-1 ring-amber-500/20">
              Draft — awaiting approval
            </span>
          )}
        </div>
        <span className="text-xs text-slate-500">
          {report.osintFindings.length} sources · {highCount} high · {mediumCount} medium
        </span>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-0 border-b border-sky-500/10 px-4 pt-2">
        {(['narrative', 'osint'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 pb-2 text-xs font-medium transition border-b-2 ${
              tab === t
                ? 'border-sky-400 text-sky-300'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {t === 'narrative' ? 'AI Narrative' : `OSINT Findings (${report.osintFindings.length})`}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === 'narrative' && (
          <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-300">
            {report.narrative}
          </pre>
        )}

        {tab === 'osint' && (
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {report.osintFindings.map((f, i) => (
              <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${RELEVANCE_DOT[f.riskRelevance]}`} />
                  <span className="text-xs font-semibold text-slate-300">{f.source}</span>
                  <span className="text-xs text-slate-600">·</span>
                  <span className="text-xs text-slate-500">{OSINT_SOURCE_LABEL[f.sourceType]}</span>
                  <span className="ml-auto text-xs text-slate-600">{f.confidence}% confidence</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{f.finding}</p>
              </div>
            ))}
          </div>
        )}

        {report.status === 'draft' && (
          <div className="mt-4 flex items-center gap-3 border-t border-sky-500/10 pt-3">
            <div className="flex-1 rounded-lg bg-amber-500/5 px-3 py-2 text-xs text-amber-200 ring-1 ring-amber-500/15">
              AI-drafted EDD — review findings before approving. Approval confirms this report is accurate and authorises compliance action.
            </div>
            <Button variant="primary" onClick={onApprove}>
              Approve EDD
            </Button>
          </div>
        )}

        {report.status === 'approved' && report.approvedBy && (
          <p className="mt-3 text-xs text-slate-500 border-t border-sky-500/10 pt-3">
            Approved by <span className="text-slate-300">{report.approvedBy}</span>
            {report.approvedAt && ` · ${timeAgo(report.approvedAt)}`}
          </p>
        )}
      </div>
    </div>
  )
}

export default function AdverseMediaMonitor() {
  const mediaHits = useStore((s) => s.mediaHits)
  const reviewMediaHit = useStore((s) => s.reviewMediaHit)
  const dismissMediaHit = useStore((s) => s.dismissMediaHit)
  const escalateMediaHit = useStore((s) => s.escalateMediaHit)
  const eddReports = useStore((s) => s.eddReports)
  const generateEdd = useStore((s) => s.generateEdd)
  const approveEdd = useStore((s) => s.approveEdd)
  const eddDraftingHitId = useStore((s) => s.eddDraftingHitId)

  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState<MediaHitStatus | 'all'>('all')
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null)

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
      {sandboxUrl && <SandboxedViewer url={sandboxUrl} onClose={() => setSandboxUrl(null)} />}
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
          {current && (() => {
            const edd = eddReports.find((r) => r.mediaHitId === current.id)
            const isGenerating = eddDraftingHitId === current.id
            return (
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
                      <button
                        onClick={() => setSandboxUrl(current.url)}
                        className="mt-1 block truncate text-xs text-sky-400 hover:text-sky-300 hover:underline text-left"
                      >
                        {current.url}
                      </button>
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
                  {current.status === 'escalated' && !edd && !isGenerating && (
                    <>
                      <span className="flex items-center text-sm text-emerald-300">
                        ✓ Escalated for Customer Due Diligence review
                      </span>
                      <Button
                        variant="primary"
                        onClick={() => generateEdd(current.id)}
                      >
                        Generate EDD — run OSINT
                      </Button>
                    </>
                  )}
                  {current.status === 'escalated' && isGenerating && (
                    <div className="flex items-center gap-2 text-sm text-sky-300">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-sky-400" />
                      Collecting OSINT &amp; drafting EDD…
                    </div>
                  )}
                  {current.status === 'escalated' && edd && !isGenerating && (
                    <span className="text-sm text-sky-300">
                      ✓ EDD generated — review below
                    </span>
                  )}
                  {current.status === 'dismissed' && (
                    <span className="text-sm text-slate-500">Dismissed as false positive</span>
                  )}
                </div>

                {/* EDD panel — shown when an EDD report exists for this hit */}
                {edd && (
                  <EddPanel
                    report={edd}
                    onApprove={() => approveEdd(edd.id)}
                  />
                )}
              </Card>
            )
          })()}
        </div>
      )}
    </div>
  )
}

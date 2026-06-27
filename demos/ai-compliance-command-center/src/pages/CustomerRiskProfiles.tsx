// Human Oversight / Governance — Perpetual KYC Customer Risk Profiles.
//
// Profiles are NOT computed at render time. They are maintained in the store
// and updated reactively by every compliance event:
//   transaction ingestion  → sets/raises risk tier from transaction risk band
//   adverse media hit      → raises tier to ≥ Medium on detection, ≥ High on escalation
//   EDD approval           → raises tier based on EDD risk rating
//   human review           → the only mechanism that can LOWER a tier
//
// Review cadence enforced by tier:
//   Critical → 30 days   High → 90 days   Medium → 180 days   Low → 365 days
import { useState } from 'react'
import { useStore } from '../lib/store'
import { Button, Card, Empty, PageHeader, Stat } from '../components/ui'
import { clock, timeAgo } from '../lib/format'
import type { CustomerProfile, CustomerRiskTier } from '../lib/types'

// ── Styles ────────────────────────────────────────────────────────────────────

const TIER_STYLE: Record<CustomerRiskTier, string> = {
  critical: 'bg-rose-500/15 text-rose-200 ring-rose-500/30',
  high:     'bg-orange-500/10 text-orange-300 ring-orange-500/20',
  medium:   'bg-amber-500/10 text-amber-300 ring-amber-500/20',
  low:      'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20',
}

const TIER_BAR: Record<CustomerRiskTier, string> = {
  critical: 'bg-rose-500',
  high:     'bg-orange-500',
  medium:   'bg-amber-500',
  low:      'bg-emerald-500',
}

const TIER_ORDER: CustomerRiskTier[] = ['critical', 'high', 'medium', 'low']

function TierBadge({ tier }: { tier: CustomerRiskTier }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ring-1 ${TIER_STYLE[tier]}`}>
      {tier.toUpperCase()}
    </span>
  )
}

function ReviewDueLabel({ isoDate }: { isoDate: string }) {
  const due  = new Date(isoDate).getTime()
  const now  = Date.now()
  const overdue = due < now
  const days = Math.abs(Math.round((due - now) / 86_400_000))
  return overdue ? (
    <span className="text-xs font-semibold text-rose-400">
      Overdue by {days}d
    </span>
  ) : (
    <span className="text-xs text-slate-400">
      Due in {days}d ({clock(isoDate)})
    </span>
  )
}

// ── Detail panel ─────────────────────────────────────────────────────────────

function CustomerDetail({
  profile,
  onReview,
}: {
  profile: CustomerProfile
  onReview: (newTier: CustomerRiskTier) => void
}) {
  const [selectedTier, setSelectedTier] = useState<CustomerRiskTier>(profile.riskTier)
  const isOverdue = new Date(profile.nextReviewDue).getTime() < Date.now()

  return (
    <Card className="p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs text-slate-500">{profile.id}</div>
          <div className="mt-1 text-lg font-bold text-slate-100">{profile.name}</div>
          <div className="mt-1 text-xs text-slate-500">
            First seen {clock(profile.firstSeenAt)} · Last event {timeAgo(profile.lastEventAt)}
          </div>
        </div>
        <TierBadge tier={profile.riskTier} />
      </div>

      {/* Review status bar */}
      <div
        className={`mt-4 flex items-center justify-between rounded-lg px-4 py-3 ${
          isOverdue
            ? 'bg-rose-500/10 ring-1 ring-rose-500/20'
            : 'bg-slate-800/40'
        }`}
      >
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500">Next review due</div>
          <div className="mt-0.5">
            <ReviewDueLabel isoDate={profile.nextReviewDue} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold uppercase text-slate-500">Last reviewed</div>
          <div className="mt-0.5 text-xs text-slate-400">
            {profile.lastReviewedAt
              ? `${timeAgo(profile.lastReviewedAt)} by ${profile.lastReviewedBy}`
              : 'Never'}
          </div>
        </div>
      </div>

      {/* Risk metrics */}
      <div className="mt-4 grid grid-cols-4 gap-2">
        {[
          { label: 'Transactions', value: profile.totalTransactions, color: 'text-slate-200' },
          { label: 'Alerts',       value: profile.totalAlerts,       color: profile.totalAlerts > 0 ? 'text-amber-300' : 'text-slate-200' },
          { label: 'Media hits',   value: profile.totalMediaHits,    color: profile.totalMediaHits > 0 ? 'text-orange-300' : 'text-slate-200' },
          { label: 'Sanctions',    value: profile.sanctionsHits,     color: profile.sanctionsHits > 0 ? 'text-rose-300' : 'text-slate-200' },
        ].map((m) => (
          <div key={m.label} className="rounded-lg bg-slate-800/40 p-3 text-center">
            <div className={`text-xl font-bold ${m.color}`}>{m.value}</div>
            <div className="mt-0.5 text-xs text-slate-500">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Tier history timeline */}
      <div className="mt-5">
        <div className="mb-2 text-xs font-semibold uppercase text-slate-500">
          Risk tier history
        </div>
        {profile.tierHistory.length === 0 ? (
          <p className="text-xs text-slate-600">No tier changes recorded — profile at initial Low tier.</p>
        ) : (
          <div className="max-h-52 space-y-1.5 overflow-y-auto">
            {profile.tierHistory.map((e, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg bg-slate-900/60 px-3 py-2">
                <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
                  <TierBadge tier={e.fromTier} />
                  <span className="text-xs text-slate-600">→</span>
                  <TierBadge tier={e.toTier} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-slate-300">{e.trigger}</p>
                  <p className="text-xs text-slate-600">{timeAgo(e.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Human review gate */}
      <div className="mt-5 border-t border-slate-800 pt-4">
        <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Mark as reviewed</div>
        <p className="mb-3 text-xs text-slate-500">
          Automated events can only raise the risk tier. A human review is required to confirm or
          downgrade it. This action is logged to the immutable audit trail.
        </p>
        <div className="flex items-center gap-2">
          <select
            value={selectedTier}
            onChange={(e) => setSelectedTier(e.target.value as CustomerRiskTier)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            {TIER_ORDER.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
          <Button variant="primary" onClick={() => onReview(selectedTier)}>
            Confirm review
          </Button>
          {isOverdue && (
            <span className="text-xs text-rose-400">Review overdue — action required</span>
          )}
        </div>
      </div>
    </Card>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

const REVIEW_DAYS: Record<CustomerRiskTier, number> = {
  critical: 30, high: 90, medium: 180, low: 365,
}

export default function CustomerRiskProfiles() {
  const customers      = useStore((s) => s.customers)
  const reviewCustomer = useStore((s) => s.reviewCustomer)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tierFilter, setTierFilter] = useState<CustomerRiskTier | 'all' | 'overdue'>('all')

  const now = Date.now()

  const sorted = [...customers].sort((a, b) => {
    const ti = TIER_ORDER.indexOf(a.riskTier) - TIER_ORDER.indexOf(b.riskTier)
    if (ti !== 0) return ti
    return new Date(b.lastEventAt).getTime() - new Date(a.lastEventAt).getTime()
  })

  const filtered = sorted.filter((c) => {
    if (tierFilter === 'all') return true
    if (tierFilter === 'overdue') return new Date(c.nextReviewDue).getTime() < now
    return c.riskTier === tierFilter
  })

  const current = filtered.find((c) => c.id === selectedId) ?? filtered[0]

  const overdueCount  = customers.filter((c) => new Date(c.nextReviewDue).getTime() < now).length
  const criticalCount = customers.filter((c) => c.riskTier === 'critical').length
  const highCount     = customers.filter((c) => c.riskTier === 'high').length

  return (
    <div>
      <PageHeader title="Customer Risk Profiles" zone="Governance">
        <span className="flex items-center gap-1.5 rounded-lg bg-sky-600/10 px-3 py-1.5 text-xs font-medium text-sky-300 ring-1 ring-sky-500/20">
          Perpetual KYC · event-driven
        </span>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Tracked customers" value={customers.length}  sub="from live feed" />
        <Stat label="Critical"          value={criticalCount}     accent="text-rose-400"   sub="30-day review" />
        <Stat label="High"              value={highCount}         accent="text-orange-400" sub="90-day review" />
        <Stat label="Reviews overdue"   value={overdueCount}      accent="text-amber-400"  sub="action required" />
      </div>

      {customers.length === 0 ? (
        <Empty>
          No customer profiles yet. Profiles are built automatically as transactions are ingested — ingest a few to get started.
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
          {/* List */}
          <div className="space-y-2">
            {/* Filter tabs */}
            <div className="flex flex-wrap gap-1 rounded-lg bg-slate-900/60 p-1">
              {(['all', 'critical', 'high', 'medium', 'low', 'overdue'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setTierFilter(f)}
                  className={`flex-1 rounded px-1.5 py-1 text-xs font-medium transition ${
                    tierFilter === f
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f === 'overdue' ? `Overdue (${overdueCount})` : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            <div className="max-h-[65vh] space-y-1.5 overflow-y-auto pr-0.5">
              {filtered.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-600">No customers in this filter.</p>
              )}
              {filtered.map((c) => {
                const isOverdue = new Date(c.nextReviewDue).getTime() < now
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      current?.id === c.id
                        ? 'border-sky-500/50 bg-sky-600/10'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-slate-200">{c.name}</span>
                      <TierBadge tier={c.riskTier} />
                    </div>
                    {/* Mini risk bar */}
                    <div className="mt-2 h-1 w-full rounded-full bg-slate-800">
                      <div
                        className={`h-1 rounded-full ${TIER_BAR[c.riskTier]}`}
                        style={{ width: `${({ critical: 100, high: 75, medium: 50, low: 25 })[c.riskTier]}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <span>{c.totalTransactions}tx · {c.totalAlerts} alerts</span>
                      {isOverdue
                        ? <span className="font-semibold text-rose-400">Review overdue</span>
                        : <span>Review in {Math.max(0, Math.round((new Date(c.nextReviewDue).getTime() - now) / 86_400_000))}d</span>
                      }
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Detail */}
          {current && (
            <CustomerDetail
              key={current.id}
              profile={current}
              onReview={(newTier) => reviewCustomer(current.id, newTier)}
            />
          )}
        </div>
      )}

      {/* Review cadence reference */}
      <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Review cadence</div>
        <div className="flex flex-wrap gap-4">
          {TIER_ORDER.map((t) => (
            <div key={t} className="flex items-center gap-2">
              <TierBadge tier={t} />
              <span className="text-xs text-slate-400">every {REVIEW_DAYS[t]} days</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

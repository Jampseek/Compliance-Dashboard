// Small presentational primitives shared across the zone pages.
import type { ReactNode } from 'react'
import type { RiskBand } from '../lib/types'
import { bandColor } from '../lib/format'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/60 ${className}`}>{children}</div>
  )
}

export function RiskBadge({ band, score }: { band: RiskBand; score: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ${bandColor[band]}`}
    >
      {band} · {score}
    </span>
  )
}

export function Stat({
  label,
  value,
  sub,
  accent = 'text-slate-100',
}: {
  label: string
  value: string | number
  sub?: string
  accent?: string
}) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </Card>
  )
}

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'danger' | 'primary' | 'ghost'
  disabled?: boolean
}) {
  const styles: Record<string, string> = {
    default: 'bg-slate-800 hover:bg-slate-700 text-slate-100',
    primary: 'bg-sky-600 hover:bg-sky-500 text-white',
    danger: 'bg-rose-600/80 hover:bg-rose-600 text-white',
    ghost: 'bg-transparent hover:bg-slate-800 text-slate-300',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]}`}
    >
      {children}
    </button>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 p-12 text-center text-sm text-slate-500">
      {children}
    </div>
  )
}

export function PageHeader({ title, zone, children }: { title: string; zone: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-sky-400">{zone}</div>
        <h1 className="mt-1 text-2xl font-bold text-slate-100">{title}</h1>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

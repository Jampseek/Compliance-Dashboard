import type { RiskBand } from './types'

export function money(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB')
}

export const bandColor: Record<RiskBand, string> = {
  low: 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/30',
  medium: 'text-amber-400 bg-amber-500/10 ring-amber-500/30',
  high: 'text-rose-400 bg-rose-500/10 ring-rose-500/30',
}

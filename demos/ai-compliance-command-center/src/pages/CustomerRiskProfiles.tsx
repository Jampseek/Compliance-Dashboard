import { useState } from 'react'
import { useStore } from '../lib/store'
import { PageHeader } from '../components/ui'
import type { Transaction, Alert, AdverseMediaHit } from '../lib/types'

/** Computes risk profile statistics for a customer */
function computeCustomerRiskProfile(
  customerName: string,
  transactions: Transaction[],
  alerts: Alert[],
  mediaHits: AdverseMediaHit[]
): CustomerRiskProfile {
  // Count total transactions involving the customer (as originator)
  const totalTransactions = transactions.filter(t => t.originator === customerName).length

  // Count flagged transactions (alerts associated with this customer)
  const flaggedTransactions = alerts.filter(a => a.transaction.originator === customerName).length

  // Count adverse media hits (only new/unresolved hits count toward risk)
  const adverseMediaHits = mediaHits.filter(h => h.entityName === customerName && h.status === 'new').length

  // Count sanctions matches for this customer (screening hits with OFAC/EU/UN)
  const sanctionsHits = alerts
    .filter(a => a.transaction.originator === customerName)
    .flatMap(a => a.assessment.screeningHits || [])
    .filter(s => ['OFAC', 'EU', 'UN'].includes(s.list || ''))
    .length

  // Determine current risk level from highest assessment band
  const riskBands = alerts
    .filter(a => a.transaction.originator === customerName && a.assessment.band)
    .map(a => a.assessment.band)

  let riskLevel: 'Low' | 'Medium' | 'High' | 'Critical' = 'Low'
  if (riskBands.includes('high')) {
    riskLevel = 'High'
  }
  // Critical when sanctions or high risk + media hits
  if (riskBands.includes('high') && mediaHits.length > 0) {
    riskLevel = 'Critical'
  }
  if (sanctionsHits > 0) {
    riskLevel = 'Critical'
  }

  // Find latest timestamp for last activity
  const allTimestamps = [
    ...transactions.filter(t => t.originator === customerName).map(t => new Date(t.timestamp).getTime()),
    ...alerts.filter(a => a.transaction.originator === customerName).map(a => new Date(a.createdAt).getTime()),
    ...mediaHits.filter(h => h.entityName === customerName).map(h => new Date(h.detectedAt).getTime())
  ]
  const latestMs = allTimestamps.length > 0 ? Math.max(...allTimestamps) : 0
  const lastActivityTimestamp = latestMs
    ? new Date(latestMs).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'N/A'

  return {
    name: customerName,
    riskLevel,
    totalTransactions,
    flaggedTransactions,
    adverseMediaHits,
    sanctionsMatches: sanctionsHits,
    lastActivityTimestamp,
  }
}

/** Type representing the stored transaction data format */
interface Transaction {
  id: string
  timestamp: string
  originator: string
}

/** CSV format type used internally */
interface CustomerRiskProfile {
  name: string
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical'
  totalTransactions: number
  flaggedTransactions: number
  adverseMediaHits: number
  sanctionsMatches: number
  lastActivityTimestamp: string
}

export default function CustomerRiskProfiles() {
  const transactions = useStore((s) => s.transactions)
  const alerts = useStore((s) => s.alerts)
  const mediaHits = useStore((s) => s.mediaHits)

  // Extract unique customer names from transactions
  const customerNames = Array.from(new Set(transactions.map(t => t.originator)))

  // Compute risk profiles
  const profiles = customerNames.map(name => computeCustomerRiskProfile(
    name, transactions, alerts, mediaHits
  ))

  // Helper to handle risk level color
  const riskColor = (level: 'Low' | 'Medium' | 'High' | 'Critical'): string => {
    switch (level) {
      case 'Low': return 'bg-emerald-200 text-emerald-800';
      case 'Medium': return 'bg-amber-200 text-amber-800';
      case 'High': return 'bg-amber-200 text-amber-800';
      case 'Critical': return 'bg-red-200 text-red-800';
      default: return 'bg-slate-200 text-slate-800';
    }
  }

  return (
    <div>
      <PageHeader title="Customer Risk Profiles" zone="Governance">
        <span className="text-xs text-slate-400">
          Shows Perpetual KYC dashboard for sanctioned and high‑risk entities
        </span>
      </PageHeader>

      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-6">
        {profiles.map((p) => (
          <div key={p.name} className="rounded-lg bg-slate-950/60 p-4 border border-slate-800">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-4 w-4 rounded-full ${riskColor(p.riskLevel)}`}
                title={p.riskLevel}
              />
              <span className="ml-2 text-sm text-slate-300">{p.name}</span>
            </div>
            <div className="mt-2 text-sm text-slate-400">
              Transactions:{' '}
              {p.totalTransactions}
            </div>
            <div className="mt-1 text-sm text-slate-400">
              Flagged:{' '}
              {p.flaggedTransactions}
            </div>
            <div className="mt-1 text-sm text-slate-400">
              Adverse Media:{' '}
              {p.adverseMediaHits}
            </div>
            <div className="mt-1 text-sm text-slate-400">
              Sanctions:{' '}
              {p.sanctionsMatches}
            </div>
          </div>
        ))}
      </div>

      {/* Detailed profile table */}
      <div className="mt-6 space-y-4">
        <table className="min-w-full bg-slate-950/60 rounded-lg border border-slate-800 p-4">
          <thead className="text-slate-300">
            <tr>
              <th className="px-2 py-1 text-sm font-medium">Customer</th>
              <th className="px-2 py-1 text-sm font-medium">Risk</th>
              <th className="px-2 py-1 text-sm font-medium align-right">Transactions</th>
              <th className="px-2 py-1 text-sm font-medium align-right">Flagged</th>
              <th className="px-2 py-1 text-sm font-medium align-right">Media Hits</th>
              <th className="px-2 py-1 text-sm font-medium align-right">Sanctions</th>
              <th className="px-2 py-1 text-sm font-medium align-right">Last Activity</th>
            </tr>
          </thead>
          <tbody className="text-slate-200 text-sm">
            {profiles.map((p) => (
              <tr key={p.name}>
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2 font-medium">{p.riskLevel}</td>
                <td className="px-4 py-2 align-right">{p.totalTransactions}</td>
                <td className="px-4 py-2 align-right">{p.flaggedTransactions}</td>
                <td className="px-4 py-2 align-right">{p.adverseMediaHits}</td>
                <td className="px-4 py-2 align-right">{p.sanctionsMatches}</td>
                <td className="px-4 py-2 text-sm">{p.lastActivityTimestamp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
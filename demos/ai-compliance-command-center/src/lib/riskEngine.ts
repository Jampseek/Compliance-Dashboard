// GPT-4o + XGBoost Risk Score Engine (runs as an Azure Function in the
// architecture). We model the two components the diagram calls out:
//
//   • modelScore  — a gradient-boosted (XGBoost) probability of suspicious
//                   activity, here a transparent weighted feature sum.
//   • llmScore    — a GPT-4o contextual reasoning score over the same features
//                   plus screening hits, with a human-readable narrative.
//
// The fused score drives the High Risk / Low Risk branch in the diagram.

import type { RiskAssessment, RiskBand, ScreeningHit, Transaction } from './types'
import { HIGH_RISK_COUNTRIES } from './mockData'

interface Feature {
  label: string
  weight: number // contribution to the model score (0-100 scale)
}

function features(txn: Transaction, hits: ScreeningHit[]): Feature[] {
  const f: Feature[] = []

  if (txn.amount >= 100_000) f.push({ label: 'High-value transfer (>$100k)', weight: 22 })
  else if (txn.amount >= 25_000) f.push({ label: 'Large transfer (>$25k)', weight: 10 })

  if (txn.amount >= 8800 && txn.amount <= 9990)
    f.push({ label: 'Possible structuring (just under $10k threshold)', weight: 28 })

  if (HIGH_RISK_COUNTRIES.includes(txn.originatorCountry))
    f.push({ label: `Originator in high-risk jurisdiction (${txn.originatorCountry})`, weight: 18 })
  if (HIGH_RISK_COUNTRIES.includes(txn.beneficiaryCountry))
    f.push({ label: `Beneficiary in high-risk jurisdiction (${txn.beneficiaryCountry})`, weight: 20 })

  if (txn.type === 'crypto') f.push({ label: 'Crypto rail', weight: 14 })
  if (txn.type === 'cash') f.push({ label: 'Cash-intensive transaction', weight: 12 })
  if (txn.channel === 'correspondent')
    f.push({ label: 'Correspondent banking channel', weight: 10 })

  for (const hit of hits) {
    if (hit.list === 'OFAC' || hit.list === 'EU' || hit.list === 'UN')
      f.push({ label: `Sanctions match: ${hit.list} (${hit.score}%)`, weight: 40 })
    else if (hit.list === 'PEP')
      f.push({ label: `Politically exposed person (${hit.score}%)`, weight: 16 })
    else if (hit.list === 'Adverse Media')
      f.push({ label: `Adverse media (${hit.score}%)`, weight: 12 })
  }

  return f
}

function band(score: number): RiskBand {
  if (score >= 65) return 'high'
  if (score >= 35) return 'medium'
  return 'low'
}

/**
 * Generate a GPT-4o style narrative. In production this is an Azure OpenAI
 * chat completion; the structure here mirrors a typical grounded prompt result.
 */
function narrate(txn: Transaction, fts: Feature[], score: number): string {
  if (fts.length === 0) {
    return `Transaction ${txn.id} of ${txn.currency} ${txn.amount.toLocaleString()} between ${txn.originator} and ${txn.beneficiary} presents no notable risk indicators. Behaviour is consistent with expected ${txn.type} activity.`
  }
  const top = fts
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((x) => x.label.toLowerCase())
  return `Transaction ${txn.id} (${txn.currency} ${txn.amount.toLocaleString()}, ${txn.type}) scored ${score}/100. Primary drivers: ${top.join('; ')}. Recommend ${
    score >= 65 ? 'analyst review and potential escalation' : score >= 35 ? 'monitoring and secondary review' : 'auto-clearing with audit logging'
  }.`
}

export function assess(txn: Transaction, hits: ScreeningHit[]): RiskAssessment {
  const fts = features(txn, hits)
  const raw = fts.reduce((sum, f) => sum + f.weight, 0)
  const modelScore = Math.min(100, Math.round(raw))

  // GPT-4o component: contextual lift when multiple weak signals co-occur, which
  // a flat model can under-weight. Capped so the LLM never dominates blindly.
  const cooccurrence = fts.length >= 3 ? 12 : fts.length === 2 ? 6 : 0
  const llmScore = Math.min(100, Math.round(modelScore * 0.9 + cooccurrence))

  // Fuse the two components (0.6 model / 0.4 LLM) — explainable by design.
  const score = Math.min(100, Math.round(modelScore * 0.6 + llmScore * 0.4))

  return {
    score,
    band: band(score),
    modelScore,
    llmScore,
    reasons: fts.map((f) => f.label),
    narrative: narrate(txn, fts, score),
    screeningHits: hits,
  }
}

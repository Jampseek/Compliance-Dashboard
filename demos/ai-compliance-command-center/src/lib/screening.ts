// AI Screening Layer — Comply Advantage style sanctions / PEP / adverse-media
// screening. In production this is an external API call; here we approximate it
// with a deterministic keyword + jurisdiction heuristic so the demo is runnable
// with zero external dependencies.

import type { ScreeningHit, Transaction } from './types'
import { HIGH_RISK_COUNTRIES } from './mockData'
import { rng } from './random'

// Names that deterministically trigger a watchlist hit in the demo.
const SANCTIONED_FRAGMENTS = ['Volkov', 'Veridian Petrochem', 'Orion Imports']
const PEP_FRAGMENTS = ['Al-Rashid', 'Vega']

export function screen(txn: Transaction): ScreeningHit[] {
  const hits: ScreeningHit[] = []
  const parties = [txn.originator, txn.beneficiary]

  for (const party of parties) {
    if (SANCTIONED_FRAGMENTS.some((f) => party.includes(f))) {
      hits.push({
        list: rng() < 0.5 ? 'OFAC' : 'EU',
        matchedName: party,
        score: 80 + Math.round(rng() * 19),
      })
    }
    if (PEP_FRAGMENTS.some((f) => party.includes(f))) {
      hits.push({ list: 'PEP', matchedName: party, score: 60 + Math.round(rng() * 30) })
    }
  }

  // Adverse media correlated with high-risk jurisdictions.
  if (
    HIGH_RISK_COUNTRIES.includes(txn.beneficiaryCountry) &&
    rng() < 0.4
  ) {
    hits.push({
      list: 'Adverse Media',
      matchedName: txn.beneficiary,
      score: 40 + Math.round(rng() * 40),
    })
  }

  return hits
}

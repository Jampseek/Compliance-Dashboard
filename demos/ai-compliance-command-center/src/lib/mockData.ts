// Generates synthetic banking transactions that stand in for the feed coming
// from the Core Banking System over Kafka / Azure Event Hubs.

import type { AdverseMediaHit, MediaCategory, Transaction, TxnType } from './types'
import { id, intRange, pick, range, rng } from './random'

const NAMES = [
  'Northwind Trading Ltd',
  'Atlas Logistics SA',
  'Marisol Vega',
  'Kenji Tanaka',
  'Halcyon Capital LLC',
  'Orion Imports GmbH',
  'Fatima Al-Rashid',
  'Brightstone Holdings',
  'Lucas Pereira',
  'Sable & Crane Partners',
  'Veridian Petrochem',
  'Aurora Microfinance',
  'Dmitri Volkov',
  'Sunrise Remittance Co',
  'Cedar Point Realty',
]

// Higher-risk jurisdictions weighted in to create realistic alerts.
const LOW_RISK_COUNTRIES = ['US', 'GB', 'DE', 'CA', 'FR', 'JP', 'AU', 'NL', 'SG']
const HIGH_RISK_COUNTRIES = ['IR', 'KP', 'SY', 'RU', 'AF', 'MM', 'VE']

const TYPES: TxnType[] = ['wire', 'ach', 'card', 'crypto', 'cash', 'cheque']
const CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SGD']
const CHANNELS = ['online', 'branch', 'correspondent', 'mobile', 'api']

function country(highRiskBias: number): string {
  return rng() < highRiskBias ? pick(HIGH_RISK_COUNTRIES) : pick(LOW_RISK_COUNTRIES)
}

/** Create one synthetic transaction. `now` is supplied so the caller controls time. */
export function makeTransaction(now: number): Transaction {
  const type = pick(TYPES)
  // Structuring pattern: amounts that sit just under the $10k reporting threshold.
  const structuring = rng() < 0.12
  const amount = structuring
    ? range(8800, 9990)
    : Math.round(range(50, type === 'wire' ? 480_000 : 25_000))

  const highRiskBias = type === 'crypto' || type === 'cash' ? 0.35 : 0.12

  return {
    id: id('txn'),
    timestamp: new Date(now - intRange(0, 90) * 1000).toISOString(),
    amount: Math.round(amount * 100) / 100,
    currency: pick(CURRENCIES),
    type,
    originator: pick(NAMES),
    beneficiary: pick(NAMES),
    originatorCountry: country(highRiskBias),
    beneficiaryCountry: country(highRiskBias),
    channel: pick(CHANNELS),
  }
}

// ── Adverse Media ─────────────────────────────────────────────────────────────

const MEDIA_SOURCES = [
  'Reuters',
  'BBC News',
  'FCA Enforcement',
  'OFAC Notices',
  'FinCEN Advisories',
  'Court Records',
  'Financial Times',
  'Global Witness',
  'Transparency International',
]

const MEDIA_SOURCE_URLS: Record<string, string> = {
  'Reuters':                   'https://www.reuters.com/legal/litigation',
  'BBC News':                  'https://www.bbc.co.uk/news/business',
  'FCA Enforcement':           'https://www.fca.org.uk/news/press-releases',
  'OFAC Notices':              'https://ofac.treasury.gov/recent-actions',
  'FinCEN Advisories':         'https://www.fincen.gov/resources/advisories',
  'Court Records':             'https://www.courtlistener.com/docket',
  'Financial Times':           'https://www.ft.com/companies/enforcement',
  'Global Witness':            'https://www.globalwitness.org/en/campaigns',
  'Transparency International': 'https://www.transparency.org/en/news',
}

const MEDIA_CATEGORIES: MediaCategory[] = [
  'fraud',
  'corruption',
  'sanctions',
  'money_laundering',
  'legal',
  'regulatory',
]

const HEADLINES: Record<MediaCategory, string[]> = {
  fraud: [
    '{entity} under investigation for alleged fraud scheme',
    'Authorities probe {entity} over financial irregularities',
    '{entity} named in multi-million dollar fraud case',
    'Fraud task force seizes assets linked to {entity}',
  ],
  corruption: [
    '{entity} linked to bribery allegations in procurement deal',
    'Anti-corruption watchdog flags {entity} for review',
    '{entity} executives face corruption charges',
    'Whistleblower documents name {entity} in kickback scheme',
  ],
  sanctions: [
    '{entity} added to sanctions watch list pending review',
    'Regulator issues advisory on transactions involving {entity}',
    '{entity} flagged in new OFAC guidance document',
    'UN panel identifies {entity} as sanctions-risk entity',
  ],
  money_laundering: [
    '{entity} accounts frozen amid money laundering probe',
    'AML task force opens inquiry into {entity}',
    '{entity} cited in anti-money laundering enforcement action',
    'Shell company network traced back to {entity}',
  ],
  legal: [
    '{entity} named as defendant in civil litigation',
    'Court documents reveal {entity} faces asset freeze order',
    '{entity} subject to injunction in ongoing legal proceedings',
    'Judgment entered against {entity} for undisclosed liabilities',
  ],
  regulatory: [
    'Regulator censures {entity} for compliance failures',
    '{entity} receives formal warning from financial watchdog',
    'FCA opens enforcement proceedings against {entity}',
    '{entity} fined for repeated AML control breaches',
  ],
}

/**
 * Simulate the NLP engine surfacing a negative-news hit on a known entity.
 * Returns null ~70% of the time to model realistic signal density.
 */
export function makeMediaHit(now: number): AdverseMediaHit | null {
  if (rng() > 0.28) return null
  const entityName = pick(NAMES)
  const category = pick(MEDIA_CATEGORIES)
  const source = pick(MEDIA_SOURCES)
  const headline = pick(HEADLINES[category]).replace('{entity}', entityName)
  const confidence = 50 + Math.round(rng() * 49) // 50–99
  const slug = entityName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const ref = Math.floor(rng() * 0xffffff).toString(16).padStart(6, '0')
  const baseUrl = MEDIA_SOURCE_URLS[source]
  return {
    id: id('media'),
    detectedAt: new Date(now).toISOString(),
    entityName,
    source,
    url: `${baseUrl}/${slug}-${ref}`,
    headline,
    sentiment: confidence >= 78 ? 'highly_negative' : 'negative',
    confidence,
    category,
    status: 'new',
  }
}

export { HIGH_RISK_COUNTRIES }

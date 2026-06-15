// Generates synthetic banking transactions that stand in for the feed coming
// from the Core Banking System over Kafka / Azure Event Hubs.

import type { Transaction, TxnType } from './types'
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

export { HIGH_RISK_COUNTRIES }

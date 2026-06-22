// OSINT data generator — simulates what a real OSINT platform (e.g. LexisNexis,
// Refinitiv World-Check, Sayari, OpenSanctions) would return when given an
// entity name and a triggering adverse-media category.

import type { MediaCategory, OsintFinding, OsintSourceType } from './types'
import { pick, rng } from './random'

// ── Source registry ───────────────────────────────────────────────────────────

const SOURCE_URLS: Record<OsintSourceType, string> = {
  corporate_registry:    'https://find-and-update.company-information.service.gov.uk',
  beneficial_ownership:  'https://register.openownership.org/entities',
  court_records:         'https://www.courtlistener.com/docket',
  social_media:          'https://www.linkedin.com/company',
  regulatory_filings:    'https://efts.sec.gov/LATEST/search-index',
  pep_database:          'https://www.opensanctions.org/entities',
  sanctions_cross_check: 'https://sanctionssearch.ofac.treas.gov',
  news_aggregator:       'https://newsapi.org/v2/everything',
}

const SOURCE_NAMES: Record<OsintSourceType, string[]> = {
  corporate_registry:    ['Companies House', 'SEC EDGAR', 'FinCEN BOI Registry', 'Delaware SOS'],
  beneficial_ownership:  ['Open Ownership Register', 'GLEIF LEI Database', 'UK PSC Register'],
  court_records:         ['PACER / CourtListener', 'LexisNexis CourtLink', 'Westlaw Dockets'],
  social_media:          ['LinkedIn Intelligence', 'Twitter/X Monitor', 'Web Presence Scan'],
  regulatory_filings:    ['SEC EDGAR Filings', 'FCA Register', 'FinCEN MSB Registry'],
  pep_database:          ['OpenSanctions PEP', 'World-Check PEP', 'LexisNexis PEP Scan'],
  sanctions_cross_check: ['OFAC SDN List', 'EU Consolidated List', 'UN Security Council List', 'HMT Asset Freeze'],
  news_aggregator:       ['Dow Jones Factiva', 'Refinitiv News', 'LexisNexis NewsDesk'],
}

// ── Finding templates by source + media category ─────────────────────────────

type FindingMap = Partial<Record<MediaCategory, string[]>>

const FINDINGS: Record<OsintSourceType, { generic: string[]; byCategory: FindingMap }> = {
  corporate_registry: {
    generic: [
      'Entity registered in {jurisdiction}; status: Active. Registered {months} months ago.',
      'Entity incorporated in {jurisdiction}. Three director changes in past 12 months.',
      'Annual confirmation statement overdue by {days} days. Potential dormancy flag.',
      'Entity shows multiple registered address changes in 24-month window.',
      'Subsidiary of {parent} registered in {jurisdiction}.',
    ],
    byCategory: {
      fraud: [
        'Registered agent address matches 47 other entities — potential phoenix company pattern.',
        'Director {director} disqualified from acting as company officer (Companies House record).',
      ],
      money_laundering: [
        'Entity dissolved and re-incorporated twice in 18 months under similar trading names.',
        'Registered address is a virtual office provider with 200+ co-tenants.',
      ],
      sanctions: [
        'Entity registered in jurisdiction subject to UK/EU enhanced country-level controls.',
        'Prior name variant "{entity} International" appears on historical sanction advisory.',
      ],
    },
  },

  beneficial_ownership: {
    generic: [
      'UBO identified: {name}, {nationality}, {pct}% ownership via {layers}-layer holding structure.',
      'Ownership chain passes through {jurisdiction1} → {jurisdiction2} before reaching operating entity.',
      'No UBO declared above 25% threshold — nominee shareholder arrangement suspected.',
      '{pct}% held via discretionary trust; beneficiaries undisclosed.',
    ],
    byCategory: {
      corruption: [
        'UBO is a close associate of a serving government minister (PEP adjacency).',
        'Beneficial owner previously held a senior public procurement position.',
      ],
      sanctions: [
        'Ownership structure partially obscured via {jurisdiction} shell layer — consistent with sanctions-evasion typology.',
        'Secondary owner ({pct}%) is a national of a comprehensively sanctioned country.',
      ],
      money_laundering: [
        'Layered ownership structure through {layers} jurisdictions with no apparent commercial rationale.',
        'Bearer shares identified in intermediate holding company — UBO unverifiable.',
      ],
    },
  },

  court_records: {
    generic: [
      'Civil claim filed against entity: breach of contract, {amount} USD (pending).',
      'No active litigation found. One resolved matter: arbitration ({year}, settled).',
      'Judgment entered against entity: {amount} USD, unpaid as of filing date.',
      'Injunction issued restricting asset disposal pending resolution of fraud claim.',
    ],
    byCategory: {
      fraud: [
        'Criminal indictment: {count}-count wire fraud, trial date TBD.',
        'Restitution order: {amount} USD outstanding from prior fraud conviction (partially paid).',
      ],
      money_laundering: [
        'Forfeiture proceedings initiated: {amount} USD in frozen accounts linked to ML investigation.',
        'Entity named as relief defendant in DOJ civil forfeiture action.',
      ],
      legal: [
        'Multiple creditor petitions filed within 12-month period; insolvency risk elevated.',
        'Asset freeze order in place per High Court injunction — Mareva order.',
      ],
    },
  },

  social_media: {
    generic: [
      'LinkedIn profile: {employees} employees listed; significant headcount drop vs prior year.',
      'No verified web presence. Domain registered {months} months ago — limited operating history.',
      'Twitter/X mentions spike 3× above baseline coinciding with adverse media date.',
      'LinkedIn page removed. Cached version shows prior compliance director departure announcement.',
    ],
    byCategory: {
      regulatory: [
        'Former employees post public complaints about compliance culture on Glassdoor.',
        'Company blog removed references to regulatory certification — archived version captured.',
      ],
      fraud: [
        'Consumer complaints cluster on Trustpilot citing non-delivery and refund failures.',
        'Reddit thread documents alleged Ponzi-like returns pattern from investment product.',
      ],
    },
  },

  regulatory_filings: {
    generic: [
      'No SEC filings found. Entity not registered as reporting company.',
      'FCA authorisation status: Authorised. One past supervisory notice on file.',
      'FinCEN MSB Registration: Active. Last renewal {months} months ago.',
      'Form 8-K filed {months} months ago disclosing material regulatory inquiry.',
    ],
    byCategory: {
      regulatory: [
        'FCA Final Notice: £{amount}k fine for AML control failures ({year}).',
        'SEC enforcement action settled without admission: disgorgement of {amount} USD.',
        'AUSTRAC enforceable undertaking accepted — compliance uplift required.',
      ],
      fraud: [
        'SEC Litigation Release naming entity as defendant in securities fraud action.',
        'FINRA disciplinary action: suspension of associated persons for misrepresentation.',
      ],
    },
  },

  pep_database: {
    generic: [
      'No PEP associations identified for named directors.',
      'Director cross-references with {country} parliament member database — no match.',
      'Entity holds government contract with {ministry} ({country}) — indirect state nexus.',
    ],
    byCategory: {
      corruption: [
        'Director {name} is listed as PEP: former {title}, {country} ({years} years ago). Cooling-off period incomplete.',
        'Entity awarded {amount} USD government contract six months after director left public office.',
        'Spouse of serving {title} holds 15% equity stake — indirect PEP exposure.',
      ],
      sanctions: [
        'Controlling shareholder is first-degree relative of sanctioned individual ({list}).',
        'Former director added to OFAC SDN list {months} months after departure from this entity.',
      ],
    },
  },

  sanctions_cross_check: {
    generic: [
      'No direct name match on OFAC SDN, EU Consolidated, or UN Security Council lists.',
      'Fuzzy-match hit on OFAC SDN: "{matched}" (score 71%) — inconclusive, requires analyst review.',
      'Jurisdiction of incorporation ({jurisdiction}) subject to FATF grey-list enhanced monitoring.',
    ],
    byCategory: {
      sanctions: [
        'Entity name variant "{entity} Holdings" appears on EU Consolidated List (designation date: {date}).',
        'Counterparty bank in transaction chain is listed on OFAC correspondent account advisory.',
        'Primary correspondent bank has ceased processing transactions involving this entity citing OFAC risk.',
      ],
      money_laundering: [
        'Jurisdiction of incorporation on FATF black list — Recommendation 37 deficient.',
        'Transaction corridor identified as FATF typology route for trade-based money laundering.',
      ],
    },
  },

  news_aggregator: {
    generic: [
      '{count} news articles mentioning entity in past 90 days; {negative} with negative sentiment.',
      'Media coverage volume 4× above 12-month baseline coinciding with regulatory action.',
      'International press coverage in {count} jurisdictions — cross-border exposure confirmed.',
    ],
    byCategory: {
      fraud: [
        'Investigative journalism piece ({outlet}) details alleged fraud mechanism with named individuals.',
        'Industry publication reports client complaints filed with regulator — {count} complaints confirmed.',
      ],
      corruption: [
        'ICIJ Offshore Leaks database cross-reference yields {count} mentions in leaked documents.',
        'NGO report ({org}) names entity in analysis of public procurement irregularities.',
      ],
      money_laundering: [
        'Financial Action Task Force mutual evaluation report cites sector where entity operates as high-risk.',
        'FinCEN Geographic Targeting Order covers postal codes where entity operates.',
      ],
    },
  },
}

// ── Helper interpolation ──────────────────────────────────────────────────────

const JURISDICTIONS = ['British Virgin Islands', 'Cayman Islands', 'Delaware', 'Dubai (DIFC)', 'Malta', 'Cyprus', 'Luxembourg', 'Seychelles']
const LOW_RISK_J  = ['England & Wales', 'New York', 'Singapore', 'Ontario', 'New South Wales']
const NAMES_POOL  = ['A. Petrov', 'M. Okonkwo', 'S. Bergström', 'J. Doe', 'K. Al-Amin', 'L. Ferreira', 'N. Tanaka']
const NATIONALITIES = ['Russian', 'Chinese', 'Iranian', 'Emirati', 'British', 'Swiss', 'Singaporean']
const COUNTRIES = ['Russia', 'UAE', 'UK', 'Singapore', 'Switzerland', 'Cyprus', 'Malta']
const MINISTRIES = ['Ministry of Finance', 'State Oil Fund', 'Public Infrastructure Authority', 'Central Procurement Agency']
const OUTLETS = ['The Guardian', 'OCCRP', 'Bloomberg Investigates', 'Der Spiegel', 'Le Monde']
const ORGS = ['Global Witness', 'Transparency International', 'Finance Uncovered', 'OCCRP']
const TITLES = ['Deputy Minister', 'State Secretary', 'Regional Governor', 'Parliamentary Committee Chair']
const LISTS = ['OFAC SDN', 'EU Consolidated List', 'HMT Asset Freeze List']
const SANCTIONS_MATCH_NAMES = ['Holdings', 'International', 'Group', 'Ventures', 'Capital']

function interpolate(template: string, entity: string): string {
  const months = 3 + Math.floor(rng() * 48)
  const days   = 10 + Math.floor(rng() * 120)
  const pct    = [51, 75, 100, 25, 33][Math.floor(rng() * 5)]
  const layers = 2 + Math.floor(rng() * 4)
  const amount = [50_000, 120_000, 500_000, 2_100_000, 8_400_000][Math.floor(rng() * 5)].toLocaleString()
  const year   = 2019 + Math.floor(rng() * 5)
  const count  = 2 + Math.floor(rng() * 18)
  const employees = 5 + Math.floor(rng() * 200)
  const negative  = Math.floor(count * (0.4 + rng() * 0.5))
  const years  = 1 + Math.floor(rng() * 8)

  return template
    .replace(/{entity}/g, entity)
    .replace(/{jurisdiction}/g, pick([...JURISDICTIONS, ...LOW_RISK_J]))
    .replace(/{jurisdiction1}/g, pick(JURISDICTIONS))
    .replace(/{jurisdiction2}/g, pick(LOW_RISK_J))
    .replace(/{parent}/g, entity + ' ' + pick(SANCTIONS_MATCH_NAMES))
    .replace(/{months}/g, String(months))
    .replace(/{days}/g, String(days))
    .replace(/{pct}/g, String(pct))
    .replace(/{layers}/g, String(layers))
    .replace(/{amount}/g, amount)
    .replace(/{year}/g, String(year))
    .replace(/{years}/g, String(years))
    .replace(/{count}/g, String(count))
    .replace(/{employees}/g, String(employees))
    .replace(/{negative}/g, String(negative))
    .replace(/{director}/g, pick(NAMES_POOL))
    .replace(/{name}/g, pick(NAMES_POOL))
    .replace(/{nationality}/g, pick(NATIONALITIES))
    .replace(/{country}/g, pick(COUNTRIES))
    .replace(/{matched}/g, entity + ' ' + pick(SANCTIONS_MATCH_NAMES))
    .replace(/{list}/g, pick(LISTS))
    .replace(/{title}/g, pick(TITLES))
    .replace(/{ministry}/g, pick(MINISTRIES))
    .replace(/{outlet}/g, pick(OUTLETS))
    .replace(/{org}/g, pick(ORGS))
    .replace(/{date}/g, `${year}-${String(1 + Math.floor(rng() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rng() * 28)).padStart(2, '0')}`)
}

function pickFinding(sourceType: OsintSourceType, category: MediaCategory, entity: string): string {
  const block = FINDINGS[sourceType]
  const catPool = block.byCategory[category] ?? []
  const pool = catPool.length > 0 && rng() < 0.55 ? catPool : block.generic
  return interpolate(pick(pool), entity)
}

function relevanceFor(sourceType: OsintSourceType, category: MediaCategory): 'high' | 'medium' | 'low' {
  const HIGH_MAP: Partial<Record<OsintSourceType, MediaCategory[]>> = {
    sanctions_cross_check: ['sanctions'],
    pep_database:          ['corruption', 'sanctions'],
    court_records:         ['fraud', 'legal', 'money_laundering'],
    regulatory_filings:    ['regulatory', 'fraud'],
    beneficial_ownership:  ['money_laundering', 'sanctions', 'corruption'],
  }
  if (HIGH_MAP[sourceType]?.includes(category)) return 'high'
  if (rng() < 0.4) return 'medium'
  return 'low'
}

// ── Public API ────────────────────────────────────────────────────────────────

const ALL_SOURCE_TYPES: OsintSourceType[] = [
  'corporate_registry',
  'beneficial_ownership',
  'court_records',
  'social_media',
  'regulatory_filings',
  'pep_database',
  'sanctions_cross_check',
  'news_aggregator',
]

/**
 * Generate a realistic OSINT finding set for an entity flagged in adverse media.
 * Returns 5–8 findings across different source types.
 */
export function generateOsintFindings(
  entityName: string,
  category: MediaCategory,
  now: number,
): OsintFinding[] {
  const sourceCount = 5 + Math.floor(rng() * 4) // 5–8
  const sources = [...ALL_SOURCE_TYPES].sort(() => rng() - 0.5).slice(0, sourceCount)

  return sources.map((sourceType) => {
    const source = pick(SOURCE_NAMES[sourceType])
    const finding = pickFinding(sourceType, category, entityName)
    const confidence = 55 + Math.floor(rng() * 44)
    const riskRelevance = relevanceFor(sourceType, category)
    const slug = entityName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const baseUrl = SOURCE_URLS[sourceType]
    return {
      sourceType,
      source,
      finding,
      confidence,
      riskRelevance,
      url: `${baseUrl}/${slug}`,
      retrievedAt: new Date(now - Math.floor(rng() * 300_000)).toISOString(),
    }
  })
}

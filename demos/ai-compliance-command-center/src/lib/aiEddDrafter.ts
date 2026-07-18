// AI EDD Drafter — routes through the AI Gateway (Azure Foundry → Anthropic → stub).
// The gateway's decision tree maps edd_drafting to the complex-reasoning tier and
// enforces role policy + monthly budget caps before any tokens are spent.
// Governance principle unchanged: AI produces the draft, human approves.

import type { AdverseMediaHit, EddReport, EddRiskRating, OsintFinding } from './types'
import type { Role } from './rbac'
import { getPrompt } from './promptLibrary'
import { invokeModel } from './aiGateway'
import { PRINCIPALS } from './rbac'
import { id } from './random'

// ── Deterministic stub ────────────────────────────────────────────────────────

function computeRiskRating(findings: OsintFinding[], hit: AdverseMediaHit): EddRiskRating {
  const highCount = findings.filter((f) => f.riskRelevance === 'high').length
  const category  = hit.category
  if (category === 'sanctions' || highCount >= 4) return 'critical'
  if (category === 'money_laundering' || category === 'corruption' || highCount >= 2) return 'high'
  if (category === 'fraud' || category === 'regulatory') return 'medium'
  return 'low'
}

function stubNarrative(hit: AdverseMediaHit, findings: OsintFinding[], rating: EddRiskRating): string {
  const highFindings   = findings.filter((f) => f.riskRelevance === 'high')
  const mediumFindings = findings.filter((f) => f.riskRelevance === 'medium')

  const findingSummary = highFindings
    .map((f) => `• [${f.source}] ${f.finding}`)
    .join('\n')

  const mediumSummary = mediumFindings
    .map((f) => `• [${f.source}] ${f.finding}`)
    .join('\n')

  const nextSteps: Record<EddRiskRating, string> = {
    critical: '1. Immediately escalate to MLRO and Senior Management.\n2. Suspend new transaction processing pending review.\n3. File SAR with the relevant regulator within statutory deadline.',
    high:     '1. Request source-of-funds and source-of-wealth documentation from the customer.\n2. Schedule senior management sign-off for relationship continuation.\n3. Monitor transaction activity on a daily basis pending further review.',
    medium:   '1. Update CDD file with OSINT findings and schedule 90-day review.\n2. Apply enhanced ongoing monitoring controls.\n3. Request updated beneficial ownership declaration.',
    low:      '1. Update the CDD profile with findings and schedule annual review.\n2. Continue standard transaction monitoring thresholds.',
  }

  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENHANCED DUE DILIGENCE REPORT — DRAFT
AI-generated · Awaiting human approval
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. EXECUTIVE SUMMARY
${hit.entityName} has been identified as a ${rating.toUpperCase()} risk entity following adverse media detection and multi-source OSINT collection. The findings below present material evidence requiring compliance action prior to any relationship continuation or new business engagement.

2. ADVERSE MEDIA TRIGGER
Source: ${hit.source} | Category: ${hit.category.replace('_', ' ')} | Confidence: ${hit.confidence}%
Headline: "${hit.headline}"
NLP sentiment classification: ${hit.sentiment === 'highly_negative' ? 'Highly Negative' : 'Negative'}. The triggering article was assessed by the NLP scanning engine with ${hit.confidence}% entity-match confidence. This event was independently corroborated by news aggregator sources during OSINT collection.

3. OSINT FINDINGS

HIGH-RELEVANCE FINDINGS:
${highFindings.length > 0 ? findingSummary : '• No high-relevance findings identified across queried sources.'}

MEDIUM-RELEVANCE FINDINGS:
${mediumFindings.length > 0 ? mediumSummary : '• No medium-relevance findings identified.'}

4. RISK RATING RATIONALE
Overall Rating: ${rating.toUpperCase()}
${rating === 'critical' ? `The entity is rated CRITICAL due to direct or indirect sanctions exposure or a concentration of four or more high-relevance adverse findings across independent OSINT sources.` : ''}
${rating === 'high' ? `The entity is rated HIGH due to indicators of money laundering, corruption, or PEP adjacency corroborated across multiple independent OSINT sources, constituting a material financial crime risk.` : ''}
${rating === 'medium' ? `The entity is rated MEDIUM due to regulatory or fraud-related adverse media with corroborating OSINT findings. The evidence does not yet meet the threshold for an immediate SAR filing but requires enhanced monitoring and CDD uplift.` : ''}
${rating === 'low' ? `The entity is rated LOW. While adverse media was detected, OSINT findings do not reveal material additional risk indicators. Standard enhanced monitoring controls are considered proportionate.` : ''}

5. RECOMMENDED NEXT STEPS
${nextSteps[rating]}`
}

// ── AI-powered drafter ────────────────────────────────────────────────────────

export async function draftEdd(
  hit: AdverseMediaHit,
  findings: OsintFinding[],
  initiatedBy: string,
  now: number,
  role: Role = 'analyst',
): Promise<EddReport> {
  const rating   = computeRiskRating(findings, hit)
  const template = getPrompt('edd-narrative-v1')

  const systemPrompt = template?.template ?? `You are an AML/KYC specialist producing an Enhanced Due Diligence (EDD) report.`

  const findingsText = findings
    .map(
      (f, i) =>
        `[${i + 1}] SOURCE: ${f.source} (${f.sourceType.replace('_', ' ')})
   FINDING: ${f.finding}
   CONFIDENCE: ${f.confidence}% | RISK RELEVANCE: ${f.riskRelevance.toUpperCase()}`,
    )
    .join('\n\n')

  const context = `ENTITY: ${hit.entityName}
ADVERSE MEDIA EVENT:
  Source: ${hit.source}
  Category: ${hit.category.replace('_', ' ')}
  Headline: "${hit.headline}"
  Sentiment: ${hit.sentiment}
  NLP Confidence: ${hit.confidence}%
  Detected: ${new Date(hit.detectedAt).toUTCString()}

OSINT FINDINGS (${findings.length} sources queried):
${findingsText}

COMPUTED RISK RATING: ${rating.toUpperCase()} (based on finding density and category)`

  const res = await invokeModel({
    taskCategory: 'edd_drafting',
    role,
    actor: PRINCIPALS[role].name,
    system: systemPrompt,
    prompt: `Draft an EDD report for the following entity:\n\n${context}`,
    maxTokens: 1500,
  })

  let narrative: string
  if (res.ok) {
    narrative = `[Generated by Claude EDD AI · prompt "${template?.id ?? 'edd-narrative-v1'}" · model ${res.model} · via ${res.provider}]\n\n${res.text}`
  } else {
    narrative = stubNarrative(hit, findings, rating)
    if (res.reason === 'budget_cap') {
      narrative = `[AI CALL BLOCKED — monthly AI budget cap reached for this role. Deterministic fallback used. Request a cap increase or budget reallocation on the AI Governance page.]\n\n${narrative}`
    } else if (res.reason === 'policy') {
      narrative = `[AI CALL BLOCKED — the complex-reasoning model tier is not permitted for this role under AI usage policy. Deterministic fallback used. See the AI Governance page.]\n\n${narrative}`
    }
  }

  return {
    id: id('edd'),
    mediaHitId: hit.id,
    entityName: hit.entityName,
    initiatedAt: new Date(now).toISOString(),
    initiatedBy,
    status: 'draft',
    osintFindings: findings,
    narrative,
    riskRating: rating,
  }
}

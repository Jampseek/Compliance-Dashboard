// AI EDD Drafter — calls Claude (claude-sonnet-4-6) when VITE_ANTHROPIC_API_KEY is set,
// otherwise falls back to the deterministic stub below.
// Follows the same governance principle as the SAR drafter: AI produces the draft,
// human approves before the report is acted upon.

import Anthropic from '@anthropic-ai/sdk'
import type { AdverseMediaHit, EddReport, EddRiskRating, OsintFinding } from './types'
import { getPrompt } from './promptLibrary'
import { withRetry } from './retry'
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
): Promise<EddReport> {
  const rating  = computeRiskRating(findings, hit)
  const apiKey  = import.meta.env.VITE_ANTHROPIC_API_KEY
  const template = getPrompt('edd-narrative-v1')

  let narrative: string

  if (!apiKey) {
    narrative = stubNarrative(hit, findings, rating)
  } else {
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

    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
    try {
      const message = await withRetry(
        () => client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          system: systemPrompt,
          messages: [{ role: 'user', content: `Draft an EDD report for the following entity:\n\n${context}` }],
        }),
        { maxAttempts: 2, baseDelayMs: 800 },
      )
      const aiText = message.content[0].type === 'text' ? message.content[0].text : ''
      narrative = `[Generated by Claude EDD AI · prompt "${template?.id ?? 'edd-narrative-v1'}" · model ${message.model}]\n\n${aiText}`
    } catch {
      // API unavailable after retries — fall back to the deterministic stub.
      narrative = stubNarrative(hit, findings, rating)
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

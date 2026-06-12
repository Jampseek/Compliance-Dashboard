// AI Workflow Prompt Library (Deliverable 5). These are the grounded prompt
// templates the SAR Drafting AI and the Semantic Kernel triage step use. Kept
// as data so they can be versioned and reviewed independently of the app code.

export interface PromptTemplate {
  id: string
  name: string
  description: string
  template: string
}

export const PROMPTS: PromptTemplate[] = [
  {
    id: 'triage-v1',
    name: 'Alert Triage (Semantic Kernel)',
    description: 'Prioritises a queued alert and produces a one-line triage summary.',
    template: `You are a financial-crime triage assistant. Given the transaction and risk
assessment, assign a priority 1 (most urgent) to 5 and summarise why in one
sentence. Weight sanctions hits and structuring patterns highest.`,
  },
  {
    id: 'sar-narrative-v2',
    name: 'SAR Narrative Drafter',
    description: 'Drafts a regulator-ready SAR narrative grounded only in case facts.',
    template: `You are an AML investigator drafting a Suspicious Activity Report narrative.
Use ONLY the facts provided in the case file. Follow the structure: (1) who,
(2) what activity, (3) why it is suspicious, (4) amounts and timeframe,
(5) supporting indicators. Do not speculate beyond the evidence. Output a
concise factual narrative suitable for {regulator} filing.`,
  },
]

export function getPrompt(idOrName: string): PromptTemplate | undefined {
  return PROMPTS.find((p) => p.id === idOrName || p.name === idOrName)
}

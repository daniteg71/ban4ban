import 'server-only'
import crypto from 'node:crypto'
import type { CorporateDna } from '@/lib/corporate-dna'
import { geminiJson, isAiLive, type GeminiSchema } from '@/lib/ai-gemini'

// ============================================================================
// MOTORE DI VALUTAZIONE AFFINITÀ AZIENDA-BANDO (analisi dettagliata, al click).
// Logica del team (criteri, PESI, recommendation, checklist operativa) portata 1:1
// su Gemini invece di OpenAI, coerente col resto dell'app (zero dipendenze, free).
//  - Output: 6 sotto-voti + voto finale pesato + checklist operativa per la sottomissione.
//  - CACHE in-memory per (bando + versione DNA): un click ricalcola solo la prima volta.
//  - Non lancia MAI: se l'AI è spenta/fallisce ritorna null e il chiamante usa lo scheletro.
// ============================================================================

export type OpportunityType =
  | 'BANDO_COMPETITIVO'
  | 'AGEVOLAZIONE_FISCALE'
  | 'CONTRIBUTO_FONDO_PERDUTO'
  | 'FINANZIAMENTO_AGEVOLATO'
  | 'AVVISO_PUBBLICO'
  | 'ALTRO'

export type Recommendation = 'CANDIDARSI' | 'VALUTARE_CON_ATTENZIONE' | 'NON_CANDIDARSI'

export type TodoCategory = 'AMMINISTRATIVA' | 'DOCUMENTALE' | 'TECNICA' | 'FINANZIARIA'

export type ChecklistItem = {
  id: string
  task: string
  description: string
  priority: 'ALTA' | 'MEDIA' | 'BASSA'
  category: TodoCategory
  checked: boolean
  suggested_timeline: string
}

export type ScoreBreakdown = {
  sector_fit: number
  technical_fit: number
  certifications_fit: number
  experience_fit: number
  geographic_fit: number
  economic_strategic_fit: number
}

export type EvaluationResult = {
  evaluation_type: OpportunityType
  company_name: string
  tender_title: string
  final_score: number // 1-10, pesato lato codice
  confidence: number // 0-1
  recommendation: Recommendation
  summary: string
  score_breakdown: ScoreBreakdown
  strengths: string[]
  weaknesses: string[]
  missing_requirements: string[]
  risks: string[]
  next_actions: string[]
  checklist: ChecklistItem[]
  reasoning_short: string
}

type TenderInput = { id?: string; title?: string; source?: string; text: string }

const OPP_TYPES: OpportunityType[] = [
  'BANDO_COMPETITIVO',
  'AGEVOLAZIONE_FISCALE',
  'CONTRIBUTO_FONDO_PERDUTO',
  'FINANZIAMENTO_AGEVOLATO',
  'AVVISO_PUBBLICO',
  'ALTRO',
]

// Schema Gemini (sottoinsieme OpenAPI): niente minimum/maximum/additionalProperties → si clampa in codice.
const EVAL_SCHEMA: GeminiSchema = {
  type: 'object',
  properties: {
    evaluation_type: { type: 'string', enum: OPP_TYPES },
    summary: { type: 'string' },
    confidence: { type: 'number' },
    score_breakdown: {
      type: 'object',
      properties: {
        sector_fit: { type: 'number' },
        technical_fit: { type: 'number' },
        certifications_fit: { type: 'number' },
        experience_fit: { type: 'number' },
        geographic_fit: { type: 'number' },
        economic_strategic_fit: { type: 'number' },
      },
      required: [
        'sector_fit',
        'technical_fit',
        'certifications_fit',
        'experience_fit',
        'geographic_fit',
        'economic_strategic_fit',
      ],
    },
    strengths: { type: 'array', items: { type: 'string' } },
    weaknesses: { type: 'array', items: { type: 'string' } },
    missing_requirements: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    next_actions: { type: 'array', items: { type: 'string' } },
    checklist: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          task: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['ALTA', 'MEDIA', 'BASSA'] },
          category: { type: 'string', enum: ['AMMINISTRATIVA', 'DOCUMENTALE', 'TECNICA', 'FINANZIARIA'] },
          suggested_timeline: { type: 'string' },
        },
        required: ['id', 'task', 'description', 'priority', 'category', 'suggested_timeline'],
      },
    },
    reasoning_short: { type: 'string' },
  },
  required: [
    'evaluation_type',
    'summary',
    'confidence',
    'score_breakdown',
    'strengths',
    'weaknesses',
    'missing_requirements',
    'risks',
    'next_actions',
    'checklist',
    'reasoning_short',
  ],
}

// PESI del team (invariati): garantiscono consistenza matematica del voto finale.
function calculateWeightedScore(b: ScoreBreakdown): number {
  const sum =
    b.sector_fit * 0.15 +
    b.technical_fit * 0.25 +
    b.certifications_fit * 0.1 +
    b.experience_fit * 0.2 +
    b.geographic_fit * 0.1 +
    b.economic_strategic_fit * 0.2
  return Math.round(sum * 10) / 10
}

// Soglie del team (invariate).
function normalizeFinalRecommendation(score: number): Recommendation {
  if (score >= 6.5) return 'CANDIDARSI'
  if (score >= 4.5) return 'VALUTARE_CON_ATTENZIONE'
  return 'NON_CANDIDARSI'
}

const clamp = (n: unknown, lo: number, hi: number, fb: number): number => {
  const x = typeof n === 'number' && Number.isFinite(n) ? n : fb
  return Math.max(lo, Math.min(hi, x))
}

const sha = (s: string, n = 16) => crypto.createHash('sha1').update(s).digest('hex').slice(0, n)

// cache in-memory: `${tenderRef}:${dnaVer}` -> risultato
const g = globalThis as unknown as { __jesapEval?: Map<string, EvaluationResult> }
const cache = g.__jesapEval ?? (g.__jesapEval = new Map())

// Mappa il nostro CorporateDna nell'anagrafica attesa dal prompt (campi del team disponibili).
function companyForPrompt(dna: CorporateDna, extra?: { strengths?: string[]; gaps?: string[] }) {
  return {
    name: dna.rag_soc,
    vat_number: dna.p_iva || undefined,
    location: dna.regione || undefined,
    ateco_primary: dna.ateco?.[0],
    ateco_secondary: dna.ateco?.slice(1),
    sectors: [...(dna.settori ?? []), ...(dna.ateco ?? [])],
    services: dna.comp ?? [],
    certifications: dna.cert ?? [],
    past_projects: (dna.esperienze ?? []).map((e) => e.desc).filter(Boolean),
    revenue_last_year: dna.fin?.fatturato || undefined,
    equity: dna.fin?.cap_sociale || undefined,
    last_balance_year: dna.fin?.ult_bilancio_anno || undefined,
    strengths: extra?.strengths ?? [],
    weaknesses: extra?.gaps ?? [],
  }
}

function buildPrompt(company: ReturnType<typeof companyForPrompt>, tender: TenderInput): string {
  return `Analizza l'affinità tra l'azienda e il bando fornito. Genera una valutazione rigorosa e compila una CHECKLIST operativa e sequenziale di passaggi necessari affinché l'azienda possa preparare, completare e inviare la domanda di partecipazione senza dimenticare nulla.

Criteri di scoring da 1 a 10:
1. sector_fit: coerenza tra settore aziendale e opportunità
2. technical_fit: coerenza tra servizi, tecnologie e requisiti tecnici
3. certifications_fit: coerenza tra certificazioni aziendali e requisiti richiesti
4. experience_fit: coerenza tra esperienze/progetti passati e opportunità
5. geographic_fit: coerenza geografica e territoriale
6. economic_strategic_fit: sostenibilità economica e interesse strategico

Scala voto: 1-3 affinità bassa | 4-5 debole o rischiosa | 6 discreta con criticità | 7-8 buona | 9-10 molto alta.

Regole di valutazione e Checklist:
- Usa tutta la scala e sii deciso. Se mancano requisiti obbligatori, abbassa i rispettivi voti.
- Il testo del bando è breve (titolo + estratto): valuta l'affinità di TEMA e SETTORE, NON penalizzare per le informazioni mancanti, ma abbassa 'confidence' se i dati del DNA aziendale sono scarsi.
- Genera un 'id' unico in snake_case per ogni task (es. "verifica_credenziali_mepa", "estrazione_durc_regolare").
- Fornisci una 'suggested_timeline' logica e sequenziale (es. "Entro 48 ore", "Subito dopo i preventivi").
- Copri OBBLIGATORIAMENTE tutte le categorie: AMMINISTRATIVA (portali, firme), DOCUMENTALE (bilanci, DURC, visure), TECNICA (relazioni, specifiche), FINANZIARIA (budget, piani economici).
- Rispondi in ITALIANO.

AZIENDA:
${JSON.stringify(company, null, 2)}

OPPORTUNITÀ / BANDO:
ID: ${tender.id || 'non disponibile'}
Titolo: ${tender.title || 'Titolo non disponibile'}
Fonte: ${tender.source || 'Fonte non disponibile'}

Testo del Bando:
${tender.text}`
}

/**
 * Valutazione dettagliata di UN bando per l'azienda selezionata. Ritorna null se l'AI è
 * spenta, manca il DNA, o la chiamata fallisce (il chiamante mostra lo scheletro).
 */
export async function evaluateTenderForCompany(
  dna: CorporateDna | null,
  tender: TenderInput,
  extra?: { strengths?: string[]; gaps?: string[] }
): Promise<EvaluationResult | null> {
  if (!dna || !isAiLive()) return null

  const dnaVer = sha(JSON.stringify(dna), 12)
  const tenderRef = sha(`${tender.id ?? ''}|${tender.title ?? ''}|${tender.source ?? ''}`)
  const cacheKey = `${tenderRef}:${dnaVer}`
  const hit = cache.get(cacheKey)
  if (hit) return hit

  const company = companyForPrompt(dna, extra)
  let parsed: Partial<EvaluationResult> | null = null
  try {
    parsed = await geminiJson<Partial<EvaluationResult>>(buildPrompt(company, tender), EVAL_SCHEMA)
  } catch {
    parsed = null
  }
  if (!parsed || !parsed.score_breakdown) return null

  // Clamp dei sotto-voti 1-10 e ricalcolo del voto finale pesato lato codice (consistenza).
  const breakdown: ScoreBreakdown = {
    sector_fit: clamp(parsed.score_breakdown.sector_fit, 1, 10, 5),
    technical_fit: clamp(parsed.score_breakdown.technical_fit, 1, 10, 5),
    certifications_fit: clamp(parsed.score_breakdown.certifications_fit, 1, 10, 5),
    experience_fit: clamp(parsed.score_breakdown.experience_fit, 1, 10, 5),
    geographic_fit: clamp(parsed.score_breakdown.geographic_fit, 1, 10, 5),
    economic_strategic_fit: clamp(parsed.score_breakdown.economic_strategic_fit, 1, 10, 5),
  }
  const finalScore = calculateWeightedScore(breakdown)

  const result: EvaluationResult = {
    evaluation_type: OPP_TYPES.includes(parsed.evaluation_type as OpportunityType)
      ? (parsed.evaluation_type as OpportunityType)
      : 'ALTRO',
    company_name: dna.rag_soc,
    tender_title: tender.title || 'Titolo non disponibile',
    final_score: finalScore,
    confidence: clamp(parsed.confidence, 0, 1, 0.5),
    recommendation: normalizeFinalRecommendation(finalScore),
    summary: String(parsed.summary ?? '').trim(),
    score_breakdown: breakdown,
    strengths: (parsed.strengths ?? []).filter(Boolean),
    weaknesses: (parsed.weaknesses ?? []).filter(Boolean),
    missing_requirements: (parsed.missing_requirements ?? []).filter(Boolean),
    risks: (parsed.risks ?? []).filter(Boolean),
    next_actions: (parsed.next_actions ?? []).filter(Boolean),
    checklist: (parsed.checklist ?? [])
      .filter((c) => c && c.task)
      .map((c, i) => ({
        id: c.id || `task_${i + 1}`,
        task: c.task,
        description: c.description ?? '',
        priority: (['ALTA', 'MEDIA', 'BASSA'] as const).includes(c.priority as 'ALTA') ? c.priority! : 'MEDIA',
        category: (['AMMINISTRATIVA', 'DOCUMENTALE', 'TECNICA', 'FINANZIARIA'] as const).includes(
          c.category as 'TECNICA'
        )
          ? c.category!
          : 'AMMINISTRATIVA',
        checked: false, // stato iniziale sempre false
        suggested_timeline: c.suggested_timeline ?? '',
      })),
    reasoning_short: String(parsed.reasoning_short ?? '').trim(),
  }

  cache.set(cacheKey, result)
  return result
}

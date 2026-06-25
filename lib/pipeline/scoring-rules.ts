// Port tipizzato di scoring_rules.json. Calibri il matching modificando SOLO questo file.
import type { DimensionKey, Tier } from './types';

export const DIMENSION_WEIGHTS: Record<DimensionKey, number> = {
  semantic_similarity: 0.3,
  keyword_overlap: 0.25,
  certification_match: 0.2,
  capacity_match: 0.15,
  budget_compatibility: 0.1,
};
// assert a runtime: la somma dei pesi deve fare 1.0
const WSUM = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(WSUM - 1) > 1e-9) {
  throw new Error(`[scoring-rules] somma pesi = ${WSUM}, deve essere 1.0`);
}

export const STAGE1 = {
  minDaysToDeadline: 4,
  minBudget: 20_000,
  maxBudget: 5_000_000,
  minQualityScore: 0.3,
};

export const STAGE2 = {
  // pre-score = cosine*0.6 + jaccard*0.4 (+cpv bonus). Gate per passare allo scoring completo.
  // NB: 4.5 è il valore "di produzione" (con embedding multilingua reali, cosine ~0.5-0.7).
  // In mock il proxy lessicale dà segnali più bassi, quindi il gate è calibrato più basso.
  gateThreshold: (process.env.DATA_MODE ?? 'mock').toLowerCase() === 'live' ? 4.5 : 2.8,
  cosineWeight: 0.6,
  jaccardWeight: 0.4,
  cpvBonus: 0.1,
};

export const STAGE3 = {
  // l'LLM (la parte cara) si attiva SOLO qui: top-N o sopra soglia, con tetto di chiamate.
  byScoreThreshold: 7.0,
  byTopNPerRun: 10,
  maxLlmCallsPerRun: 10,
  maxLlmCallsPerDay: 50,
};

export type BonusMalusRule = {
  ruleId: string;
  effect: number;
  maxApplications: number;
};

// Regole bonus/malus applicate DOPO l'aggregazione (vedi index.ts per le condizioni).
export const BONUS_MALUS: BonusMalusRule[] = [
  { ruleId: 'portfolio_sector_match', effect: 0.5, maxApplications: 1 },
  { ruleId: 'recent_similar_project', effect: 1.0, maxApplications: 1 },
  { ruleId: 'expired_certification_penalty', effect: -1.0, maxApplications: 3 },
  { ruleId: 'near_deadline_pressure', effect: -0.5, maxApplications: 1 },
  { ruleId: 'geographic_home_region', effect: 0.3, maxApplications: 1 },
  { ruleId: 'no_budget_info_uncertainty', effect: -0.3, maxApplications: 1 },
];

export function classifyTier(totalScore: number): Tier {
  if (totalScore >= 8.0) return 'HIGH';
  if (totalScore >= 6.0) return 'MEDIUM';
  if (totalScore >= 4.5) return 'LOW';
  return 'EXCLUDED';
}

export const TIER_META: Record<Tier, { label: string; color: string }> = {
  HIGH: { label: 'Alta priorità', color: '#16a34a' },
  MEDIUM: { label: 'Media priorità', color: '#d97706' },
  LOW: { label: 'Bassa priorità', color: '#64748b' },
  EXCLUDED: { label: 'Escluso', color: '#dc2626' },
};

export const FILTERING = {
  minScoreThreshold: 4.5,
  maxResultsPerRun: 50,
};

// Stima effort (giorni) dalle keyword del bando — prima riga che matcha (l'ordine conta).
export const EFFORT_TABLE: { keywords: string[]; days: number }[] = [
  { keywords: ['studio di fattibilita', 'indagine', 'assessment', 'audit'], days: 10 },
  { keywords: ['progetto pilota', 'proof of concept', 'poc', 'prototipo'], days: 20 },
  { keywords: ['formazione', 'corso', 'training', 'workshop', 'aula'], days: 8 },
  { keywords: ['consulenza', 'supporto specialistico', 'assistenza tecnica'], days: 30 },
  { keywords: ['sviluppo software', 'implementazione', 'realizzazione', 'integrazione'], days: 90 },
  { keywords: ['progettazione', 'architettura', 'design di sistema'], days: 45 },
  { keywords: ['fornitura beni', 'acquisto', 'prodotto', 'licenza'], days: 3 },
  { keywords: ['manutenzione', 'gestione operativa', 'conduzione'], days: 60 },
];
export const DEFAULT_EFFORT_DAYS = 25;

// Certificazioni: pattern regex dal config per estrarre quelle richieste dal testo.
export const CERT_PATTERNS: { regex: RegExp; label: string }[] = [
  { regex: /ISO\s*9001(?::\d{4})?/i, label: 'ISO 9001' },
  { regex: /ISO\s*14001(?::\d{4})?/i, label: 'ISO 14001' },
  { regex: /ISO\s*27001(?::\d{4})?/i, label: 'ISO 27001' },
  { regex: /ISO\s*45001(?::\d{4})?/i, label: 'ISO 45001' },
  { regex: /OHSAS\s*18001(?::\d{4})?/i, label: 'OHSAS 18001' },
  { regex: /SA\s*8000(?::\d{4})?/i, label: 'SA 8000' },
  { regex: /SOA\s+(?:OS|OG)\s*\d+/i, label: 'SOA qualificazione' },
  { regex: /AGID\s+(?:accreditamento|qualificazione)/i, label: 'AGID Cloud' },
  { regex: /\bCSA\s+STAR\b/i, label: 'CSA STAR' },
  { regex: /\bPCI[\s-]DSS\b/i, label: 'PCI DSS' },
];

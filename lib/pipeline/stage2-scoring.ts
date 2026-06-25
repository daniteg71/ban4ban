import type { CompanyProfile } from './company-profile';
import { cosine, embed } from './embeddings';
import { DIMENSION_WEIGHTS, EFFORT_TABLE, DEFAULT_EFFORT_DAYS, STAGE2 } from './scoring-rules';
import { cleanText, extractCertifications, extractKeywords, jaccard } from './text-utils';
import type { DimensionScore, NormalizedTender, RawTender } from './types';

// Normalizzazione di un bando sopravvissuto allo Stage 1.
export async function normalizeTender(
  raw: RawTender,
  deadline: string | null,
  daysToDeadline: number | null,
  budget: number | null,
  region: string | null
): Promise<NormalizedTender> {
  const cleaned = cleanText(`${raw.title} ${raw.description}`);
  return {
    raw,
    cleanedText: cleaned,
    deadline,
    daysToDeadline,
    budget,
    region,
    keywords: extractKeywords(cleaned),
    certificationsRequired: extractCertifications(`${raw.title} ${raw.description}`),
    cpvCodes: raw.cpvCodes ?? [],
  };
}

// PRE-SCORE (Stage 2 gate): cosine*0.6 + jaccard*0.4 + cpv bonus. Cheap, decide chi prosegue.
export async function preliminaryScore(
  tender: NormalizedTender,
  profile: CompanyProfile
): Promise<{ score: number; tenderEmbedding: number[]; matchedKeywords: string[] }> {
  const tenderEmbedding = await embed(tender.cleanedText);
  const cos = cosine(tenderEmbedding, profile.embedding);

  const tenderKw = new Set(tender.keywords);
  const jac = jaccard(tenderKw, profile.keywords);
  const matchedKeywords = [...tenderKw].filter((k) => profile.keywords.has(k));

  const cpvBonus = cpvMatch(tender.cpvCodes, profile) ? STAGE2.cpvBonus : 0;
  const raw = cos * STAGE2.cosineWeight + jac * STAGE2.jaccardWeight + cpvBonus;
  return { score: Math.min(10, raw * 10), tenderEmbedding, matchedKeywords };
}

function cpvMatch(tenderCpv: string[], profile: CompanyProfile): boolean {
  // proxy: se una keyword di settore compare nei CPV testuali
  return tenderCpv.some((c) => [...profile.sectors].some((s) => c.toLowerCase().includes(s.slice(0, 4))));
}

// SCORING COMPLETO a 5 dimensioni (gira solo su chi passa il gate).
export function fullScore(
  tender: NormalizedTender,
  profile: CompanyProfile,
  tenderEmbedding: number[],
  today: Date
): { dimensions: DimensionScore[]; missingCertifications: string[] } {
  // 1. semantic
  const sem = cosine(tenderEmbedding, profile.embedding) * 10;

  // 2. keyword overlap (+ cpv affinity bonus)
  const tenderKw = new Set(tender.keywords);
  let kwScore = jaccard(tenderKw, profile.keywords) * 10;
  if (cpvMatch(tender.cpvCodes, profile)) kwScore = Math.min(10, kwScore + 1.5);

  // 3. certification match — confronto "fuzzy" (es. azienda "ISO 27001 LA" copre richiesta "ISO 27001")
  const companyCerts = [...profile.certifications].map((c) => c.toUpperCase());
  const hasCert = (req: string) =>
    companyCerts.some((c) => c.includes(req.toUpperCase()) || req.toUpperCase().includes(c));
  const required = tender.certificationsRequired;
  const held = required.filter(hasCert);
  const missingCertifications = required.filter((c) => !hasCert(c));
  const certScore = required.length === 0 ? 5 : (held.length / required.length) * 10;

  // 4. capacity match
  const effort = estimateEffort(tender.cleanedText);
  const months = tender.daysToDeadline ? Math.max(0.5, tender.daysToDeadline / 30) : 3;
  const availableDays = profile.teamSize * 4 * months; // ~4 gg/persona/mese dedicabili
  const capScore = Math.min(1, availableDays / effort) * 10;

  // 5. budget compatibility
  let budgetScore = 5;
  if (tender.budget !== null) {
    const { minTenderBudget: mn, maxTenderBudget: mx } = profile;
    const range = tender.budget < mn ? tender.budget / mn : tender.budget > mx ? mx / tender.budget : 1;
    budgetScore = range * 10;
  }

  const mk = (key: DimensionScore['key'], score: number, confidence: number, note: string): DimensionScore => ({
    key, score: Math.max(0, Math.min(10, score)), weight: DIMENSION_WEIGHTS[key], confidence, note,
  });

  return {
    missingCertifications,
    dimensions: [
      mk('semantic_similarity', sem, 0.7, 'Affinità semantica bando↔servizi'),
      mk('keyword_overlap', kwScore, 0.8, `${[...tenderKw].filter((k) => profile.keywords.has(k)).length} keyword in comune`),
      mk('certification_match', certScore, required.length ? 0.9 : 0.4, required.length ? `${held.length}/${required.length} certificazioni` : 'Nessuna certificazione obbligatoria'),
      mk('capacity_match', capScore, 0.5, `~${effort} gg stimati vs ${Math.round(availableDays)} gg disponibili`),
      mk('budget_compatibility', budgetScore, tender.budget !== null ? 0.7 : 0.3, tender.budget !== null ? 'Budget nel range sostenibile' : 'Budget non disponibile'),
    ],
  };
}

function estimateEffort(cleaned: string): number {
  for (const row of EFFORT_TABLE) {
    if (row.keywords.some((k) => cleaned.includes(k))) return row.days;
  }
  return DEFAULT_EFFORT_DAYS;
}

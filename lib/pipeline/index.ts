// Orchestratore del funnel a 3 stadi: il miglior trade-off tempo/affidabilità/costo.
//
//   INPUT: DNA aziendale + lista bandi grezzi (dal Drive o dallo scraper)
//   Stage 1  filtri rigidi gratis        -> scarta scaduti/fuori budget/illeggibili
//   Stage 2  pre-score lessicale+embedding-> gate: prosegue solo chi supera la soglia
//   Stage 2b scoring completo 5 dimensioni-> punteggio 0..10 + bonus/malus + tier
//   Stage 3  LLM (caro) SOLO sui top-N    -> insight/explainability, con cost guard
//
// Tornando un PipelineReport con le metriche del funnel (quanti sopravvivono a ogni stadio).

import type { DnaSnapshot } from '../types';
import { buildCompanyProfile } from './company-profile';
import { detectRisks, applyBonusMalus } from './rules';
import { classifyTier, FILTERING } from './scoring-rules';
import { stage1Filter } from './stage1-filters';
import { fullScore, normalizeTender, preliminaryScore } from './stage2-scoring';
import { CostGuard, eligibleForLlm, llmEnrich } from './stage3-llm';
import { STAGE2 } from './scoring-rules';
import { resolveRegion } from './parsers';
import type { PipelineReport, RawTender, ScoredTender } from './types';

export async function runMatchingPipeline(
  dna: DnaSnapshot,
  rawTenders: RawTender[],
  today: Date = new Date()
): Promise<PipelineReport> {
  const profile = await buildCompanyProfile(dna);
  const guard = new CostGuard();

  let stage1Passed = 0;
  let stage2Passed = 0;

  // STAGE 1 + STAGE 2 (pre-score + scoring completo) su tutti i sopravvissuti
  const scored: ScoredTender[] = [];
  for (const raw of rawTenders) {
    const s1 = stage1Filter(raw, today);
    if (!s1.passed) continue;
    stage1Passed++;

    const region = resolveRegion(raw.locationRaw);
    const tender = await normalizeTender(raw, s1.deadline, s1.daysToDeadline, s1.budget, region);
    const pre = await preliminaryScore(tender, profile);
    if (pre.score < STAGE2.gateThreshold) continue; // GATE: non sprechiamo scoring completo
    stage2Passed++;

    const { dimensions, missingCertifications } = fullScore(tender, profile, pre.tenderEmbedding, today);
    const base = dimensions.reduce((s, d) => s + d.score * d.weight, 0);
    const { bonuses, maluses, delta } = applyBonusMalus(tender, profile, missingCertifications);
    const total = Math.max(0, Math.min(10, base + delta));
    const confidence = dimensions.reduce((s, d) => s + d.confidence, 0) / dimensions.length;
    const capacity = dimensions.find((d) => d.key === 'capacity_match')!.score;

    scored.push({
      tender,
      preliminaryScore: pre.score,
      dimensionScores: dimensions,
      totalScore: total,
      confidence,
      tier: classifyTier(total),
      bonuses,
      maluses,
      matchedKeywords: pre.matchedKeywords,
      missingCertifications,
      risks: detectRisks(tender, missingCertifications, capacity, tender.budget),
      llmInsights: null,
      stageReached: '2_scored',
    });
  }

  const debugScores = scored.map((s) => ({
    id: s.tender.raw.externalId,
    total: Math.round(s.totalScore * 100) / 100,
    tier: s.tier,
    dims: s.dimensionScores.map((d) => `${d.key.slice(0, 4)}:${d.score.toFixed(1)}`).join(' '),
  }));

  // ordina per punteggio e scarta gli EXCLUDED
  scored.sort((a, b) => b.totalScore - a.totalScore);
  const filtered = scored
    .filter((s) => s.tier !== 'EXCLUDED' && s.totalScore >= FILTERING.minScoreThreshold)
    .slice(0, FILTERING.maxResultsPerRun);

  // STAGE 3 — LLM solo sui top eleggibili, finché il cost guard lo consente
  let enriched = 0;
  for (let i = 0; i < filtered.length; i++) {
    const s = filtered[i];
    if (!eligibleForLlm(s.totalScore, i) || !guard.canCall()) continue;
    s.llmInsights = await llmEnrich(s.tender, profile, s.missingCertifications);
    s.stageReached = '3_enriched';
    guard.record();
    enriched++;
  }

  return {
    inputCount: rawTenders.length,
    stage1Passed,
    stage2Passed,
    stage3Enriched: enriched,
    llmCallsUsed: guard.callsUsed,
    results: filtered,
    debugScores,
  };
}

// Orchestratore del funnel. Obiettivo PRIMARIO: restituire esattamente i bandi COMPATIBILI,
// cioè pertinenti con l'azienda E che rispettano i requisiti minimi (ammissibilità).
//
//   INPUT: DNA aziendale + lista bandi grezzi (dal Drive o dallo scraper)
//   Stage 1      filtri rigidi gratis        -> scarta scaduti/fuori budget/illeggibili
//   Pertinenza   pre-score lessicale+embedding-> scarta i bandi fuori dalle aree aziendali
//   Ammissibilità requisiti minimi            -> scarta dove mancano certificazioni obblig./fatturato
//   Scoring      5 dimensioni                 -> ordina i compatibili rimasti
//   Stage 3      LLM (caro) SOLO sui top-N    -> insight, con cost guard
//
// Ritorna i compatibili + la lista degli scartati col motivo (per verifica).

import type { DnaSnapshot } from '../types';
import { buildCompanyProfile } from './company-profile';
import { checkRequisitiMinimi } from './eligibility';
import { detectRisks, applyBonusMalus } from './rules';
import { classifyTier, FILTERING, STAGE2 } from './scoring-rules';
import { stage1Filter } from './stage1-filters';
import { fullScore, normalizeTender, preliminaryScore } from './stage2-scoring';
import { CostGuard, eligibleForLlm, llmEnrich } from './stage3-llm';
import { resolveRegion } from './parsers';
import type { PipelineReport, ScartatoInfo, ScoredTender } from './types';

const MOTIVO_STAGE1: Record<string, string> = {
  deadline_expired: 'Scadenza già passata',
  deadline_too_close: 'Scadenza troppo ravvicinata',
  budget_too_low: 'Importo sotto la soglia minima',
  budget_too_high: 'Importo oltre la soglia massima',
  low_quality_parse: 'Dati del bando insufficienti',
};

export async function runMatchingPipeline(
  dna: DnaSnapshot,
  rawTenders: import('./types').RawTender[],
  today: Date = new Date()
): Promise<PipelineReport> {
  const profile = await buildCompanyProfile(dna);
  const guard = new CostGuard();
  const scartati: ScartatoInfo[] = [];
  const scarta = (raw: { externalId: string; title: string; ente?: string }, stadio: ScartatoInfo['stadio'], motivo: string) =>
    scartati.push({ id: raw.externalId, titolo: raw.title, ente: raw.ente ?? '—', stadio, motivo });

  let stage1Passed = 0;
  let pertinenti = 0;
  let ammissibili = 0;

  const scored: ScoredTender[] = [];
  for (const raw of rawTenders) {
    // STAGE 1 — filtri rigidi
    const s1 = stage1Filter(raw, today);
    if (!s1.passed) {
      scarta(raw, 'stage1', MOTIVO_STAGE1[s1.reason] ?? s1.reason);
      continue;
    }
    stage1Passed++;

    const region = resolveRegion(raw.locationRaw);
    const tender = await normalizeTender(raw, s1.deadline, s1.daysToDeadline, s1.budget, region);

    // PERTINENZA — il bando è nelle nostre aree? (pre-score lessicale + embedding)
    const pre = await preliminaryScore(tender, profile);
    if (pre.score < STAGE2.gateThreshold) {
      scarta(raw, 'pertinenza', 'Non pertinente con le aree aziendali');
      continue;
    }
    pertinenti++;

    // AMMISSIBILITÀ — rispettiamo i requisiti minimi obbligatori?
    const elig = checkRequisitiMinimi(tender, dna);
    if (!elig.ammissibile) {
      scarta(raw, 'ammissibilita', `Requisito minimo non soddisfatto: ${elig.motivoEsclusione}`);
      continue;
    }
    ammissibili++;

    // SCORING — ordina i compatibili rimasti
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
      ammissibile: true,
      requisiti: elig.requisiti,
    });
  }

  // i compatibili, ordinati per punteggio
  scored.sort((a, b) => b.totalScore - a.totalScore);
  const results = scored.slice(0, FILTERING.maxResultsPerRun);

  const debugScores = scored.map((s) => ({
    id: s.tender.raw.externalId,
    total: Math.round(s.totalScore * 100) / 100,
    tier: s.tier,
    dims: s.dimensionScores.map((d) => `${d.key.slice(0, 4)}:${d.score.toFixed(1)}`).join(' '),
  }));

  // STAGE 3 — LLM solo sui top compatibili, finché il cost guard lo consente
  let enriched = 0;
  for (let i = 0; i < results.length; i++) {
    const s = results[i];
    if (!eligibleForLlm(s.totalScore, i) || !guard.canCall()) continue;
    s.llmInsights = await llmEnrich(s.tender, profile, s.missingCertifications);
    s.stageReached = '3_enriched';
    guard.record();
    enriched++;
  }

  return {
    inputCount: rawTenders.length,
    stage1Passed,
    pertinenti,
    ammissibili,
    stage3Enriched: enriched,
    llmCallsUsed: guard.callsUsed,
    results,
    scartati,
    debugScores,
  };
}

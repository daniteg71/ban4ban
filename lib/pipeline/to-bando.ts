// Adatta l'output del funnel ai tipi usati dalla UI (BandoSummary per le card, AnalisiBando per il dettaglio).
import type { AnalisiBando, AreaInteresse, BandoSummary, Criterio, MatchRow } from '../types';
import type { ScoredTender } from './types';

const AREE: AreaInteresse[] = [
  'Data & Automation', 'Cybersecurity', 'Cloud & Infrastructure', 'AI & Machine Learning', 'Software Development',
];
function toArea(a?: string): AreaInteresse {
  return (AREE.find((x) => x === a) ?? 'Software Development') as AreaInteresse;
}

const DIM_LABEL: Record<string, string> = {
  semantic_similarity: 'Affinità semantica',
  keyword_overlap: 'Sovrapposizione competenze',
  certification_match: 'Certificazioni',
  capacity_match: 'Capacità/giornate',
  budget_compatibility: 'Compatibilità budget',
};

export function toBandoSummary(s: ScoredTender): BandoSummary {
  const top = s.dimensionScores.slice().sort((a, b) => b.score - a.score)[0];
  return {
    id: s.tender.raw.externalId,
    titolo: s.tender.raw.title,
    ente: s.tender.raw.ente ?? '—',
    scadenza: s.tender.deadline ?? '',
    importo: s.tender.budget ?? 0,
    area: toArea(s.tender.raw.area),
    punteggio: Math.round(s.totalScore * 10) / 10,
    sintesiBreve: s.llmInsights?.strengths[0] ?? `Punto forte: ${DIM_LABEL[top.key]} (${top.score.toFixed(1)}/10).`,
    fonte: 'scraping',
    url: s.tender.raw.url,
    tier: s.tier,
  };
}

export function toAnalisi(s: ScoredTender): AnalisiBando {
  const criteri: Criterio[] = s.dimensionScores.map((d, i) => ({
    id: `dim-${i}`,
    titolo: DIM_LABEL[d.key],
    descrizione: `Peso ${Math.round(d.weight * 100)}% · confidenza ${Math.round(d.confidence * 100)}%`,
    soddisfatto: d.score >= 6,
    evidenza: d.note,
  }));

  const matchTable: MatchRow[] = [
    {
      requisito: 'Certificazioni richieste',
      richiesto: s.tender.certificationsRequired.join(', ') || 'nessuna',
      posseduto: s.missingCertifications.length
        ? `mancano: ${s.missingCertifications.join(', ')}`
        : 'tutte possedute',
      esito: s.missingCertifications.length ? 'mismatch' : 'match',
    },
    {
      requisito: 'Budget',
      richiesto: s.tender.budget ? `€ ${s.tender.budget.toLocaleString('it-IT')}` : 'n.d.',
      posseduto: 'nel range sostenibile',
      esito: s.dimensionScores.find((d) => d.key === 'budget_compatibility')!.score >= 6 ? 'match' : 'parziale',
    },
    {
      requisito: 'Competenze (keyword)',
      richiesto: 'affinità col DNA',
      posseduto: `${s.matchedKeywords.slice(0, 5).join(', ') || '—'}`,
      esito: s.dimensionScores.find((d) => d.key === 'keyword_overlap')!.score >= 6 ? 'match' : 'parziale',
    },
  ];

  const insightTxt = s.llmInsights
    ? `${s.llmInsights.strengths.join(' · ')}. Rischi: ${s.llmInsights.risks.map((r) => r.description).join('; ')}.`
    : 'Bando valutato fino allo scoring; arricchimento LLM non attivato (non rientra nei top per il cost-guard).';

  const checklist = [
    ...(s.llmInsights?.offerHints ?? []).map((h) => ({ voce: h, fatto: false, responsabile: 'Offerta' })),
    ...s.risks.map((r) => ({ voce: `Mitigare: ${r.mitigation}`, fatto: false, responsabile: 'Risk' })),
  ];

  const racc =
    s.tier === 'HIGH' ? 'partecipare' : s.tier === 'MEDIUM' ? 'partecipare-con-riserva' : 'non-partecipare';

  return {
    bando: toBandoSummary(s),
    criteri,
    matchTable,
    analisiCritica: insightTxt,
    checklist,
    raccomandazione: racc,
  };
}

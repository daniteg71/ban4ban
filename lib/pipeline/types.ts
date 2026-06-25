// Tipi del motore di matching bandi <-> DNA (funnel a 3 stadi).
// Vedi README e lib/pipeline/index.ts per il flusso.

export type RawTender = {
  externalId: string;
  sourceId: string;
  url?: string;
  title: string;
  description: string;
  /** ente appaltante (per la UI) */
  ente?: string;
  /** area di interesse (per la UI / dashboard) */
  area?: string;
  /** testo grezzo della scadenza, es. "15 settembre 2026" o "15/09/2026" */
  deadlineRaw?: string;
  /** testo grezzo dell'importo, es. "€ 1.250.000,00" */
  budgetRaw?: string;
  cpvCodes?: string[];
  locationRaw?: string;
};

export type NormalizedTender = {
  raw: RawTender;
  cleanedText: string;
  deadline: string | null; // ISO8601
  daysToDeadline: number | null;
  budget: number | null;
  region: string | null;
  keywords: string[];
  certificationsRequired: string[];
  cpvCodes: string[];
};

export type DimensionKey =
  | 'semantic_similarity'
  | 'keyword_overlap'
  | 'certification_match'
  | 'capacity_match'
  | 'budget_compatibility';

export type DimensionScore = {
  key: DimensionKey;
  score: number; // 0..10
  weight: number;
  confidence: number; // 0..1
  note: string;
};

export type AppliedRule = { ruleId: string; effect: number };

export type Tier = 'HIGH' | 'MEDIUM' | 'LOW' | 'EXCLUDED';

export type DetectedRisk = {
  riskId: string;
  description: string;
  probability: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  mitigation: string;
};

export type LlmInsights = {
  strengths: string[];
  risks: { description: string; severity: 'low' | 'medium' | 'high'; mitigation: string }[];
  offerHints: string[];
  redFlags: string[];
};

export type PipelineStage = '1_filtered' | '2_scored' | '3_enriched';

export type ScoredTender = {
  tender: NormalizedTender;
  preliminaryScore: number; // gate dello stage 2
  dimensionScores: DimensionScore[];
  totalScore: number; // 0..10, dopo bonus/malus
  confidence: number;
  tier: Tier;
  bonuses: AppliedRule[];
  maluses: AppliedRule[];
  matchedKeywords: string[];
  missingCertifications: string[];
  risks: DetectedRisk[];
  llmInsights: LlmInsights | null;
  stageReached: PipelineStage;
  ammissibile: boolean;
  requisiti: import('./eligibility').Requisito[];
};

// Bando scartato a un certo stadio, col motivo leggibile (per verifica/trasparenza).
export type ScartatoInfo = {
  id: string;
  titolo: string;
  ente: string;
  stadio: 'stage1' | 'pertinenza' | 'ammissibilita';
  motivo: string;
};

// Metriche del funnel: quanti bandi sopravvivono a ogni stadio (per spiegare il trade-off).
export type PipelineReport = {
  inputCount: number;
  stage1Passed: number;
  pertinenti: number; // superano il gate di pertinenza (stage 2)
  ammissibili: number; // rispettano i requisiti minimi
  stage3Enriched: number;
  llmCallsUsed: number;
  results: ScoredTender[]; // = compatibili (pertinenti + ammissibili), ordinati
  scartati: ScartatoInfo[]; // tutti gli esclusi, con motivo
  debugScores?: { id: string; total: number; tier: string; dims: string }[];
};

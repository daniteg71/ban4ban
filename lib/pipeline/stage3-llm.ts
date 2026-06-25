// Stage 3 — arricchimento LLM. È la parte CARA: si attiva solo sui top-N o sopra soglia,
// con un tetto duro di chiamate (cost guard). In mock genera insight plausibili senza spendere.
import type { CompanyProfile } from './company-profile';
import { STAGE3 } from './scoring-rules';
import type { LlmInsights, NormalizedTender } from './types';

const MODE = (process.env.DATA_MODE ?? 'mock').toLowerCase();

// Cost guard: contatore chiamate per run. In produzione usare Redis (vedi config: counter_backend).
export class CostGuard {
  private used = 0;
  constructor(private readonly maxPerRun = STAGE3.maxLlmCallsPerRun) {}
  get callsUsed() {
    return this.used;
  }
  canCall(): boolean {
    return this.used < this.maxPerRun;
  }
  record() {
    this.used++;
  }
}

// Decide se un bando merita l'LLM: sopra soglia di score OPPURE nei top-N del run.
export function eligibleForLlm(score: number, rankInRun: number): boolean {
  return score >= STAGE3.byScoreThreshold || rankInRun < STAGE3.byTopNPerRun;
}

export async function llmEnrich(
  tender: NormalizedTender,
  profile: CompanyProfile,
  missingCerts: string[]
): Promise<LlmInsights> {
  if (MODE === 'live') {
    // Backend Dev: chiamata LLM reale (Gemini o Claude). Prompt in JSON-only, temperature bassa,
    // max ~600 token, timeout 30s, 2 retry. Vedi stage3_llm_config del design originale.
    throw new Error('[stage3.llmEnrich] live non implementato — chiamare l\'LLM (JSON-only) e validare con zod.');
  }

  // MOCK: insight derivati deterministicamente da bando + gap, senza spendere token.
  const strengths = [
    `Affinità con i servizi: "${tender.keywords.slice(0, 2).join(', ')}"`,
    profile.preferredRegion ? `Presidio territoriale in ${profile.preferredRegion}` : 'Copertura tecnica sull\'area',
    `Team di ${profile.teamSize} risorse mappate nel DNA`,
  ];
  const risks = missingCerts.length
    ? [{ description: `Certificazione mancante: ${missingCerts.join(', ')}`, severity: 'high' as const, mitigation: 'Valutare RTI con partner certificato.' }]
    : [{ description: 'Concorrenza potenzialmente elevata sul segmento', severity: 'medium' as const, mitigation: 'Differenziare l\'offerta tecnica con referenze PA.' }];
  return {
    strengths,
    risks,
    offerHints: [
      'Citare referenze specifiche nello stesso CPV.',
      'Valorizzare le certificazioni possedute in offerta tecnica.',
    ],
    redFlags: missingCerts.length ? [`Requisito bloccante: ${missingCerts[0]}`] : [],
  };
}

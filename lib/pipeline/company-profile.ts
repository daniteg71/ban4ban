// Profilo aziendale per il matching, derivato dal DnaSnapshot (Formulario + Bilanci + Visura + CV).
import type { DnaSnapshot } from '../types';
import { embed } from './embeddings';
import { resolveRegion } from './parsers';
import { cleanText, extractKeywords } from './text-utils';

export type CompanyProfile = {
  keywords: Set<string>;
  certifications: Set<string>;
  embedding: number[];
  minTenderBudget: number;
  maxTenderBudget: number;
  marginTarget: number;
  teamSize: number;
  preferredRegion: string | null;
  sectors: Set<string>;
};

// Vocabolario italiano per area: serve a creare il ponte IT/EN che, in produzione, farebbe
// l'embedding multilingua. Senza, le aree in inglese del DNA non matcherebbero i bandi italiani.
const AREA_KEYWORDS: Record<string, string[]> = {
  'Data & Automation': ['data', 'dati', 'analytics', 'automazione', 'automation', 'pipeline', 'etl', 'reportistica', 'integrazione'],
  'AI & Machine Learning': ['machine', 'learning', 'intelligenza', 'artificiale', 'modello', 'previsione', 'predittiva', 'algoritmo'],
  'Cloud & Infrastructure': ['cloud', 'infrastruttura', 'migrazione', 'sistemistica', 'devops', 'conduzione', 'manutenzione'],
  'Cybersecurity': ['sicurezza', 'cybersecurity', 'penetration', 'vulnerability', 'audit', 'assessment'],
  'Software Development': ['sviluppo', 'software', 'applicazione', 'applicativo', 'integrazione', 'sistemi', 'realizzazione', 'implementazione'],
};

export async function buildCompanyProfile(dna: DnaSnapshot): Promise<CompanyProfile> {
  const areaTerms = dna.formulario.areeCoperte.flatMap((a) => AREA_KEYWORDS[a] ?? []);
  const profileText = [
    ...dna.formulario.areeCoperte,
    ...areaTerms,
    ...dna.cv.ruoliChiave,
    ...dna.cv.certificazioni,
  ].join(' ');
  const cleaned = cleanText(profileText);

  return {
    keywords: new Set([
      ...extractKeywords(cleaned, 40),
      ...areaTerms,
      ...dna.formulario.areeCoperte.map((a) => a.toLowerCase()),
    ]),
    certifications: new Set(dna.cv.certificazioni),
    embedding: await embed(cleaned),
    // budget sostenibile: da ~20k fino a circa metà del fatturato annuo
    minTenderBudget: 20_000,
    maxTenderBudget: Math.max(100_000, dna.bilanci.ultimoFatturato * 0.5),
    marginTarget: dna.bilanci.margineMedio,
    teamSize: dna.cv.totale,
    preferredRegion: resolveRegion(dna.visura.sedeLegale),
    sectors: new Set(dna.formulario.areeCoperte.map((a) => a.toLowerCase())),
  };
}

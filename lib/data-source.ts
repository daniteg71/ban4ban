// Single entry point per i dati: il frontend chiama sempre queste funzioni,
// e il flag DATA_MODE decide se rispondono dai mock o da Drive+Gemini/scraping.

import { getCachedDna, invalidateDna } from './dna-cache';
import { buildDnaGraph, type DnaGraph } from './dna-graph';
import { MOCK_ANALISI, MOCK_BANDI, MOCK_DNA } from './mock-data';
import { MOCK_RAW_TENDERS } from './mock-tenders';
import { runMatchingPipeline } from './pipeline';
import { toAnalisi, toBandoSummary } from './pipeline/to-bando';
import type { PipelineReport } from './pipeline/types';
import type { AnalisiBando, BandoSource, BandoSummary, DnaSnapshot } from './types';

const MODE = (process.env.DATA_MODE ?? 'mock').toLowerCase();

// ---- DNA -------------------------------------------------------------------
// Sempre passato dalla cache (rebuild-on-demand + caching, vedi dna-cache.ts).

export async function getDna(): Promise<DnaSnapshot> {
  return getCachedDna(async () => {
    if (MODE === 'live') {
      const { buildDnaSnapshot } = await import('./drive');
      return buildDnaSnapshot();
    }
    return MOCK_DNA;
  });
}

// Forza il rebuild del DNA alla prossima richiesta (bottone "Aggiorna DNA" / webhook Drive).
export function refreshDna(): void {
  invalidateDna();
  reportCache = null; // il report dipende dal DNA: invalidalo insieme
}

// Grafo del DNA (knowledge base). Deriva dallo snapshot, quindi cambia col Drive.
export async function getDnaGraph(): Promise<DnaGraph> {
  const dna = await getDna();
  return buildDnaGraph(dna);
}

// ---- Motore di matching (funnel a 3 stadi) ---------------------------------
// La fonte 'scraping' passa i bandi grezzi nel funnel: filtri gratis -> pre-score ->
// scoring completo -> LLM solo sui top. In live i grezzi arrivano dallo scraper/Drive.
// Memoizzato per versione di DNA così dashboard e dettaglio non rieseguono inutilmente.

let reportCache: { key: string; report: PipelineReport } | null = null;

export async function getScrapingReport(): Promise<PipelineReport> {
  const dna = await getDna();
  const key = dna.aggiornatoIl;
  if (reportCache?.key === key) return reportCache.report;

  let rawTenders = MOCK_RAW_TENDERS;
  if (MODE === 'live') {
    const { cercaBandiOnline } = await import('./scraper');
    rawTenders = await cercaBandiOnline(dna); // lo scraper restituisce RawTender[]
  }
  const report = await runMatchingPipeline(dna, rawTenders);
  reportCache = { key, report };
  return report;
}

// ---- Bandi -----------------------------------------------------------------
// Due fonti: 'drive' (file pre-caricati) oppure 'scraping' (ricerca online via funnel).

export async function getBandi(source: BandoSource = 'drive'): Promise<BandoSummary[]> {
  if (source === 'scraping') {
    const report = await getScrapingReport();
    return report.results.map(toBandoSummary);
  }
  // fonte drive
  if (MODE === 'live') {
    const dna = await getDna();
    const { listBandiPdf, fetchBandoTesto } = await import('./drive');
    const { valutaBando } = await import('./gemini');
    const files = await listBandiPdf();
    const analisi = await Promise.all(
      files.map(async (f) => valutaBando(dna, await fetchBandoTesto(f.id)))
    );
    return analisi.map((a) => a.bando);
  }
  return MOCK_BANDI;
}

// ---- Analisi singola -------------------------------------------------------

export async function getAnalisi(id: string): Promise<AnalisiBando | null> {
  if (MODE === 'live') {
    const dna = await getDna();
    const { fetchBandoTesto } = await import('./drive');
    const { valutaBando } = await import('./gemini');
    return valutaBando(dna, await fetchBandoTesto(id));
  }
  // bandi dal funnel (scraping): id tipo "online-..."
  if (id.startsWith('online-')) {
    const report = await getScrapingReport();
    const scored = report.results.find((s) => s.tender.raw.externalId === id);
    return scored ? toAnalisi(scored) : null;
  }
  // bandi drive: analisi curata se esiste, altrimenti generata dal summary
  if (MOCK_ANALISI[id]) return MOCK_ANALISI[id];
  const summary = MOCK_BANDI.find((b) => b.id === id);
  return summary ? analisiDaSummary(summary) : null;
}

// Genera un'analisi plausibile a partire dal punteggio del summary, così ogni bando mock
// (anche quelli "online") è cliccabile e mostra una dashboard completa.
function analisiDaSummary(b: BandoSummary): AnalisiBando {
  const okCount = Math.round(b.punteggio);
  const criteriBase = [
    'Fatturato minimo richiesto',
    'PM certificato',
    'Referenze su progetti analoghi',
    'Certificazione ISO 27001',
    'Margine economico positivo',
    'Sede in territorio UE',
    'Figure tecniche dedicate',
    'Conformità GDPR / sicurezza',
    'Capacità finanziaria / fideiussione',
    'Requisiti speciali del bando',
  ];
  const criteri = criteriBase.map((titolo, i) => ({
    id: `c${i + 1}`,
    titolo,
    descrizione: `Verifica del requisito "${titolo}" rispetto al DNA aziendale.`,
    soddisfatto: i < okCount,
    evidenza: i < okCount ? 'Coperto da DNA (mock)' : 'Gap rilevato (mock)',
  }));
  const racc: AnalisiBando['raccomandazione'] =
    b.punteggio >= 7.5 ? 'partecipare' : b.punteggio >= 5 ? 'partecipare-con-riserva' : 'non-partecipare';
  return {
    bando: b,
    criteri,
    matchTable: [
      { requisito: 'Area tecnica', richiesto: b.area, posseduto: b.area, esito: 'match' },
      { requisito: 'Importo', richiesto: `€ ${b.importo.toLocaleString('it-IT')}`, posseduto: 'Sostenibile', esito: 'parziale' },
    ],
    analisiCritica:
      `Analisi sintetica generata sui ${okCount}/10 criteri coperti. ` +
      (b.url ? `Fonte online: ${b.url}. ` : '') +
      'In modalità live questa sezione sarà prodotta da Gemini sul testo integrale del bando.',
    checklist: [
      { voce: 'Verificare requisiti speciali del bando', fatto: false, responsabile: 'PM' },
      { voce: 'Confermare disponibilità figure chiave', fatto: false, responsabile: 'HR' },
    ],
    raccomandazione: racc,
  };
}

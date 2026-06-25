// Bandi GREZZI simulati: è ciò che, in live, arriverebbe dallo scraper o dal Drive.
// Volutamente eterogenei per mostrare il funnel all'opera:
//  - alcuni vengono scartati a Stage 1 (scaduti / fuori budget / illeggibili)
//  - altri non superano il gate di Stage 2 (poca affinità col DNA)
//  - i migliori arrivano a Stage 3 (LLM).
// Le scadenze sono relative a "oggi" per restare sempre valide nei test.

import type { RawTender } from './pipeline/types';

function plusDays(days: number): string {
  const base = new Date('2026-06-24T00:00:00Z'); // ancora coerente con currentDate
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export const MOCK_RAW_TENDERS: RawTender[] = [
  {
    externalId: 'online-consip-101',
    sourceId: 'mepa',
    url: 'https://www.acquistinretepa.it/',
    title: 'Servizi di data analytics e automazione per la PA centrale',
    ente: 'Consip / MEPA',
    area: 'Data & Automation',
    description:
      'Affidamento di servizi di sviluppo software, implementazione di pipeline di data analytics e automazione dei processi documentali. Richiesta certificazione ISO 27001 e ISO 9001. Esperienza in integrazione di sistemi.',
    deadlineRaw: plusDays(98),
    budgetRaw: '€ 750.000,00',
    cpvCodes: ['72000000', '72500000'],
    locationRaw: 'Lazio',
  },
  {
    externalId: 'online-regione-102',
    sourceId: 'portale-regionale',
    url: 'https://example.org/bando102',
    title: 'Piattaforma di machine learning per previsione domanda sanitaria',
    ente: 'Regione Lombardia',
    area: 'AI & Machine Learning',
    description:
      'Progettazione e sviluppo software di una piattaforma di machine learning per la previsione della domanda. Richiesta esperienza in progettazione di sistemi e architettura. Certificazione ISO 27001 gradita.',
    deadlineRaw: '20 ottobre 2026',
    budgetRaw: '€ 420.000,00',
    cpvCodes: ['72200000'],
    locationRaw: 'Lombardia',
  },
  {
    externalId: 'online-comune-103',
    sourceId: 'portale-comunale',
    url: 'https://example.org/bando103',
    title: 'Migrazione cloud e gestione infrastruttura anagrafica',
    ente: 'Comune di Bologna',
    area: 'Cloud & Infrastructure',
    description:
      'Servizi di migrazione cloud e conduzione/manutenzione dell\'infrastruttura. Richiesta qualificazione AGID accreditamento e ISO 27001. Assistenza tecnica continuativa.',
    deadlineRaw: '28/07/2026',
    budgetRaw: '€ 95.000,00',
    cpvCodes: ['72500000'],
    locationRaw: 'Emilia-Romagna',
  },
  {
    externalId: 'online-univ-104',
    sourceId: 'portale-universita',
    url: 'https://example.org/bando104',
    title: 'Penetration test e cybersecurity assessment dipartimentale',
    ente: 'Università di Padova',
    area: 'Cybersecurity',
    description:
      'Servizio di assessment e penetration test sui sistemi dipartimentali. Richiesta certificazione PCI DSS e personale con certificazioni offensive security. Audit di sicurezza.',
    deadlineRaw: '5 novembre 2026',
    budgetRaw: '€ 130.000,00',
    cpvCodes: ['72600000'],
    locationRaw: 'Veneto',
  },
  // --- SCARTATO Stage 1: scaduto ---
  {
    externalId: 'online-scaduto-105',
    sourceId: 'mepa',
    title: 'Fornitura licenze software gestionale',
    ente: 'ASL Napoli',
    area: 'Software Development',
    description: 'Fornitura beni: licenze software gestionale e relativo supporto specialistico.',
    deadlineRaw: plusDays(-3),
    budgetRaw: '€ 60.000,00',
    cpvCodes: ['48000000'],
    locationRaw: 'Campania',
  },
  // --- SCARTATO Stage 1: fuori budget (troppo grande) ---
  {
    externalId: 'online-mega-106',
    sourceId: 'portale-nazionale',
    title: 'Realizzazione e gestione decennale rete nazionale fibra',
    ente: 'Ministero',
    area: 'Cloud & Infrastructure',
    description:
      'Progettazione, realizzazione e gestione operativa di una rete nazionale in fibra ottica su scala decennale, con manutenzione e conduzione.',
    deadlineRaw: '15 dicembre 2026',
    budgetRaw: '€ 18.000.000,00',
    cpvCodes: ['32000000'],
    locationRaw: 'Lazio',
  },
  // --- SCARTATO Stage 2: poca affinità col DNA (settore lontano) ---
  {
    externalId: 'online-catering-107',
    sourceId: 'portale-comunale',
    title: 'Servizio di ristorazione e catering per mensa scolastica',
    ente: 'Comune di Lecce',
    area: 'Software Development',
    description:
      'Affidamento del servizio di ristorazione collettiva e catering per le mense scolastiche comunali, con fornitura pasti e gestione operativa.',
    deadlineRaw: '30 settembre 2026',
    budgetRaw: '€ 240.000,00',
    cpvCodes: ['55500000'],
    locationRaw: 'Puglia',
  },
  // --- SCARTATO Stage 1: illeggibile (descrizione vuota) ---
  {
    externalId: 'online-vuoto-108',
    sourceId: 'scraper',
    title: 'Avviso',
    description: 'n.d.',
    deadlineRaw: '10 ottobre 2026',
    budgetRaw: '',
    cpvCodes: [],
  },
];

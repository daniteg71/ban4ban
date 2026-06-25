// Ricerca bandi su internet ("Cerca bandi online").
// IMPORTANTE: lo scraper NON valuta i bandi — restituisce solo i bandi GREZZI (RawTender[]).
// La valutazione la fa il funnel a 3 stadi (lib/pipeline), così l'AI costosa gira solo sui top.
//
// STRATEGIA CONSIGLIATA per l'implementazione live:
//   1. Partire dalle aree coperte dal DNA (dna.formulario.areeCoperte) per costruire le query.
//   2. Interrogare i portali appalti pubblici italiani. Opzioni:
//        - API/feed ufficiali quando esistono (es. portali regionali, MEPA/Acquisti in Rete,
//          ANAC dati aperti) -> preferibili allo scraping HTML perché stabili e legali.
//        - In assenza di API, scraping HTML delle pagine di ricerca bando.
//   3. Per ogni risultato estrarre titolo, descrizione, scadenza/budget GREZZI, CPV, ente, area, URL.
//   4. Restituire RawTender[]. Il funnel penserà a filtrare, normalizzare e valutare.
//
// NOTA: rispettare i Terms of Service dei portali e robots.txt. Dove c'è un'API ufficiale, usarla.

import type { RawTender } from './pipeline/types';
import type { DnaSnapshot } from './types';

export async function cercaBandiOnline(_dna: DnaSnapshot): Promise<RawTender[]> {
  throw new Error(
    '[scraper.cercaBandiOnline] non ancora implementato — costruire le query dalle aree del DNA, ' +
      'interrogare i portali appalti (API ufficiali dove disponibili) ed estrarre i bandi GREZZI ' +
      'come RawTender[] (title, description, deadlineRaw, budgetRaw, cpvCodes, ente, area, url). ' +
      'NON valutarli qui: ci pensa il funnel in lib/pipeline.'
  );
}

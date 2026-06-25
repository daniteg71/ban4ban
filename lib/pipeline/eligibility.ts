// Requisiti minimi / AMMISSIBILITÀ.
// Un bando è COMPATIBILE solo se l'azienda rispetta TUTTI i requisiti minimi obbligatori.
// Qui controlliamo: certificazioni obbligatorie e fatturato minimo richiesto.
// (Il punteggio fine 0-10 è un'altra cosa: serve a ordinare i compatibili, non ad ammetterli.)

import type { DnaSnapshot } from '../types';
import { parseItalianBudget } from './parsers';
import { CERT_PATTERNS } from './scoring-rules';
import type { NormalizedTender } from './types';

export type Requisito = {
  nome: string;
  richiesto: string;
  posseduto: string;
  soddisfatto: boolean;
  bloccante: boolean; // se true e non soddisfatto -> NON ammissibile
};

export type Eligibility = {
  ammissibile: boolean;
  requisiti: Requisito[];
  motivoEsclusione: string | null; // primo requisito bloccante non soddisfatto
};

// Una certificazione è "obbligatoria" salvo che vicino alla menzione compaiano parole come
// "gradita / preferenziale / titolo preferenziale / premiante".
const OPTIONAL_MARKERS = /(gradit|preferenzial|titolo prefer|costituisce titolo|premiant|facoltativ)/i;

// La clausola (frase tra ; . o a capo) che contiene la certificazione.
function clauseAt(text: string, idx: number): string {
  const before = text.slice(0, idx);
  const start = Math.max(before.lastIndexOf(';'), before.lastIndexOf('.'), before.lastIndexOf('\n')) + 1;
  const rel = text.slice(idx).search(/[;.\n]/);
  const end = rel === -1 ? text.length : idx + rel;
  return text.slice(start, end);
}

// Obbligatoria salvo che la sua clausola contenga un marcatore di preferenzialità.
function isMandatory(text: string, matchIndex: number): boolean {
  return !OPTIONAL_MARKERS.test(clauseAt(text, matchIndex));
}

export function checkRequisitiMinimi(tender: NormalizedTender, dna: DnaSnapshot): Eligibility {
  const text = `${tender.raw.title} ${tender.raw.description}`;
  const requisiti: Requisito[] = [];

  // confronto certificazioni "fuzzy" (es. "ISO 27001 LA" copre "ISO 27001")
  const companyCerts = dna.cv.certificazioni.map((c) => c.toUpperCase());
  const hasCert = (label: string) =>
    companyCerts.some((c) => c.includes(label.toUpperCase()) || label.toUpperCase().includes(c));

  // --- Certificazioni richieste ---
  for (const { regex, label } of CERT_PATTERNS) {
    const m = regex.exec(text);
    if (!m) continue;
    const mandatory = isMandatory(text, m.index);
    const held = hasCert(label);
    requisiti.push({
      nome: `Certificazione ${label}`,
      richiesto: mandatory ? 'obbligatoria' : 'preferenziale',
      posseduto: held ? 'presente nel DNA' : 'non presente',
      soddisfatto: held,
      bloccante: mandatory,
    });
  }

  // --- Fatturato minimo richiesto ---
  const fatt = extractFatturatoMinimo(text);
  if (fatt !== null) {
    const ok = dna.bilanci.ultimoFatturato >= fatt;
    requisiti.push({
      nome: 'Fatturato minimo',
      richiesto: `≥ € ${fatt.toLocaleString('it-IT')}`,
      posseduto: `€ ${dna.bilanci.ultimoFatturato.toLocaleString('it-IT')}`,
      soddisfatto: ok,
      bloccante: true,
    });
  }

  const violati = requisiti.filter((r) => r.bloccante && !r.soddisfatto);
  return {
    ammissibile: violati.length === 0,
    requisiti,
    motivoEsclusione: violati.length ? violati[0].nome : null,
  };
}

function extractFatturatoMinimo(text: string): number | null {
  // es. "fatturato globale non inferiore a € 3.000.000", "fatturato minimo di 2.000.000 euro"
  const re = /fatturato[^.€\d]{0,60}?(?:non inferiore a|minimo|almeno|pari ad?|di)\s*(€?\s*[\d]{1,3}(?:\.[\d]{3})*(?:,[\d]{1,2})?)/i;
  const m = text.match(re);
  return m ? parseItalianBudget(m[1]) : null;
}

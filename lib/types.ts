export type AreaInteresse =
  | 'Data & Automation'
  | 'Cybersecurity'
  | 'Cloud & Infrastructure'
  | 'AI & Machine Learning'
  | 'Software Development';

export type Criterio = {
  id: string;
  titolo: string;
  descrizione: string;
  soddisfatto: boolean;
  evidenza: string;
};

export type MatchRow = {
  requisito: string;
  richiesto: string;
  posseduto: string;
  esito: 'match' | 'parziale' | 'mismatch';
};

export type ChecklistItem = {
  voce: string;
  fatto: boolean;
  responsabile?: string;
};

// Da dove arriva un bando: scraping su internet oppure file caricati su Drive.
export type BandoSource = 'scraping' | 'drive';

export type BandoSummary = {
  id: string;
  titolo: string;
  ente: string;
  scadenza: string;
  importo: number;
  area: AreaInteresse;
  punteggio: number;
  sintesiBreve: string;
  fonte: BandoSource;
  // Presente solo per i bandi trovati via scraping: link alla pagina originale.
  url?: string;
  // Tier dal motore di matching (funnel a 3 stadi), se calcolato.
  tier?: 'HIGH' | 'MEDIUM' | 'LOW' | 'EXCLUDED';
};

export type RequisitoMinimo = {
  nome: string;
  richiesto: string;
  posseduto: string;
  soddisfatto: boolean;
  bloccante: boolean;
};

export type AnalisiBando = {
  bando: BandoSummary;
  criteri: Criterio[];
  matchTable: MatchRow[];
  analisiCritica: string;
  checklist: ChecklistItem[];
  raccomandazione: 'partecipare' | 'partecipare-con-riserva' | 'non-partecipare';
  // Requisiti minimi (ammissibilità): se tutti i bloccanti sono soddisfatti -> compatibile.
  requisiti?: RequisitoMinimo[];
  ammissibile?: boolean;
};

export type DnaSnapshot = {
  aggiornatoIl: string;
  formulario: { servizi: number; areeCoperte: AreaInteresse[] };
  bilanci: { ultimoFatturato: number; margineMedio: number; anniDisponibili: number[] };
  visura: { ragioneSociale: string; codiceFiscale: string; sedeLegale: string };
  cv: { totale: number; certificazioni: string[]; ruoliChiave: string[] };
};

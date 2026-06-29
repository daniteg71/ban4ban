import 'server-only'
import type { CompanyDna, Grant } from '@/lib/db/schema'

// CONTRATTO dell'output strategico (Step 6). Separiamo DATO e GRAFICA:
//  - l'algoritmo di valutazione (Giuseppe + Emanuel) PRODUCE questo oggetto
//  - la pagina/PDF lo RENDE
// Così i due lavori vanno in parallelo: basta rispettare questo schema.

export type StrategyMatchRow = {
  requisito: string
  richiesto: string
  posseduto: string
  esito: 'match' | 'parziale' | 'mismatch' | 'da-valutare'
}

export type StrategyChecklistItem = { voce: string; fatto: boolean; responsabile?: string }
export type StrategyMilestone = { quando: string; cosa: string }

export type ExecutionStrategy = {
  generatedAt: string
  azienda: {
    nome: string
    piva?: string
    ateco?: string[]
    fatturato?: number
    cert?: string[]
    comp?: string[]
  }
  bando: { titolo: string; fonte: string; url?: string; scadenza?: string; importo?: string }
  // null finché non arriva il modulo di valutazione del team
  score: number | null // 1-10
  probabilita: number | null // 0-100
  matching: StrategyMatchRow[] // tabella match / non-match
  checklist: StrategyChecklistItem[] // cose da fare
  milestone: StrategyMilestone[]
  documentiMancanti: string[]
  puntiForza: string[]
  note: string
}

// HOOK: costruisce lo "scheletro" della strategia con i DATI REALI disponibili
// (anagrafica azienda dal DNA + dati bando dallo scraping) e lascia SEGNAPOSTO dove
// serve l'AI (score, probabilità, matching specifico). Il team riempie qui.
export function buildStrategy(dna: CompanyDna | null, grant: Grant, nowIso: string): ExecutionStrategy {
  const nome = dna?.nodes.find((n) => n.id === 'core')?.label ?? 'Azienda'
  return {
    generatedAt: nowIso,
    azienda: {
      nome,
      // anagrafica strutturata (p.iva, ateco, fin, cert) arriverà dall'estrazione DNA (Gustavo)
    },
    bando: {
      titolo: grant.title,
      fonte: grant.sourceName ?? '—',
      url: grant.sourceUrl ?? undefined,
      scadenza: grant.deadline ?? undefined,
      importo: grant.amount ?? undefined,
    },
    // voto 1-10 già calcolato in fase di ricerca (algoritmo di valutazione)
    score: grant.matchScore && grant.matchScore > 0 ? grant.matchScore : null,
    probabilita: null,
    // struttura della tabella pronta; gli esiti reali li mette l'algoritmo del team
    matching: [
      { requisito: 'Requisiti di ammissibilità', richiesto: 'da bando', posseduto: '—', esito: 'da-valutare' },
      { requisito: 'Certificazioni richieste', richiesto: 'da bando', posseduto: '—', esito: 'da-valutare' },
      { requisito: 'Capacità economico-finanziaria', richiesto: 'da bando', posseduto: '—', esito: 'da-valutare' },
      { requisito: 'Coerenza con i progetti/portfolio', richiesto: 'da bando', posseduto: '—', esito: 'da-valutare' },
    ],
    // checklist operativa standard (fattuale, non analisi): la valorizza poi l'algoritmo
    checklist: [
      { voce: 'Verificare i requisiti di ammissibilità sulla pagina ufficiale', fatto: false, responsabile: 'PM' },
      { voce: 'Raccogliere visura, bilanci e certificazioni aggiornate', fatto: false, responsabile: 'Amministrazione' },
      { voce: 'Predisporre il progetto e il piano di spesa coerente col bando', fatto: false, responsabile: 'Tecnico' },
      { voce: 'Preparare gli allegati tecnici e la documentazione richiesta', fatto: false, responsabile: 'Tecnico' },
      { voce: 'Firma digitale e invio della domanda entro la scadenza', fatto: false, responsabile: 'Legale' },
    ],
    milestone: [
      { quando: 'Settimana 1', cosa: 'Verifica ammissibilità e raccolta documenti' },
      { quando: 'Settimana 2-3', cosa: 'Stesura progetto e piano di spesa' },
      { quando: 'Settimana 4', cosa: 'Allegati, revisione e invio' },
    ],
    documentiMancanti: [], // li popola il modulo di valutazione
    puntiForza: [], // li popola il modulo di valutazione
    note: 'Punteggio, probabilità e matching puntuale sono in arrivo dal modulo di valutazione del team. Anagrafica strutturata (P.IVA, ATECO, dati finanziari) dall’estrazione DNA dal Drive.',
  }
}

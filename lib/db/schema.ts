// Tipi del dominio. (Versione MVP senza Postgres: la persistenza è in-memory, vedi lib/store.ts.)
// Quando arriverà un vero DB, qui si rimettono le tabelle drizzle e in store.ts si ricollega pg.

export type Company = {
  id: number
  name: string
  driveFolderName: string | null
  driveFolderId: string | null
  sector: string | null
  description: string | null
  dna: CompanyDna | null
  createdAt: Date
}

export type Grant = {
  id: number
  /** ref STABILE (hash di fonte+link): identifica il bando tra istanze/ricerche, usato nelle URL /bandi/[ref] */
  ref?: string
  companyId: string
  title: string
  sourceUrl: string | null
  sourceName: string | null
  description: string | null
  deadline: string | null
  amount: string | null
  category: string | null
  region: string | null
  matchScore: number | null
  /** giustificazione breve del voto (dall'algoritmo di valutazione) */
  scoreReason: string | null
  strategy: GrantStrategy | null
  createdAt: Date
}

// ---- Tipi salvati come JSON ----

export type DnaNode = {
  id: string
  label: string
  /** la categoria determina colore + cluster nella galassia */
  group:
    | 'core'
    | 'competenze'
    | 'mercato'
    | 'finanza'
    | 'innovazione'
    | 'team'
    | 'asset'
  value: number // 0-100 forza, determina la dimensione del nodo
  summary: string
}

export type DnaLink = {
  source: string
  target: string
  strength: number // 0-1
}

export type CompanyDna = {
  headline: string
  nodes: DnaNode[]
  links: DnaLink[]
  strengths: string[]
  gaps: string[]
}

export type GrantStrategy = {
  summary: string
  probability: number // 0-100
  fitReasons: string[]
  risks: string[]
  steps: string[]
  recommendedTimeline: string
}

// File del Drive aziendale. `modifiedTime` (RFC-3339) serve a rilevare le modifiche
// per la ricostruzione incrementale del DNA (Step 2), senza scaricare i file.
export type DriveFile = { id: string; name: string; mimeType: string; modifiedTime?: string }

// Bando scartato dal filtro requisiti minimi (NON valutato dall'AI -> 0 token), col motivo.
export type ScartatoGrant = {
  title: string
  sourceName: string | null
  sourceUrl: string | null
  motivo: string
}

// Una ricerca salvata nello storico.
export type SearchRun = {
  id: number
  companyId: string
  at: Date
  found: number
  scraped: number
  /** bandi mai visti prima (andrebbero all'AI) */
  nuovi: number
  /** bandi già noti (riuso cache, zero token) */
  giaNoti: number
  grants: Grant[]
  /** non ammissibili: scartati dal filtro requisiti minimi, NON valutati dall'AI (0 token) */
  scartati: ScartatoGrant[]
}

'use server'

import { revalidatePath } from 'next/cache'
import type { Grant } from '@/lib/db/schema'
import { scrapeGrants } from '@/lib/scrape'
import { checkDriveConnection, type DriveStatus } from '@/lib/drive'
import { getDnaFromDrive } from '@/lib/dna-from-drive'
import { COMPANY, filterCompatible, placeholderDnaFromFiles } from '@/lib/company-config'
import { addSearchRun, findGrant, getLatestRun, getRun, getRuns } from '@/lib/store'
import { classifyNewVsKnown, registerSeen } from '@/lib/token-cache'
import { buildStrategy, type ExecutionStrategy } from '@/lib/strategy'
import { refOf, scoreBandi } from '@/lib/scoring'

const PAGE_SIZE = 8

export async function getCompanyInfo() {
  const drive: DriveStatus = await checkDriveConnection()
  // DNA REALE sintetizzato dal testo dei file (Step 1, con cache incrementale Step 2).
  // Fallback al segnaposto (solo nomi file) se l'estrazione non produce nulla.
  let dna = null
  if (drive.connected) {
    const built = await getDnaFromDrive()
    dna = built?.companyDna ?? placeholderDnaFromFiles(drive.files)
  }
  return { company: COMPANY, drive, dna }
}

// CERCA BANDI — pipeline:
//  1) scraping reale dai siti principali (MIMIT), INDIPENDENTE dal DNA
//  2) [hook Gustavo] riscrittura del DNA dal Drive
//  3) [hook team] filtro di compatibilità DNA <-> bando
//  4) salva la ricerca nello storico
export async function searchGrants() {
  // 1) scraping reale (zero token: HTML/RSS, niente AI)
  const raw = await scrapeGrants()

  // ordina "in ordine di uscita": per data di pubblicazione, più recenti prima (gli undated in coda)
  raw.sort((a, b) => {
    const ta = a.published ? Date.parse(a.published) : NaN
    const tb = b.published ? Date.parse(b.published) : NaN
    return (Number.isNaN(tb) ? -Infinity : tb) - (Number.isNaN(ta) ? -Infinity : ta)
  })

  // 2) DNA dal Drive (cache incrementale). Robusto: se l'estrazione fallisce/è lenta, si prosegue
  //    comunque (dna=null) e lo scoring usa il fallback deterministico -> la ricerca non si rompe mai.
  let companyDna = null
  let corporateDna = null
  try {
    const built = await getDnaFromDrive()
    companyDna = built?.companyDna ?? null
    corporateDna = built?.corporateDna ?? null
  } catch {
    // ignora: si procede senza DNA (fallback)
  }
  const dna = companyDna

  // regionale vs nazionale (utile anche per i filtri futuri)
  const REGIONALI = ['Lazio Innova', 'Sviluppo Toscana', 'Sardegna Impresa']
  const regioneOf = (source: string) => (REGIONALI.includes(source) ? 'Regionale' : 'Nazionale')

  // mappa i risultati grezzi in "bandi" (nessuna valutazione: matchScore resta 0, non mostrato)
  let grants: Omit<Grant, 'id' | 'companyId' | 'createdAt'>[] = raw.map((r) => ({
    title: r.title,
    sourceUrl: r.link,
    sourceName: r.source,
    description: r.snippet,
    deadline: 'Da verificare',
    amount: 'Da verificare',
    category: null,
    region: regioneOf(r.source),
    matchScore: 0,
    strategy: null,
  }))

  // 3) FILTRO REQUISITI MINIMI (Step 4, booleano, GRATIS): separa compatibili da non ammissibili.
  // Solo i compatibili andranno all'AI -> risparmio token. I non ammissibili: mostrati col motivo, 0 token.
  const { compatibili, scartati } = filterCompatible(dna, grants as Grant[])
  const scartatiData = scartati.map((s) => ({
    title: s.grant.title,
    sourceName: s.grant.sourceName,
    sourceUrl: s.grant.sourceUrl,
    motivo: s.motivo,
  }))

  // 3c) VALUTAZIONE 1-10 su TUTTI i compatibili (batch Gemini + cache + fallback). Mai blocca la ricerca.
  try {
    const scores = await scoreBandi(
      corporateDna,
      compatibili.map((g) => ({
        ref: refOf({ source: g.sourceName, link: g.sourceUrl }),
        title: g.title,
        source: g.sourceName ?? '',
        text: g.description ?? '',
      }))
    )
    for (const g of compatibili) {
      const s = scores[refOf({ source: g.sourceName, link: g.sourceUrl })]
      g.matchScore = s ? s.score : 0 // voto 1-10
    }
  } catch {
    // se lo scoring fallisce, i bandi restano senza voto (matchScore 0) ma la ricerca funziona
  }
  // sorting per affinità: voto più alto in cima
  compatibili.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))

  // 3b) ANTI-SPRECO TOKEN: nuovi vs già noti (solo i nuovi vengono valutati dall'AI; i noti riusano la cache).
  const { nuovi, giaNoti } = classifyNewVsKnown(compatibili)
  registerSeen(compatibili, new Date().toISOString())

  // 4) storico
  addSearchRun(compatibili.length, raw.length, nuovi.length, giaNoti.length, compatibili, scartatiData)

  revalidatePath('/bandi')
  return {
    found: compatibili.length,
    scraped: raw.length,
    scartati: scartatiData.length,
    nuovi: nuovi.length,
    giaNoti: giaNoti.length,
  }
}

// Bandi paginati (8 per pagina) della ricerca corrente o di una dello storico.
export async function getGrantsPage(
  page = 1,
  runId?: number
): Promise<{ grants: Grant[]; page: number; totalPages: number; total: number }> {
  const run = runId ? getRun(runId) : getLatestRun()
  const all = run?.grants ?? []
  const total = all.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const p = Math.min(Math.max(1, page), totalPages)
  const grants = all.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE)
  return { grants, page: p, totalPages, total }
}

// Output strategico (Step 6) per un bando. Costruito dai dati reali; i campi AI sono segnaposto
// finché non arriva il modulo di valutazione del team.
export async function getStrategy(grantId: number): Promise<ExecutionStrategy | null> {
  const grant = findGrant(grantId)
  if (!grant) return null
  const { dna } = await getCompanyInfo()
  return buildStrategy(dna, grant, new Date().toISOString())
}

export async function getSearchHistory(): Promise<
  { id: number; at: string; found: number; scraped: number; nuovi: number; giaNoti: number; scartati: number }[]
> {
  return getRuns().map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    found: r.found,
    scraped: r.scraped,
    nuovi: r.nuovi,
    giaNoti: r.giaNoti,
    scartati: r.scartati.length,
  }))
}

// Non ammissibili (scartati dal filtro requisiti minimi) della ricerca corrente o di una dello storico.
export async function getScartati(runId?: number): Promise<import('@/lib/db/schema').ScartatoGrant[]> {
  const run = runId ? getRun(runId) : getLatestRun()
  return run?.scartati ?? []
}

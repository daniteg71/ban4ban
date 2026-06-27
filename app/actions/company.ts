'use server'

import { revalidatePath } from 'next/cache'
import type { Grant } from '@/lib/db/schema'
import { scrapeGrants } from '@/lib/scrape'
import { checkDriveConnection, type DriveStatus } from '@/lib/drive'
import { COMPANY, filterCompatible, placeholderDnaFromFiles, rewriteDnaFromDrive } from '@/lib/company-config'
import { addSearchRun, getLatestRun, getRun, getRuns } from '@/lib/store'
import { classifyNewVsKnown, dnaVersion, registerSeen } from '@/lib/token-cache'

const PAGE_SIZE = 8

export async function getCompanyInfo() {
  const drive: DriveStatus = await checkDriveConnection()
  // DNA segnaposto dai file reali del Drive (il DNA completo lo riscriverà l'automazione di Gustavo).
  const dna = drive.connected ? placeholderDnaFromFiles(drive.files) : null
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

  // 2) DNA dal Drive (per ora pass-through: lo riscriverà l'API di Gustavo)
  const { drive } = await getCompanyInfo()
  const dna = drive.connected ? placeholderDnaFromFiles(drive.files) : null
  await rewriteDnaFromDrive(dna)

  // mappa i risultati grezzi in "bandi" (nessuna valutazione: matchScore resta 0, non mostrato)
  let grants: Omit<Grant, 'id' | 'companyId' | 'createdAt'>[] = raw.map((r) => ({
    title: r.title,
    sourceUrl: r.link,
    sourceName: r.source,
    description: r.snippet,
    deadline: 'Da verificare',
    amount: 'Da verificare',
    category: null,
    region: 'Nazionale',
    matchScore: 0,
    strategy: null,
  }))

  // 3) compatibilità (pass-through finché non arriva l'algoritmo del team)
  grants = filterCompatible(dna, grants as Grant[])

  // 3b) ANTI-SPRECO TOKEN: quanti bandi sono nuovi (andrebbero all'AI) vs già noti (riuso cache).
  // Lo scoring del team userà withScoreCache(hash, dnaVersion(dna), ...) per spendere solo sui nuovi.
  void dnaVersion(dna)
  const { nuovi, giaNoti } = classifyNewVsKnown(raw)
  registerSeen(raw, new Date().toISOString())

  // 4) storico
  addSearchRun(grants.length, raw.length, nuovi.length, giaNoti.length, grants)

  revalidatePath('/bandi')
  return { found: grants.length, scraped: raw.length, nuovi: nuovi.length, giaNoti: giaNoti.length }
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

export async function getSearchHistory(): Promise<
  { id: number; at: string; found: number; scraped: number; nuovi: number; giaNoti: number }[]
> {
  return getRuns().map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    found: r.found,
    scraped: r.scraped,
    nuovi: r.nuovi,
    giaNoti: r.giaNoti,
  }))
}

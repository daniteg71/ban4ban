'use server'

import { cache } from 'react'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import type { Grant } from '@/lib/db/schema'
import { getGrantsPool } from '@/lib/scrape'
import { checkDriveConnection, listCompanyFolders, type DriveStatus } from '@/lib/drive'
import { getDnaFromDrive } from '@/lib/dna-from-drive'
import { APP_NAME, filterCompatible, folderUrl, getSelectedFolderId, placeholderDnaFromFiles } from '@/lib/company-config'
import { addSearchRun, getLatestRun, getRun, getRuns } from '@/lib/store'
import { classifyNewVsKnown, registerSeen } from '@/lib/token-cache'
import { buildStrategy, type ExecutionStrategy } from '@/lib/strategy'
import { refOf, scoreBandi } from '@/lib/scoring'
import { evaluateTenderForCompany } from '@/lib/evaluate'

const PAGE_SIZE = 8
const COMPANY_COOKIE = 'ban4ban_company'

// Azienda selezionata (o la prima disponibile). null se il Drive non ha sottocartelle.
// Memoizzato per-richiesta: getCompanyInfo + getGrantsPage + getSearchHistory + getScartati
// (tutti chiamati in Promise.all dalla home) la risolvono una volta sola.
const resolveSelected = cache(async (): Promise<{ id: string; name: string } | null> => {
  const companies = await listCompanyFolders()
  if (companies.length === 0) return null
  const sel = await getSelectedFolderId()
  return companies.find((c) => c.id === sel) ?? companies[0]
})

// Cambia l'azienda attiva (selettore).
export async function setCompany(folderId: string) {
  ;(await cookies()).set(COMPANY_COOKIE, folderId, { sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 })
  revalidatePath('/')
  revalidatePath('/dna')
}

// `withDna` costruisce la "galassia" DNA (download file + sintesi Gemini): SERVE solo alla
// pagina /dna. Home e strategia NON usano il dna qui → di default lo saltiamo (grosso risparmio:
// niente download dei file né chiamata Gemini sul render di quelle pagine).
export async function getCompanyInfo(opts?: { withDna?: boolean }) {
  // PRE-DOWNLOAD "a monte": avvia (senza bloccare) lo scaricamento del pool bandi mentre la
  // pagina si carica, così al click su "Cerca bandi" il pool è già pronto. Non lancia mai.
  void getGrantsPool().catch(() => {})

  const companies = await listCompanyFolders()
  const selected = await resolveSelected()
  const folderId = selected?.id
  const drive: DriveStatus = await checkDriveConnection(folderId)
  let dna = null
  let corporateDna = null
  if (opts?.withDna && folderId && drive.connected) {
    const built = await getDnaFromDrive(folderId, selected?.name)
    dna = built?.companyDna ?? placeholderDnaFromFiles(drive.files, selected?.name)
    corporateDna = built?.corporateDna ?? null
  }
  return {
    appName: APP_NAME,
    company: {
      name: selected?.name ?? 'Azienda',
      driveFolderId: folderId ?? '',
      driveFolderUrl: folderId ? folderUrl(folderId) : '#',
    },
    companies,
    selectedId: folderId ?? null,
    drive,
    dna,
    corporateDna,
  }
}

const REGIONALI = ['Lazio Innova', 'Sviluppo Toscana', 'Sardegna Impresa']
const regioneOf = (source: string) => (REGIONALI.includes(source) ? 'Regionale' : 'Nazionale')

// CERCA BANDI: scraping (indipendente dal DNA) -> filtro requisiti minimi -> voto 1-10 -> storico.
export async function searchGrants() {
  const selected = await resolveSelected()
  const companyId = selected?.id ?? 'none'

  const raw = await getGrantsPool() // pool condiviso pre-scaricato (no re-scrape a ogni ricerca)
  raw.sort((a, b) => {
    const ta = a.published ? Date.parse(a.published) : NaN
    const tb = b.published ? Date.parse(b.published) : NaN
    return (Number.isNaN(tb) ? -Infinity : tb) - (Number.isNaN(ta) ? -Infinity : ta)
  })

  // DNA dell'azienda selezionata (cache incrementale). Robusto: niente DNA -> fallback nello scoring.
  // Il CorporateDna porta già `regione` e `settori`, usati dal filtro ammissibilità.
  let corporateDna = null
  try {
    const built = await getDnaFromDrive(selected?.id, selected?.name)
    corporateDna = built?.corporateDna ?? null
  } catch {
    /* si procede senza DNA */
  }

  let grants: Omit<Grant, 'id' | 'companyId' | 'createdAt'>[] = raw.map((r) => ({
    ref: refOf({ source: r.source, link: r.link }),
    title: r.title,
    sourceUrl: r.link,
    sourceName: r.source,
    description: r.snippet,
    deadline: 'Da verificare',
    amount: 'Da verificare',
    category: null,
    region: regioneOf(r.source),
    matchScore: 0,
    scoreReason: null,
    strategy: null,
  }))

  const { compatibili, scartati } = filterCompatible(corporateDna, grants as Grant[])
  const scartatiData = scartati.map((s) => ({
    title: s.grant.title,
    sourceName: s.grant.sourceName,
    sourceUrl: s.grant.sourceUrl,
    motivo: s.motivo,
  }))

  // VALUTAZIONE 1-10 (batch Gemini + cache + fallback). Mai blocca la ricerca.
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
      g.matchScore = s ? s.score : 0
      g.scoreReason = s ? s.reason : null
    }
  } catch {
    /* la ricerca funziona comunque, senza voto */
  }
  compatibili.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))

  const { nuovi, giaNoti } = classifyNewVsKnown(compatibili)
  registerSeen(compatibili, new Date().toISOString())

  addSearchRun(companyId, compatibili.length, raw.length, nuovi.length, giaNoti.length, compatibili, scartatiData)

  revalidatePath('/')
  return {
    found: compatibili.length,
    scraped: raw.length,
    scartati: scartatiData.length,
    nuovi: nuovi.length,
    giaNoti: giaNoti.length,
  }
}

export async function getGrantsPage(
  page = 1,
  runId?: number,
  q?: string,
  sort?: string
): Promise<{
  grants: Grant[]
  page: number
  totalPages: number
  total: number
  query: string
  sort: string
  unfilteredTotal: number
}> {
  const companyId = (await resolveSelected())?.id ?? 'none'
  const run = runId ? getRun(companyId, runId) : getLatestRun(companyId)
  const allRaw = run?.grants ?? []
  const query = (q ?? '').trim()
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const filtered = words.length
    ? allRaw.filter((g) => {
        const hay = `${g.title} ${g.description ?? ''}`.toLowerCase()
        return words.every((w) => hay.includes(w))
      })
    : allRaw

  const sortKey = sort ?? 'recenti'
  const titleScore = (g: Grant) => {
    if (!words.length) return 0
    const t = g.title.toLowerCase()
    return words.filter((w) => t.includes(w)).length
  }
  const all =
    sortKey === 'voto'
      ? [...filtered].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
      : sortKey === 'az'
        ? [...filtered].sort((a, b) => a.title.localeCompare(b.title, 'it'))
        : words.length
          ? [...filtered].sort((a, b) => titleScore(b) - titleScore(a))
          : filtered

  const total = all.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const p = Math.min(Math.max(1, page), totalPages)
  const grants = all.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE)
  return { grants, page: p, totalPages, total, query, sort: sortKey, unfilteredTotal: allRaw.length }
}

// Output strategico per un bando, identificato dal REF STABILE (hash fonte+link).
// Ricostruisce il bando dal POOL CONDIVISO (non dallo store in-memory): così funziona anche
// dopo un cold-start o su un'altra istanza lambda → niente più 404. Se l'AI è spenta/fallisce,
// resta lo scheletro (voto rapido + checklist standard).
export async function getStrategy(ref: string): Promise<ExecutionStrategy | null> {
  const selected = await resolveSelected()

  // 1) Trova il bando nel pool condiviso tramite il ref stabile.
  const pool = await getGrantsPool()
  const raw = pool.find((r) => refOf({ source: r.source, link: r.link }) === ref)
  if (!raw) return null

  // 2) Ricostruisce il Grant dai dati del pool (lo store non serve più qui).
  const grant: Grant = {
    id: 0,
    ref,
    companyId: selected?.id ?? 'none',
    title: raw.title,
    sourceUrl: raw.link,
    sourceName: raw.source,
    description: raw.snippet,
    deadline: 'Da verificare',
    amount: 'Da verificare',
    category: null,
    region: regioneOf(raw.source),
    matchScore: 0,
    scoreReason: null,
    strategy: null,
    createdAt: new Date(),
  }

  // 3) DNA dell'azienda (una sola volta qui: getCompanyInfo non lo costruisce più sulla strategia).
  const built = await getDnaFromDrive(selected?.id, selected?.name)
  const corporateDna = built?.corporateDna ?? null

  // 4) Voto rapido (fallback) così la pagina mostra sempre un punteggio anche senza l'analisi AI.
  try {
    const scores = await scoreBandi(corporateDna, [
      { ref, title: grant.title, source: grant.sourceName ?? '', text: grant.description ?? '' },
    ])
    const s = scores[ref]
    if (s) {
      grant.matchScore = s.score
      grant.scoreReason = s.reason
    }
  } catch {
    /* la strategia funziona anche senza voto rapido */
  }

  // 5) Analisi dettagliata (6 dimensioni + checklist) — cache per (ref + versione DNA).
  const evaluation = await evaluateTenderForCompany(
    corporateDna,
    {
      id: ref,
      title: grant.title,
      source: grant.sourceName ?? undefined,
      text: [grant.description, grant.region && `Ambito: ${grant.region}`, grant.amount && `Importo: ${grant.amount}`]
        .filter(Boolean)
        .join('\n'),
    },
    { strengths: built?.companyDna.strengths, gaps: built?.companyDna.gaps }
  )
  return buildStrategy(built?.companyDna ?? null, grant, new Date().toISOString(), evaluation)
}

export async function getSearchHistory(): Promise<
  { id: number; at: string; found: number; scraped: number; nuovi: number; giaNoti: number; scartati: number }[]
> {
  const companyId = (await resolveSelected())?.id ?? 'none'
  return getRuns(companyId).map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    found: r.found,
    scraped: r.scraped,
    nuovi: r.nuovi,
    giaNoti: r.giaNoti,
    scartati: r.scartati.length,
  }))
}

export async function getScartati(runId?: number): Promise<import('@/lib/db/schema').ScartatoGrant[]> {
  const companyId = (await resolveSelected())?.id ?? 'none'
  const run = runId ? getRun(companyId, runId) : getLatestRun(companyId)
  return run?.scartati ?? []
}

import 'server-only'
import type { Grant, SearchRun } from '@/lib/db/schema'

// Persistenza in-memory mono-azienda (MVP, niente DB). Tiene SOLO lo storico ricerche.
// NB: si azzera a freddo sul serverless. Per persistenza reale serve un DB.

const g = globalThis as unknown as {
  __jesapRuns?: { runs: SearchRun[]; seq: { grant: number; run: number } }
}
const store = g.__jesapRuns ?? (g.__jesapRuns = { runs: [], seq: { grant: 0, run: 0 } })

export function addSearchRun(
  found: number,
  scraped: number,
  nuovi: number,
  giaNoti: number,
  grantsData: Omit<Grant, 'id' | 'companyId' | 'createdAt'>[]
): SearchRun {
  const run: SearchRun = {
    id: ++store.seq.run,
    companyId: 1,
    at: new Date(),
    found,
    scraped,
    nuovi,
    giaNoti,
    grants: grantsData.map((gr) => ({
      ...gr,
      id: ++store.seq.grant,
      companyId: 1,
      createdAt: new Date(),
    })),
  }
  store.runs.push(run)
  return run
}

export function getRuns(): SearchRun[] {
  return [...store.runs].sort((a, b) => b.id - a.id)
}

export function getLatestRun(): SearchRun | null {
  return getRuns()[0] ?? null
}

export function getRun(runId: number): SearchRun | null {
  return store.runs.find((r) => r.id === runId) ?? null
}

export function findGrant(grantId: number): Grant | null {
  for (const run of getRuns()) {
    const g = run.grants.find((x) => x.id === grantId)
    if (g) return g
  }
  return null
}

import 'server-only'
import crypto from 'node:crypto'
import type { CompanyDna } from '@/lib/db/schema'

// MECCANISMO ANTI-SPRECO TOKEN.
// Idea: l'AI (Step 5 scoring / Step 6 strategia) è la parte cara. Quindi:
//  1) ogni bando ha un HASH stabile; ogni DNA una VERSIONE.
//  2) i risultati AI si memorizzano per chiave `hash:versioneDNA`.
//  3) a ogni ricerca solo i bandi NUOVI (mai visti) andrebbero all'AI; i già noti riusano la cache.
// Più l'app viene usata, più bandi sono già in cache -> il costo in token per ricerca tende a ZERO.
// (Finché il DNA non cambia: al cambio del DNA cambia la versione e si ricalcola solo allora.)
//
// NB: cache in-memory (si azzera a freddo). Per risparmio permanente cross-sessione -> KV/DB.

type Reg = {
  seen: Map<string, string> // bandoHash -> primo avvistamento ISO
  scores: Map<string, unknown> // `${hash}:${dnaV}` -> risultato AI
  stats: { scoreHits: number; scoreMisses: number }
}
const g = globalThis as unknown as { __jesapTok?: Reg }
const reg: Reg =
  g.__jesapTok ?? (g.__jesapTok = { seen: new Map(), scores: new Map(), stats: { scoreHits: 0, scoreMisses: 0 } })

const sha = (s: string, n = 16) => crypto.createHash('sha1').update(s).digest('hex').slice(0, n)

export function hashBando(b: { source: string; link: string }): string {
  return sha(b.source + '|' + b.link)
}
export function dnaVersion(dna: CompanyDna | null): string {
  return dna ? sha(JSON.stringify(dna), 12) : 'none'
}

// Driver del risparmio: separa nuovi (da analizzare) vs già noti (riuso cache).
export function classifyNewVsKnown<T extends { source: string; link: string }>(
  bandi: T[]
): { nuovi: T[]; giaNoti: T[] } {
  const nuovi: T[] = []
  const giaNoti: T[] = []
  for (const b of bandi) (reg.seen.has(hashBando(b)) ? giaNoti : nuovi).push(b)
  return { nuovi, giaNoti }
}

export function registerSeen(bandi: { source: string; link: string }[], nowIso: string): void {
  for (const b of bandi) {
    const h = hashBando(b)
    if (!reg.seen.has(h)) reg.seen.set(h, nowIso)
  }
}

// Wrapper per lo scoring del team (Step 5): cache trasparente per hash+versioneDNA.
// Uso previsto: const score = await withScoreCache(hashBando(b), dnaVersion(dna), () => aiScore(b, dna))
export async function withScoreCache<T>(
  hash: string,
  dnaV: string,
  compute: () => Promise<T>
): Promise<T> {
  const key = `${hash}:${dnaV}`
  if (reg.scores.has(key)) {
    reg.stats.scoreHits++
    return reg.scores.get(key) as T
  }
  reg.stats.scoreMisses++
  const value = await compute()
  reg.scores.set(key, value)
  return value
}

export function getCacheStats() {
  const { scoreHits, scoreMisses } = reg.stats
  const tot = scoreHits + scoreMisses
  return {
    bandiNoti: reg.seen.size,
    scoreHits,
    scoreMisses,
    hitRate: tot ? Math.round((scoreHits / tot) * 100) : 0,
  }
}

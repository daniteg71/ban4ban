import 'server-only'
import crypto from 'node:crypto'
import type { CorporateDna } from '@/lib/corporate-dna'
import { geminiJson, isAiLive, type GeminiSchema } from '@/lib/ai-gemini'

// ============================================================================
// ALGORITMO DI VALUTAZIONE (voto 1-10) — da applicare a TUTTI i bandi trovati.
// Logica adattata dal codice del team (criteri + pesi), portata su Gemini (gratis) invece
// di OpenAI. Tre garanzie:
//  1) BATCH: un'unica chiamata Gemini per tutti i bandi (no 1-chiamata-per-bando) -> veloce, niente rate-limit.
//  2) CACHE: punteggio memorizzato per (bando + versione DNA) -> i già valutati non ricostano.
//  3) FALLBACK deterministico: se l'AI è spenta/lenta/fallisce, punteggio lessicale istantaneo
//     -> la lista si ordina SEMPRE e la ricerca non si rompe mai.
// La valutazione DETTAGLIATA a 6 dimensioni (strategia) resta sul singolo bando, al click.
// ============================================================================

export type BandoScore = { score: number; reason: string }

const sha = (s: string, n = 16) => crypto.createHash('sha1').update(s).digest('hex').slice(0, n)

type ScoreInput = { ref: string; title: string; source: string; text: string }

// cache in-memory: chiave `${ref}:${dnaVer}` -> punteggio
const g = globalThis as unknown as { __jesapScores?: Map<string, BandoScore> }
const cache = g.__jesapScores ?? (g.__jesapScores = new Map())

function dnaVer(dna: CorporateDna | null): string {
  return dna ? sha(JSON.stringify(dna), 12) : 'none'
}

function clamp(n: unknown, lo: number, hi: number, fallback: number): number {
  const x = typeof n === 'number' && Number.isFinite(n) ? n : fallback
  return Math.max(lo, Math.min(hi, Math.round(x * 10) / 10))
}

// Fallback deterministico: affinità lessicale tra profilo (comp/cert/ateco) e testo del bando.
function localAffinity(dna: CorporateDna | null, it: ScoreInput): BandoScore {
  const hay = `${it.title} ${it.text}`.toLowerCase()
  const terms = new Set<string>()
  if (dna) {
    for (const s of [...(dna.comp ?? []), ...(dna.cert ?? []), ...(dna.ateco ?? [])]) {
      for (const w of String(s).toLowerCase().split(/[^a-zà-ù0-9]+/)) if (w.length > 3) terms.add(w)
    }
  }
  let hits = 0
  for (const t of terms) if (hay.includes(t)) hits++
  const score = clamp(4 + hits * 0.7, 1, 9, 4) // deterministico: 10 non lo dà mai
  return { score, reason: hits ? `${hits} affinità col profilo aziendale` : 'Affinità non determinabile dal testo disponibile' }
}

const BATCH_SCHEMA: GeminiSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          score: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['ref', 'score', 'reason'],
      },
    },
  },
  required: ['items'],
}

async function geminiBatch(dna: CorporateDna, items: ScoreInput[]): Promise<Record<string, BandoScore> | null> {
  const profilo = {
    rag_soc: dna.rag_soc,
    ateco: dna.ateco,
    cert: dna.cert,
    comp: dna.comp,
    fin: dna.fin,
    esperienze: (dna.esperienze ?? []).map((e) => e.tag),
  }
  const prompt = `Sei un analista di bandi e incentivi per imprese. Valuta l'AFFINITÀ (voto INTERO 1-10) tra l'AZIENDA e ciascun BANDO della lista.
Criteri: coerenza di settore, tecnica (servizi/competenze vs requisiti), certificazioni, esperienze passate, ambito geografico, sostenibilità economico-strategica.
Regole: non essere generoso; il 10 è raro; se mancano requisiti o attinenza, abbassa il voto; basati solo sui dati forniti.

AZIENDA: ${JSON.stringify(profilo)}

BANDI (valuta ognuno, usa il "ref" per identificarlo):
${JSON.stringify(items.map((b) => ({ ref: b.ref, titolo: b.title, fonte: b.source, testo: b.text.slice(0, 240) })))}

Rispondi SOLO JSON: {"items":[{"ref","score","reason"}]} con un reason breve (max 90 caratteri).`
  const out = await geminiJson<{ items: { ref: string; score: number; reason: string }[] }>(prompt, BATCH_SCHEMA)
  if (!out?.items) return null
  const map: Record<string, BandoScore> = {}
  for (const i of out.items) map[i.ref] = { score: clamp(i.score, 1, 10, 5), reason: String(i.reason || '').slice(0, 120) }
  return map
}

/**
 * Valuta una lista di bandi. Ritorna una mappa ref->BandoScore. Non lancia mai.
 * Usa cache + batch Gemini + fallback deterministico.
 */
export async function scoreBandi(
  dna: CorporateDna | null,
  bandi: { ref: string; title: string; source: string; text: string }[]
): Promise<Record<string, BandoScore>> {
  const ver = dnaVer(dna)
  const result: Record<string, BandoScore> = {}
  const todo: ScoreInput[] = []

  for (const b of bandi) {
    const cached = cache.get(`${b.ref}:${ver}`)
    if (cached) result[b.ref] = cached
    else todo.push(b)
  }
  if (todo.length === 0) return result

  // prova il batch AI (una sola chiamata); se non disponibile/fallisce -> fallback
  let aiMap: Record<string, BandoScore> | null = null
  if (dna && isAiLive()) {
    try {
      aiMap = await geminiBatch(dna, todo)
    } catch {
      aiMap = null
    }
  }

  for (const b of todo) {
    const score = aiMap?.[b.ref] ?? localAffinity(dna, b)
    cache.set(`${b.ref}:${ver}`, score)
    result[b.ref] = score
  }
  return result
}

export function refOf(b: { source?: string | null; link?: string | null }): string {
  return sha(`${b.source ?? ''}|${b.link ?? ''}`)
}

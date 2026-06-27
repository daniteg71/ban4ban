import 'server-only'
import crypto from 'node:crypto'
import { listDriveFiles, readDriveTexts, type DriveDoc } from '@/lib/drive'
import type { CompanyDna, DriveFile } from '@/lib/db/schema'
import type { CorporateDna } from '@/lib/corporate-dna'
import { COMPANY } from '@/lib/company-config'
import { geminiJson, isAiLive, type GeminiSchema } from '@/lib/ai-gemini'

// ============================================================================
// Step 1 — Sintesi del DNA dai file REALI del Drive.
// Step 2 — Ricostruzione INCREMENTALE: un'impronta (id+modifiedTime, niente download)
//          dice se il Drive è cambiato. Se NO, riusa la cache: niente download né sintesi.
//
// Senza AI nel progetto (lib/ai.ts rimosso), la sintesi è EURISTICA (regex/parole-chiave).
// I campi non trovati restano vuoti: è un MVP onesto, non inventa dati. Quando il team
// aggancia l'AI (Step 5/6), questi stessi testi (DriveDoc[]) diventano l'input del prompt.
// ============================================================================

const sha = (s: string, n = 16) => crypto.createHash('sha1').update(s).digest('hex').slice(0, n)

function fingerprint(files: DriveFile[]): string {
  return sha(files.map((f) => `${f.id}:${f.modifiedTime ?? ''}`).join('|'))
}

export type DriveDna = {
  fingerprint: string
  usedAi: boolean // true se la sintesi è venuta da Gemini; false = euristica (fallback)
  files: DriveFile[]
  docs: DriveDoc[]
  companyDna: CompanyDna // modello "galassia" per la UI (/dna)
  corporateDna: CorporateDna // contratto strutturato per la pipeline (Step 4/5)
}

// Cache in-memory per istanza (sopravvive all'HMR via globalThis). A freddo si azzera:
// per persistenza cross-sessione -> KV/DB. Sufficiente per l'MVP.
const g = globalThis as unknown as { __jesapDna?: DriveDna | null }

/**
 * Ritorna il DNA sintetizzato dai file del Drive, ricostruendolo SOLO se il contenuto
 * è cambiato (confronto impronta). `null` se il Drive non è leggibile/è vuoto.
 */
export async function getDnaFromDrive(folderId?: string): Promise<DriveDna | null> {
  const files = await listDriveFiles(folderId)
  if (files.length === 0) return null

  // Step 2: se l'impronta è uguale E lo stato dell'AI non è cambiato, riusa la cache.
  const fp = fingerprint(files)
  if (g.__jesapDna && g.__jesapDna.fingerprint === fp && g.__jesapDna.usedAi === isAiLive()) {
    return g.__jesapDna
  }

  const docs = await readDriveTexts(files)

  // Sintesi: prima prova l'AI (Gemini); se spenta o fallisce, usa l'euristica.
  const ai = await synthesizeWithGemini(docs)
  const dna: DriveDna = {
    fingerprint: fp,
    usedAi: Boolean(ai),
    files,
    docs,
    companyDna: ai ? buildCompanyDnaFromAi(ai) : buildCompanyDna(files, docs),
    corporateDna: ai ? ai.corporate : extractCorporateDna(docs),
  }
  g.__jesapDna = dna
  return dna
}

// ===========================================================================
// SINTESI CON AI (Gemini) — percorso preferito quando GEMINI_API_KEY è impostata.
// L'AI legge il testo dei documenti e produce DNA strutturato + mappa concettuale.
// Regola: NON inventare dati (campi vuoti se l'informazione non c'è).
// ===========================================================================

type NodeGroup = CompanyDna['nodes'][number]['group']
const GROUPS: NodeGroup[] = ['core', 'competenze', 'mercato', 'finanza', 'innovazione', 'team', 'asset']

type AiSynthesis = {
  corporate: CorporateDna
  headline: string
  nodes: { label: string; group: NodeGroup; value: number; summary: string }[]
  strengths: string[]
  gaps: string[]
}

const AI_SCHEMA: GeminiSchema = {
  type: 'object',
  properties: {
    corporate: {
      type: 'object',
      properties: {
        p_iva: { type: 'string' },
        rag_soc: { type: 'string' },
        ateco: { type: 'array', items: { type: 'string' } },
        fin: {
          type: 'object',
          properties: {
            ult_bilancio_anno: { type: 'integer' },
            fatturato: { type: 'number' },
            cap_sociale: { type: 'number' },
            utile_netto: { type: 'number' },
          },
        },
        cert: { type: 'array', items: { type: 'string' } },
        comp: { type: 'array', items: { type: 'string' } },
        esperienze: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              tag: { type: 'string' },
              valore: { type: 'number' },
              desc: { type: 'string' },
            },
          },
        },
      },
    },
    headline: { type: 'string' },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          group: { type: 'string', enum: GROUPS },
          value: { type: 'integer' },
          summary: { type: 'string' },
        },
      },
    },
    strengths: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
  },
}

function clamp(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback
  return Math.min(hi, Math.max(lo, v))
}

// L'AI a volte scrive "null"/"N/A" come testo invece di lasciare vuoto: lo trattiamo come vuoto.
const JUNK = new Set(['', 'null', 'undefined', 'n/a', 'na', '-', '—', 'none', 'nessuno', 'non disponibile', 'non trovato'])
function cleanStr(s: unknown): string {
  const v = typeof s === 'string' ? s.trim() : ''
  return JUNK.has(v.toLowerCase()) ? '' : v
}
function cleanArr(a: unknown): string[] {
  if (!Array.isArray(a)) return []
  return [...new Set(a.map(cleanStr).filter(Boolean))]
}

// Normalizza l'output dell'AI: riempie i default così il resto del codice non vede mai `undefined`.
function normalizeAi(raw: Partial<AiSynthesis> | null): AiSynthesis | null {
  if (!raw || !raw.corporate) return null
  const c = raw.corporate
  return {
    corporate: {
      p_iva: cleanStr(c.p_iva),
      rag_soc: cleanStr(c.rag_soc) || COMPANY.name,
      ateco: cleanArr(c.ateco),
      fin: {
        ult_bilancio_anno: c.fin?.ult_bilancio_anno ?? 0,
        fatturato: c.fin?.fatturato ?? 0,
        cap_sociale: c.fin?.cap_sociale ?? 0,
        utile_netto: c.fin?.utile_netto ?? 0,
      },
      cert: cleanArr(c.cert),
      comp: cleanArr(c.comp),
      esperienze: (c.esperienze ?? [])
        .filter((e) => cleanStr(e?.desc))
        .map((e, i) => ({
          id: cleanStr(e.id) || `EXP${String(i + 1).padStart(2, '0')}`,
          tag: cleanStr(e.tag) || 'progetto',
          valore: typeof e.valore === 'number' ? e.valore : 0,
          desc: cleanStr(e.desc),
        })),
    },
    headline: cleanStr(raw.headline) || `${COMPANY.name}: DNA aziendale`,
    nodes: (raw.nodes ?? [])
      .filter((n) => n && cleanStr(n.label))
      .map((n) => ({
        label: cleanStr(n.label),
        group: GROUPS.includes(n.group) ? n.group : 'mercato',
        value: clamp(n.value, 10, 100, 60),
        summary: cleanStr(n.summary),
      })),
    strengths: cleanArr(raw.strengths),
    gaps: cleanArr(raw.gaps),
  }
}

async function synthesizeWithGemini(docs: DriveDoc[]): Promise<AiSynthesis | null> {
  if (!isAiLive() || docs.length === 0) return null
  const corpus = docs.map((d) => `### ${d.name}\n${d.text}`).join('\n\n').slice(0, 24000)
  const prompt = `Sei un analista che estrae il "DNA aziendale" dai documenti reali di un'azienda
(presi dal suo Google Drive). Ti fornisco il testo dei file. Produci un JSON con:
- "corporate": dati strutturati (partita IVA, ragione sociale, codici ATECO, dati finanziari,
  certificazioni, competenze chiave, esperienze/progetti con valore in euro);
- "nodes": 5-10 nodi che riassumono i punti chiave dell'azienda (ogni nodo ha label, group, value 0-100, summary);
- "headline": una frase che sintetizza l'azienda;
- "strengths": punti di forza; "gaps": informazioni mancanti o aree deboli.

REGOLE FONDAMENTALI:
1. NON inventare dati. Se un'informazione non è nei documenti, lascia stringa vuota "", array vuoto [] o 0.
2. Rispondi in ITALIANO.
3. Basati SOLO sul testo fornito qui sotto.

=== DOCUMENTI ===
${corpus}`
  const raw = await geminiJson<Partial<AiSynthesis>>(prompt, AI_SCHEMA)
  return normalizeAi(raw)
}

// Costruisce la "galassia" (CompanyDna) dalla sintesi AI: nodo core + i nodi concettuali.
function buildCompanyDnaFromAi(ai: AiSynthesis): CompanyDna {
  const nodes: CompanyDna['nodes'] = [
    { id: 'core', label: COMPANY.name, group: 'core', value: 100, summary: 'DNA aziendale (sintesi AI dai documenti del Drive).' },
    ...ai.nodes.slice(0, 14).map((n, i) => ({
      id: `n${i}`,
      label: n.label,
      group: n.group,
      value: n.value,
      summary: n.summary,
    })),
  ]
  const links: CompanyDna['links'] = ai.nodes
    .slice(0, 14)
    .map((_, i) => ({ source: 'core', target: `n${i}`, strength: 0.6 }))
  return { headline: ai.headline, nodes, links, strengths: ai.strengths, gaps: ai.gaps }
}

// ---------------------------------------------------------------------------
// Modello "galassia" (CompanyDna): un nodo per file, col RIASSUNTO preso dal testo reale.
// (Fallback EURISTICO usato quando l'AI è spenta o fallisce.)
// ---------------------------------------------------------------------------

function groupFor(name: string): CompanyDna['nodes'][number]['group'] {
  const n = name.toLowerCase()
  if (n.includes('cv') || n.includes('curriculum')) return 'team'
  if (n.includes('formulario') || n.includes('servizi') || n.includes('competenz')) return 'competenze'
  if (n.includes('bilanci') || n.includes('bilancio') || n.includes('finanz')) return 'finanza'
  if (n.includes('visura')) return 'asset'
  if (n.includes('progett') || n.includes('portfolio') || n.includes('r&s') || n.includes('innovaz')) return 'innovazione'
  return 'mercato'
}

// Primo "estratto" leggibile del documento (per il summary del nodo).
function snippet(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  return clean.length > max ? clean.slice(0, max).trimEnd() + '…' : clean
}

export function buildCompanyDna(files: DriveFile[], docs: DriveDoc[]): CompanyDna {
  const textOf = new Map(docs.map((d) => [d.name, d.text]))
  const nodes: CompanyDna['nodes'] = [
    {
      id: 'core',
      label: COMPANY.name,
      group: 'core',
      value: 100,
      summary: 'DNA aziendale sintetizzato dai documenti reali del Drive.',
    },
    ...files.slice(0, 20).map((f, i) => {
      const txt = textOf.get(f.name) ?? ''
      return {
        id: `f${i}`,
        label: f.name.replace(/\.[a-z0-9]+$/i, ''),
        group: groupFor(f.name),
        value: txt ? 70 : 50, // i file letti (con testo) "pesano" di più
        summary: txt ? snippet(txt) : `Documento dal Drive: ${f.name} (formato non estratto).`,
      }
    }),
  ]
  const links: CompanyDna['links'] = files
    .slice(0, 20)
    .map((_, i) => ({ source: 'core', target: `f${i}`, strength: 0.6 }))

  const cdna = extractCorporateDna(docs)
  const strengths: string[] = []
  if (cdna.comp.length) strengths.push(`Competenze: ${cdna.comp.slice(0, 6).join(', ')}`)
  if (cdna.cert.length) strengths.push(`Certificazioni: ${cdna.cert.join(', ')}`)
  if (cdna.esperienze.length) strengths.push(`${cdna.esperienze.length} esperienze/progetti rilevati`)

  const gaps: string[] = []
  if (!cdna.p_iva) gaps.push('Partita IVA non trovata nei documenti (manca Visura?)')
  if (!cdna.fin.fatturato) gaps.push('Dati finanziari non trovati (manca un Bilancio?)')
  if (!cdna.ateco.length) gaps.push('Codici ATECO non trovati')

  return {
    headline: `${COMPANY.name}: DNA generato da ${docs.length} documento/i del Drive.`,
    nodes,
    links,
    strengths,
    gaps,
  }
}

// ---------------------------------------------------------------------------
// Contratto strutturato (CorporateDna) — estrazione EURISTICA dai testi.
// Onesta: ciò che non si trova resta vuoto (niente dati inventati).
// ---------------------------------------------------------------------------

// Dizionario competenze: parole-chiave cercate nei testi (CV, formulari…).
const COMPETENZE_DIZIONARIO = [
  'project management', 'gestione progetti', 'sviluppo software', 'cloud', 'intelligenza artificiale',
  'machine learning', 'data analysis', 'analisi dati', 'cybersecurity', 'sicurezza informatica',
  'marketing', 'comunicazione', 'progettazione', 'edilizia', 'ingegneria', 'architettura',
  'consulenza', 'finanza', 'contabilità', 'logistica', 'produzione', 'qualità', 'ricerca e sviluppo',
  'automazione', 'crm', 'erp', 'digital', 'sostenibilità', 'energia', 'gestione immobiliare', 'real estate',
]

function uniq(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))]
}

// "1.500.000,00" / "1500000" -> 1500000 (best-effort, formato italiano).
function parseEuro(raw: string): number {
  const cleaned = raw.replace(/\./g, '').replace(/,\d{1,2}$/, '').replace(/[^\d]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

export function extractCorporateDna(docs: DriveDoc[]): CorporateDna {
  const all = docs.map((d) => d.text).join('\n').toLowerCase()
  const allRaw = docs.map((d) => d.text).join('\n')

  // P.IVA: prima cerca etichettata, poi un qualsiasi gruppo di 11 cifre.
  const pivaLabeled = allRaw.match(/p(?:artita)?\.?\s*iva[:\s]*([0-9]{11})/i)
  const pivaAny = allRaw.match(/\b\d{11}\b/)
  const p_iva = (pivaLabeled?.[1] ?? pivaAny?.[0] ?? '').trim()

  // ATECO: pattern NN.NN(.N).
  const ateco = uniq([...allRaw.matchAll(/\b\d{2}\.\d{2}(?:\.\d{1,2})?\b/g)].map((m) => m[0]))

  // Certificazioni ISO -> normalizzate "ISO-9001".
  const cert = uniq(
    [...allRaw.matchAll(/\biso[\s/-]?(\d{4,5})\b/gi)].map((m) => `ISO-${m[1]}`),
  )

  // Competenze: parole-chiave presenti nel testo.
  const comp = uniq(COMPETENZE_DIZIONARIO.filter((k) => all.includes(k)))

  // Finanza: best-effort su etichette comuni (spesso assente se non c'è un bilancio).
  const fatturato = parseEuro(allRaw.match(/fatturato[^0-9]{0,20}([0-9.,]{4,})/i)?.[1] ?? '')
  const cap_sociale = parseEuro(allRaw.match(/capitale sociale[^0-9]{0,20}([0-9.,]{3,})/i)?.[1] ?? '')
  const utile_netto = parseEuro(allRaw.match(/utile(?:\s+netto)?[^0-9]{0,20}([0-9.,]{3,})/i)?.[1] ?? '')
  const annoMatch = allRaw.match(/bilancio[^0-9]{0,12}(20\d{2})/i) ?? allRaw.match(/\b(20\d{2})\b/)
  const ult_bilancio_anno = annoMatch ? Number(annoMatch[1]) : 0

  // Esperienze/progetti: righe che contengono un importo in € (best-effort).
  const esperienze: CorporateDna['esperienze'] = []
  const righe = allRaw.split(/\n|;/)
  for (const r of righe) {
    const m = r.match(/€\s*([0-9.,]{3,})/)
    if (m) {
      const desc = r.replace(/\s+/g, ' ').trim().slice(0, 140)
      esperienze.push({
        id: `EXP${String(esperienze.length + 1).padStart(2, '0')}`,
        tag: 'progetto',
        valore: parseEuro(m[1]),
        desc,
      })
    }
    if (esperienze.length >= 20) break
  }

  return {
    p_iva,
    rag_soc: COMPANY.name,
    ateco,
    fin: { ult_bilancio_anno, fatturato, cap_sociale, utile_netto },
    cert,
    comp,
    esperienze,
  }
}

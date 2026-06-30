import 'server-only'
import crypto from 'node:crypto'
import { listDriveFiles, readDriveTexts, type DriveDoc } from '@/lib/drive'
import type { CompanyDna, DriveFile } from '@/lib/db/schema'
import type { CorporateDna } from '@/lib/corporate-dna'
import { geminiJson, isAiLive, type GeminiSchema } from '@/lib/ai-gemini'

// Nome azienda corrente (impostato a ogni getDnaFromDrive). In una request le chiamate
// concorrenti riguardano la STESSA azienda selezionata → sicuro per i label del DNA.
let dnaCompanyName = 'Azienda'

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

// Cache in-memory PER CARTELLA (multi-azienda): chiave = folderId. globalThis sopravvive all'HMR.
const g = globalThis as unknown as { __jesapDna?: Map<string, DriveDna> }
const dnaCache = g.__jesapDna ?? (g.__jesapDna = new Map())

/**
 * Ritorna il DNA sintetizzato dai file del Drive, ricostruendolo SOLO se il contenuto
 * è cambiato (confronto impronta). `null` se il Drive non è leggibile/è vuoto.
 */
export async function getDnaFromDrive(folderId?: string, companyName?: string): Promise<DriveDna | null> {
  dnaCompanyName = companyName || 'Azienda'
  const key = folderId ?? process.env.DRIVE_BANDI_FOLDER_ID ?? 'default'
  const files = await listDriveFiles(folderId)
  if (files.length === 0) return null

  // Step 2: se l'impronta è uguale E lo stato dell'AI non è cambiato, riusa la cache.
  const fp = fingerprint(files)
  const cached = dnaCache.get(key)
  if (cached && cached.fingerprint === fp && cached.usedAi === isAiLive()) {
    return cached
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
  dnaCache.set(key, dna)
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
        regione: { type: 'string' },
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
        settori: { type: 'array', items: { type: 'string' } },
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
      rag_soc: cleanStr(c.rag_soc) || dnaCompanyName,
      regione: cleanStr(c.regione),
      ateco: cleanArr(c.ateco),
      fin: {
        ult_bilancio_anno: c.fin?.ult_bilancio_anno ?? 0,
        fatturato: c.fin?.fatturato ?? 0,
        cap_sociale: c.fin?.cap_sociale ?? 0,
        utile_netto: c.fin?.utile_netto ?? 0,
      },
      cert: cleanArr(c.cert),
      comp: cleanArr(c.comp),
      // settori in chiaro: usa quelli dell'AI se presenti, altrimenti derivali dagli ATECO.
      settori: cleanArr(c.settori).length ? cleanArr(c.settori) : atecoToSectors(cleanArr(c.ateco)),
      esperienze: (c.esperienze ?? [])
        .filter((e) => cleanStr(e?.desc))
        .map((e, i) => ({
          id: cleanStr(e.id) || `EXP${String(i + 1).padStart(2, '0')}`,
          tag: cleanStr(e.tag) || 'progetto',
          valore: typeof e.valore === 'number' ? e.valore : 0,
          desc: cleanStr(e.desc),
        })),
    },
    headline: cleanStr(raw.headline) || `${dnaCompanyName}: DNA aziendale`,
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
- "corporate": dati strutturati (partita IVA, ragione sociale, "regione" della sede legale
  (es. "Lazio", "Lombardia"), codici ATECO, "settori" merceologici in chiaro es. "edilizia e
  costruzioni"/"informatica e software", dati finanziari, certificazioni, competenze chiave,
  esperienze/progetti con valore in euro);
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
  const ai = normalizeAi(raw)
  // Se l'AI non ha individuato la regione, ricavala dal testo (best-effort).
  if (ai && !ai.corporate.regione) ai.corporate.regione = detectCompanyRegion(corpus)
  return ai
}

// Costruisce la "galassia" (CompanyDna) dalla sintesi AI: nodo core + i nodi concettuali.
function buildCompanyDnaFromAi(ai: AiSynthesis): CompanyDna {
  const nodes: CompanyDna['nodes'] = [
    { id: 'core', label: dnaCompanyName, group: 'core', value: 100, summary: 'DNA aziendale (sintesi AI dai documenti del Drive).' },
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
      label: dnaCompanyName,
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
    headline: `${dnaCompanyName}: DNA generato da ${docs.length} documento/i del Drive.`,
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

// Etichetta di settore in chiaro per la DIVISIONE ATECO (prime 2 cifre del codice).
// Serve a dare al profilo aziendale parole-chiave di settore reali (i codici "62.01" non
// matchano nulla); usate dal filtro ammissibilità, dallo scoring e dalla valutazione.
function sectorForDivision(d: number): string | null {
  if (d >= 1 && d <= 3) return 'agricoltura, silvicoltura e pesca'
  if (d >= 5 && d <= 9) return 'estrazione di minerali'
  if (d >= 10 && d <= 12) return 'industria alimentare e delle bevande'
  if (d >= 13 && d <= 15) return 'tessile, abbigliamento e calzature'
  if (d >= 16 && d <= 18) return 'legno, carta, editoria e stampa'
  if (d >= 19 && d <= 23) return 'chimica, farmaceutica, plastica e materiali'
  if (d >= 24 && d <= 25) return 'metallurgia e prodotti in metallo'
  if (d >= 26 && d <= 28) return 'elettronica, elettrotecnica e macchinari'
  if (d >= 29 && d <= 30) return 'automotive e mezzi di trasporto'
  if (d >= 31 && d <= 33) return 'altre manifatture e riparazioni'
  if (d === 35) return 'energia elettrica e gas'
  if (d >= 36 && d <= 39) return 'acqua, rifiuti e ambiente'
  if (d >= 41 && d <= 43) return 'edilizia e costruzioni'
  if (d >= 45 && d <= 47) return 'commercio'
  if (d >= 49 && d <= 53) return 'trasporti e logistica'
  if (d >= 55 && d <= 56) return 'turismo, ricettività e ristorazione'
  if (d >= 58 && d <= 60) return 'editoria, media e produzioni audiovisive'
  if (d >= 61 && d <= 63) return 'informatica, software e telecomunicazioni'
  if (d >= 64 && d <= 66) return 'servizi finanziari e assicurativi'
  if (d === 68) return 'attività immobiliari'
  if (d >= 69 && d <= 75) return 'consulenza, servizi professionali e progettazione'
  if (d >= 77 && d <= 82) return 'servizi alle imprese e noleggio'
  if (d === 84) return 'pubblica amministrazione'
  if (d === 85) return 'istruzione e formazione'
  if (d >= 86 && d <= 88) return 'sanità e assistenza sociale'
  if (d >= 90 && d <= 93) return 'attività artistiche, culturali e sportive'
  if (d >= 94 && d <= 96) return 'altri servizi alla persona'
  return null
}

export function atecoToSectors(ateco: string[]): string[] {
  const out = new Set<string>()
  for (const code of ateco) {
    const div = Number.parseInt(String(code).replace(/\D.*$/, '').slice(0, 2), 10)
    const label = Number.isFinite(div) ? sectorForDivision(div) : null
    if (label) out.add(label)
  }
  return [...out]
}

// Regione dell'azienda dedotta dal testo dei documenti (best-effort, prudente: null se incerto).
// Riconosce il nome della regione o una città capoluogo. Usata per il filtro geografico.
const REGION_HINTS: { region: string; rx: RegExp }[] = [
  { region: 'Lazio', rx: /\blazio\b|\broma\b|latina|frosinone|viterbo|\brieti\b/i },
  { region: 'Toscana', rx: /toscana|firenze|\bprato\b|\bpisa\b|livorno|arezzo|\bsiena\b|\blucca\b|grosseto/i },
  { region: 'Sardegna', rx: /sardegna|cagliari|sassari|\bnuoro\b|oristano|\bolbia\b/i },
  { region: 'Lombardia', rx: /lombardia|milano|bergamo|brescia|\bmonza\b|\bcomo\b|varese|\bpavia\b/i },
  { region: 'Veneto', rx: /\bveneto\b|venezia|verona|padova|vicenza|treviso|rovigo|belluno/i },
  { region: 'Piemonte', rx: /piemonte|torino|\bcuneo\b|alessandria|\bnovara\b|\basti\b/i },
  { region: 'Emilia-Romagna', rx: /emilia|bologna|\bmodena\b|parma|reggio emilia|ferrara|ravenna|rimini|forl/i },
  { region: 'Campania', rx: /campania|napoli|salerno|caserta|avellino|benevento/i },
  { region: 'Puglia', rx: /\bpuglia\b|\bbari\b|taranto|\blecce\b|foggia|brindisi|andria/i },
  { region: 'Sicilia', rx: /sicilia|palermo|catania|messina|siracusa|trapani|ragusa|agrigento/i },
]

export function detectCompanyRegion(text: string): string {
  for (const h of REGION_HINTS) if (h.rx.test(text)) return h.region
  return ''
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
    rag_soc: dnaCompanyName,
    regione: detectCompanyRegion(allRaw),
    ateco,
    fin: { ult_bilancio_anno, fatturato, cap_sociale, utile_netto },
    cert,
    comp,
    settori: atecoToSectors(ateco),
    esperienze,
  }
}

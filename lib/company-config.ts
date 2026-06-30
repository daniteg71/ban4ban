import 'server-only'
import { cookies } from 'next/headers'
import type { CompanyDna, DriveFile, Grant } from '@/lib/db/schema'
import type { CorporateDna } from '@/lib/corporate-dna'

// Nome dell'applicazione (multi-azienda di test).
export const APP_NAME = 'ban4ban'

// Cartella radice del Drive: contiene una SOTTOCARTELLA per azienda (vedi listCompanyFolders).
export const ROOT_FOLDER_ID = process.env.DRIVE_BANDI_FOLDER_ID ?? '1HFXiNjjnrnsNeaMRBDH-vGao-XepH_GE'

const COMPANY_COOKIE = 'ban4ban_company' // memorizza il folderId dell'azienda selezionata

export async function getSelectedFolderId(): Promise<string | null> {
  const c = (await cookies()).get(COMPANY_COOKIE)?.value
  return c || null
}

export function folderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`
}

// ----------------------------------------------------------------------------
// HOOK 1 — riscrittura del DNA dal Drive: IMPLEMENTATO in `lib/dna-from-drive.ts`
// (`getDnaFromDrive`). Legge il TESTO reale dei file e sintetizza CompanyDna + CorporateDna,
// con ricostruzione incrementale (Step 2). Orchestrato in `app/actions/company.ts`.
// `placeholderDnaFromFiles` qui sotto resta come fallback (solo nomi file).
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// FILTRO AMMISSIBILITÀ PER-AZIENDA (Step 4) — booleano, gratis (niente AI).
// Separa i bandi AMMISSIBILI da quelli NON ammissibili PER QUESTA azienda, in base al DNA.
// Prudente: scarta SOLO su mismatch evidente; nel dubbio tiene (lo gestisce poi il voto).
//   1) SETTORE: bando chiaramente di un settore verticale a cui l'azienda non ha affinità.
//   2) GEOGRAFIA: bando regionale di una regione diversa da quella dell'azienda.
// Se non sappiamo nulla dell'azienda (DNA vuoto), NON si scarta per settore: senza profilo
// non si può stabilire un mismatch (così aziende diverse danno conteggi diversi, non finti).
// ----------------------------------------------------------------------------

// Settori verticali: (rileva il bando, rileva l'affinità dell'azienda, motivo dello scarto).
const VERTICAL_SECTORS: { bando: RegExp; company: RegExp; motivo: string }[] = [
  {
    bando: /agricol|agroaliment|zootecn|vitivinic|ortofrut|\brurale\b|forestal|florovivais/i,
    company: /agricol|agroaliment|\bfood\b|aliment|rurale|forestal|vitivinic/i,
    motivo: 'Settore agricolo/agroalimentare non attinente al profilo aziendale',
  },
  {
    bando: /\bpesca\b|acquacolt|ittic|maricoltur/i,
    company: /pesca|ittic|maritt|acquacolt/i,
    motivo: 'Settore pesca/acquacoltura non attinente al profilo aziendale',
  },
  {
    bando: /turism|ricettiv|alberghier|ospitalit|strutture ricettiv|stabiliment[oi] balnear|agrituris/i,
    company: /turism|alberg|ospitalit|ricettiv|hotel|ristoraz/i,
    motivo: 'Settore turistico-ricettivo non attinente al profilo aziendale',
  },
  {
    bando: /spettacolo|cinema|teatr|festival|editori|emittent|radiofonic|televisiv|giornalis|audiovisiv|discografic/i,
    company: /editori|spettacolo|cinema|cultura|\bmedia\b|giornalis|audiovisiv|comunicazion/i,
    motivo: 'Settore cultura/editoria/spettacolo non attinente al profilo aziendale',
  },
  {
    bando: /tessil|abbigliament|calzatur|conciar|pellett|\bmoda\b/i,
    company: /tessil|abbigliament|\bmoda\b|calzatur|design|fashion/i,
    motivo: 'Settore moda/tessile non attinente al profilo aziendale',
  },
]

// Sorgenti regionali -> regione del bando (per il filtro geografico).
const SOURCE_REGION: Record<string, string> = {
  'Lazio Innova': 'Lazio',
  'Sviluppo Toscana': 'Toscana',
  'Sardegna Impresa': 'Sardegna',
}

export function filterCompatible<T extends Grant>(
  dna: CorporateDna | null,
  grants: T[]
): { compatibili: T[]; scartati: { grant: T; motivo: string }[] } {
  const compatibili: T[] = []
  const scartati: { grant: T; motivo: string }[] = []

  // Profilo testuale dell'azienda (competenze + settori + ateco + ragione sociale) per l'affinità di settore.
  const profile = dna
    ? [...(dna.comp ?? []), ...(dna.settori ?? []), ...(dna.ateco ?? []), dna.rag_soc ?? ''].join(' ').toLowerCase()
    : ''
  // Regione dell'azienda dal DNA strutturato (estratta in lib/dna-from-drive). "" = sconosciuta.
  const companyRegion = dna?.regione || ''

  for (const g of grants) {
    const hay = `${g.title} ${g.description ?? ''}`.toLowerCase()

    // 1) Settore: scarta solo se conosciamo il profilo E il bando è di un settore verticale estraneo.
    if (profile) {
      const sec = VERTICAL_SECTORS.find((s) => s.bando.test(hay) && !s.company.test(profile))
      if (sec) {
        scartati.push({ grant: g, motivo: sec.motivo })
        continue
      }
    }

    // 2) Geografia: scarta i bandi regionali di una regione diversa da quella dell'azienda.
    if (companyRegion) {
      const bandoRegion = SOURCE_REGION[g.sourceName ?? '']
      if (bandoRegion && bandoRegion !== companyRegion) {
        scartati.push({ grant: g, motivo: `Bando regionale (${bandoRegion}) fuori dall'area dell'azienda (${companyRegion})` })
        continue
      }
    }

    compatibili.push(g)
  }
  return { compatibili, scartati }
}

// DNA "segnaposto" minimo finché non arriva quello reale dall'automazione Drive.
// Costruito dai file reali della cartella (nessuna analisi finta).
export function placeholderDnaFromFiles(files: DriveFile[], companyName = 'Azienda'): CompanyDna {
  const groupFor = (name: string): CompanyDna['nodes'][number]['group'] => {
    const n = name.toLowerCase()
    if (n.includes('cv') || n.includes('curriculum')) return 'team'
    if (n.includes('formulario') || n.includes('servizi')) return 'competenze'
    if (n.includes('bilanci') || n.includes('bilancio') || n.includes('finanz')) return 'finanza'
    if (n.includes('visura')) return 'asset'
    return 'mercato'
  }
  const nodes: CompanyDna['nodes'] = [
    { id: 'core', label: companyName, group: 'core', value: 100, summary: 'Azienda (DNA in costruzione dall’automazione Drive).' },
    ...files.slice(0, 20).map((f, i) => ({
      id: `f${i}`,
      label: f.name.replace(/\.[a-z0-9]+$/i, ''),
      group: groupFor(f.name),
      value: 60,
      summary: `Documento dal Drive: ${f.name}`,
    })),
  ]
  const links: CompanyDna['links'] = files.slice(0, 20).map((_, i) => ({ source: 'core', target: `f${i}`, strength: 0.6 }))
  return {
    headline: `${companyName}: DNA dai documenti del Drive.`,
    nodes,
    links,
    strengths: [],
    gaps: [],
  }
}

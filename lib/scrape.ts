import 'server-only'
import * as cheerio from 'cheerio'

export type RawResult = {
  title: string
  link: string
  source: string
  published: string
  snippet: string
}

const UA = 'Mozilla/5.0 (compatible; JesapBot/1.0; grant discovery)'

/**
 * Scraping REALE dei principali portali italiani di incentivi alle imprese.
 * Eseguito a ogni ricerca (cache: 'no-store') -> bandi sempre aggiornati. Zero token (HTML/RSS).
 *
 * Fonti NAZIONALI (catalogo strutturato):
 *  - MIMIT (Ministero delle Imprese) — RSS + elenco
 *  - Invitalia (Agenzia nazionale per lo sviluppo)
 * Fonti REGIONALI (bandi che spesso non stanno nei portali nazionali) — RSS filtrati per bandi:
 *  - Lazio Innova, Sviluppo Toscana, Sardegna Impresa
 *
 * NB: incentivi.gov.it e molti portali regionali sono app JavaScript (servirebbe headless browser);
 * i bandi UE stanno sul portale EU Funding&Tenders (fuori scope per scelta).
 */
export async function scrapeGrants(_queries?: string[]): Promise<RawResult[]> {
  const groups = await Promise.all([
    // nazionali
    scrapeMimitRss(),
    scrapeMimitListing(),
    scrapeInvitalia(),
    // regionali (RSS filtrati)
    scrapeRegionalRss('Lazio Innova', 'https://www.lazioinnova.it/feed/'),
    scrapeRegionalRss('Sviluppo Toscana', 'https://www.sviluppo.toscana.it/rss'),
    scrapeRegionalRss('Sardegna Impresa', 'https://www.sardegnaimpresa.eu/it/rss.xml'),
  ])

  const byLink = new Map<string, RawResult>()
  for (const r of groups.flat()) {
    const existing = byLink.get(r.link)
    if (!existing) byLink.set(r.link, r)
    else if (!existing.snippet && r.snippet) byLink.set(r.link, r)
  }
  return Array.from(byLink.values()).slice(0, 60)
}

// Tiene solo gli item che parlano di bandi/agevolazioni (scarta news generiche e voci di servizio).
const BANDO_RX = /(band|contribut|avvis|finanziament|voucher|agevolaz|incentiv|fond[oi]|por |fesr|fse|sovvenzion|credito d|call|sostegn)/i
const NOISE_RX = /(manutenzione|recapiti|sito web|cookie|privacy|newsletter|webinar|evento|premiazione|giornata)/i

async function scrapeRegionalRss(name: string, url: string): Promise<RawResult[]> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, cache: 'no-store' })
    if (!res.ok) return []
    const xml = await res.text()
    const $ = cheerio.load(xml, { xmlMode: true })
    const out: RawResult[] = []
    $('item').each((_, el) => {
      const it = $(el)
      const title = it.find('title').first().text().trim()
      const link = it.find('link').first().text().trim()
      if (!title || !link) return
      const descHtml = it.find('description').first().text()
      const snippet = cheerio.load(descHtml || '').text().replace(/\s+/g, ' ').trim().slice(0, 400)
      const hay = `${title} ${snippet}`
      if (!BANDO_RX.test(hay) || NOISE_RX.test(title)) return // tieni solo i bandi
      out.push({ title, link, source: name, published: it.find('pubDate').first().text().trim(), snippet })
    })
    return out.slice(0, 12)
  } catch {
    return []
  }
}

async function scrapeMimitRss(): Promise<RawResult[]> {
  try {
    const res = await fetch('https://www.mimit.gov.it/it/incentivi?format=feed&type=rss', {
      headers: { 'User-Agent': UA },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const xml = await res.text()
    const $ = cheerio.load(xml, { xmlMode: true })
    const out: RawResult[] = []
    $('item').each((_, el) => {
      const it = $(el)
      const title = it.find('title').first().text().trim()
      const link = it.find('link').first().text().trim()
      if (!title || !link || !link.includes('/it/incentivi/')) return
      const descHtml = it.find('description').first().text()
      const snippet = cheerio.load(descHtml || '').text().replace(/\s+/g, ' ').trim().slice(0, 400)
      out.push({ title, link, source: 'MIMIT — Ministero delle Imprese', published: it.find('pubDate').first().text().trim(), snippet })
    })
    return out
  } catch {
    return []
  }
}

async function scrapeMimitListing(): Promise<RawResult[]> {
  try {
    const res = await fetch('https://www.mimit.gov.it/it/incentivi', { headers: { 'User-Agent': UA }, cache: 'no-store' })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    const out: RawResult[] = []
    const seen = new Set<string>()
    $('a[href^="/it/incentivi/"]').each((_, el) => {
      const a = $(el)
      const href = a.attr('href') || ''
      const slug = href.replace('/it/incentivi/', '')
      const title = a.text().replace(/\s+/g, ' ').trim()
      if (!slug || !title || title.length < 5 || seen.has(slug)) return
      seen.add(slug)
      out.push({
        title,
        link: 'https://www.mimit.gov.it' + href,
        source: 'MIMIT — Ministero delle Imprese',
        published: '',
        snippet: 'Incentivo nazionale per le imprese (MIMIT). Dettagli e requisiti sulla pagina ufficiale.',
      })
    })
    return out
  } catch {
    return []
  }
}

async function scrapeInvitalia(): Promise<RawResult[]> {
  try {
    const res = await fetch('https://www.invitalia.it/cosa-facciamo/rafforziamo-le-imprese', { headers: { 'User-Agent': UA }, cache: 'no-store' })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    const bySlug = new Map<string, string>()
    $('a[href^="/incentivi-e-strumenti/"]').each((_, el) => {
      const a = $(el)
      const slug = (a.attr('href') || '').split('/incentivi-e-strumenti/')[1]
      if (!slug) return
      let title = a.text().replace(/\s+/g, ' ').trim().replace(/^leggi tutto su\s*/i, '').trim()
      if (title.length < 4) return
      const prev = bySlug.get(slug)
      if (!prev || title.length < prev.length) bySlug.set(slug, title)
    })
    return Array.from(bySlug.entries()).map(([slug, title]) => ({
      title,
      link: 'https://www.invitalia.it/incentivi-e-strumenti/' + slug,
      source: 'Invitalia',
      published: '',
      snippet: 'Incentivo gestito da Invitalia (Agenzia nazionale per lo sviluppo). Dettagli e requisiti sulla pagina ufficiale.',
    }))
  } catch {
    return []
  }
}

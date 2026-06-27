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
 * Scraping REALE dei principali portali nazionali di incentivi alle imprese.
 * Eseguito a ogni ricerca (cache: 'no-store'), così i bandi sono sempre quelli pubblicati ora.
 *
 * Fonti (tutte server-rendered, scrapabili senza headless browser):
 *  - MIMIT (Ministero delle Imprese) — RSS + pagina elenco
 *  - Invitalia (Agenzia nazionale per lo sviluppo) — pagina incentivi
 *
 * NB: per aggiungere un portale, basta una nuova funzione che restituisce RawResult[]
 * e aggiungerla all'array qui sotto. (Portali come incentivi.gov.it o i siti regionali sono
 * app JavaScript: richiederebbero un headless browser; l'UE ha un'API a parte — vedi note.)
 */
export async function scrapeGrants(_queries?: string[]): Promise<RawResult[]> {
  const groups = await Promise.all([
    scrapeMimitRss(),
    scrapeMimitListing(),
    scrapeInvitalia(),
  ])

  // unione + dedup per link, preferendo chi ha una descrizione
  const byLink = new Map<string, RawResult>()
  for (const r of groups.flat()) {
    const existing = byLink.get(r.link)
    if (!existing) byLink.set(r.link, r)
    else if (!existing.snippet && r.snippet) byLink.set(r.link, r)
  }
  return Array.from(byLink.values()).slice(0, 40)
}

async function scrapeMimitRss(): Promise<RawResult[]> {
  try {
    const res = await fetch(
      'https://www.mimit.gov.it/it/incentivi?format=feed&type=rss',
      { headers: { 'User-Agent': UA }, cache: 'no-store' },
    )
    if (!res.ok) return []
    const xml = await res.text()
    const $ = cheerio.load(xml, { xmlMode: true })
    const out: RawResult[] = []
    $('item').each((_, el) => {
      const it = $(el)
      const title = it.find('title').first().text().trim()
      const link = it.find('link').first().text().trim()
      if (!title || !link || !link.includes('/it/incentivi/')) return // scarta "Tutti gli incentivi"
      const descHtml = it.find('description').first().text()
      const snippet = cheerio
        .load(descHtml || '')
        .text()
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 400)
      out.push({
        title,
        link,
        source: 'MIMIT — Ministero delle Imprese',
        published: it.find('pubDate').first().text().trim(),
        snippet,
      })
    })
    return out
  } catch {
    return []
  }
}

async function scrapeMimitListing(): Promise<RawResult[]> {
  try {
    const res = await fetch('https://www.mimit.gov.it/it/incentivi', {
      headers: { 'User-Agent': UA },
      cache: 'no-store',
    })
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
        snippet:
          'Incentivo nazionale per le imprese (MIMIT). Dettagli e requisiti sulla pagina ufficiale.',
      })
    })
    return out
  } catch {
    return []
  }
}

async function scrapeInvitalia(): Promise<RawResult[]> {
  try {
    const res = await fetch('https://www.invitalia.it/cosa-facciamo/rafforziamo-le-imprese', {
      headers: { 'User-Agent': UA },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    // titolo "migliore" per ogni slug (scarta i link "LEGGI TUTTO su ...")
    const bySlug = new Map<string, string>()
    $('a[href^="/incentivi-e-strumenti/"]').each((_, el) => {
      const a = $(el)
      const href = a.attr('href') || ''
      const slug = href.split('/incentivi-e-strumenti/')[1]
      if (!slug) return
      let title = a.text().replace(/\s+/g, ' ').trim()
      title = title.replace(/^leggi tutto su\s*/i, '').trim()
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

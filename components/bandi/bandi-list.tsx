'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowDownUp,
  ArrowRight,
  Ban,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  Gauge,
  History,
  Loader2,
  MapPin,
  Radar,
  Search,
  X,
} from 'lucide-react'
import { searchGrants } from '@/app/actions/company'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Grant, ScartatoGrant } from '@/lib/db/schema'

type HistoryItem = { id: number; at: string; found: number; scraped: number; nuovi: number; giaNoti: number; scartati: number }

const STEPS = [
  'Connessione ai portali ufficiali…',
  'Lettura bandi e incentivi…',
  'Raccolta risultati…',
]

const SORT_OPTIONS = [
  { value: 'recenti', label: 'Più recenti' },
  { value: 'voto', label: 'Voto più alto' },
  { value: 'az', label: 'A–Z' },
] as const

export function BandiList({
  grants,
  page,
  totalPages,
  total,
  query,
  sort,
  unfilteredTotal,
  history,
  scartati,
  activeRunId,
}: {
  grants: Grant[]
  page: number
  totalPages: number
  total: number
  query: string
  sort: string
  unfilteredTotal: number
  history: HistoryItem[]
  scartati: ScartatoGrant[]
  activeRunId?: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState(0)
  const [info, setInfo] = useState<string | null>(null)
  const [showScartati, setShowScartati] = useState(false)
  const [q, setQ] = useState(query)
  // Tiene l'input allineato all'URL (es. quando si pulisce il filtro o si cambia run).
  useEffect(() => setQ(query), [query])

  // Ricerca LIVE: mentre si digita, dopo un breve debounce si aggiorna l'URL (?q=)
  // e il filtro lato server rigira su tutti i bandi. Niente Invio necessario.
  useEffect(() => {
    const trimmed = q.trim()
    if (trimmed === query) return // già allineato all'URL: niente navigazione
    const handle = setTimeout(() => {
      const p = new URLSearchParams()
      if (trimmed) p.set('q', trimmed)
      if (sort && sort !== 'recenti') p.set('sort', sort)
      if (activeRunId) p.set('run', String(activeRunId))
      const s = p.toString()
      // replace (non push) per non intasare la cronologia a ogni tasto.
      // scroll:false → non riporta la pagina in cima a ogni aggiornamento live.
      router.replace(s ? `/?${s}` : '/', { scroll: false })
    }, 250)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  // Dropdown ordinamento (custom, per coerenza col tema scuro dell'app).
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!sortOpen) return
    function onDocClick(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [sortOpen])
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label ?? 'Più recenti'

  // Costruisce un URL conservando filtro (q), ordinamento (sort) e run attivo,
  // sovrascrivendo gli `extra`. Il default 'recenti' si omette per tenere l'URL pulito.
  function buildUrl(extra: Record<string, string | number> = {}) {
    const p = new URLSearchParams()
    if (query) p.set('q', query)
    if (sort && sort !== 'recenti') p.set('sort', sort)
    if (activeRunId) p.set('run', String(activeRunId))
    for (const [k, v] of Object.entries(extra)) p.set(k, String(v))
    const s = p.toString()
    return s ? `/?${s}` : '/'
  }

  // Invia la ricerca: aggiorna ?q= (azzera la pagina) preservando sort e run.
  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    const p = new URLSearchParams()
    if (q.trim()) p.set('q', q.trim())
    if (sort && sort !== 'recenti') p.set('sort', sort)
    if (activeRunId) p.set('run', String(activeRunId))
    const s = p.toString()
    router.replace(s ? `/?${s}` : '/', { scroll: false })
  }

  function clearSearch() {
    setQ('')
    const p = new URLSearchParams()
    if (sort && sort !== 'recenti') p.set('sort', sort)
    if (activeRunId) p.set('run', String(activeRunId))
    const s = p.toString()
    router.replace(s ? `/?${s}` : '/', { scroll: false })
  }

  // Cambia ordinamento: azzera la pagina, conserva filtro e run.
  function changeSort(value: string) {
    const p = new URLSearchParams()
    if (query) p.set('q', query)
    if (value && value !== 'recenti') p.set('sort', value)
    if (activeRunId) p.set('run', String(activeRunId))
    const s = p.toString()
    router.replace(s ? `/?${s}` : '/', { scroll: false })
  }

  // Link a un run dello storico, conservando filtro e ordinamento correnti.
  function historyHref(id: number, latest: boolean) {
    const p = new URLSearchParams()
    if (query) p.set('q', query)
    if (sort && sort !== 'recenti') p.set('sort', sort)
    if (!latest) p.set('run', String(id))
    const s = p.toString()
    return s ? `/?${s}` : '/'
  }

  function runSearch() {
    setInfo(null)
    setStep(0)
    const interval = setInterval(() => setStep((s) => (s < STEPS.length - 1 ? s + 1 : s)), 1200)
    startTransition(async () => {
      try {
        const res = await searchGrants()
        setInfo(
          `${res.found} compatibili · ${res.scartati} non ammissibili (scartati gratis, 0 token) · ${res.nuovi} nuovi, ${res.giaNoti} già noti (riuso cache).`
        )
        router.push('/')
        router.refresh()
      } catch {
        setInfo('Errore durante la ricerca. Riprova.')
      } finally {
        clearInterval(interval)
      }
    })
  }

  const activeRun = activeRunId ? history.find((h) => h.id === activeRunId) : history[0]

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-6">
        {/* Header / search */}
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Radar className="size-4 text-accent" /> Portali ufficiali (MIMIT, Invitalia, regioni)
          </span>
          <Button onClick={runSearch} disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            {total > 0 ? 'Nuova ricerca' : 'Cerca bandi'}
          </Button>
        </div>

        {/* Storico ricerche */}
        {history.length > 0 && (
          <div className="glass rounded-2xl p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <History className="size-4 text-accent" /> Storico ricerche
            </div>
            <div className="flex flex-wrap gap-2">
              {history.map((h, i) => {
                const isActive = activeRunId ? activeRunId === h.id : i === 0
                return (
                  <Link
                    key={h.id}
                    href={historyHref(h.id, i === 0)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs transition-colors ${
                      isActive
                        ? 'border-primary/50 bg-primary/20 text-foreground'
                        : 'border-border bg-secondary/40 text-muted-foreground hover:bg-primary/10'
                    }`}
                  >
                    <Clock className="size-3.5" />
                    {new Date(h.at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    <span className="rounded-full bg-background/50 px-1.5 py-0.5 font-medium">{h.found}</span>
                    {i === 0 && <span className="text-accent">· ultima</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Efficienza token — riga compatta */}
        {!isPending && activeRun && total > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            <Gauge className="size-3.5 text-accent" />
            <span><span className="text-ok">{activeRun.giaNoti}</span> già valutati (0 token)</span>
            <span><span className="text-foreground">{activeRun.nuovi}</span> nuovi</span>
            <span><span className="text-danger">{activeRun.scartati}</span> non ammissibili</span>
          </div>
        )}

        {/* Barra di ricerca (testo su titolo + descrizione) + ordinamento — entrambi lato server.
            Posizionata qui, sotto Storico ed Efficienza token, appena sopra la lista. */}
        {unfilteredTotal > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <form onSubmit={submitSearch} className="glass flex flex-1 items-center gap-2 rounded-2xl p-2">
              <Search className="ml-2 size-4 shrink-0 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cerca tra i bandi (es. transizione, digitale, energia)…"
                className="flex-1 bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
              />
              {q && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="mr-1 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-primary/10 hover:text-foreground"
                >
                  <X className="size-3.5" /> Azzera
                </button>
              )}
            </form>

            {/* Ordinamento: dropdown custom in tema con l'app (la tendina nativa stonerebbe).
                I valori con dati reali ordinano subito; "voto" si accende con l'algoritmo. */}
            <div ref={sortRef} className="relative">
              <button
                type="button"
                onClick={() => setSortOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={sortOpen}
                className="glass flex h-full w-full items-center gap-2 rounded-2xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:w-auto"
              >
                <ArrowDownUp className="size-4 shrink-0 text-accent" />
                <span className="hidden sm:inline">Ordina:</span>
                <span className="font-medium text-foreground">{sortLabel}</span>
                <ChevronDown className={`size-4 shrink-0 transition-transform ${sortOpen ? 'rotate-180' : ''}`} />
              </button>
              {sortOpen && (
                <ul
                  role="listbox"
                  className="glass-strong absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-2xl p-1"
                >
                  {SORT_OPTIONS.map((o) => {
                    const active = o.value === sort
                    return (
                      <li key={o.value} role="option" aria-selected={active}>
                        <button
                          type="button"
                          onClick={() => {
                            setSortOpen(false)
                            if (!active) changeSort(o.value)
                          }}
                          className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                            active
                              ? 'bg-primary/20 font-medium text-foreground'
                              : 'text-muted-foreground hover:bg-primary/10 hover:text-foreground'
                          }`}
                        >
                          {o.label}
                          {active && <Check className="size-4 text-accent" />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Loading */}
        {isPending && (
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3">
              <Loader2 className="size-5 animate-spin text-accent" />
              <p className="text-sm font-medium">{STEPS[step]}</p>
            </div>
          </div>
        )}

        {info && !isPending && <p className="text-sm text-muted-foreground">{info}</p>}

        {/* Empty: nessun bando del tutto */}
        {!isPending && total === 0 && unfilteredTotal === 0 && (
          <div className="glass flex flex-col items-center justify-center rounded-3xl px-6 py-16 text-center">
            <div className="rounded-2xl border border-border bg-primary/10 p-4">
              <Radar className="size-8 text-accent" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">Avvia la prima ricerca</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Cercheremo bandi e incentivi reali dai portali ufficiali.
            </p>
          </div>
        )}

        {/* Empty: ci sono bandi ma il filtro non trova nulla */}
        {!isPending && total === 0 && unfilteredTotal > 0 && (
          <div className="glass flex flex-col items-center justify-center rounded-3xl px-6 py-12 text-center">
            <div className="rounded-2xl border border-border bg-primary/10 p-4">
              <Search className="size-7 text-accent" />
            </div>
            <h2 className="mt-4 text-base font-semibold">Nessun bando per «{query}»</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Prova con un altro termine.{' '}
              <button onClick={clearSearch} className="text-accent hover:underline">
                Azzera il filtro
              </button>{' '}
              per rivedere tutti i {unfilteredTotal} bandi.
            </p>
          </div>
        )}

        {/* Risultati (8 per pagina) */}
        {!isPending && grants.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground">
              {query
                ? `${total} di ${unfilteredTotal} bandi per «${query}»`
                : `${total} bandi`}
              {' · '}
              {sort === 'az' ? 'ordine alfabetico' : sort === 'voto' ? 'voto più alto prima' : 'più recenti prima'}
              {' · '}pagina {page} di {totalPages}
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {grants.map((g) => {
                const voto = g.matchScore ?? 0
                const votoColor = voto >= 7.5 ? 'text-ok' : voto >= 5 ? 'text-warn' : 'text-muted-foreground'
                return (
                <div key={g.id} className="glass flex flex-col rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {g.region && (
                        <Badge variant="secondary" className="gap-1">
                          <MapPin className="size-3" />
                          {g.region}
                        </Badge>
                      )}
                      {g.sourceName && <Badge variant="secondary">{g.sourceName}</Badge>}
                    </div>
                    {voto > 0 && (
                      <div className="flex shrink-0 items-baseline gap-0.5" title="Affinità col profilo aziendale (1-10)">
                        <span className={`text-xl font-bold ${votoColor}`}>{voto.toFixed(1)}</span>
                        <span className="text-xs text-muted-foreground">/10</span>
                      </div>
                    )}
                  </div>
                  <Link href={`/bandi/${g.ref ?? g.id}`} className="group">
                    <h3 className="mt-2 text-pretty text-base font-semibold leading-snug group-hover:text-accent">
                      {g.title}
                    </h3>
                  </Link>
                  {g.description && (
                    <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground">{g.description}</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-sm">
                    <Link href={`/bandi/${g.ref ?? g.id}`} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                      Strategia <ArrowRight className="size-3.5" />
                    </Link>
                    {g.sourceUrl && (
                      <a href={g.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                        Sito ufficiale <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                </div>
                )
              })}
            </div>

            {/* Paginazione */}
            {totalPages > 1 && (
              <div className="mt-2 flex items-center justify-center gap-2">
                <Link
                  href={buildUrl({ page: page - 1 })}
                  aria-disabled={page <= 1}
                  className={`rounded-lg border border-border px-3 py-1.5 text-sm ${
                    page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-primary/10'
                  }`}
                >
                  ← Precedente
                </Link>
                <span className="text-sm text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Link
                  href={buildUrl({ page: page + 1 })}
                  aria-disabled={page >= totalPages}
                  className={`rounded-lg border border-border px-3 py-1.5 text-sm ${
                    page >= totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-primary/10'
                  }`}
                >
                  Successiva →
                </Link>
              </div>
            )}
          </>
        )}

        {/* Non ammissibili (scartati dal filtro requisiti minimi, NON valutati = 0 token) */}
        {!isPending && scartati.length > 0 && (
          <div className="glass rounded-2xl p-4">
            <button
              onClick={() => setShowScartati((v) => !v)}
              className="flex w-full items-center gap-2 text-sm font-semibold"
            >
              <Ban className="size-4 text-danger" />
              Non ammissibili ({scartati.length})
              <span className="font-normal text-muted-foreground">
                — scartati senza spendere token AI
              </span>
              <span className="ml-auto text-muted-foreground">{showScartati ? '▾' : '▸'}</span>
            </button>
            {showScartati && (
              <ul className="mt-3 flex flex-col gap-2">
                {scartati.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                    <span className="mt-0.5 text-danger">✕</span>
                    <span className="flex-1">
                      <span className="font-medium">{s.title}</span>
                      {s.sourceName && <span className="text-muted-foreground"> · {s.sourceName}</span>}
                      <span className="block text-xs text-muted-foreground">{s.motivo}</span>
                    </span>
                    {s.sourceUrl && (
                      <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Clock,
  ExternalLink,
  Gauge,
  History,
  Loader2,
  MapPin,
  Radar,
  Search,
} from 'lucide-react'
import { searchGrants } from '@/app/actions/company'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Grant } from '@/lib/db/schema'

type HistoryItem = { id: number; at: string; found: number; scraped: number; nuovi: number; giaNoti: number }

const STEPS = [
  'Connessione ai portali ufficiali…',
  'Lettura bandi e incentivi…',
  'Raccolta risultati…',
]

export function BandiList({
  grants,
  page,
  totalPages,
  total,
  history,
  activeRunId,
}: {
  grants: Grant[]
  page: number
  totalPages: number
  total: number
  history: HistoryItem[]
  activeRunId?: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState(0)
  const [info, setInfo] = useState<string | null>(null)

  function runSearch() {
    setInfo(null)
    setStep(0)
    const interval = setInterval(() => setStep((s) => (s < STEPS.length - 1 ? s + 1 : s)), 1200)
    startTransition(async () => {
      try {
        const res = await searchGrants()
        setInfo(
          `${res.found} bandi dai portali ufficiali · ${res.nuovi} nuovi, ${res.giaNoti} già noti (riuso cache: nessun ricalcolo AI).`
        )
        router.push('/bandi')
        router.refresh()
      } catch {
        setInfo('Errore durante la ricerca. Riprova.')
      } finally {
        clearInterval(interval)
      }
    })
  }

  const runParam = activeRunId ? `&run=${activeRunId}` : ''
  const activeRun = activeRunId ? history.find((h) => h.id === activeRunId) : history[0]

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-col gap-6">
        {/* Header / search */}
        <div className="glass-strong flex flex-col items-start justify-between gap-4 rounded-3xl p-6 sm:flex-row sm:items-center">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Radar className="size-6 text-accent" />
              Bandi per la tua azienda
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Scraping in tempo reale dai portali ufficiali (MIMIT + Invitalia). La compatibilità
              col DNA verrà applicata quando arriverà il modulo dedicato.
            </p>
          </div>
          <Button size="lg" onClick={runSearch} disabled={isPending}>
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
                    href={i === 0 ? '/bandi' : `/bandi?run=${h.id}`}
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

        {/* Anti-spreco token: nuovi vs già noti */}
        {!isPending && activeRun && total > 0 && (
          <div className="glass flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl p-4 text-sm">
            <span className="flex items-center gap-2 font-semibold">
              <Gauge className="size-4 text-accent" /> Efficienza token
            </span>
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">{activeRun.nuovi}</span> nuovi (da analizzare)
            </span>
            <span className="text-muted-foreground">
              <span className="font-medium text-ok">{activeRun.giaNoti}</span> già noti (riuso cache, 0 token)
            </span>
            <span className="text-xs text-muted-foreground">
              Più usi l’app, più bandi sono in cache → meno token a ogni ricerca.
            </span>
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

        {/* Empty */}
        {!isPending && total === 0 && (
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

        {/* Risultati (8 per pagina) */}
        {!isPending && grants.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground">
              {total} bandi · pagina {page} di {totalPages}
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {grants.map((g) => (
                <a
                  key={g.id}
                  href={g.sourceUrl ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group glass rounded-2xl p-5 transition-all hover:border-primary/40 hover:shadow-xl"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    {g.region && (
                      <Badge variant="secondary" className="gap-1">
                        <MapPin className="size-3" />
                        {g.region}
                      </Badge>
                    )}
                    {g.sourceName && <Badge variant="secondary">{g.sourceName}</Badge>}
                  </div>
                  <h3 className="mt-2 text-pretty text-base font-semibold leading-snug">{g.title}</h3>
                  {g.description && (
                    <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground">{g.description}</p>
                  )}
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent">
                    Apri sul sito ufficiale
                    <ExternalLink className="size-3.5" />
                  </span>
                </a>
              ))}
            </div>

            {/* Paginazione */}
            {totalPages > 1 && (
              <div className="mt-2 flex items-center justify-center gap-2">
                <Link
                  href={`/bandi?page=${page - 1}${runParam}`}
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
                  href={`/bandi?page=${page + 1}${runParam}`}
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
      </div>
    </div>
  )
}

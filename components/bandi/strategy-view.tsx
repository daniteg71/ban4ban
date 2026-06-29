'use client'

import { Check, Circle, Download, ExternalLink, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { ExecutionStrategy } from '@/lib/strategy'

const ESITO: Record<string, { label: string; cls: string }> = {
  match: { label: 'OK', cls: 'bg-ok/15 text-ok' },
  parziale: { label: 'Parziale', cls: 'bg-warn/15 text-warn' },
  mismatch: { label: 'KO', cls: 'bg-danger/15 text-danger' },
  'da-valutare': { label: 'Da valutare', cls: 'bg-secondary text-muted-foreground' },
}

export function StrategyView({ s }: { s: ExecutionStrategy }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Barra azioni (nascosta in stampa) */}
      <div className="no-print mb-4 flex items-center justify-between">
        <a href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Torna ai bandi
        </a>
        <Button onClick={() => window.print()} size="sm">
          <Download className="size-4" />
          Scarica PDF
        </Button>
      </div>

      {/* FOGLIO strategia */}
      <div className="strategy-sheet glass rounded-xl p-8">
        <header className="border-b border-border pb-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Printer className="size-3.5" /> Strategia di partecipazione
          </div>
          <h1 className="mt-2 text-2xl font-semibold leading-tight">{s.bando.titolo}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{s.bando.fonte}</Badge>
            {s.bando.scadenza && <span>Scadenza: {s.bando.scadenza}</span>}
            {s.bando.importo && <span>Importo: {s.bando.importo}</span>}
            {s.bando.url && (
              <a href={s.bando.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                Fonte ufficiale <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </header>

        {/* Punteggio (segnaposto finché non arriva il modulo) */}
        <section className="mt-6 grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border p-4 text-center">
            <div className="text-xs text-muted-foreground">Punteggio di affinità</div>
            <div className="mt-1 text-3xl font-bold text-accent">
              {s.score != null ? `${s.score}/10` : '—'}
            </div>
            {s.score == null && <div className="text-[11px] text-muted-foreground">in arrivo</div>}
          </div>
          <div className="rounded-2xl border border-border p-4 text-center">
            <div className="text-xs text-muted-foreground">Probabilità di accesso</div>
            <div className="mt-1 text-3xl font-bold text-accent">
              {s.probabilita != null ? `${s.probabilita}%` : '—'}
            </div>
            {s.probabilita == null && <div className="text-[11px] text-muted-foreground">in arrivo</div>}
          </div>
        </section>

        {/* Anagrafica azienda */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Azienda</h2>
          <table className="mt-2 w-full text-sm">
            <tbody>
              <tr className="border-b border-border/60">
                <td className="py-1.5 text-muted-foreground">Ragione sociale</td>
                <td className="py-1.5 font-medium">{s.azienda.nome}</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-1.5 text-muted-foreground">P.IVA</td>
                <td className="py-1.5">{s.azienda.piva ?? '—'}</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-1.5 text-muted-foreground">ATECO</td>
                <td className="py-1.5">{s.azienda.ateco?.join(', ') ?? '—'}</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-1.5 text-muted-foreground">Certificazioni</td>
                <td className="py-1.5">{s.azienda.cert?.join(', ') ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Tabella matching */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Valutazione di matching</h2>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5">Requisito</th>
                <th className="py-1.5">Richiesto</th>
                <th className="py-1.5">Azienda</th>
                <th className="py-1.5 text-right">Esito</th>
              </tr>
            </thead>
            <tbody>
              {s.matching.map((m, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="py-1.5 font-medium">{m.requisito}</td>
                  <td className="py-1.5 text-muted-foreground">{m.richiesto}</td>
                  <td className="py-1.5 text-muted-foreground">{m.posseduto}</td>
                  <td className="py-1.5 text-right">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ESITO[m.esito].cls}`}>
                      {ESITO[m.esito].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Checklist */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Checklist operativa</h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {s.checklist.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                {c.fatto ? <Check className="mt-0.5 size-4 text-ok" /> : <Circle className="mt-0.5 size-4 text-muted-foreground" />}
                <span className="flex-1">{c.voce}</span>
                {c.responsabile && <span className="text-xs text-muted-foreground">{c.responsabile}</span>}
              </li>
            ))}
          </ul>
        </section>

        {/* Milestone */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Piano (milestone)</h2>
          <ol className="mt-2 flex flex-col gap-1.5">
            {s.milestone.map((m, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="w-24 shrink-0 font-medium text-accent">{m.quando}</span>
                <span className="text-foreground/85">{m.cosa}</span>
              </li>
            ))}
          </ol>
        </section>

        <p className="mt-6 border-t border-border pt-3 text-xs text-muted-foreground">{s.note}</p>
      </div>
    </div>
  )
}

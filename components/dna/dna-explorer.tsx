'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, FileText, Sparkles, TriangleAlert, X } from 'lucide-react'
import type { CompanyDna, DnaNode } from '@/lib/db/schema'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DnaMap2D } from '@/components/dna/dna-map-2d'

const GROUP_META: Record<DnaNode['group'], { label: string; color: string }> = {
  core: { label: 'Azienda', color: '#ffffff' },
  competenze: { label: 'Competenze', color: '#b569b0' },
  mercato: { label: 'Mercato', color: '#f59e0b' },
  finanza: { label: 'Finanza', color: '#22c55e' },
  innovazione: { label: 'Innovazione', color: '#8a3b86' },
  team: { label: 'Team', color: '#c98fc4' },
  asset: { label: 'Asset', color: '#6f2f6b' },
}

export function DnaExplorer({
  dna,
  companyName,
}: {
  dna: CompanyDna
  companyName: string
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = useMemo(
    () => dna.nodes.find((n) => n.id === selectedId) ?? null,
    [dna.nodes, selectedId],
  )

  const activeGroups = useMemo(() => {
    const set = new Set(dna.nodes.map((n) => n.group))
    return Array.from(set)
  }, [dna.nodes])

  return (
    <div className="relative h-[calc(100dvh-3.5rem)] w-full md:h-dvh">
      {/* Mappa 2D statica */}
      <div className="absolute inset-0 p-4">
        <DnaMap2D dna={dna} selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      {/* Top-left: headline */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-sm">
        <div className="glass pointer-events-auto rounded-2xl p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-accent" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              DNA di {companyName}
            </span>
          </div>
          <p className="mt-2 text-pretty text-sm leading-relaxed text-foreground/90">
            {dna.headline}
          </p>
          <div className="mt-3 border-t border-border/60 pt-2">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Documenti dal Drive</p>
            <ul className="flex flex-col gap-1">
              {dna.nodes
                .filter((n) => n.id !== 'core' && n.group !== 'core')
                .map((n) => (
                  <li key={n.id} className="flex items-center gap-1.5 text-xs text-foreground/85">
                    <FileText className="size-3.5 shrink-0 text-accent" />
                    <span className="truncate">{n.label}</span>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Top-right: legend + CTA */}
      <div className="absolute right-4 top-4 z-10 flex flex-col items-end gap-3">
        <Link href="/bandi">
          <Button size="sm" className="shadow-lg">
            Cerca bandi
            <ArrowRight className="size-4" />
          </Button>
        </Link>
        <div className="glass hidden rounded-2xl p-3 sm:block">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Categorie
          </p>
          <div className="flex flex-col gap-1.5">
            {activeGroups.map((g) => (
              <div key={g} className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: GROUP_META[g].color }}
                />
                <span className="text-xs text-foreground/80">
                  {GROUP_META[g].label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom-left: strengths & gaps (mostrati solo se presenti — niente analisi finta) */}
      {(dna.strengths.length > 0 || dna.gaps.length > 0) && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex max-w-xs flex-col gap-2">
          {dna.strengths.length > 0 && (
            <div className="glass pointer-events-auto rounded-2xl p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ok">
                <Check className="size-3.5" /> Punti di forza
              </div>
              <ul className="flex flex-col gap-1">
                {dna.strengths.slice(0, 4).map((s, i) => (
                  <li key={i} className="text-xs leading-snug text-foreground/80">{s}</li>
                ))}
              </ul>
            </div>
          )}
          {dna.gaps.length > 0 && (
            <div className="glass pointer-events-auto rounded-2xl p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-warn">
                <TriangleAlert className="size-3.5" /> Aree da rafforzare
              </div>
              <ul className="flex flex-col gap-1">
                {dna.gaps.slice(0, 3).map((s, i) => (
                  <li key={i} className="text-xs leading-snug text-foreground/80">{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Selected node detail panel */}
      {selected && (
        <div className="absolute bottom-4 right-4 z-20 w-[300px] max-w-[calc(100vw-2rem)]">
          <div className="glass-strong rounded-2xl p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="mt-0.5 size-3 rounded-full"
                  style={{ backgroundColor: GROUP_META[selected.group].color }}
                />
                <div>
                  <h3 className="text-sm font-semibold leading-tight">
                    {selected.label}
                  </h3>
                  <Badge
                    variant="secondary"
                    className="mt-1 h-5 px-1.5 text-[10px]"
                  >
                    {GROUP_META[selected.group].label}
                  </Badge>
                </div>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Chiudi"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-foreground/80">
              {selected.summary}
            </p>
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Maturità</span>
                <span className="font-medium text-foreground">
                  {selected.value}/100
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${selected.value}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hint */}
      {!selected && (
        <p className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 text-center text-xs text-muted-foreground">
          Clicca un nodo per i dettagli
        </p>
      )}
    </div>
  )
}

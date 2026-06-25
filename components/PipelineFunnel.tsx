'use client';

import { useEffect, useState } from 'react';

type Scartato = { id: string; titolo: string; ente: string; stadio: string; motivo: string };
type Report = {
  inputCount: number;
  stage1Passed: number;
  pertinenti: number;
  ammissibili: number;
  compatibili: number;
  llmCallsUsed: number;
  scartati: Scartato[];
};

const STEPS = [
  { key: 'inputCount', label: 'Bandi trovati', sub: 'in ingresso' },
  { key: 'stage1Passed', label: 'Validi', sub: 'scadenza/budget ok' },
  { key: 'pertinenti', label: 'Pertinenti', sub: 'nelle nostre aree' },
  { key: 'compatibili', label: 'Compatibili', sub: 'requisiti minimi ok' },
] as const;

const STADIO_LABEL: Record<string, string> = {
  stage1: 'Filtro base',
  pertinenza: 'Non pertinente',
  ammissibilita: 'Requisiti minimi',
};

export function PipelineFunnel() {
  const [r, setR] = useState<Report | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch('/api/match-report', { cache: 'no-store' })
      .then((res) => res.json())
      .then((d) => !d.error && setR(d))
      .catch(() => {});
  }, []);

  if (!r) return null;
  const max = Math.max(r.inputCount, 1);

  return (
    <div className="rounded-2xl glass p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Come filtriamo i bandi</h3>
        <span className="text-xs text-slate-500">
          {r.compatibili} compatibili su {r.inputCount} · {r.llmCallsUsed} analisi AI
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STEPS.map((s, i) => {
          const val = r[s.key];
          const pct = Math.round((val / max) * 100);
          const isLast = i === STEPS.length - 1;
          return (
            <div key={s.key} className={`rounded-xl p-3 ${isLast ? 'bg-brand-good/10 ring-1 ring-brand-good/30' : 'bg-white/60'}`}>
              <div className={`text-2xl font-bold ${isLast ? 'text-brand-good' : 'text-brand'}`}>{val}</div>
              <div className="text-xs font-medium text-slate-700">{s.label}</div>
              <div className="text-[11px] text-slate-500">{s.sub}</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div className={`h-full ${isLast ? 'bg-brand-good' : 'brand-flow'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {r.scartati.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-xs font-medium text-slate-600 hover:text-brand"
          >
            {open ? '▾' : '▸'} Scartati ({r.scartati.length}) — perché non compaiono
          </button>
          {open && (
            <ul className="mt-2 space-y-1.5">
              {r.scartati.map((s) => (
                <li key={s.id} className="flex items-start gap-2 rounded-lg bg-white/50 px-3 py-2 text-xs">
                  <span className="text-brand-bad">✗</span>
                  <span className="flex-1">
                    <span className="font-medium text-slate-700">{s.titolo}</span>
                    <span className="text-slate-400"> · {s.ente}</span>
                    <div className="text-slate-500">{s.motivo}</div>
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                    {STADIO_LABEL[s.stadio] ?? s.stadio}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        Compaiono solo i bandi <strong>compatibili</strong>: pertinenti con le aree aziendali e con
        i requisiti minimi obbligatori rispettati. L'analisi AI gira solo su questi.
      </p>
    </div>
  );
}

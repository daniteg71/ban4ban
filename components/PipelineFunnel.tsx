'use client';

import { useEffect, useState } from 'react';

type Report = {
  inputCount: number;
  stage1Passed: number;
  stage2Passed: number;
  stage3Enriched: number;
  llmCallsUsed: number;
  resultsCount: number;
};

const STAGES = [
  { key: 'inputCount', label: 'Bandi grezzi', sub: 'in ingresso', cost: 'gratis' },
  { key: 'stage1Passed', label: 'Stage 1', sub: 'filtri rigidi', cost: 'gratis' },
  { key: 'stage2Passed', label: 'Stage 2', sub: 'pre-score + scoring', cost: '~gratis' },
  { key: 'stage3Enriched', label: 'Stage 3', sub: 'LLM sui top', cost: 'a pagamento' },
] as const;

export function PipelineFunnel() {
  const [r, setR] = useState<Report | null>(null);

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
        <h3 className="text-sm font-semibold">Motore di matching · funnel a 3 stadi</h3>
        <span className="text-xs text-slate-500">
          {r.llmCallsUsed} chiamate LLM su {r.inputCount} bandi
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STAGES.map((s) => {
          const val = r[s.key];
          const pct = Math.round((val / max) * 100);
          return (
            <div key={s.key} className="rounded-xl bg-white/60 p-3">
              <div className="text-2xl font-bold text-brand">{val}</div>
              <div className="text-xs font-medium text-slate-700">{s.label}</div>
              <div className="text-[11px] text-slate-500">{s.sub}</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full brand-flow" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">{s.cost}</div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        L'AI generativa (la parte cara) gira solo sull'ultimo stadio: il 90% dei bandi viene scartato
        prima, a costo ~zero. Massima affidabilità dove conta, tempo e spesa minimi.
      </p>
    </div>
  );
}

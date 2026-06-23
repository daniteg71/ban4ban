'use client';

import { useEffect, useState } from 'react';
import type { BandoSource, BandoSummary } from '@/lib/types';
import { BandoCard } from './BandoCard';
import { Owl } from './Owl';

export function BandiSearch({ initial }: { initial: BandoSummary[] }) {
  const [bandi, setBandi] = useState<BandoSummary[]>(initial);
  const [source, setSource] = useState<BandoSource>('drive');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cerca(s: BandoSource) {
    setSource(s);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bandi?source=${s}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Errore nella ricerca');
      setBandi(data.bandi);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore sconosciuto');
      setBandi([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void cerca('drive');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ordinati = [...bandi].sort((a, b) => b.punteggio - a.punteggio);

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center gap-3">
        <button
          onClick={() => cerca('scraping')}
          disabled={loading}
          className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
            source === 'scraping'
              ? 'brand-flow text-white shadow-lg shadow-brand/25'
              : 'glass glass-hover text-slate-700'
          }`}
        >
          🔍 Cerca bandi online
        </button>
        <button
          onClick={() => cerca('drive')}
          disabled={loading}
          className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
            source === 'drive'
              ? 'brand-flow text-white shadow-lg shadow-brand/25'
              : 'glass glass-hover text-slate-700'
          }`}
        >
          📁 Bandi da Drive
        </button>
        {loading && (
          <span className="flex items-center gap-2 text-sm text-slate-500">
            <Owl className="w-6" motion="pulse" /> Ricerca in corso…
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-brand-bad/30 bg-brand-bad/10 px-4 py-3 text-sm text-brand-bad">
          {error}
        </div>
      )}

      {loading && (
        <div className="grid place-items-center py-16">
          <Owl className="w-20" motion="pulse" />
        </div>
      )}

      {!loading && !error && ordinati.length === 0 && (
        <div className="grid place-items-center gap-3 py-16 text-slate-500">
          <Owl className="w-16 opacity-30" />
          <span className="text-sm">Nessun bando trovato per questa fonte.</span>
        </div>
      )}

      {!loading && (
        <div className="grid gap-5 md:grid-cols-2">
          {ordinati.map((b) => (
            <BandoCard key={b.id} bando={b} />
          ))}
        </div>
      )}
    </div>
  );
}

import Link from 'next/link';
import type { BandoSummary } from '@/lib/types';
import { Owl } from './Owl';
import { ScoreGauge } from './ScoreGauge';

const TIER_COLOR: Record<NonNullable<BandoSummary['tier']>, string> = {
  HIGH: '#16a34a',
  MEDIUM: '#d97706',
  LOW: '#64748b',
  EXCLUDED: '#dc2626',
};

export function BandoCard({ bando }: { bando: BandoSummary }) {
  return (
    <Link
      href={`/bandi/${bando.id}`}
      className="group relative block overflow-hidden rounded-2xl glass glass-hover p-5"
    >
      {/* watermark gufo nell'angolo */}
      <Owl className="pointer-events-none absolute -right-6 -bottom-6 w-28 opacity-[0.06] transition-opacity group-hover:opacity-[0.12]" />
      <div className="relative flex items-start gap-4">
        <ScoreGauge value={bando.punteggio} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-500">{bando.area}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                bando.fonte === 'scraping' ? 'bg-brand-light/20 text-brand-ink' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {bando.fonte === 'scraping' ? '🔍 online' : '📁 drive'}
            </span>
            {bando.fonte === 'scraping' && (
              <span className="rounded-full bg-brand-good/15 px-2 py-0.5 text-[10px] font-semibold text-brand-good">
                ✓ Compatibile
              </span>
            )}
            {bando.tier && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                style={{ background: TIER_COLOR[bando.tier] }}
              >
                {bando.tier}
              </span>
            )}
          </div>
          <div className="mt-1 font-semibold text-slate-900 group-hover:text-brand transition-colors">
            {bando.titolo}
          </div>
          <div className="mt-1 text-sm text-slate-600">{bando.ente}</div>
          <p className="mt-3 text-sm text-slate-700">{bando.sintesiBreve}</p>
          <div className="mt-3 flex gap-4 text-xs text-slate-500">
            <span>Scadenza: {new Date(bando.scadenza).toLocaleDateString('it-IT')}</span>
            <span>Importo: € {bando.importo.toLocaleString('it-IT')}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

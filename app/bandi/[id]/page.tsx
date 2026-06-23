import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CriteriaTable } from '@/components/CriteriaTable';
import { ExportButton } from '@/components/ExportButton';
import { MatchTable } from '@/components/MatchTable';
import { Owl } from '@/components/Owl';
import { ScoreGauge } from '@/components/ScoreGauge';
import { getAnalisi } from '@/lib/data-source';

export const dynamic = 'force-dynamic';

const raccLabel = {
  partecipare: { txt: 'Partecipare', cls: 'bg-brand-good/15 text-brand-good' },
  'partecipare-con-riserva': { txt: 'Partecipare con riserva', cls: 'bg-brand-warn/15 text-brand-warn' },
  'non-partecipare': { txt: 'Non partecipare', cls: 'bg-brand-bad/15 text-brand-bad' },
};

export default async function BandoPage({ params }: { params: { id: string } }) {
  const analisi = await getAnalisi(params.id);
  if (!analisi) notFound();

  const { bando, criteri, matchTable, analisiCritica, checklist, raccomandazione } = analisi;
  const r = raccLabel[raccomandazione];

  return (
    <div className="space-y-8">
      <div className="no-print">
        <Link href="/" className="text-sm text-slate-600 hover:text-brand">← Tutti i bandi</Link>
      </div>

      <header className="relative overflow-hidden rounded-2xl glass brand-ring p-6">
        <Owl className="pointer-events-none absolute -right-10 -top-10 w-56 opacity-[0.07]" />
        <div className="relative flex items-start gap-6">
          <ScoreGauge value={bando.punteggio} size="lg" />
          <div className="flex-1">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
              <span>{bando.area}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold normal-case ${
                bando.fonte === 'scraping' ? 'bg-brand-light/20 text-brand-ink' : 'bg-slate-100 text-slate-600'
              }`}>
                {bando.fonte === 'scraping' ? '🔍 online' : '📁 drive'}
              </span>
            </div>
            <h1 className="text-2xl font-bold mt-1">{bando.titolo}</h1>
            <div className="text-slate-600">{bando.ente}</div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-slate-600">Scadenza: {new Date(bando.scadenza).toLocaleDateString('it-IT')}</span>
              <span className="text-slate-600">Importo: € {bando.importo.toLocaleString('it-IT')}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${r.cls}`}>{r.txt}</span>
              {bando.url && (
                <a
                  href={bando.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="no-print text-brand-accent underline hover:opacity-80"
                >
                  Apri bando originale ↗
                </a>
              )}
            </div>
          </div>
          <ExportButton />
        </div>
      </header>

      <section className="rounded-2xl glass p-6">
        <h2 className="font-semibold mb-4">Criteri di valutazione (10)</h2>
        <CriteriaTable criteri={criteri} />
      </section>

      <section className="rounded-2xl glass p-6">
        <h2 className="font-semibold mb-4">Match requisiti</h2>
        <MatchTable rows={matchTable} />
      </section>

      <section className="rounded-2xl glass p-6">
        <h2 className="font-semibold mb-3">Analisi critica</h2>
        <p className="text-slate-700 leading-relaxed">{analisiCritica}</p>
      </section>

      <section className="rounded-2xl glass p-6">
        <h2 className="font-semibold mb-4">Checklist operativa</h2>
        <ul className="space-y-2">
          {checklist.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <input type="checkbox" defaultChecked={item.fatto} className="mt-1" readOnly />
              <span className="flex-1">{item.voce}</span>
              {item.responsabile && (
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">{item.responsabile}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

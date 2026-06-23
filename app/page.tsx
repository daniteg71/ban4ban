import { BandiSearch } from '@/components/BandiSearch';
import { DnaStatus } from '@/components/DnaStatus';
import { Owl } from '@/components/Owl';
import { getBandi, getDna } from '@/lib/data-source';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const [bandiDrive, dna] = await Promise.all([getBandi('drive'), getDna()]);

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl glass brand-ring px-8 py-10">
        <Owl className="absolute -right-10 -top-10 w-64 opacity-10" />
        <div className="relative flex items-center gap-6">
          <Owl className="hidden sm:block w-24 shrink-0" motion="float" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Valuta i bandi col tuo <span className="brand-text">DNA</span>
            </h1>
            <p className="mt-3 max-w-2xl text-slate-600">
              Scegli la fonte — <strong>Cerca bandi online</strong> (scraping sui portali appalti) o{' '}
              <strong>Bandi da Drive</strong> (file pre-caricati). Ogni bando riceve un punteggio
              0–10 rispetto agli asset aziendali. Clicca per l'analisi completa.
            </p>
          </div>
        </div>
      </section>

      <DnaStatus dna={dna} />

      <BandiSearch initial={bandiDrive} />
    </div>
  );
}

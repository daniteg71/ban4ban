import type { DnaSnapshot } from '@/lib/types';
import { Owl } from './Owl';
import { RefreshDnaButton } from './RefreshDnaButton';

export function DnaStatus({ dna }: { dna: DnaSnapshot }) {
  return (
    <div className="relative overflow-hidden rounded-2xl glass p-5">
      <Owl className="pointer-events-none absolute -right-8 -top-8 w-32 opacity-[0.05]" />
      <div className="relative flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold">
          <Owl className="w-5" /> DNA aziendale
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            Aggiornato {new Date(dna.aggiornatoIl).toLocaleString('it-IT')}
          </span>
          <RefreshDnaButton />
        </div>
      </div>
      <div className="relative mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
        <Item label="Ragione sociale" value={dna.visura.ragioneSociale} />
        <Item label="Sede" value={dna.visura.sedeLegale} />
        <Item label="Ultimo fatturato" value={`€ ${dna.bilanci.ultimoFatturato.toLocaleString('it-IT')}`} />
        <Item label="Margine medio" value={`${(dna.bilanci.margineMedio * 100).toFixed(0)}%`} />
        <Item label="Servizi mappati" value={dna.formulario.servizi.toString()} />
        <Item label="CV totali" value={dna.cv.totale.toString()} />
        <Item label="Aree coperte" value={dna.formulario.areeCoperte.join(', ')} />
        <Item label="Certificazioni" value={dna.cv.certificazioni.join(', ')} />
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-slate-900">{value}</div>
    </div>
  );
}

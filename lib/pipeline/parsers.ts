// Parser italiani (port di date_parser / budget_normalizer / location_resolver).
// Tutti tornano null se non riescono (behavior_on_fail: return_null).

const MONTHS: Record<string, string> = {
  gennaio: '01', febbraio: '02', marzo: '03', aprile: '04', maggio: '05', giugno: '06',
  luglio: '07', agosto: '08', settembre: '09', ottobre: '10', novembre: '11', dicembre: '12',
  gen: '01', feb: '02', mar: '03', apr: '04', mag: '05', giu: '06',
  lug: '07', ago: '08', set: '09', ott: '10', nov: '11', dic: '12',
};

export function parseItalianDate(raw?: string): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();

  // ISO o YYYY-MM-DD(THH...)
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // DD/MM/YYYY o DD-MM-YYYY
  const dmy = s.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${m}-${d}`;
  }

  // "15 settembre 2026" / "15 set 2026"
  const named = s.match(/(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})/);
  if (named && MONTHS[named[2]]) {
    return `${named[3]}-${MONTHS[named[2]]}-${named[1].padStart(2, '0')}`;
  }
  return null;
}

export function daysBetween(isoDate: string, today: Date): number {
  const d = new Date(isoDate + 'T00:00:00Z');
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

export function parseItalianBudget(raw?: string): number | null {
  if (!raw) return null;
  // cattura sequenze tipo 1.250.000,00 con o senza simbolo euro
  const m = raw.match(/([\d]{1,3}(?:\.[\d]{3})*(?:,[\d]{1,2})?)/);
  if (!m) return null;
  const normalized = m[1].replace(/\./g, '').replace(',', '.');
  const val = parseFloat(normalized);
  return Number.isFinite(val) ? val : null;
}

const REGIONS = [
  'Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna',
  'Friuli-Venezia Giulia', 'Lazio', 'Liguria', 'Lombardia', 'Marche',
  'Molise', 'Piemonte', 'Puglia', 'Sardegna', 'Sicilia', 'Toscana',
  'Trentino-Alto Adige', 'Umbria', "Valle d'Aosta", 'Veneto',
];

export function resolveRegion(raw?: string): string | null {
  if (!raw) return null;
  const low = raw.toLowerCase();
  return REGIONS.find((r) => low.includes(r.toLowerCase().split('-')[0])) ?? null;
}

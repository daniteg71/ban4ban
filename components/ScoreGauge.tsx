import { coloreFascia, fasciaPunteggio } from '@/lib/scoring';

const STROKE: Record<'alto' | 'medio' | 'basso', string> = {
  alto: '#22C55E',
  medio: '#F59E0B',
  basso: '#EF4444',
};

export function ScoreGauge({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' | 'lg' }) {
  const px = size === 'lg' ? 96 : size === 'sm' ? 48 : 64;
  const stroke = size === 'lg' ? 8 : size === 'sm' ? 4 : 6;
  const r = (px - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, value / 10));
  const dash = c * frac;
  const fascia = fasciaPunteggio(value);
  const textSize = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-sm' : 'text-xl';

  return (
    <div className="relative shrink-0" style={{ width: px, height: px }}>
      <svg width={px} height={px} className="-rotate-90">
        <circle cx={px / 2} cy={px / 2} r={r} fill="none" stroke="#e9e2ec" strokeWidth={stroke} />
        <circle
          cx={px / 2}
          cy={px / 2}
          r={r}
          fill="none"
          stroke={STROKE[fascia]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className={`absolute inset-0 grid place-items-center font-bold ${textSize} ${coloreFascia(value)}`}>
        {value.toFixed(1)}
      </div>
    </div>
  );
}

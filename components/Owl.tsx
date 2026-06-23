// Gufo JESAP riutilizzabile. Per default è riempito dal gradiente viola animato
// (owl-flow). Imposta la larghezza via className (es. "w-10"): l'altezza segue
// l'aspect-ratio del logo. Decorativo -> aria-hidden.

type OwlProps = {
  className?: string;
  /** 'flow' = gradiente animato (default), 'solid' = viola pieno, 'white' = bianco */
  tone?: 'flow' | 'solid' | 'white';
  /** animazione opzionale dell'elemento */
  motion?: 'none' | 'pulse' | 'float';
};

export function Owl({ className = 'w-10', tone = 'flow', motion = 'none' }: OwlProps) {
  const toneClass = tone === 'flow' ? 'owl-flow' : tone === 'white' ? 'owl-white' : '';
  const motionClass = motion === 'pulse' ? 'owl-pulse' : motion === 'float' ? 'owl-float' : '';
  return <span aria-hidden className={`owl ${toneClass} ${motionClass} ${className}`} />;
}

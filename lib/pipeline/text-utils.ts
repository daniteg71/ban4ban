// Pulizia testo + estrazione keyword/certificazioni (versione leggera, serverless-friendly).
// Sostituisce spaCy/KeyBERT del design Python con logica lessicale a costo zero.

import { CERT_PATTERNS } from './scoring-rules';

const ABBREV: Record<string, string> = {
  'p.a.': 'pubblica amministrazione',
  's.r.l.': 'societa a responsabilita limitata',
  's.p.a.': 'societa per azioni',
  'd.lgs.': 'decreto legislativo',
  'art.': 'articolo',
  'n.': 'numero',
};

const BOILERPLATE = [
  /ai sensi del d\.?lgs\.? ?\d+\/\d+/gi,
  /codice dei contratti pubblici/gi,
  /si rende noto che/gi,
  /prot\.? n\.? ?\d+/gi,
  /il responsabile del procedimento/gi,
];

const STOPWORDS = new Set([
  'presente', 'bando', 'gara', 'procedura', 'aperta', 'ristretta', 'comma', 'lettera',
  'articolo', 'decreto', 'legge', 'servizio', 'servizi', 'fornitura', 'lavoro', 'lavori',
  'importo', 'euro', 'base', 'asta', 'offerta', 'aggiudicazione', 'stazione', 'appaltante',
  'per', 'con', 'del', 'della', 'dei', 'delle', 'una', 'uno', 'che', 'non', 'come', 'sono',
  'and', 'the', 'di', 'da', 'in', 'il', 'la', 'le', 'lo', 'gli', 'un', 'al', 'ai', 'su',
]);

export function cleanText(input: string): string {
  let t = input.toLowerCase();
  t = t.replace(/<[^>]+>/g, ' '); // strip html
  for (const [k, v] of Object.entries(ABBREV)) t = t.split(k).join(v);
  for (const re of BOILERPLATE) t = t.replace(re, ' ');
  t = t.replace(/[^a-zà-ù0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return t;
}

export function extractKeywords(cleaned: string, topK = 12): string[] {
  const freq = new Map<string, number>();
  for (const w of cleaned.split(' ')) {
    if (w.length < 4 || STOPWORDS.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([w]) => w);
}

export function extractCertifications(text: string): string[] {
  const found = new Set<string>();
  for (const { regex, label } of CERT_PATTERNS) {
    if (regex.test(text)) found.add(label);
  }
  return [...found];
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

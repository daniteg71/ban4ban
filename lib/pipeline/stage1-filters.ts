// Stage 1 — filtri rigidi a costo zero. Uccide la maggior parte dei bandi prima di spendere AI.
import { daysBetween, parseItalianBudget, parseItalianDate } from './parsers';
import { STAGE1 } from './scoring-rules';
import type { RawTender } from './types';

export type Stage1Result =
  | { passed: true; deadline: string | null; daysToDeadline: number | null; budget: number | null }
  | { passed: false; reason: string };

export function stage1Filter(raw: RawTender, today: Date): Stage1Result {
  const deadline = parseItalianDate(raw.deadlineRaw);
  const daysToDeadline = deadline ? daysBetween(deadline, today) : null;

  // scadenza: se parsabile, deve essere futura e non troppo ravvicinata
  if (daysToDeadline !== null) {
    if (daysToDeadline < 0) return { passed: false, reason: 'deadline_expired' };
    if (daysToDeadline < STAGE1.minDaysToDeadline)
      return { passed: false, reason: 'deadline_too_close' };
  }

  // budget: se parsabile, deve stare nel range sostenibile
  const budget = parseItalianBudget(raw.budgetRaw);
  if (budget !== null) {
    if (budget < STAGE1.minBudget) return { passed: false, reason: 'budget_too_low' };
    if (budget > STAGE1.maxBudget) return { passed: false, reason: 'budget_too_high' };
  }

  // qualità minima del parse: serve almeno titolo + un po' di descrizione
  if (!raw.title || raw.description.trim().length < 30)
    return { passed: false, reason: 'low_quality_parse' };

  return { passed: true, deadline, daysToDeadline, budget };
}

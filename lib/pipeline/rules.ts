// Bonus/malus (post-aggregazione) e rilevamento rischi. Port delle regole di scoring_rules.json.
import type { CompanyProfile } from './company-profile';
import { BONUS_MALUS } from './scoring-rules';
import type { AppliedRule, DetectedRisk, NormalizedTender } from './types';

export function applyBonusMalus(
  tender: NormalizedTender,
  profile: CompanyProfile,
  missingCerts: string[]
): { bonuses: AppliedRule[]; maluses: AppliedRule[]; delta: number } {
  const bonuses: AppliedRule[] = [];
  const maluses: AppliedRule[] = [];
  const fire = (id: string) => {
    const r = BONUS_MALUS.find((x) => x.ruleId === id)!;
    (r.effect >= 0 ? bonuses : maluses).push({ ruleId: id, effect: r.effect });
  };

  // settore in comune
  if ([...profile.sectors].some((s) => tender.cleanedText.includes(s.split(' ')[0]))) fire('portfolio_sector_match');
  // NB: le certificazioni MANCANTI penalizzano già la dimensione certification_match; non
  // applichiamo qui anche expired_certification_penalty (che nel design è per certificati SCADUTI,
  // dato non disponibile nel DNA mock) per non penalizzare due volte.
  void missingCerts;
  // pressione scadenza
  if (tender.daysToDeadline !== null && tender.daysToDeadline >= 4 && tender.daysToDeadline <= 7) fire('near_deadline_pressure');
  // regione di casa
  if (profile.preferredRegion && tender.region === profile.preferredRegion) fire('geographic_home_region');
  // budget assente
  if (tender.budget === null) fire('no_budget_info_uncertainty');

  const delta = [...bonuses, ...maluses].reduce((s, r) => s + r.effect, 0);
  return { bonuses, maluses, delta };
}

export function detectRisks(
  tender: NormalizedTender,
  missingCerts: string[],
  capacityScore: number,
  budget: number | null
): DetectedRisk[] {
  const risks: DetectedRisk[] = [];
  if (tender.daysToDeadline !== null && tender.daysToDeadline <= 7) {
    risks.push({
      riskId: 'imminent_deadline',
      description: 'Scadenza entro 7 giorni: rischio operativo per raccolta documenti e firma digitale.',
      probability: 'high', impact: 'high',
      mitigation: 'Avviare subito raccolta documentazione e firma.',
    });
  }
  if (missingCerts.length) {
    risks.push({
      riskId: 'blocking_certification_missing',
      description: `Certificazione obbligatoria mancante (${missingCerts.join(', ')}): possibile esclusione.`,
      probability: 'high', impact: 'high',
      mitigation: 'Valutare RTI/ATI con partner certificato o rinunciare.',
    });
  }
  if (capacityScore < 5) {
    risks.push({
      riskId: 'capacity_overload',
      description: 'Giornate disponibili insufficienti rispetto all\'effort stimato.',
      probability: 'medium', impact: 'high',
      mitigation: 'Coinvolgere collaboratori esterni o subappaltatori.',
    });
  }
  if (budget !== null && budget > 300_000) {
    risks.push({
      riskId: 'high_value_high_competition',
      description: 'Gara ad alto valore: segmento competitivo.',
      probability: 'medium', impact: 'medium',
      mitigation: 'Differenziare l\'offerta tecnica, citare referenze PA.',
    });
  }
  return risks;
}

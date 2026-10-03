import type { ResolvedWeekIntake } from '../core/weekIntake';

/**
 * Pure, deterministic authority boundary: WHERE the Weekly Coach is permitted to consider
 * TRAIN. This does not decide whether a candidate day is trained — that remains the Coach's
 * decision within this space (TRAIN vs REST, discipline choice when several are candidates,
 * purpose/contribution). "Candidate" means "the Coach MAY choose TRAIN here", never
 * "the Coach MUST choose TRAIN here": REST/UNAVAILABLE remain valid on every date, candidate
 * or not, and the 7-day WeekIntent shape is untouched — non-candidate dates stay in the week
 * as context, they are never removed.
 *
 * This reproduces EXACTLY the same four invariants coachWeekDecision.ts already validates for
 * TRAIN, post-hoc, on the provider's response (managed ownership, temporal eligibility,
 * discipline availability, forcedUnavailable). No new semantics are introduced here, and no
 * rule is duplicated with different meaning: this is the same authority, computed earlier so
 * it can be offered to the Coach as input instead of discovered only after rejection.
 *
 * protection/externalLoad (computed in loadBuilderFacts.ts) are deliberately NOT included.
 * That computation is a different authority: it reads weekly_plan/external_training_records
 * at Builder-call time (session-level, I/O-dependent), not a pure projection of
 * ResolvedWeekIntake. Folding it in here would duplicate/move Builder-level authority into the
 * Coach boundary without a demonstrated equivalence, which this phase's scope explicitly
 * excludes. If protection/externalLoad should ever gate Coach-level TRAIN candidacy, that is a
 * separate, deliberate design decision — not an incidental side effect of this function.
 */
export type WeekTrainCandidate = { date: string; discipline: string };

export function deriveWeekTrainCandidates(intake: ResolvedWeekIntake, managed: readonly string[]): WeekTrainCandidate[] {
  const forcedUnavailable = new Set(
    intake.eligibility
      .map(e => e.date)
      .filter(date => managed.every(discipline =>
        intake.availability.days.find(d => d.date === date && d.discipline === discipline)?.status === 'UNAVAILABLE')),
  );
  const candidates: WeekTrainCandidate[] = [];
  for (const e of intake.eligibility) {
    if (e.status !== 'ELIGIBLE') continue;
    if (forcedUnavailable.has(e.date)) continue;
    for (const discipline of managed) {
      const day = intake.availability.days.find(d => d.date === e.date && d.discipline === discipline);
      if (day?.status === 'AVAILABLE') candidates.push({ date: e.date, discipline });
    }
  }
  return candidates;
}

import type { CoreAthleteContext, CoreFact } from './athleteContext';
import { normalizeAvailabilityDays } from '../sports/trainingAvailability';
import { resolveWeeklyDeclaration } from '../sports/weeklyAvailabilityDeclaration';
import { calendarDays, isCivilDate, addCivilDays, civilWeekStart } from '../planning/civilCalendar';

export type WeekIntakeInput = {
  /** Caller resolves the athlete's civil date/time zone; timestamps are not accepted. */
  referenceDate: string;
  target: ({ kind: 'current_week' | 'next_week' } | { kind: 'week'; startDate: string }) & { source: string };
  includeToday?: CoreFact<boolean>;
  /** Caller-supplied factual scope, not a discipline selection by this resolver. */
  disciplines: readonly string[];
  habitual?: CoreAthleteContext['availability'];
  /** Existing perfil.weekly_availability map, supplied by caller; no reads here. */
  weeklyAvailability?: Record<string, unknown>;
};
export type ResolvedWeekIntake = {
  version: 1; referenceDate: string;
  targetWindow: { startDate: string; endDate: string; source: string };
  temporalDecision: { status: 'resolved' | 'unresolved' | 'not_applicable'; includeToday: boolean | null; source: string | null };
  /** Temporal eligibility alone never asserts availability or permission to train. */
  eligibility: { date: string; status: 'ELIGIBLE' | 'EXCLUDED' | 'UNKNOWN' }[];
  availability: { status: 'resolved' | 'unresolved'; days: {
    date: string; discipline: string; status: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
    basis: 'explicit_week' | 'habitual' | 'unknown'; source: string | null;
  }[] };
  unresolved: ('INCLUDE_TODAY' | 'WEEK_AVAILABILITY')[];
};

/** Pure pre-Coach projection. Existing Monday–Sunday identity is retained even
 * midweek; only eligibility excludes past dates. Explicit non-Monday starts are
 * rejected instead of silently shifted. No sports decisions, DB, NLP or prompts.
 * Weekly confirmation is required for eligible dates; habitual facts are visible
 * evidence, never relabelled as the athlete's answer for this week.
 */
export function resolveWeekIntake(input: WeekIntakeInput): ResolvedWeekIntake {
  if (!isCivilDate(input.referenceDate) || !input.target?.source?.trim()
    || !Array.isArray(input.disciplines) || !input.disciplines.length
    || input.disciplines.some(d => typeof d !== 'string' || !d.trim())
    || new Set(input.disciplines).size !== input.disciplines.length) throw new Error('WEEK_INTAKE_INVALID_INPUT');
  const start = input.target.kind === 'current_week' ? civilWeekStart(input.referenceDate)
    : input.target.kind === 'next_week' ? addCivilDays(civilWeekStart(input.referenceDate), 7)
      : input.target.kind === 'week' ? input.target.startDate : null;
  if (!isCivilDate(start) || civilWeekStart(start) !== start) throw new Error('WEEK_INTAKE_TARGET_INVALID');
  const end = addCivilDays(start, 6);
  if (end < input.referenceDate) throw new Error('WEEK_INTAKE_TARGET_PAST');
  const dates = calendarDays.map((_, i) => addCivilDays(start, i));
  const weekly = resolveWeeklyDeclaration({ weekly_availability: input.weeklyAvailability }, start);
  const days: ResolvedWeekIntake['availability']['days'] = dates.flatMap((date, i) => input.disciplines.map(discipline => {
    const declaration = weekly.status === 'valid' ? weekly.declaration : null;
    const explicit = declaration?.unavailableDays.includes(calendarDays[i]) || declaration?.excludedDisciplines.includes(discipline)
      ? [] : declaration && Object.hasOwn(declaration.availability, discipline)
        ? normalizeAvailabilityDays(declaration.availability[discipline]) : null;
    const fact = input.habitual?.byDiscipline[discipline];
    const baseline = fact?.status === 'known' ? normalizeAvailabilityDays(fact.value) : null;
    const available = explicit ?? baseline;
    return { date, discipline, status: available === null ? 'UNKNOWN' as const
      : available.includes(calendarDays[i]) ? 'AVAILABLE' as const : 'UNAVAILABLE' as const,
      basis: explicit !== null ? 'explicit_week' as const : baseline !== null ? 'habitual' as const : 'unknown' as const,
      source: explicit !== null ? `perfil.weekly_availability.${start}:explicit_user_declaration` : fact?.source ?? null };
  }));
  const todayInside = dates.includes(input.referenceDate);
  const choice = input.includeToday;
  if (choice?.status === 'known' && (typeof choice.value !== 'boolean' || !choice.source?.trim()))
    throw new Error('WEEK_INTAKE_TEMPORAL_INVALID');
  const todayUnavailable = days.filter(d => d.date === input.referenceDate).every(d => d.status === 'UNAVAILABLE');
  const temporal: ResolvedWeekIntake['temporalDecision'] = !todayInside
    ? { status: 'not_applicable', includeToday: null, source: 'today_outside_window' }
    : choice?.status === 'known' ? { status: 'resolved', includeToday: choice.value, source: choice.source }
      : todayUnavailable ? { status: 'not_applicable', includeToday: null, source: 'today_unavailable' }
        : { status: 'unresolved', includeToday: null, source: choice?.source ?? null };
  const eligibility: ResolvedWeekIntake['eligibility'] = dates.map(date => ({ date,
    status: date < input.referenceDate ? 'EXCLUDED' : date > input.referenceDate ? 'ELIGIBLE'
      : temporal.status === 'unresolved' ? 'UNKNOWN'
        : temporal.includeToday === true ? 'ELIGIBLE' : 'EXCLUDED' }));
  const needsAvailability = days.some(d => eligibility.find(e => e.date === d.date)!.status !== 'EXCLUDED'
    && (d.status === 'UNKNOWN' || d.basis !== 'explicit_week'));
  return { version: 1, referenceDate: input.referenceDate, targetWindow: { startDate: start, endDate: end, source: input.target.source },
    temporalDecision: temporal, eligibility, availability: { status: needsAvailability ? 'unresolved' : 'resolved', days },
    unresolved: [...(temporal.status === 'unresolved' ? ['INCLUDE_TODAY' as const] : []),
      ...(needsAvailability ? ['WEEK_AVAILABILITY' as const] : [])] };
}

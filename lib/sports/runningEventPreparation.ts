import { canonicalDigest } from '../execution/executionIntegrity';
import type { PrescriptionScope } from './prescriptionScope';
import { civilDay, type EventAuthority } from '../athlete/eventAuthority';
import type { RunningHistory } from '../execution/historicalRunning';

export const RUNNING_EVENT_PREPARATION_V1 = {
  version: 1 as const, discipline: 'carrera', eventType: 'half_marathon',
  // Product-policy boundaries in civil days; these are not physiological laws.
  baseBuildMinDays: 57, specificBuildMinDays: 22, taperMinDays: 8, raceWeekMaxDays: 7,
  continuity: { recentDays: 28, currentWithinDays: 14, establishedWeeks: 6, recentSessions: 4, longRuns: 2, qualitySessions: 2 },
} as const;
export type PreparationState = 'GENERAL_DEVELOPMENT'|'BASE_BUILD'|'SPECIFIC_BUILD'|'TAPER'|'RACE_WEEK'|'POST_EVENT';
export type LongitudinalDecision = 'MAINTAIN'|'PROGRESS'|'REPEAT'|'REDUCE'|'RECOVER'|'TAPER'|'RACE_PREP'|'BLOCKED';
export type ExposurePermission = 'REQUIRED'|'ALLOWED'|'FORBIDDEN';
export type RunningWeeklyConstraints = {version:1;easy:ExposurePermission;recovery:ExposurePermission;longRun:ExposurePermission;quality:ExposurePermission;eventSpecific:ExposurePermission;progression:'ALLOWED'|'FORBIDDEN';overload:'ALLOWED'|'FORBIDDEN';protectedDate:string|null};

const activeRestrictions = (v: unknown) => {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, any>;
  return r.active === true || (Array.isArray(r.restrictions) && r.restrictions.length > 0) || (Array.isArray(r.areas) && r.areas.length > 0);
};
const exposure = (history: any) => (history?.records ?? []).filter((r: any) => r.countable !== false);

export function decideRunningEventPreparation(input: {
  eventAuthority: EventAuthority; runningHistory: RunningHistory; scope: PrescriptionScope; restrictions?: unknown;
  referenceDate: string; availability?: unknown;
}) {
  const a = input.eventAuthority;
  const eventValid = a?.targetEvent?.confirmation === 'CONFIRMED' && a.targetEvent.priority === 'primary' && a.targetEvent.status === 'active'
    && a.targetEvent.eventType === 'race' && a.goalId === 'half_marathon' && a.targetEvent.goalId === 'half_marathon';
  const rows = exposure(input.runningHistory), classes = new Set(rows.map((r: any) => r.exposure).filter(Boolean));
  const current = civilDay(input.referenceDate);
  if (current === null || a.asOfDate !== input.referenceDate || input.runningHistory.asOfDate !== input.referenceDate) throw Error('D3_REFERENCE_DATE_MISMATCH');
  const dated = rows.filter((r: any) => civilDay(r.date) !== null && civilDay(r.date)! <= current);
  const recent = dated.filter((r: any) => current - civilDay(r.date)! < RUNNING_EVENT_PREPARATION_V1.continuity.recentDays);
  const activeWeeks = new Set(dated.map((r: any) => Math.floor((civilDay(r.date)! + 3) / 7))).size;
  const lastDate = dated.map((r: any) => r.date as string).sort().at(-1) ?? null;
  const currentHistory = lastDate !== null && current - civilDay(lastDate)! <= RUNNING_EVENT_PREPARATION_V1.continuity.currentWithinDays;
  const longRuns = dated.filter((r: any) => r.exposure === 'long_run').length;
  const qualitySessions = dated.filter((r: any) => r.exposure === 'quality').length;
  const thresholds = RUNNING_EVENT_PREPARATION_V1.continuity;
  const established = currentHistory && activeWeeks >= thresholds.establishedWeeks && recent.length >= thresholds.recentSessions && longRuns >= thresholds.longRuns && qualitySessions >= thresholds.qualitySessions && (classes.has('easy') || classes.has('recovery'));
  const longitudinalState = !dated.length ? 'INSUFFICIENT' : !currentHistory ? 'STALE' : established ? 'ESTABLISHED_CURRENT' : 'DEVELOPING';
  const signedDays = eventValid ? civilDay(a.eventDate)! - current : null;
  const days = signedDays === null ? null : Math.max(0, signedDays);
  let preparationState: PreparationState = 'GENERAL_DEVELOPMENT';
  if (eventValid && signedDays! < 0) preparationState = 'POST_EVENT';
  else if (eventValid && days !== null) preparationState = days <= 7 ? 'RACE_WEEK' : days <= 21 ? 'TAPER' : days <= 56 ? 'SPECIFIC_BUILD' : 'BASE_BUILD';
  const restricted = activeRestrictions(input.restrictions);
  const managed = input.scope.prescriptionAllowed && input.scope.managedDisciplines.includes('carrera');
  let longitudinalDecision: LongitudinalDecision = 'MAINTAIN';
  if (!managed) longitudinalDecision = 'BLOCKED';
  else if (restricted) longitudinalDecision = preparationState === 'RACE_WEEK' ? 'RECOVER' : 'REDUCE';
  else if (preparationState === 'POST_EVENT') longitudinalDecision = 'RECOVER';
  else if (preparationState === 'RACE_WEEK') longitudinalDecision = 'RACE_PREP';
  else if (preparationState === 'TAPER') longitudinalDecision = 'TAPER';
  else if (established) longitudinalDecision = preparationState === 'SPECIFIC_BUILD' ? 'PROGRESS' : 'MAINTAIN';
  else longitudinalDecision = 'REPEAT';
  const weeklyIntent = {
    preserveEasyExposure: preparationState !== 'RACE_WEEK' && preparationState !== 'POST_EVENT',
    allowQualityExposure: managed && established && !restricted && ['BASE_BUILD','SPECIFIC_BUILD'].includes(preparationState),
    allowLongRunExposure: managed && established && !restricted && ['BASE_BUILD','SPECIFIC_BUILD'].includes(preparationState),
    recoveryRequired: restricted || preparationState === 'TAPER' || preparationState === 'RACE_WEEK' || preparationState === 'POST_EVENT',
    eventSpecificEmphasis: preparationState === 'SPECIFIC_BUILD' || preparationState === 'RACE_WEEK',
    progressionAllowed: longitudinalDecision === 'PROGRESS',
    numericDoseAuthority: 'B3', intensityAuthority: 'C2',
    taperNoOverload: preparationState === 'TAPER' || preparationState === 'RACE_WEEK',
    raceDayProtected: preparationState === 'RACE_WEEK',
  };
  const constraints: RunningWeeklyConstraints = {
    version: 1 as const,
    easy: managed && !restricted && !['POST_EVENT','RACE_WEEK'].includes(preparationState) ? 'REQUIRED' as const : 'FORBIDDEN' as const,
    recovery: managed ? weeklyIntent.recoveryRequired ? 'REQUIRED' as const : 'ALLOWED' as const : 'FORBIDDEN' as const,
    longRun: weeklyIntent.allowLongRunExposure ? 'ALLOWED' as const : 'FORBIDDEN' as const,
    quality: weeklyIntent.allowQualityExposure ? 'ALLOWED' as const : 'FORBIDDEN' as const,
    eventSpecific: managed && established && !restricted && preparationState === 'SPECIFIC_BUILD' ? 'ALLOWED' as const : 'FORBIDDEN' as const,
    progression: weeklyIntent.progressionAllowed ? 'ALLOWED' as const : 'FORBIDDEN' as const,
    overload: 'FORBIDDEN' as const,
    protectedDate: eventValid ? a.eventDate : null,
  };
  const evidenceSummary = { establishedContinuity: established, executionCount: dated.length, activeWeeks, recentSessions: recent.length, lastDate, longRuns, qualitySessions,
    exposureCounts: input.runningHistory?.summaries?.all?.exposureCounts ?? {}, longRunExposure: input.runningHistory?.summaries?.all?.longRunExposure ?? [],
    qualityExposure: input.runningHistory?.summaries?.all?.qualityExposure ?? [], numericDoseCoverage: input.runningHistory?.summaries?.all?.duration?.status ?? 'UNKNOWN' };
  const body = { version: 1 as const, discipline: 'carrera' as const, eventType: 'half_marathon' as const, eventId: a?.eventId ?? null,
    referenceDate: input.referenceDate, eventDate: a?.eventDate ?? null, daysRemaining: days, preparationState, longitudinalState, longitudinalDecision,
    evidenceSummary, reasons: [`temporal_policy_v1:${preparationState}`, established ? 'established_running_continuity' : 'insufficient_running_exposure', restricted ? 'active_restrictions' : 'no_active_restrictions'],
    restrictionsApplied: restricted, historyCompleteness: input.runningHistory?.coverage?.captureCompleteness ?? 'UNKNOWN', weeklyIntent, constraints,
    managed, decisionDigest: canonicalDigest({ preparationState, longitudinalState, longitudinalDecision, eventDigest:a.digest, eventId:a?.eventId??null, eventDate:a?.eventDate??null, referenceDate:input.referenceDate, historyDigest:input.runningHistory?.digest??null, restrictions:input.restrictions??null, scope:input.scope, availability:input.availability??null }) };
  return body;
}
export type RunningEventPreparationDecisionV1 = ReturnType<typeof decideRunningEventPreparation>;

/** Catalog eligibility only. Numerical targets remain selected and validated by B3/C2. */
export function runningEventMethodAllowed(decision: RunningEventPreparationDecisionV1, methodId: string) {
  const category = methodId === 'running_base' ? 'easy' : methodId === 'running_recovery' ? 'recovery'
    : ['running_threshold','running_vo2'].includes(methodId) ? 'quality' : methodId === 'running_specific' ? 'eventSpecific' : null;
  return category !== null && decision.constraints[category] !== 'FORBIDDEN';
}

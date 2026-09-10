import { canonicalDigest } from '../execution/executionIntegrity';
import type { PrescriptionScope } from './prescriptionScope';

export const RUNNING_EVENT_PREPARATION_V1 = {
  version: 1 as const, discipline: 'carrera', eventType: 'half_marathon',
  // Product-policy boundaries in civil days; these are not physiological laws.
  baseBuildMinDays: 57, specificBuildMinDays: 22, taperMinDays: 8, raceWeekMaxDays: 7,
} as const;
export type PreparationState = 'GENERAL_DEVELOPMENT'|'BASE_BUILD'|'SPECIFIC_BUILD'|'TAPER'|'RACE_WEEK'|'POST_EVENT';
export type LongitudinalDecision = 'MAINTAIN'|'PROGRESS'|'REPEAT'|'REDUCE'|'RECOVER'|'TAPER'|'RACE_PREP'|'BLOCKED';

const activeRestrictions = (v: unknown) => {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, any>;
  return r.active === true || (Array.isArray(r.restrictions) && r.restrictions.length > 0) || (Array.isArray(r.areas) && r.areas.length > 0);
};
const exposure = (history: any) => (history?.records ?? []).filter((r: any) => r.countable !== false);

export function decideRunningEventPreparation(input: {
  eventAuthority: any; runningHistory: any; scope: PrescriptionScope; restrictions?: unknown;
  referenceDate: string; availability?: unknown;
}) {
  const a = input.eventAuthority;
  const eventValid = a?.planningMode === 'EVENT_PREPARATION' && a?.eventType === 'race' && a?.eventDate && a?.goalId === 'half_marathon';
  const rows = exposure(input.runningHistory), classes = new Set(rows.map((r: any) => r.exposure).filter(Boolean));
  const established = rows.length >= 3 && classes.size >= 2 && (classes.has('easy') || classes.has('recovery'));
  const days = typeof a?.daysRemaining === 'number' ? a.daysRemaining : null;
  let preparationState: PreparationState = 'GENERAL_DEVELOPMENT';
  if (a?.validity === 'EVENT_PAST' || (days !== null && days < 0)) preparationState = 'POST_EVENT';
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
    allowQualityExposure: established && !restricted && preparationState === 'SPECIFIC_BUILD',
    allowLongRunExposure: established && !restricted && preparationState === 'BASE_BUILD',
    recoveryRequired: restricted || preparationState === 'TAPER' || preparationState === 'RACE_WEEK' || preparationState === 'POST_EVENT',
    eventSpecificEmphasis: preparationState === 'SPECIFIC_BUILD' || preparationState === 'RACE_WEEK',
    progressionAllowed: longitudinalDecision === 'PROGRESS',
    numericDoseAuthority: 'B3', intensityAuthority: 'C2',
    taperNoOverload: preparationState === 'TAPER' || preparationState === 'RACE_WEEK',
    raceDayProtected: preparationState === 'RACE_WEEK',
  };
  const evidenceSummary = { establishedContinuity: established, executionCount: rows.length,
    exposureCounts: input.runningHistory?.summaries?.all?.exposureCounts ?? {}, longRunExposure: input.runningHistory?.summaries?.all?.longRunExposure ?? [],
    qualityExposure: input.runningHistory?.summaries?.all?.qualityExposure ?? [], numericDoseCoverage: input.runningHistory?.summaries?.all?.duration?.status ?? 'UNKNOWN' };
  const body = { version: 1 as const, discipline: 'carrera' as const, eventType: 'half_marathon' as const, eventId: a?.eventId ?? null,
    referenceDate: input.referenceDate, eventDate: a?.eventDate ?? null, daysRemaining: days, preparationState, longitudinalDecision,
    evidenceSummary, reasons: [`temporal_policy_v1:${preparationState}`, established ? 'established_running_continuity' : 'insufficient_running_exposure', restricted ? 'active_restrictions' : 'no_active_restrictions'],
    restrictionsApplied: restricted, historyCompleteness: input.runningHistory?.coverage?.captureCompleteness ?? 'UNKNOWN', weeklyIntent,
    managed, decisionDigest: canonicalDigest({ preparationState, longitudinalDecision, eventId:a?.eventId??null, eventDate:a?.eventDate??null, referenceDate:input.referenceDate, historyDigest:input.runningHistory?.digest??null, restrictions:input.restrictions??null, scope:input.scope }) };
  return body;
}

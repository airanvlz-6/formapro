import type { WorkoutRecord } from './workoutContracts';
import { performedExecutions } from './workoutProjections';
import { addCivilDays, calendarDays, calendarKey, isCivilDate } from '../planning/civilCalendar';

/**
 * PLAN vs EXECUTION — two layers, never one word.
 *
 *   PLAN       what Forge wanted the athlete to do        (weekly_plan, read-only here)
 *   EXECUTION  what the athlete actually did              (running_execution_records)
 *
 * `projectWorkoutPlans` answers "was this PRESCRIBED session performed?" (only an execution linked
 * with relation='performed'). This module answers the separate factual question "did the athlete
 * train on this civil day?" from EVERY current, non-deleted canonical execution — linked or not.
 * A free or replacing workout counts as real activity (load, frequency, history) but never
 * completes a prescribed session. Pure, serializable, no React/DOM/client state, writes nothing.
 */

/** Prescription types that are not training sessions: a rest day is not "a session to perform". */
export const NON_TRAINING_SESSION_TYPES: readonly string[] = ['descanso', 'unavailable', 'external_blocked'];
export type ExecutionRelation = 'performed' | 'replaced' | 'free';

export type PrescribedSessionInput = { planId: string; sessionId: string | null; tipo?: string | null };
export type DayExecution = { executionId: string; revision: number; relation: ExecutionRelation; title: string; discipline: string };
export type DayActivity = {
  date: string;
  /** Factual: at least one current canonical execution has executedOn === date. */
  dayTrained: boolean;
  executionCount: number;
  executions: DayExecution[];
  /** Prescribed TRAINING sessions of that day (rest/unavailable excluded) and whether each was performed. */
  prescribedSessions: { planId: string; sessionId: string | null; performed: boolean }[];
  /** True only when a prescribed session of that day has a linked relation='performed' execution. */
  prescribedSessionPerformed: boolean;
  restDay: boolean;
  /** Trained on a day with nothing prescribed to train (no session at all, or a rest day). */
  unplannedTraining: boolean;
};

export const executionRelation = (r: WorkoutRecord): ExecutionRelation => r.data.prescription?.relation ?? 'free';
/** Every current, non-deleted canonical execution, whatever its prescription link. */
export const currentExecutions = (records: readonly WorkoutRecord[]) => records.filter(r => !r.deletedAt);

export function describeDayActivity(input: {
  date: string; records: readonly WorkoutRecord[]; prescribed?: readonly PrescribedSessionInput[];
}): DayActivity {
  const executions = currentExecutions(input.records).filter(r => r.data.executedOn === input.date);
  const sessions = input.prescribed ?? [];
  const training = sessions.filter(s => !NON_TRAINING_SESSION_TYPES.includes(calendarKey(String(s.tipo ?? ''))));
  const prescribedSessions = training.map(s => ({ planId: s.planId, sessionId: s.sessionId,
    performed: !!s.sessionId && performedExecutions(input.records, s.planId, s.sessionId).length > 0 }));
  const prescribedSessionPerformed = prescribedSessions.some(s => s.performed);
  return {
    date: input.date, dayTrained: executions.length > 0, executionCount: executions.length,
    executions: executions.map(r => ({ executionId: r.executionId, revision: r.revision, relation: executionRelation(r),
      title: r.data.title, discipline: r.data.discipline })),
    prescribedSessions, prescribedSessionPerformed,
    restDay: sessions.length > 0 && training.length === 0,
    unplannedTraining: executions.length > 0 && training.length === 0,
  };
}

/** Distinct civil days with at least one execution inside [from, to] (inclusive). Two executions on
 * one day count that day once; the executions themselves stay available through `currentExecutions`. */
export function trainedDays(records: readonly WorkoutRecord[], from?: string, to?: string): string[] {
  return [...new Set(currentExecutions(records).map(r => r.data.executedOn)
    .filter(d => (!from || d >= from) && (!to || d <= to)))].sort();
}

const slotDate = (weekStart: string, dia: unknown) => {
  const index = calendarDays.indexOf(calendarKey(String(dia ?? '')));
  return isCivilDate(weekStart) && index >= 0 ? addCivilDays(weekStart, index) : null;
};

/** Civil date of a weekly_plan session slot, or null if the week/day cannot be resolved. */
export const prescribedSessionDate = slotDate;

type PlanLike = { id: unknown; week_start?: string; sessions?: any[] };
/** Day activity for the 7 civil days of a week, with each plan's sessions placed on their slot. */
export function describeWeekActivity(input: { weekStart: string; plans: readonly PlanLike[]; records: readonly WorkoutRecord[] }): DayActivity[] {
  return Array.from({ length: 7 }, (_, i) => addCivilDays(input.weekStart, i)).map(date => describeDayActivity({
    date, records: input.records,
    prescribed: input.plans.flatMap(p => (p.sessions ?? []).filter(s => slotDate(input.weekStart, s.dia) === date)
      .map(s => ({ planId: String(p.id), sessionId: s.session_id ?? null, tipo: s.tipo ?? null })))
  }));
}

export type PrescribedAdherenceWindow = { planned: number; performed: number; rate: number | null };
/** PRESCRIBED adherence over plans ALREADY passed through projectWorkoutPlans: due prescribed training
 * sessions (slot date inside the window and <= today) vs sessions projected `completada`. A free or
 * replacing workout never raises `performed`; it only shows up in actual-activity counts. */
export function prescribedAdherence(input: { today: string; windowDays: number; projectedPlans: readonly PlanLike[] }): PrescribedAdherenceWindow {
  const from = addCivilDays(input.today, 1 - input.windowDays);
  let planned = 0, performed = 0;
  for (const p of input.projectedPlans) for (const s of p.sessions ?? []) {
    const date = p.week_start ? slotDate(p.week_start, s.dia) : null;
    if (!date || date < from || date > input.today || !s.session_id
      || NON_TRAINING_SESSION_TYPES.includes(calendarKey(String(s.tipo ?? '')))) continue;
    planned++;
    if (s.completada === true) performed++;
  }
  return { planned, performed, rate: planned ? Math.round(performed / planned * 100) : null };
}

/** Actual-activity entries shaped like the legacy `{fecha}` history, so frequency readers
 * (calcularFrecuenciaRealRelativa) can count ALL canonical executions, not only performed ones. */
export const activityHistoryEntries = (records: readonly WorkoutRecord[]) =>
  currentExecutions(records).map(r => ({ fecha: r.data.executedOn, executionId: r.executionId }));

/** Canonical executions plus legacy workout_history entries that have no canonical twin
 * (same executionId/workout_id/operationId dedup idiom as lib/core/recentTrainingEvidence.ts). */
export function combineActualActivity(records: readonly WorkoutRecord[], legacyHistory: unknown) {
  const canonical = currentExecutions(records);
  const ids = new Set(canonical.map(r => r.executionId));
  const legacy = (Array.isArray(legacyHistory) ? legacyHistory : []).filter((w: any) => !ids.has(w?.operationId) && !ids.has(w?.workout_id));
  return {
    canonical, legacyUnique: legacy,
    totalExecutions: canonical.length + legacy.length,
    history: [...activityHistoryEntries(canonical), ...legacy.map((w: any) => ({ fecha: w.fecha }))],
  };
}

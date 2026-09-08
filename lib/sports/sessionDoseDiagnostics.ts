import type { AllowedTrainingContract } from './allowedTrainingContract';
import type { SessionDurationEstimate } from './sessionTimeDoseAuthority';
import { timeAuthorityForIntent } from './sessionTimeDosePolicy';
import { transferMethod } from './goalTransferModel';
import { WORKOUT_STRUCTURE_LIBRARY } from './workoutStructureLibrary';
import { calendarDays, calendarKey } from '../planning/weeklyCalendar';

/** One flat record per dose validation attempt (the Builder is capped at two attempts).
 * No logging from rendering, receipt verification or persistence. */
export function emitSessionDoseAuthority(c: AllowedTrainingContract, estimate: SessionDurationEstimate,
  errors: readonly string[], planningRunId?: string) {
  try {
    if (!c.doseContext?.timeAuthority) return;
    const a = timeAuthorityForIntent(c.doseContext.timeBudget, c.intent);
    const method = c.intent?.kind === 'adaptation' ? transferMethod(c.intent.methodId) : undefined;
    const day = calendarDays.indexOf(calendarKey(c.targetDay));
    const date = /^\d{4}-\d{2}-\d{2}$/.test(c.targetWeekStart) && day >= 0
      ? new Date(Date.parse(c.targetWeekStart) + day * 86400000).toISOString().slice(0, 10) : null;
    const number = (n: number | null) => n !== null && Number.isFinite(n) ? n : null;
    const result = errors.includes('SESSION_BUDGET_EXCEEDED') ? 'SESSION_BUDGET_EXCEEDED'
      : errors.includes('SESSION_DOSE_UNDERDOSED') ? 'SESSION_DOSE_UNDERDOSED'
      : errors.includes('SESSION_DOSE_UNDER_TARGET') ? 'SESSION_DOSE_UNDER_TARGET'
      : errors.includes('SESSION_DOSE_OVER_TARGET') ? 'SESSION_DOSE_OVER_TARGET'
      : errors.length ? 'DOSE_REJECTED' : a.resolution;
    console.info?.('SESSION_DOSE_AUTHORITY', JSON.stringify({
      planningRunId: typeof planningRunId === 'string' && /^[a-f0-9-]{36}$/.test(planningRunId) ? planningRunId : null,
      date, discipline: method?.discipline ?? (Object.values(WORKOUT_STRUCTURE_LIBRARY).some(s => s.discipline === c.discipline) ? c.discipline : null),
      method: method?.id ?? null,
      role: c.intent?.kind === 'adaptation' && ['PRIMARY', 'SUPPORTING', 'MAINTENANCE', 'OPTIONAL'].includes(c.intent.role) ? c.intent.role : null,
      availableMinSeconds: number(a.availableTime.minimumSeconds), availableMaxSeconds: number(a.availableTime.maximumSeconds),
      hardMaximumSeconds: number(a.hardMaximumSeconds), targetMinSeconds: a.targetDuration?.minimumSeconds ?? null,
      targetMaxSeconds: a.targetDuration?.maximumSeconds ?? null, minimumUsefulSeconds: a.minimumUsefulDurationSeconds,
      estimatedMinSeconds: number(estimate.minimumSeconds), estimatedExpectedSeconds: number(estimate.expectedSeconds),
      estimatedMaxSeconds: number(estimate.maximumSeconds), result, policyId: a.policyId, provenance: a.provenance,
    }));
  } catch { /* Serialization and logger failures are non-authoritative. */ }
}

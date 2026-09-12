import type { AllowedTrainingContract } from './allowedTrainingContract';
import type { SessionDurationEstimate } from './sessionTimeDoseAuthority';
import { timeAuthorityForIntent } from './sessionTimeDosePolicy';
import { transferMethod } from './goalTransferModel';
import { WORKOUT_STRUCTURE_LIBRARY } from './workoutStructureLibrary';
import { calendarDays, calendarKey } from '../planning/weeklyCalendar';
import { MOVEMENT_LIBRARY } from './movementLibrary';

/** Reuse the existing diagnostic boundary. Never log raw prompts, profiles or receipts. */
export function emitSessionCoachingDiagnostic(event: 'SESSION_COACH_INPUT' | 'SESSION_COACH_DECISION'
  | 'SESSION_AUTHORITY_RESOLUTION' | 'BUILDER_OUTPUT', projection: unknown) {
  try { if (process.env.FORGE_SESSION_COACHING_DIAGNOSTICS === '1') console.info?.(event, JSON.stringify(projection)); }
  catch { /* Observability never grants or removes prescription authority. */ }
}

/** Only structured quantities and status codes from the server context enter diagnostic logs. */
export function sessionCoachingHistoryDiagnostic(context: string, discipline: string) {
  try {
    const parsed = JSON.parse(context);
    const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
    const code = (v: unknown) => typeof v === 'string' && /^[A-Z_]{1,80}$/.test(v) ? v : 'UNKNOWN';
    const blocks = (raw: any) => Array.isArray(raw) ? raw.slice(0, 3).map(b => ({
      blockType: ['warmup', 'main', 'cooldown'].includes(b.blockType) ? b.blockType : 'UNKNOWN',
      movements: Array.isArray(b.movements) ? b.movements.slice(0, 30).map((m: any) => ({
        movementId: Object.hasOwn(MOVEMENT_LIBRARY, m.movementId) ? m.movementId : 'UNKNOWN',
        dose: Object.fromEntries(['sets', 'reps', 'durationSeconds', 'distanceMeters', 'restSeconds'].map(k => [k, number(m.prescription?.[k])])),
      })) : [],
    })) : null;
    return { prescribed: (parsed.sessionHistory?.prescriptions ?? []).filter((r: any) => r.prescription?.discipline === discipline).slice(0, 8)
      .map((r: any) => ({ date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null, factualState: code(r.factualState),
        methodId: transferMethod(r.prescription.methodId)?.id ?? null,
        durationMinutes: number(r.prescription.durationMinutes), structuredDose: blocks(r.prescription.structuredDose),
        executedQuantityStatus: code(r.execution?.quantityStatus) })),
      readinessStatus: parsed.readiness?.status === 'available' ? 'available' : 'unknown',
      modificationCodes: (parsed.sessionHistory?.modifications?.records ?? []).slice(0, 8)
        .map((r: any) => ({ trigger: code(r.trigger_type), reasonCode: code(r.reason_code) })) };
  } catch { return { status: 'UNKNOWN' }; }
}

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

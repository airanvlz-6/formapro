import type { CompatibleRunningDoseEvidence } from './runningDoseCompatibility';
import type { RunningDoseSelection } from './runningMethodDoseAuthority';
import type { StrategicIntent } from './goalTransferModel';

// Product reuse policies, not physiological capacity or progression estimates.
// Each requires an explicit, complete, recent execution of exactly this method.
export const RUNNING_REUSE_POLICIES = {
  running_recovery: { id: 'recovery_completed_duration_reuse_v1', movement: 'regenerativo', structure: 'continuo_regenerativo', mode: 'continuous' },
  running_long_run: { id: 'long_run_completed_duration_reuse_v1', movement: 'rodaje_largo', structure: 'continuo_carrera', mode: 'continuous' },
  running_threshold: { id: 'threshold_sustained_work_reuse_v1', movement: 'series_umbral', structure: 'tempo_continuo', mode: 'continuous' },
  running_vo2: { id: 'vo2_uniform_intervals_reuse_v1', movement: 'series_vo2max', structure: 'intervalos_carrera', mode: 'intervals' },
} as const;
export const RUNNING_REUSE_RECENCY_DAYS = 28;
type Method = keyof typeof RUNNING_REUSE_POLICIES;
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
const exact = (n: number) => ({ minimum: n, maximum: n });
export function runningReuseSelection(e: CompatibleRunningDoseEvidence, intent: StrategicIntent): { dose: RunningDoseSelection | null; reason: string; executionId?: string } {
  const policy = RUNNING_REUSE_POLICIES[intent.methodId as Method];
  const fail = (reason: string) => ({ dose: null, reason });
  if (!policy || intent.pattern !== 'run' || e.variant !== intent.methodId) return fail('DOMAIN_UNSUPPORTED');
  const evidence = e.structuredMethodExecution;
  if (evidence?.status === 'CONFLICT') return fail('CONFLICTING_EVIDENCE');
  const asOf = Date.parse(e.window.endDate);
  if (!Number.isFinite(asOf)) return fail('INVALID_EVIDENCE_WINDOW');
  const rows = (evidence?.records ?? []).filter(r => r.date >= e.window.startDate && r.date <= e.window.endDate
    && Number.isFinite(Date.parse(r.date)) && asOf - Date.parse(r.date) < RUNNING_REUSE_RECENCY_DAYS * 86400000
    && r.provenance === 'STRUCTURED_SELF_REPORTED' && r.verification === 'SERVER_VALIDATED_SELF_REPORT'
    && r.executionIdentity.methodId === intent.methodId && r.executionIdentity.variant === intent.methodId
    && r.executionIdentity.pattern === 'run' && r.executionIdentity.family === e.family);
  if (!rows.length) return fail('RECENT_METHOD_EXECUTION_REQUIRED');
  // Latest report supersedes earlier outings; an incomplete latest report cannot silently fall back.
  const latest = rows.map(r => r.date).sort().at(-1)!;
  const candidates = rows.filter(r => r.date === latest);
  if (candidates.length !== 1) return fail('AMBIGUOUS_LATEST_METHOD_EXECUTION');
  const r = candidates[0], s = r.structure, q = r.quantities;
  if (!r.executionId || r.completeness !== 'FULL' || r.missing.length) return fail('COMPLETE_METHOD_EXECUTION_REQUIRED');
  if (!s || s.mode !== policy.mode || !s.bouts.length || s.bouts.some(b => !b.completed || b.movementId !== policy.movement
    || !positive(b.durationSeconds) || b.distanceMeters !== undefined || b.repetitions !== undefined)) return fail('EXACT_METHOD_STRUCTURE_REQUIRED');
  // A main-only composition cannot silently discard separately reported preparation or recoveries.
  if (q.preparationDurationSeconds !== undefined || q.preparationDistanceMeters !== undefined || q.totalDistanceMeters !== undefined
    || q.mainWorkDistanceMeters !== undefined) return fail('UNSUPPORTED_EXECUTION_COMPOSITION');
  const work = s.bouts.reduce((n, b) => n + b.durationSeconds!, 0);
  if (!positive(q.totalDurationSeconds) || q.mainWorkDurationSeconds !== work) return fail('EXACT_MAIN_AND_TOTAL_REQUIRED');
  const common = { selectedTarget: exact(work), maximumAuthorized: work, minimumUseful: null, compositionTolerance: null,
    allowedMovementIds: [policy.movement], structures: [policy.structure], metric: 'duration' as const, unit: 'seconds' as const };
  if (policy.mode === 'continuous') {
    if (s.bouts.length !== 1 || s.recoveries?.length || q.totalDurationSeconds !== work) return fail('CONTINUOUS_TOTAL_REQUIRED');
    return { reason: 'EXACT_COMPLETED_METHOD_REUSE', executionId: r.executionId,
      dose: { ...common, composition: 'SINGLE_CONTINUOUS_TOTAL', structureConstraints: { mode: 'continuous', efforts: null, bout: null, recoverySeconds: null } } };
  }
  const recoveries = s.recoveries ?? [], bout = s.bouts[0].durationSeconds!;
  if (s.bouts.length < 2 || s.bouts.some(b => b.durationSeconds !== bout) || recoveries.length !== s.bouts.length - 1
    || recoveries.some((v, i) => !v.completed || v.afterBout !== s.bouts[i].boutIndex || v.mode !== 'passive'
      || !positive(v.durationSeconds) || v.distanceMeters !== undefined || v.durationSeconds !== recoveries[0].durationSeconds))
    return fail('UNIFORM_WORK_AND_PASSIVE_RECOVERY_REQUIRED');
  const rest = recoveries[0].durationSeconds!;
  if (q.totalDurationSeconds !== work + rest * recoveries.length) return fail('EXACT_INTERVAL_TOTAL_REQUIRED');
  return { reason: 'EXACT_COMPLETED_METHOD_REUSE', executionId: r.executionId, dose: { ...common, metric: 'work_duration',
    composition: 'SINGLE_INTERVAL_MAIN', structureConstraints: { mode: 'intervals', efforts: exact(s.bouts.length),
      bout: { unit: 'seconds', range: exact(bout) }, recoverySeconds: exact(rest) } } };
}
export const selectRecoveryReuse = (e: CompatibleRunningDoseEvidence, i: StrategicIntent) => i.methodId === 'running_recovery' ? runningReuseSelection(e,i).dose : null;
export const selectLongRunReuse = (e: CompatibleRunningDoseEvidence, i: StrategicIntent) => i.methodId === 'running_long_run' ? runningReuseSelection(e,i).dose : null;
export const selectThresholdReuse = (e: CompatibleRunningDoseEvidence, i: StrategicIntent) => i.methodId === 'running_threshold' ? runningReuseSelection(e,i).dose : null;
export const selectVo2Reuse = (e: CompatibleRunningDoseEvidence, i: StrategicIntent) => i.methodId === 'running_vo2' ? runningReuseSelection(e,i).dose : null;

/** Targeted factual capture through the existing authenticated execution writer. Never asks
 * the athlete to claim a hypothetical dose or to repeat a session just to unlock planning. */
export function runningReuseRequirement(methodId: string, reason: string) {
  const p = RUNNING_REUSE_POLICIES[methodId as Method];
  if (!p) return null;
  const needsCapture = reason === 'RECENT_METHOD_EXECUTION_REQUIRED';
  return { version: 1 as const, kind: needsCapture ? 'NEEDS_METHOD_EXECUTION' as const : 'METHOD_EXECUTION_REVIEW_REQUIRED' as const, methodId, policyId: p.id,
    reason, source: 'STRUCTURED_SELF_REPORTED' as const, transport: '/api/running-execution',
    recencyDays: RUNNING_REUSE_RECENCY_DAYS, units: 'seconds' as const,
    fields: needsCapture ? ['sourceActivityId','occurredAt','method','completeness','quantities.totalDuration','quantities.mainWorkDuration','structure.bouts',
      ...(p.mode === 'intervals' ? ['structure.recoveries'] : [])] : [],
    movementId: p.movement, mode: p.mode, noPriorExecution: 'NO_SAFE_FIRST_EXPOSURE_POLICY' as const };
}

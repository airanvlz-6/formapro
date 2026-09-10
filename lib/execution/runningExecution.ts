import { object, keys, normalizeQuantity, executionIdentity, canonicalDigest, ExecutionError, type ExecutionCompleteness } from './executionIntegrity';
import { resolveCompletionDate } from '../planning/recordCompletion';
import { transferMethod } from '../sports/goalTransferModel';
import { RUNNING_METHOD_DOSE_POLICIES } from '../sports/runningMethodDosePolicies';
import { MOVEMENT_LIBRARY } from '../sports/movementLibrary';

export type RunningExecutionRecord = {
  version: 1; executionId: string | null; athleteScope: string; source: 'forge_manual'; occurredAt: string;
  provenance: 'STRUCTURED_SELF_REPORTED'; verification: 'SERVER_VALIDATED_SELF_REPORT';
  planAssociation?: { sessionId: string; semantics: 'REPORTED_PLAN_ASSOCIATION' };
  executionIdentity: { discipline: 'carrera'; status: 'UNKNOWN' | 'EXPLICIT_SELF_REPORTED'; methodId?: string; family?: string; variant?: string; pattern?: string };
  quantities: { totalDurationSeconds?: number; totalDistanceMeters?: number; mainWorkDurationSeconds?: number;
    mainWorkDistanceMeters?: number; preparationDurationSeconds?: number; preparationDistanceMeters?: number };
  structure?: { mode: 'continuous' | 'intervals' | 'technical';
    bouts: { boutIndex: number; movementId: string; completed: boolean; durationSeconds?: number; distanceMeters?: number; repetitions?: number }[];
    recoveries?: { afterBout: number; durationSeconds?: number; distanceMeters?: number; mode?: 'passive' | 'active'; completed: boolean }[] };
  intensityObservation?: { metric: 'rpe'; value: number; provenance: 'STRUCTURED_SELF_REPORTED' };
  completeness: ExecutionCompleteness;
};
const fields = ['totalDuration', 'totalDistance', 'mainWorkDuration', 'mainWorkDistance', 'preparationDuration', 'preparationDistance'] as const;
function quantities(input: unknown) {
  const q = object(input); keys(q, fields);
  return Object.fromEntries(fields.flatMap(k => q[k] === undefined ? [] : [[k + (k.endsWith('Duration') ? 'Seconds' : 'Meters'),
    normalizeQuantity(q[k], k.endsWith('Duration') ? 'duration' : 'distance')]]));
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new ExecutionError('EXECUTION_INDEX_INVALID');
  return value;
}
function completed(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new ExecutionError('EXECUTION_COMPLETION_REQUIRED');
  return value;
}
/** Explicit factual report only. Never reads a prescription, infers a method, or grants measured authority. */
export function validateRunningExecution(input: unknown, athlete: string, today: string): RunningExecutionRecord {
  const r = object(input);
  keys(r, ['sourceActivityId', 'occurredAt', 'planSessionId', 'method', 'quantities', 'structure', 'completeness', 'intensityObservation']);
  if (!athlete || resolveCompletionDate(today)?.date !== today) throw new ExecutionError('EXECUTION_CONTEXT_INVALID');
  const occurred = resolveCompletionDate(r.occurredAt);
  if (!occurred || occurred.date > today) throw new ExecutionError('EXECUTION_DATE_INVALID');
  if (!['FULL','PARTIAL','MODIFIED','ABANDONED'].includes(String(r.completeness))) throw new ExecutionError('EXECUTION_COMPLETENESS_REQUIRED');
  const identity: RunningExecutionRecord['executionIdentity'] = { discipline: 'carrera', status: 'UNKNOWN' };
  if (r.method !== undefined) {
    const m = object(r.method); keys(m, ['methodId', 'variant', 'pattern']);
    const method = transferMethod(m.methodId), policy = RUNNING_METHOD_DOSE_POLICIES.find(p => p.methodId === m.methodId);
    if (!method || !policy || !method.patterns.some(p => p === m.pattern)) throw new ExecutionError('EXECUTION_METHOD_INVALID');
    const variant = policy.family === 'EVENT_SPECIFIC' ? m.variant : policy.family === 'TECHNICAL_EXPOSURE' ? m.pattern : method.id;
    if (policy.family === 'EVENT_SPECIFIC' && !['half_marathon:run','10k:run'].includes(String(variant))) throw new ExecutionError('EXECUTION_VARIANT_INVALID');
    if (m.variant !== undefined && m.variant !== variant) throw new ExecutionError('EXECUTION_VARIANT_INVALID');
    Object.assign(identity, { status: 'EXPLICIT_SELF_REPORTED', methodId: method.id, family: policy.family, variant, pattern: m.pattern });
  }
  const record: RunningExecutionRecord = { version: 1, executionId: executionIdentity(athlete, 'forge_manual', r.sourceActivityId),
    athleteScope: canonicalDigest(athlete), source: 'forge_manual', occurredAt: occurred.date,
    provenance: 'STRUCTURED_SELF_REPORTED', verification: 'SERVER_VALIDATED_SELF_REPORT',
    executionIdentity: identity, quantities: quantities(r.quantities ?? {}), completeness: r.completeness as ExecutionCompleteness };
  if (r.planSessionId !== undefined) {
    executionIdentity(athlete, 'plan_association', r.planSessionId);
    if (typeof r.planSessionId !== 'string') throw new ExecutionError('EXECUTION_PLAN_ASSOCIATION_INVALID');
    record.planAssociation = { sessionId: r.planSessionId, semantics: 'REPORTED_PLAN_ASSOCIATION' };
  }
  if (r.structure !== undefined) {
    const s = object(r.structure); keys(s, ['mode','bouts','recoveries']);
    if (!['continuous','intervals','technical'].includes(String(s.mode)) || !Array.isArray(s.bouts) || s.bouts.length > 256)
      throw new ExecutionError('EXECUTION_STRUCTURE_INVALID');
    const methodModes: Record<string, string[]> = {running_base:['continuous'],running_recovery:['continuous'],
      running_threshold:['continuous','intervals'],running_vo2:['intervals'],running_specific:['continuous'],running_economy:['technical']};
    if (identity.methodId && !methodModes[identity.methodId].includes(String(s.mode))) throw new ExecutionError('EXECUTION_METHOD_STRUCTURE_INCOMPATIBLE');
    const bouts = s.bouts.map(raw => {
      const b = object(raw); keys(b, ['boutIndex','movementId','duration','distance','repetitions','completed']);
      const movement = typeof b.movementId === 'string' ? MOVEMENT_LIBRARY[b.movementId] : null;
      if (!movement?.discipline.includes('carrera') || !['run','jump'].includes(movement.movement_pattern)
        || (identity.methodId && (!movement.suitable_for.includes(transferMethod(identity.methodId)!.stimulusId)
          || movement.movement_pattern !== identity.pattern))) throw new ExecutionError('EXECUTION_MOVEMENT_INCOMPATIBLE');
      return { boutIndex: count(b.boutIndex), movementId: b.movementId as string, completed: completed(b.completed),
        ...(b.duration === undefined ? {} : { durationSeconds: normalizeQuantity(b.duration, 'duration') }),
        ...(b.distance === undefined ? {} : { distanceMeters: normalizeQuantity(b.distance, 'distance') }),
        ...(b.repetitions === undefined ? {} : { repetitions: count(b.repetitions) }) };
    }).sort((a,b) => a.boutIndex - b.boutIndex);
    if (new Set(bouts.map(b => b.boutIndex)).size !== bouts.length) throw new ExecutionError('EXECUTION_BOUT_DUPLICATE');
    record.structure = { mode: s.mode as 'continuous' | 'intervals' | 'technical', bouts };
    if (s.recoveries !== undefined) {
      if (!Array.isArray(s.recoveries) || s.recoveries.length > 256) throw new ExecutionError('EXECUTION_RECOVERY_INVALID');
      record.structure.recoveries = s.recoveries.map(raw => {
        const q = object(raw); keys(q, ['afterBout','duration','distance','mode','completed']);
        const afterBout = count(q.afterBout);
        if (!bouts.some(b => b.boutIndex === afterBout) || (q.mode !== undefined && !['active','passive'].includes(String(q.mode)))) throw new ExecutionError('EXECUTION_RECOVERY_INVALID');
        return { afterBout, completed: completed(q.completed), ...(q.mode === undefined ? {} : {mode: q.mode as 'active' | 'passive'}),
          ...(q.duration === undefined ? {} : {durationSeconds: normalizeQuantity(q.duration, 'duration')}),
          ...(q.distance === undefined ? {} : {distanceMeters: normalizeQuantity(q.distance, 'distance')}) };
      }).sort((a,b) => a.afterBout - b.afterBout);
      if (new Set(record.structure.recoveries.map(q => q.afterBout)).size !== record.structure.recoveries.length) throw new ExecutionError('EXECUTION_RECOVERY_DUPLICATE');
    }
    if (record.completeness === 'FULL' && (bouts.some(b => !b.completed) || record.structure.recoveries?.some(q => !q.completed))) throw new ExecutionError('EXECUTION_COMPLETENESS_CONFLICT');
    for (const dimension of ['DurationSeconds','DistanceMeters'] as const) {
      const main = record.quantities[`mainWork${dimension}`];
      const key = dimension === 'DurationSeconds' ? 'durationSeconds' : 'distanceMeters';
      const values = bouts.map(b => b[key]);
      // Only compare a fully quantified actual structure. Never fill missing aggregates or bouts.
      if (main !== undefined && bouts.length && values.every(v => v !== undefined)
        && Math.abs(values.reduce((a,b) => a! + b!, 0)! - main) > Number.EPSILON * Math.max(1, main) * bouts.length)
        throw new ExecutionError('EXECUTION_MAIN_STRUCTURE_CONFLICT');
    }
  }
  for (const dimension of ['DurationSeconds','DistanceMeters'] as const) {
    const total = record.quantities[`total${dimension}`], main = record.quantities[`mainWork${dimension}`], prep = record.quantities[`preparation${dimension}`];
    const field = dimension === 'DurationSeconds' ? 'durationSeconds' : 'distanceMeters';
    const knownWork = main ?? record.structure?.bouts.reduce((sum,b) => sum + (b[field] ?? 0),0) ?? 0;
    const knownRecovery = record.structure?.recoveries?.reduce((sum,r) => sum + (r[field] ?? 0),0) ?? 0;
    // Lower-bound consistency only. Do not write an inferred main or total into the record.
    const known = knownWork + (prep ?? 0) + knownRecovery;
    if (total !== undefined && known - total > Number.EPSILON * Math.max(1,known,total) * (2 + (record.structure?.bouts.length ?? 0) + (record.structure?.recoveries?.length ?? 0)))
      throw new ExecutionError('EXECUTION_TOTAL_CONFLICT');
  }
  if (r.intensityObservation !== undefined) {
    const i = object(r.intensityObservation); keys(i, ['metric','value']);
    if (i.metric !== 'rpe' || typeof i.value !== 'number' || !Number.isFinite(i.value) || i.value < 0 || i.value > 10) throw new ExecutionError('EXECUTION_INTENSITY_INVALID');
    record.intensityObservation = {metric:'rpe',value:i.value,provenance:'STRUCTURED_SELF_REPORTED'};
  }
  return record;
}

export type RunningExecutionEvidence = { records: RunningExecutionRecord[]; conflicts: string[]; ambiguousCount: number; writerStatus: 'AVAILABLE' | 'WRITER_UNAVAILABLE' };
export function reconcileRunningExecutions(records: readonly RunningExecutionRecord[]): RunningExecutionEvidence {
  const groups = new Map<string, Map<string, RunningExecutionRecord>>();
  let ambiguousCount = 0;
  for (const r of records) {
    if (!r.executionId) { ambiguousCount++; continue; }
    const group = groups.get(r.executionId) ?? new Map(); group.set(canonicalDigest(r), r); groups.set(r.executionId, group);
  }
  return { writerStatus: 'AVAILABLE', ambiguousCount,
    conflicts: [...groups].filter(([,g]) => g.size > 1).map(([id]) => id).sort(),
    records: [...groups].filter(([,g]) => g.size === 1).map(([,g]) => structuredClone([...g.values()][0])).sort((a,b) => a.executionId!.localeCompare(b.executionId!)) };
}

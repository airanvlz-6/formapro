/** Rejected pre-production v1. Frozen compatibility reader; never used for current server issuance. */
import { createHash } from 'node:crypto';
import type { RunningDoseEvidenceAdmission } from './runningDoseEvidenceAuthority';
import type { PrescriptionIntent } from './prescriptionIntent';
import type { AllowedTrainingContract } from './allowedTrainingContract';
import type { StructuredSessionProposal } from './structuredSession';
import { MOVEMENT_LIBRARY } from './movementLibrary';
import { RUNNING_METHOD_DOSE_POLICIES, RUNNING_DOSE_POLICY_VERSION, RUNNING_DOSE_TARGET_LOWER_FRACTION,
  RUNNING_PREPARATION_MAXIMUM_SECONDS, RUNNING_ECONOMY_BOUT_SECONDS } from './runningMethodDosePoliciesV1';

type Intent = Extract<PrescriptionIntent, { kind: 'adaptation' }>;
export type RunningDoseBasis = { basisClass: RunningDoseEvidenceAdmission['status']; value: number | null;
  unit: 'seconds' | 'meters' | null; window: { startDate: string; endDate: string } | null;
  captureCompleteness: 'UNKNOWN'; metricStatus: 'AVAILABLE' | 'PARTIAL' | 'UNKNOWN' | null;
  knownActivities: number | null; evidenceRefs: string[] };
export type AuthorizedRunningMethodDose = { version: 1; methodId: string; context: Intent; sourceDigest: string;
  status: 'RESOLVED' | 'UNRESOLVED' | 'CONFLICT'; basis: RunningDoseBasis;
  policy: { id: string; version: number }; diagnostics: string[];
  dose: null | { metric: 'duration' | 'distance' | 'work_duration' | 'work_distance' | 'repetitions';
    unit: 'seconds' | 'meters' | 'repetitions'; target: { minimum: number; maximum: number };
    minimumUseful: null; maximumAuthorized: number; structures: string[];
    interval: { minimumSets: number; maximumSets: number; minimumRestSeconds: number; maximumRestSeconds: number } | null;
    boutSeconds: { minimum: number; maximum: number } | null; preparationMaximumSeconds: number;
    allocation: { scope: 'MAIN_ONLY'; share: number | null; basisQuantity: number; aggregateEnforcement: 'DEFERRED_B33' } } };
const ordered = (v: unknown): unknown => Array.isArray(v) ? v.map(ordered) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => [k, ordered(x)])) : v;
export const runningDoseDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');
export const isRunningDoseMethod = (intent?: PrescriptionIntent) => intent?.kind === 'adaptation'
  && RUNNING_METHOD_DOSE_POLICIES.some(p => p.methodId === intent.methodId);

/** Select only quantitative evidence used by the policy. Stable semantic refs, never baseline array
 * indices: unrelated planned rows must not stale a signed authority when the week is persisted. */
export function selectRunningDoseBasis(a: RunningDoseEvidenceAdmission): RunningDoseBasis {
  const empty: RunningDoseBasis = { basisClass: a.status, value: null, unit: null, window: null, captureCompleteness: 'UNKNOWN',
    metricStatus: null, knownActivities: null, evidenceRefs: [] };
  if (a.status === 'CONFLICT') return empty;
  const w = a.basis.windows['7'];
  for (const [m, unit] of [[w.observedDuration, 'seconds'], [w.observedDistance, 'meters']] as const) {
    if (m.value !== null && m.value > 0 && m.status !== 'UNKNOWN') return { ...empty, basisClass: 'OBSERVED', value: m.value, unit,
      window: { startDate: w.startDate, endDate: w.endDate }, metricStatus: m.status, knownActivities: m.knownActivities, evidenceRefs: m.evidenceIndices.map(i =>
        runningDoseDigest(a.admissibleEvidence.find(e => e.evidenceIndex === i)!.fact)).sort() };
  }
  const declarations = a.basis.declaredWeeklyDistance;
  if (declarations.length) return { ...empty, basisClass: 'DECLARED', unit: 'meters',
    value: Math.min(...declarations.map(d => d.minimumMeters)), evidenceRefs: declarations.map(d =>
      runningDoseDigest(a.admissibleEvidence.find(e => e.evidenceIndex === d.evidenceIndex)!.fact)).sort() };
  return empty;
}

/** No availability, level, readiness, raw profile or Analyzer fields are accepted here. */
export function resolveRunningMethodDose(basis: RunningDoseBasis, context: Intent): AuthorizedRunningMethodDose {
  const policy = RUNNING_METHOD_DOSE_POLICIES.find(p => p.methodId === context.methodId);
  const base = { version: 1 as const, methodId: context.methodId, context: structuredClone(context), basis: structuredClone(basis),
    sourceDigest: runningDoseDigest({ basis, context }), policy: { id: `${context.methodId}_dose_v1`, version: RUNNING_DOSE_POLICY_VERSION } };
  const fail = (status: 'UNRESOLVED' | 'CONFLICT', reason: string): AuthorizedRunningMethodDose => ({ ...base, status, dose: null,
    diagnostics: [`RUNNING_METHOD_DOSE_${status}`, reason] });
  if (basis.basisClass === 'CONFLICT') return fail('CONFLICT', 'RUNNING_METHOD_DOSE_CONFLICTING_BASIS');
  if (!policy || context.pattern !== 'run') return fail('UNRESOLVED', 'RUNNING_METHOD_DOSE_DOMAIN_UNSUPPORTED');
  if (context.methodId === 'running_specific' && !['half_marathon', '10k'].includes(context.goalId))
    return fail('UNRESOLVED', 'RUNNING_METHOD_DOSE_SPECIFICITY_UNSUPPORTED');
  if (!['OBSERVED', 'DECLARED'].includes(basis.basisClass) || basis.value === null || !Number.isFinite(basis.value) || basis.value <= 0
    || !basis.unit || !basis.evidenceRefs.length) return fail('UNRESOLVED', 'RUNNING_METHOD_DOSE_QUANTITATIVE_BASIS_REQUIRED');
  const repetitions = policy.metric === 'repetitions';
  const maximum = repetitions ? 6 : Math.floor(Math.min(basis.value * policy.share!,
    basis.unit === 'seconds' ? policy.maximumSeconds! : policy.maximumMeters!));
  if (maximum < 1) return fail('UNRESOLVED', 'RUNNING_METHOD_DOSE_ALLOCATION_UNREPRESENTABLE');
  return { ...base, status: 'RESOLVED', diagnostics: ['RUNNING_METHOD_DOSE_RESOLVED', `RUNNING_METHOD_DOSE_${basis.basisClass}_BASIS`,
    'RUNNING_METHOD_DOSE_WEEKLY_AGGREGATE_DEFERRED'], dose: {
    metric: repetitions ? 'repetitions' : basis.unit === 'seconds' ? policy.metric === 'work' ? 'work_duration' : 'duration'
      : policy.metric === 'work' ? 'work_distance' : 'distance', unit: repetitions ? 'repetitions' : basis.unit,
    target: { minimum: repetitions ? 4 : Math.max(1, Math.floor(maximum * RUNNING_DOSE_TARGET_LOWER_FRACTION)), maximum },
    minimumUseful: null, maximumAuthorized: maximum, structures: [...policy.structures], interval: policy.interval ? { ...policy.interval } : null,
    boutSeconds: repetitions ? { ...RUNNING_ECONOMY_BOUT_SECONDS } : null,
    preparationMaximumSeconds: RUNNING_PREPARATION_MAXIMUM_SECONDS,
    allocation: { scope: 'MAIN_ONLY', share: policy.share, basisQuantity: basis.value, aggregateEnforcement: 'DEFERRED_B33' } } };
}
export function validRunningMethodDose(c: AllowedTrainingContract): boolean {
  const a = c.runningMethodDose;
  if (a === undefined) return true; // Previously signed receipts remain readable.
  if (!a || a.version !== 1 || c.discipline !== 'carrera' || c.intent?.kind !== 'adaptation' || !isRunningDoseMethod(c.intent)) return false;
  try { return runningDoseDigest(a) === runningDoseDigest(resolveRunningMethodDose(a.basis, c.intent)); } catch { return false; }
}

/** Quantitative proposal validation only; no intensity science, silent clipping or new evidence. */
export function validateRunningMethodDose(c: AllowedTrainingContract, p: StructuredSessionProposal): string[] {
  const a = c.runningMethodDose;
  if (!a) return [];
  if (a.version !== 1) return ['RUNNING_METHOD_DOSE_AUTHORITY_INVALID'];
  if (!validRunningMethodDose(c)) return ['RUNNING_METHOD_DOSE_AUTHORITY_INVALID'];
  if (!a.dose || a.status !== 'RESOLVED') return [`RUNNING_METHOD_DOSE_${a.status}`];
  const d = a.dose, errors: string[] = [], main = p.blocks.find(b => b.blockType === 'main')!;
  if (!d.structures.includes(p.structureId)) errors.push('RUNNING_METHOD_DOSE_STRUCTURE_MISMATCH');
  if (main.formatDose) errors.push('RUNNING_METHOD_DOSE_FORMAT_OVERRIDE');
  const intervals = p.structureId === 'intervalos_carrera' || d.metric === 'repetitions';
  let total = 0, sets = 0;
  for (const m of main.movements) {
    const q = m.prescription, n = q.sets ?? 1;
    if (MOVEMENT_LIBRARY[m.movementId]?.movement_pattern !== 'run' || q.perSide || q.reps !== undefined || q.tempo !== undefined)
      errors.push('RUNNING_METHOD_DOSE_METRIC_MISMATCH');
    const work = d.unit === 'meters' ? q.distanceMeters : q.durationSeconds;
    if (work === undefined || (d.unit === 'meters' ? q.durationSeconds !== undefined : q.distanceMeters !== undefined))
      errors.push('RUNNING_METHOD_DOSE_METRIC_MISMATCH');
    total += d.metric === 'repetitions' ? n : n * (work ?? 0); sets += n;
    if (intervals && d.interval) {
      if (q.restSeconds === undefined || q.restSeconds < d.interval.minimumRestSeconds || q.restSeconds > d.interval.maximumRestSeconds)
        errors.push('RUNNING_METHOD_DOSE_RECOVERY_MISMATCH');
      if (!d.boutSeconds && (work ?? 0) > d.maximumAuthorized / d.interval.minimumSets) errors.push('RUNNING_METHOD_DOSE_BOUT_EXCEEDED');
    } else if (n !== 1 || (q.restSeconds ?? 0) !== 0 || main.movements.length !== 1) errors.push('RUNNING_METHOD_DOSE_CONTINUOUS_REQUIRED');
    if (d.boutSeconds && ((work ?? 0) < d.boutSeconds.minimum || (work ?? 0) > d.boutSeconds.maximum)) errors.push('RUNNING_METHOD_DOSE_BOUT_EXCEEDED');
  }
  if (intervals && d.interval && (sets < d.interval.minimumSets || sets > d.interval.maximumSets)) errors.push('RUNNING_METHOD_DOSE_REPETITIONS_OUTSIDE_AUTHORITY');
  if (total > d.maximumAuthorized) errors.push('RUNNING_METHOD_DOSE_EXCEEDS_AUTHORITY');
  if (total < d.target.minimum) errors.push('RUNNING_METHOD_DOSE_UNDER_TARGET');
  for (const b of p.blocks.filter(b => b.blockType !== 'main')) {
    if (b.formatDose || b.movements.some(m => m.prescription.durationSeconds === undefined || m.prescription.reps !== undefined || m.prescription.distanceMeters !== undefined))
      errors.push('RUNNING_METHOD_DOSE_PREPARATION_METRIC');
    const seconds = b.movements.reduce((sum, m) => sum + (m.prescription.sets ?? 1) * (m.prescription.durationSeconds ?? 0)
      + Math.max(0, (m.prescription.sets ?? 1) - 1) * (m.prescription.restSeconds ?? 0), 0);
    if (seconds > d.preparationMaximumSeconds) errors.push('RUNNING_METHOD_DOSE_PREPARATION_EXCEEDED');
  }
  return [...new Set(errors)];
}

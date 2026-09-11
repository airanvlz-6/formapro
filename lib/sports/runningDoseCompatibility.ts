import { createHash } from 'node:crypto';
import { compatibleRunningExecutions } from './runningExecutionCompatibility';
import type { RunningDoseEvidenceAdmission } from './runningDoseEvidenceAuthority';
import type { StrategicIntent } from './goalTransferModel';
import { RUNNING_METHOD_DOSE_POLICIES, type RunningDosePolicyFamily } from './runningMethodDosePolicies';

const ordered = (v: unknown): unknown => Array.isArray(v) ? v.map(ordered) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => [k, ordered(x)])) : v;
export const runningDoseDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');
type Metric = { value: number | null; unit: 's' | 'm' | 'sessions'; status: 'AVAILABLE' | 'PARTIAL' | 'UNKNOWN';
  knownActivities: number; evidenceRefs: string[] };
export type CompatibleRunningDoseEvidence = {
  prescriptionEvidence?: RunningDoseEvidenceAdmission['basis']['prescriptionEvidence'];
  habitualConfirmation?: RunningDoseEvidenceAdmission['basis']['habitualConfirmation'];
  habitualDeclarations?: NonNullable<RunningDoseEvidenceAdmission['basis']['habitualDeclarations']>;
  version: 2; family: RunningDosePolicyFamily | null; variant: string;
  status: RunningDoseEvidenceAdmission['status']; captureCompleteness: 'UNKNOWN';
  window: { startDate: string; endDate: string };
  habitualDeclaredVolume: { minimumMeters: number; maximumMeters: number; observedAt: string | null; evidenceRef: string }[];
  observedActivities: { activityRef: string; date: string | null; metric: 'durationSeconds' | 'distanceMeters';
    value: number; unit: 's' | 'm'; evidenceRef: string; methodIdentity: 'UNKNOWN' }[];
  observedWindows: Record<string, { startDate: string; endDate: string; duration: Metric; distance: Metric }>;
  longestObservedRun: { startDate: string; endDate: string; duration: Metric; distance: Metric };
  plannedMethodAssociations: { methodId: string; occurrenceCount: number; startDate: string; endDate: string;
    semantics: 'COMPLETED_PLAN_ASSOCIATION'; quantityKnown: false; evidenceRefs: string[] }[];
  compatibleMethodQuantities: { status: 'UNKNOWN'; reason: 'EXECUTED_METHOD_IDENTITY_NOT_MODELED' };
  structuredMethodExecution?: ReturnType<typeof compatibleRunningExecutions>;
  conflicts: { activityRef: string; date: string | null; metric: string }[];
  missingSignals: string[]; evidenceRefs: string[];
};

/** Preserve coexisting factual quantities. plannedMethodId is NOT executed-method identity.
 * No easy/long/work/bout classification can be inferred from current admission. */
export function resolveCompatibleRunningDoseEvidence(a: RunningDoseEvidenceAdmission, context: StrategicIntent): CompatibleRunningDoseEvidence {
  const family = RUNNING_METHOD_DOSE_POLICIES.find(p => p.methodId === context.methodId)?.family ?? null;
  const refs = new Map(a.admissibleEvidence.map(e => [e.evidenceIndex, runningDoseDigest(e.fact)]));
  const references = (indices: number[]) => [...new Set(indices.flatMap(i => refs.has(i) ? [refs.get(i)!] : []))].sort();
  const metric = (m: RunningDoseEvidenceAdmission['basis']['longestObservedRun']['duration']): Metric => ({
    value: m.value, unit: m.unit, status: m.status, knownActivities: m.knownActivities, evidenceRefs: references(m.evidenceIndices) });
  const stable = <T>(rows: T[]) => rows.sort((a, b) => runningDoseDigest(a).localeCompare(runningDoseDigest(b)));
  const variant = family === 'EVENT_SPECIFIC' ? `${context.goalId}:${context.pattern}`
    : family === 'TECHNICAL_EXPOSURE' ? context.pattern : context.methodId;
  return { version: 2, family, variant, ...(a.basis.prescriptionEvidence ? {prescriptionEvidence: structuredClone(a.basis.prescriptionEvidence)} : {}), ...(family === 'AEROBIC_CONTINUOUS' && a.basis.habitualConfirmation ? {habitualConfirmation: structuredClone(a.basis.habitualConfirmation)} : {}), ...(family === 'AEROBIC_CONTINUOUS' && a.basis.habitualDeclarations
      ? { habitualDeclarations: structuredClone(a.basis.habitualDeclarations) } : {}), status: a.status, captureCompleteness: 'UNKNOWN',
    window: { startDate: a.coverage.startDate, endDate: a.coverage.endDate },
    habitualDeclaredVolume: stable(a.basis.declaredWeeklyDistance.map(d => ({ minimumMeters: d.minimumMeters,
      maximumMeters: d.maximumMeters, observedAt: d.observedAt, evidenceRef: refs.get(d.evidenceIndex)! }))),
    observedActivities: stable(a.admissibleEvidence.flatMap(({ authority, fact, evidenceIndex }) =>
      authority === 'OBSERVED' && typeof fact.value === 'number' && (fact.metric === 'durationSeconds' || fact.metric === 'distanceMeters')
        ? [{ activityRef: runningDoseDigest(fact.identity), date: fact.date, metric: fact.metric, value: fact.value,
          unit: fact.metric === 'durationSeconds' ? 's' as const : 'm' as const,
          evidenceRef: refs.get(evidenceIndex)!, methodIdentity: 'UNKNOWN' as const }] : [])),
    observedWindows: Object.fromEntries(Object.entries(a.basis.windows).map(([key, w]) => [key, {
      startDate: w.startDate, endDate: w.endDate, duration: metric(w.observedDuration), distance: metric(w.observedDistance) }])),
    longestObservedRun: { startDate: a.basis.longestObservedRun.startDate, endDate: a.basis.longestObservedRun.endDate,
      duration: metric(a.basis.longestObservedRun.duration), distance: metric(a.basis.longestObservedRun.distance) },
    plannedMethodAssociations: stable(a.basis.methodExposure.filter(m => m.methodId === context.methodId).map(m => ({
      methodId: m.methodId, occurrenceCount: m.occurrenceCount, startDate: m.startDate, endDate: m.endDate,
      semantics: m.semantics, quantityKnown: false as const, evidenceRefs: references(m.evidenceIndices) }))),
    // Legacy OBSERVED metrics remain method-unknown. New self-reported execution is separate.
    compatibleMethodQuantities: { status: 'UNKNOWN', reason: 'EXECUTED_METHOD_IDENTITY_NOT_MODELED' },
    ...(a.basis.structuredExecutions ? {structuredMethodExecution:compatibleRunningExecutions(a.basis.structuredExecutions,context)} : {}),
    conflicts: stable(a.conflicts.map(c => ({ activityRef: runningDoseDigest(c.identity), date: c.date, metric: c.metric }))),
    missingSignals: [...new Set([...a.missingSignals, ...(family === 'TECHNICAL_EXPOSURE'
      ? ['VARIANT_NUMERIC_POLICY_NOT_ESTABLISHED'] : ['EXECUTED_METHOD_IDENTITY', 'METHOD_WORK_QUANTITY', 'SELECTED_TARGET_POLICY'])])].sort(),
    evidenceRefs: [...new Set([...refs.values(), ...(family === 'AEROBIC_CONTINUOUS' ? (a.basis.habitualDeclarations?.facts ?? []).map(runningDoseDigest) : []),
      ...(a.basis.structuredExecutions ? compatibleRunningExecutions(a.basis.structuredExecutions,context).records.map(runningDoseDigest) : [])])].sort() };
}

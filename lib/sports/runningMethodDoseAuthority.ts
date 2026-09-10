import { AEROBIC_CONTINUITY_POLICY, aerobicContinuityRejection } from './aerobicContinuityPolicy';
import type { StrategicIntent } from './goalTransferModel';
import type { PrescriptionIntent } from './prescriptionIntent';
import type { AllowedTrainingContract } from './allowedTrainingContract';
import type { StructuredSessionProposal } from './structuredSession';
import type { RunningDoseEvidenceAdmission } from './runningDoseEvidenceAuthority';
import { MOVEMENT_LIBRARY } from './movementLibrary';
import { RUNNING_METHOD_DOSE_POLICIES, type RunningDosePolicyFamily } from './runningMethodDosePolicies';
import { resolveCompatibleRunningDoseEvidence, runningDoseDigest, type CompatibleRunningDoseEvidence } from './runningDoseCompatibility';
import * as legacy from './runningMethodDoseAuthorityV1';
import { validateRunningPreparation } from './runningPreparationAuthority';
export { resolveCompatibleRunningDoseEvidence, runningDoseDigest } from './runningDoseCompatibility';

type Range = { minimum: number; maximum: number };
export type RunningDoseSelection = {
  composition?: 'SINGLE_CONTINUOUS_TOTAL';
  allowedMovementIds?: string[];
  metric: 'duration' | 'distance' | 'work_duration' | 'work_distance' | 'repetitions';
  unit: 'seconds' | 'meters' | 'repetitions';
  selectedTarget: Range | null; maximumAuthorized: number | null; minimumUseful: number | null;
  compositionTolerance: Range | null;
  structures: string[];
  structureConstraints: { mode: 'continuous' | 'intervals'; efforts: Range | null;
    bout: { unit: 'seconds' | 'meters'; range: Range } | null; recoverySeconds: Range | null };
};
export type RunningMethodDoseV2 = { version: 2; methodId: string; context: StrategicIntent;
  status: 'RESOLVED' | 'UNRESOLVED' | 'CONFLICT'; reason: string;
  policy: { id: string; version: 2; family: RunningDosePolicyFamily | null; variant: string };
  evidence: CompatibleRunningDoseEvidence; sourceDigest: string; evidenceRefs: string[];
  dose: RunningDoseSelection | null; diagnostics: string[] };
export type AuthorizedRunningMethodDose = RunningMethodDoseV2 | legacy.AuthorizedRunningMethodDose;
export const isRunningDoseMethod = (intent?: PrescriptionIntent) => intent?.kind === 'adaptation'
  && RUNNING_METHOD_DOSE_POLICIES.some(p => p.methodId === intent.methodId);

const positive = (v: number) => Number.isFinite(v) && v > 0;
const rangeValid = (r: Range) => positive(r.minimum) && positive(r.maximum) && r.maximum >= r.minimum;
function validSelection(d: RunningDoseSelection): boolean {
  return !!d.selectedTarget && rangeValid(d.selectedTarget)
    && (d.maximumAuthorized === null || positive(d.maximumAuthorized) && d.selectedTarget.maximum <= d.maximumAuthorized)
    && (d.minimumUseful === null || positive(d.minimumUseful) && d.selectedTarget.minimum >= d.minimumUseful)
    && (d.compositionTolerance === null || rangeValid(d.compositionTolerance)
      && d.compositionTolerance.minimum >= d.selectedTarget.minimum && d.compositionTolerance.maximum <= d.selectedTarget.maximum)
    && ({ duration: 'seconds', work_duration: 'seconds', distance: 'meters', work_distance: 'meters', repetitions: 'repetitions' }[d.metric] === d.unit)
    && d.structures.length > 0 && ['continuous', 'intervals'].includes(d.structureConstraints.mode)
    && [d.structureConstraints.efforts, d.structureConstraints.bout?.range, d.structureConstraints.recoverySeconds]
      .every(r => r == null || rangeValid(r));
}

/** Registry-only selection. A maximum, occurrence or weekly total cannot select a target. */
export function resolveRunningMethodDose(evidence: CompatibleRunningDoseEvidence, context: StrategicIntent): RunningMethodDoseV2 {
  const p = RUNNING_METHOD_DOSE_POLICIES.find(p => p.methodId === context.methodId);
  const base = { version: 2 as const, methodId: context.methodId, context: structuredClone(context),
    evidence: structuredClone(evidence), sourceDigest: runningDoseDigest({ evidence, context }), evidenceRefs: [...evidence.evidenceRefs],
    policy: { id: p?.policyId ?? `${context.methodId}_dose_v2`, version: 2 as const, family: p?.family ?? null, variant: evidence.variant } };
  const fail = (status: 'UNRESOLVED' | 'CONFLICT', reason: string): RunningMethodDoseV2 => ({ ...base, status, reason, dose: null,
    diagnostics: [...new Set([`RUNNING_METHOD_DOSE_${status}`, `RUNNING_METHOD_DOSE_${reason}`,
      ...(!p?.selectDose ? ['RUNNING_METHOD_DOSE_POLICY_NOT_ESTABLISHED'] : [])])] });
  if (evidence.status === 'CONFLICT' || evidence.conflicts.length) return fail('CONFLICT', 'CONFLICTING_EVIDENCE');
  if (!p || p.family !== evidence.family) return fail('UNRESOLVED', 'DOMAIN_UNSUPPORTED');
  if (p.policyId === AEROBIC_CONTINUITY_POLICY) {
    const reason = aerobicContinuityRejection(evidence, context);
    if (reason) return fail(reason === 'CONFLICTING_EVIDENCE' ? 'CONFLICT' : 'UNRESOLVED', reason);
  }
  const selected = p.selectDose?.(evidence, context) ?? null;
  if (!selected) return fail('UNRESOLVED', p.family === 'TECHNICAL_EXPOSURE'
    ? 'POLICY_NOT_ESTABLISHED' : 'MISSING_COMPATIBLE_EVIDENCE');
  if (!validSelection(selected)) return fail('UNRESOLVED', 'SELECTED_TARGET_NOT_ESTABLISHED');
  return { ...base, status: 'RESOLVED', reason: 'POLICY_SELECTED_TARGET', dose: structuredClone(selected),
    diagnostics: ['RUNNING_METHOD_DOSE_RESOLVED'] };
}

/** Compatibility is explicit: v1 is frozen and can only refresh a previously signed v1. */
export function refreshRunningMethodDose(a: RunningDoseEvidenceAdmission, context: StrategicIntent, previous: AuthorizedRunningMethodDose) {
  return previous.version === 1 ? legacy.resolveRunningMethodDose(legacy.selectRunningDoseBasis(a), context)
    : resolveRunningMethodDose(resolveCompatibleRunningDoseEvidence(a, context), context);
}
export function validRunningMethodDose(c: AllowedTrainingContract): boolean {
  const a = c.runningMethodDose;
  if (a === undefined) return true;
  if (a?.version === 1) return legacy.validRunningMethodDose(c);
  if (!a || a.version !== 2 || c.discipline !== 'carrera' || c.intent?.kind !== 'adaptation' || !isRunningDoseMethod(c.intent)) return false;
  try { return runningDoseDigest(a) === runningDoseDigest(resolveRunningMethodDose(a.evidence, c.intent)); } catch { return false; }
}

/** Validate selected quantities only. No selection, widening, clipping or unit conversion. */
export function validateRunningMethodDose(c: AllowedTrainingContract, proposal: StructuredSessionProposal): string[] {
  const a = c.runningMethodDose;
  if (!a) return [];
  if (a.version === 1) return legacy.validateRunningMethodDose(c, proposal);
  if (!validRunningMethodDose(c)) return ['RUNNING_METHOD_DOSE_AUTHORITY_INVALID'];
  if (a.status !== 'RESOLVED' || !a.dose) return [`RUNNING_METHOD_DOSE_${a.status}`];
  const d = a.dose, errors: string[] = [], main = proposal.blocks.find(b => b.blockType === 'main');
  if (!main) return ['RUNNING_METHOD_DOSE_MAIN_REQUIRED'];
  if (!d.structures.includes(proposal.structureId)) errors.push('RUNNING_METHOD_DOSE_STRUCTURE_MISMATCH');
  if (main.formatDose) errors.push('RUNNING_METHOD_DOSE_FORMAT_OVERRIDE');
  if (d.composition === 'SINGLE_CONTINUOUS_TOTAL' && (proposal.blocks.length !== 1 || proposal.blocks[0].blockType !== 'main'))
    errors.push('RUNNING_METHOD_DOSE_SINGLE_CONTINUOUS_TOTAL_REQUIRED');
  let total = 0, efforts = 0;
  const inside = (value: number, range: Range) => value >= range.minimum && value <= range.maximum;
  for (const m of main.movements) {
    if (d.allowedMovementIds && !d.allowedMovementIds.includes(m.movementId)) errors.push('RUNNING_METHOD_DOSE_MOVEMENT_NOT_AUTHORIZED');
    const q = m.prescription, sets = q.sets ?? 1;
    const workUnit = d.unit === 'repetitions' ? d.structureConstraints.bout?.unit : d.unit;
    const work = workUnit === 'meters' ? q.distanceMeters : q.durationSeconds;
    if (MOVEMENT_LIBRARY[m.movementId]?.movement_pattern !== a.context.pattern || q.perSide || q.reps !== undefined || q.tempo !== undefined
      || work === undefined || (workUnit === 'meters' ? q.durationSeconds !== undefined : q.distanceMeters !== undefined))
      errors.push('RUNNING_METHOD_DOSE_METRIC_MISMATCH');
    total += d.unit === 'repetitions' ? sets : sets * (work ?? 0); efforts += sets;
    const s = d.structureConstraints;
    if (s.mode === 'continuous' && (sets !== 1 || (q.restSeconds ?? 0) !== 0 || main.movements.length !== 1))
      errors.push('RUNNING_METHOD_DOSE_CONTINUOUS_REQUIRED');
    if (s.bout && (s.bout.unit !== workUnit || !inside(work ?? 0, s.bout.range))) errors.push('RUNNING_METHOD_DOSE_BOUT_EXCEEDED');
    if (s.recoverySeconds && !inside(q.restSeconds ?? -1, s.recoverySeconds)) errors.push('RUNNING_METHOD_DOSE_RECOVERY_MISMATCH');
  }
  if (d.structureConstraints.efforts && !inside(efforts, d.structureConstraints.efforts)) errors.push('RUNNING_METHOD_DOSE_REPETITIONS_OUTSIDE_AUTHORITY');
  if (d.maximumAuthorized !== null && total > d.maximumAuthorized) errors.push('RUNNING_METHOD_DOSE_EXCEEDS_AUTHORITY');
  if (d.minimumUseful !== null && total < d.minimumUseful) errors.push('RUNNING_METHOD_DOSE_BELOW_MINIMUM_USEFUL');
  if (d.selectedTarget && !inside(total, d.selectedTarget)) errors.push('RUNNING_METHOD_DOSE_OUTSIDE_SELECTED_TARGET');
  if (d.compositionTolerance && !inside(total, d.compositionTolerance)) errors.push('RUNNING_METHOD_DOSE_OUTSIDE_COMPOSITION_TOLERANCE');
  errors.push(...validateRunningPreparation(proposal));
  return [...new Set(errors)];
}

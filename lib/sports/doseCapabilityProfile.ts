import type { RunningDoseEvidenceAdmission } from './runningDoseEvidenceAuthority';
import { RUNNING_METHOD_DOSE_POLICIES } from './runningMethodDosePolicies';
import { resolveCompatibleRunningDoseEvidence, resolveRunningMethodDose } from './runningMethodDoseAuthority';
import { transferMethod, type StrategicIntent, type GoalId } from './goalTransferModel';
import type { PrescriptionScope } from './prescriptionScope';
import { habitualRunningRequirement } from '../athlete/runningHabitualDeclarations';

export function buildDoseCapabilityProfile(admission: RunningDoseEvidenceAdmission, scope: PrescriptionScope,
  context: { goalId: GoalId | null; blockPhase: StrategicIntent['blockPhase']; blockWeek: number | null }) {
  const entries = RUNNING_METHOD_DOSE_POLICIES.flatMap(policy => transferMethod(policy.methodId)!.patterns.map(pattern => {
    const intent: StrategicIntent = { kind: 'adaptation', methodId: policy.methodId,
      adaptationId: transferMethod(policy.methodId)!.adaptationId, role: 'PRIMARY', pattern,
      goalId: context.goalId ?? 'running_general', blockPhase: context.blockPhase, blockWeek: context.blockWeek, weaknessId: null };
    const evidence = resolveCompatibleRunningDoseEvidence(admission, intent), authority = resolveRunningMethodDose(evidence, intent);
    const facts = evidence.habitualDeclarations?.facts ?? [];
    const duration = facts.find(f => f.field === 'habitualEasyRunningDurationMinutes');
    const frequency = facts.find(f => f.field === 'habitualRunningSessionsPerWeek');
    const conflict = authority.status === 'CONFLICT' || !!evidence.habitualDeclarations?.conflicts.length;
    const ready = duration?.status === 'AVAILABLE' && frequency?.status === 'AVAILABLE' && frequency.value !== null && frequency.value > 0;
    const missingRequirements = policy.family === 'AEROBIC_CONTINUOUS' ? [
      ...(duration?.status === 'NO_HABITUAL_EASY_RUN' ? ['FIRST_EXPOSURE_POLICY_REQUIRED'] : duration ? [] : ['HABITUAL_EASY_RUN_DURATION']),
      ...(frequency ? [] : ['HABITUAL_RUNNING_FREQUENCY']),
      ...(frequency?.value === 0 ? ['CURRENT_RUNNING_EXPOSURE'] : []),
    ] : policy.family === 'TECHNICAL_EXPOSURE' ? ['VARIANT_POLICY', 'MOVEMENT_AND_BOUT_INTENSITY'] : ['COMPATIBLE_METHOD_WORK_QUANTITY'];
    const doseCapability = conflict ? 'CONFLICT' as const : authority.status === 'RESOLVED' ? 'QUANTIFIABLE' as const
      : ready ? 'EVIDENCE_READY_POLICY_MISSING' as const : 'MISSING_EVIDENCE' as const;
    return { methodId: policy.methodId, family: policy.family, variant: evidence.variant, pattern,
      evidenceStatus: conflict ? 'CONFLICT' as const : ready ? 'DECLARATIONS_AVAILABLE' as const : 'MISSING' as const,
      policyStatus: authority.status === 'RESOLVED' ? 'ESTABLISHED' as const : 'NOT_ESTABLISHED' as const,
      compositionStatus: 'NOT_ESTABLISHED' as const, intensityStatus: policy.family === 'TECHNICAL_EXPOSURE' ? 'NOT_ESTABLISHED' as const : 'NOT_EVALUATED' as const,
      doseCapability, prescriptionAllowed: scope.prescriptionAllowed && scope.managedDisciplines.includes('carrera'),
      missingRequirements: [...missingRequirements, ...(authority.status !== 'RESOLVED' ? ['NUMERIC_DOSE_POLICY'] : [])], evidenceRefs: [...evidence.evidenceRefs],
      diagnostics: [conflict ? 'RUNNING_DOSE_CAPABILITY_CONFLICT' : ready ? 'RUNNING_DOSE_CAPABILITY_EVIDENCE_READY' : 'RUNNING_DOSE_CAPABILITY_MISSING_EVIDENCE',
        ...(authority.status !== 'RESOLVED' ? ['RUNNING_DOSE_CAPABILITY_POLICY_MISSING'] : []),
        ...(policy.family === 'AEROBIC_CONTINUOUS' ? [duration?.status === 'AVAILABLE' ? 'RUNNING_HABITUAL_EASY_DURATION_AVAILABLE'
          : duration?.status === 'NO_HABITUAL_EASY_RUN' ? 'RUNNING_NO_HABITUAL_EASY_RUN' : 'RUNNING_HABITUAL_EASY_DURATION_MISSING',
          frequency ? 'RUNNING_HABITUAL_FREQUENCY_AVAILABLE' : 'RUNNING_HABITUAL_FREQUENCY_MISSING'] : [])] };
  }));
  return { version: 1 as const, entries,
    requirement: scope.prescriptionAllowed && scope.managedDisciplines.includes('carrera')
      ? habitualRunningRequirement(admission.basis.habitualDeclarations?.facts ?? []) : null };
}
export type DoseCapabilityProfile = ReturnType<typeof buildDoseCapabilityProfile>;

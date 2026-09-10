import { AEROBIC_CONTINUITY_POLICY } from './aerobicContinuityPolicy';
import { aerobicExecutionGate } from './aerobicExecutionGate';
import { buildAllowedTrainingContract, type ContractInput } from './allowedTrainingContract';
import { resolveMethodIntensity } from './methodIntensityAuthority';
import { buildSessionDoseContext } from './sessionDoseContext';
import type { AthletePrescriptionContext } from '../athlete/loadAthletePrescriptionContext';
import type { RunningDoseEvidenceAdmission } from './runningDoseEvidenceAuthority';
import { RUNNING_METHOD_DOSE_POLICIES } from './runningMethodDosePolicies';
import { resolveCompatibleRunningDoseEvidence, resolveRunningMethodDose } from './runningMethodDoseAuthority';
import { transferMethod, type StrategicIntent, type GoalId } from './goalTransferModel';
import type { PrescriptionScope } from './prescriptionScope';
import { habitualRunningRequirement } from '../athlete/runningHabitualDeclarations';

export function buildDoseCapabilityProfile(admission: RunningDoseEvidenceAdmission, scope: PrescriptionScope,
  context: { goalId: GoalId | null; blockPhase: StrategicIntent['blockPhase']; blockWeek: number | null; athlete?: AthletePrescriptionContext; contexts?: Record<string, ContractInput> }) {
  const entries = RUNNING_METHOD_DOSE_POLICIES.flatMap(policy => transferMethod(policy.methodId)!.patterns.map(pattern => {
    const intent: StrategicIntent = { kind: 'adaptation', methodId: policy.methodId,
      adaptationId: transferMethod(policy.methodId)!.adaptationId, role: 'PRIMARY', pattern,
      goalId: context.goalId ?? 'running_general', blockPhase: context.blockPhase, blockWeek: context.blockWeek, weaknessId: null };
    const evidence = resolveCompatibleRunningDoseEvidence(admission, intent), authority = resolveRunningMethodDose(evidence, intent);
    const facts = evidence.habitualDeclarations?.facts ?? [];
    const duration = facts.find(f => f.field === 'habitualEasyRunningDurationMinutes');
    const frequency = facts.find(f => f.field === 'habitualRunningSessionsPerWeek');
    const conflict = authority.status === 'CONFLICT' || !!evidence.habitualDeclarations?.conflicts.length;
    const ready = duration?.status === 'AVAILABLE';
    const missingRequirements = policy.family === 'AEROBIC_CONTINUOUS' ? [
      ...(duration?.status === 'NO_HABITUAL_EASY_RUN' ? ['FIRST_EXPOSURE_POLICY_REQUIRED'] : duration ? [] : ['HABITUAL_EASY_RUN_DURATION']),

      ...(frequency?.value === 0 ? ['CURRENT_RUNNING_EXPOSURE'] : []),
    ] : policy.family === 'TECHNICAL_EXPOSURE' ? ['VARIANT_POLICY', 'MOVEMENT_AND_BOUT_INTENSITY'] : ['COMPATIBLE_METHOD_WORK_QUANTITY'];
    const doseCapability = conflict ? 'CONFLICT' as const : authority.status === 'RESOLVED' ? 'QUANTIFIABLE' as const
      : authority.reason === 'HABITUAL_RECONFIRMATION_REQUIRED' ? 'RECONFIRMATION_REQUIRED' as const : ready ? 'EVIDENCE_READY_POLICY_MISSING' as const : 'MISSING_EVIDENCE' as const;
    const continuity = policy.policyId === AEROBIC_CONTINUITY_POLICY;
    let execution = {compositionStatus: 'NOT_ESTABLISHED', intensityStatus: 'NOT_EVALUATED', timeStatus: 'NOT_EVALUATED', errors: [] as string[]};
    if (continuity && authority.status === 'RESOLVED') {
      execution = {compositionStatus:'RESOLVED',intensityStatus:'UNRESOLVED',timeStatus:'UNRESOLVED',errors:['SESSION_EXECUTION_CONTEXT_REQUIRED']};
      if (context.athlete && context.contexts?.carrera) {
        const doseContext=buildSessionDoseContext(context.athlete,intent,null,[],true);
        const built=buildAllowedTrainingContract({...context.contexts.carrera,targetDay:context.contexts.carrera.availableDays?.[0] ?? context.contexts.carrera.targetDay,stimulus:transferMethod(policy.methodId)!.stimulusId,intent,doseContext});
        if (built.ok) {
          built.contract.runningMethodDose=authority;
          built.contract.intensityAuthority=resolveMethodIntensity(built.contract);
          execution=aerobicExecutionGate(built.contract);
        }
      }
    }
    return { methodId: policy.methodId, family: policy.family, variant: evidence.variant, pattern,
      evidenceStatus: conflict ? 'CONFLICT' as const : ready ? 'DECLARATIONS_AVAILABLE' as const : 'MISSING' as const,
      policyStatus: policy.selectDose ? 'ESTABLISHED' as const : 'NOT_ESTABLISHED' as const,
      compositionStatus: execution.compositionStatus, intensityStatus: execution.intensityStatus, timeStatus: execution.timeStatus,
      prescriptionBlockReason: execution.errors[0] ?? (authority.status === 'RESOLVED' ? null : authority.reason),
      doseCapability, prescriptionAllowed: scope.prescriptionAllowed && scope.managedDisciplines.includes('carrera') && authority.status === 'RESOLVED' && !execution.errors.length,
      missingRequirements: [...missingRequirements, ...(!policy.selectDose ? ['NUMERIC_DOSE_POLICY'] : authority.status !== 'RESOLVED' ? [authority.reason] : []), ...execution.errors], evidenceRefs: [...evidence.evidenceRefs],
      diagnostics: [conflict ? 'RUNNING_DOSE_CAPABILITY_CONFLICT' : ready ? 'RUNNING_DOSE_CAPABILITY_EVIDENCE_READY' : 'RUNNING_DOSE_CAPABILITY_MISSING_EVIDENCE',
        ...(!policy.selectDose ? ['RUNNING_DOSE_CAPABILITY_POLICY_MISSING'] : []),
        ...(policy.family === 'AEROBIC_CONTINUOUS' ? [duration?.status === 'AVAILABLE' ? 'RUNNING_HABITUAL_EASY_DURATION_AVAILABLE'
          : duration?.status === 'NO_HABITUAL_EASY_RUN' ? 'RUNNING_NO_HABITUAL_EASY_RUN' : 'RUNNING_HABITUAL_EASY_DURATION_MISSING',
          frequency ? 'RUNNING_HABITUAL_FREQUENCY_AVAILABLE' : 'RUNNING_HABITUAL_FREQUENCY_MISSING'] : [])] };
  }));
  return { version: 1 as const, entries,
    requirement: scope.prescriptionAllowed && scope.managedDisciplines.includes('carrera')
      ? (admission.basis.habitualDeclarations?.facts.some(f=>f.field==='habitualEasyRunningDurationMinutes') ? null : habitualRunningRequirement([])) : null };
}
export type DoseCapabilityProfile = ReturnType<typeof buildDoseCapabilityProfile>;

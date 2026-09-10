import { runningReuseRequirement } from './runningExecutionReusePolicies';
import { runningEventMethodAllowed, type RunningEventPreparationDecisionV1 } from './runningEventPreparation';
import { resolveLongitudinalRunningDose } from './runningMethodDoseAuthority';
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
import { compatibleRunningExecutions } from './runningExecutionCompatibility';

export function buildDoseCapabilityProfile(admission: RunningDoseEvidenceAdmission, scope: PrescriptionScope,
  context: { runningEventPreparation?: RunningEventPreparationDecisionV1; goalId: GoalId | null; blockPhase: StrategicIntent['blockPhase']; blockWeek: number | null; athlete?: AthletePrescriptionContext; contexts?: Record<string, ContractInput> }) {
  const entries = RUNNING_METHOD_DOSE_POLICIES.flatMap(policy => transferMethod(policy.methodId)!.patterns.map(pattern => {
    const intent: StrategicIntent = { kind: 'adaptation', methodId: policy.methodId,
      adaptationId: transferMethod(policy.methodId)!.adaptationId, role: policy.methodId === 'running_recovery' ? 'MAINTENANCE' : 'PRIMARY', pattern,
      goalId: context.goalId ?? 'running_general', blockPhase: context.blockPhase, blockWeek: context.blockWeek, weaknessId: null };
    const evidence = resolveCompatibleRunningDoseEvidence(admission, intent), authority = resolveRunningMethodDose(evidence, intent);
    const eligible = !context.runningEventPreparation || runningEventMethodAllowed(context.runningEventPreparation,policy.methodId);
    const facts = evidence.habitualDeclarations?.facts ?? [];
    const duration = facts.find(f => f.field === 'habitualEasyRunningDurationMinutes');
    const frequency = facts.find(f => f.field === 'habitualRunningSessionsPerWeek');
    const factual = compatibleRunningExecutions(admission.basis.structuredExecutions, intent);
    const conflict = authority.status === 'CONFLICT' || !!evidence.habitualDeclarations?.conflicts.length || factual.status === 'CONFLICT';
    const ready = duration?.status === 'AVAILABLE' || factual.status === 'AVAILABLE';
    const missingRequirements = policy.family === 'AEROBIC_CONTINUOUS' ? [
      ...(duration?.status === 'NO_HABITUAL_EASY_RUN' ? ['FIRST_EXPOSURE_POLICY_REQUIRED'] : duration ? [] : ['HABITUAL_EASY_RUN_DURATION']),

      ...(frequency?.value === 0 ? ['CURRENT_RUNNING_EXPOSURE'] : []),
    ] : [...(ready ? [] : ['COMPATIBLE_METHOD_WORK_QUANTITY']), ...factual.missing];
    const doseCapability = conflict ? 'CONFLICT' as const : authority.status === 'RESOLVED' ? 'QUANTIFIABLE' as const
      : authority.reason === 'HABITUAL_RECONFIRMATION_REQUIRED' ? 'RECONFIRMATION_REQUIRED' as const
      : ready ? (policy.selectDose ? 'EVIDENCE_READY_POLICY_UNRESOLVED' as const : 'EVIDENCE_READY_POLICY_MISSING' as const) : 'MISSING_EVIDENCE' as const;
    const continuity = authority.dose?.composition === 'SINGLE_CONTINUOUS_TOTAL' || authority.dose?.composition === 'SINGLE_INTERVAL_MAIN';
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
    // Diagnostic evaluation independent of dose selection. It cannot make a null selector executable.
    if (!continuity && context.athlete && context.contexts?.carrera) {
      const doseContext = buildSessionDoseContext(context.athlete,intent,null,[],true);
      const built = buildAllowedTrainingContract({...context.contexts.carrera,
        targetDay:context.contexts.carrera.availableDays?.[0] ?? context.contexts.carrera.targetDay,
        stimulus:transferMethod(policy.methodId)!.stimulusId,intent,doseContext});
      execution.intensityStatus = built.ok ? resolveMethodIntensity(built.contract).status : 'UNRESOLVED';
    }
    const blockers = [...new Set([
      ...(conflict ? ['DOSE_EVIDENCE_CONFLICT'] : ready ? [] : ['DOSE_EVIDENCE_MISSING']),
      ...(!policy.selectDose ? ['DOSE_POLICY_NOT_ESTABLISHED'] : []),
      ...(policy.selectDose && authority.status !== 'RESOLVED' ? [authority.reason] : []),
      ...(execution.compositionStatus === 'NOT_ESTABLISHED' ? ['DOSE_COMPOSITION_NOT_ESTABLISHED'] : []),
      ...(execution.intensityStatus === 'UNRESOLVED' ? ['DOSE_INTENSITY_UNRESOLVED'] : []),
      ...(!continuity ? [factual.integrityStatus] : []),
      ...factual.missing, ...execution.errors,
      ...(!scope.prescriptionAllowed || !scope.managedDisciplines.includes('carrera') ? ['PRESCRIPTION_SCOPE_DENIED'] : []),
    ])].filter(b => b !== 'SERVER_VALIDATED_SELF_REPORT');
    return { methodId: policy.methodId, family: policy.family, variant: evidence.variant, pattern,
      ...(authority.status !== 'RESOLVED' && eligible && context.runningEventPreparation?.constraints.recovery === 'REQUIRED' && policy.methodId === 'running_recovery'
        ? { missingAuthorityRequest: runningReuseRequirement(policy.methodId,authority.reason) } : {}),
      ...(context.runningEventPreparation ? {longitudinalDose:resolveLongitudinalRunningDose(authority,context.runningEventPreparation),weeklyIntensityEligibility:eligible?'ALLOWED':'FORBIDDEN'} : {}),
      evidenceStatus: conflict ? 'CONFLICT' as const : duration?.status === 'AVAILABLE' ? 'DECLARATIONS_AVAILABLE' as const
        : factual.status === 'AVAILABLE' ? 'STRUCTURED_EXECUTION_AVAILABLE' as const : factual.status === 'PARTIAL' ? 'PARTIAL' as const : 'MISSING' as const,
      policyStatus: policy.selectDose ? 'ESTABLISHED' as const : 'NOT_ESTABLISHED' as const,
      blockers, executionIntegrityStatus: factual.integrityStatus, weeklyContextStatus: 'NOT_EVALUATED' as const,
      compositionStatus: execution.compositionStatus, intensityStatus: execution.intensityStatus, timeStatus: execution.timeStatus,
      prescriptionBlockReason: execution.errors[0] ?? (authority.status === 'RESOLVED' ? null : authority.reason),
      doseCapability, prescriptionAllowed: eligible && (!context.runningEventPreparation || execution.intensityStatus === 'RESOLVED') && !conflict && scope.prescriptionAllowed && scope.managedDisciplines.includes('carrera') && authority.status === 'RESOLVED' && !execution.errors.length,
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

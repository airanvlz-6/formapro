import type { CompatibleRunningDoseEvidence } from './runningDoseCompatibility';
import type { StrategicIntent } from './goalTransferModel';
import type { RunningDoseSelection } from './runningMethodDoseAuthority';
export const AEROBIC_CONTINUITY_POLICY = 'running_base_declared_habitual_duration_v1';
export function aerobicContinuityRejection(e: CompatibleRunningDoseEvidence, intent: StrategicIntent): string | null {
  if (intent.methodId!=='running_base' || intent.adaptationId!=='base_aerobica' || intent.pattern!=='run'
    || e.family!=='AEROBIC_CONTINUOUS' || e.variant!=='running_base') return 'DOMAIN_UNSUPPORTED';
  if (e.habitualDeclarations?.conflicts.length) return 'CONFLICTING_EVIDENCE';
  const facts=e.habitualDeclarations?.facts.filter(f=>f.field==='habitualEasyRunningDurationMinutes')??[];
  if (facts.some(f=>f.status==='NO_HABITUAL_EASY_RUN')) return 'FIRST_EXPOSURE_POLICY_REQUIRED';
  if (facts.length!==1 || facts[0].status!=='AVAILABLE' || facts[0].authority!=='DECLARED' || facts[0].unit!=='minutes'
    || !Number.isSafeInteger(facts[0].value) || facts[0].value!<=0 || !Number.isSafeInteger(facts[0].value!*60)) return 'MISSING_COMPATIBLE_EVIDENCE';
  if (!e.habitualConfirmation || e.habitualConfirmation.confirmedAt!==facts[0].confirmedAt) return 'HABITUAL_RECONFIRMATION_REQUIRED';
  return null;
}
/** PRODUCT continuity, not capacity, tolerance or physiology. Select the declared outing itself. */
export function selectAerobicContinuity(e: CompatibleRunningDoseEvidence, intent: StrategicIntent): RunningDoseSelection | null {
  if (aerobicContinuityRejection(e,intent)) return null;
  const seconds=e.habitualDeclarations!.facts.find(f=>f.field==='habitualEasyRunningDurationMinutes')!.value!*60;
  return {metric:'duration',unit:'seconds',selectedTarget:{minimum:seconds,maximum:seconds},maximumAuthorized:seconds,
    minimumUseful:null,compositionTolerance:null,allowedMovementIds:['rodaje_z2'],composition:'SINGLE_CONTINUOUS_TOTAL',structures:['continuo_carrera'],
    structureConstraints:{mode:'continuous',efforts:null,bout:null,recoverySeconds:null}};
}

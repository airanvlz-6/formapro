import { AEROBIC_CONTINUITY_POLICY, selectAerobicContinuity } from './aerobicContinuityPolicy';
import type { RunningDoseSelection } from './runningMethodDoseAuthority';
import type { CompatibleRunningDoseEvidence } from './runningDoseCompatibility';
import type { StrategicIntent } from './goalTransferModel';

export type RunningDosePolicyFamily = 'AEROBIC_CONTINUOUS' | 'RECOVERY' | 'THRESHOLD_WORK'
  | 'VO2_INTERVAL' | 'EVENT_SPECIFIC' | 'TECHNICAL_EXPOSURE';
export type RunningDosePolicy = { methodId: string; family: RunningDosePolicyFamily;
  policyId: string; version: 2;
  selectDose: ((evidence: CompatibleRunningDoseEvidence, context: StrategicIntent) => RunningDoseSelection | null) | null };

/** Only aerobic declared continuity is accepted. Other null selectors are not Builder fallbacks.
 * Policies belong to this server registry; no request/profile override is accepted. */
export const RUNNING_DOSE_POLICY_VERSION = 2;
export const RUNNING_METHOD_DOSE_POLICIES: readonly RunningDosePolicy[] = [
  { methodId: 'running_base', family: 'AEROBIC_CONTINUOUS' },
  { methodId: 'running_recovery', family: 'RECOVERY' },
  { methodId: 'running_threshold', family: 'THRESHOLD_WORK' },
  { methodId: 'running_vo2', family: 'VO2_INTERVAL' },
  { methodId: 'running_specific', family: 'EVENT_SPECIFIC' },
  { methodId: 'running_economy', family: 'TECHNICAL_EXPOSURE' },
].map(p => ({ ...p, family: p.family as RunningDosePolicyFamily,
  policyId: p.methodId === 'running_base' ? AEROBIC_CONTINUITY_POLICY : `${p.methodId}_dose_v2`, version: RUNNING_DOSE_POLICY_VERSION, selectDose: p.methodId === 'running_base' ? selectAerobicContinuity : null }));

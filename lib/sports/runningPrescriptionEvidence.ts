import type { RunningHistory } from '../execution/historicalRunning';
import type { RunningExecutionEvidence } from '../execution/runningExecution';
import type { RecoveryContext } from '../physiology/recoveryContext';
import type { MethodBaseline } from '../athlete/runningMethodDeclarations';
import { RUNNING_INTENSITY_POLICIES } from './runningIntensityPolicies';
export type RunningPrescriptionEvidence = {
  history: RunningHistory; executions: RunningExecutionEvidence; declarations: MethodBaseline[];
  restrictionsActive: boolean; recovery: RecoveryContext;
  subjective: { score: number | null; date: string; source: 'readiness_checkins' };
};
export type MethodExposureState = 'REUSABLE_QUANTITATIVE_EXPOSURE'|'PRIOR_EXPOSURE_NUMERIC_UNKNOWN'|'TRUE_FIRST_EXPOSURE'|'UNKNOWN_EXPOSURE_STATE';
export function methodExposure(e: RunningPrescriptionEvidence, methodId: string, reusable: boolean) {
  const category = methodId === 'running_long_run' ? 'long_run' : methodId === 'running_recovery' ? 'recovery'
    : methodId === 'running_base' ? 'easy' : 'quality';
  const records = e.history.records.filter(r=>r.countable && r.date <= e.history.asOfDate);
  const exact = records.filter(r=>r.methodId===methodId), related=records.filter(r=>r.exposure===category);
  // A category is sufficient for legacy easy/long/recovery, never for threshold vs VO2 identity.
  const compatible = exact.length || (['easy','long_run','recovery'].includes(category) && related.length) || e.declarations.some(d=>d.methodId===methodId);
  const state:MethodExposureState = reusable ? 'REUSABLE_QUANTITATIVE_EXPOSURE' : compatible ? 'PRIOR_EXPOSURE_NUMERIC_UNKNOWN' : 'UNKNOWN_EXPOSURE_STATE';
  return {state,semanticScope:exact.length?'EXACT_METHOD':related.length?'RELATED_CATEGORY':'UNKNOWN',
    relatedCategory:category,evidenceRefs:[...new Set([...exact,...related].map(r=>r.executionId))],captureCompleteness:'UNKNOWN',
    experiencePreserved:related.length>0 || !!compatible};
}
export function runningSuitability(e: RunningPrescriptionEvidence, methodId: string) {
  const reasons:string[]=[];
  if(e.restrictionsActive) reasons.push('CANONICAL_RESTRICTION_ACTIVE');
  if(e.executions.conflicts.length || e.executions.writerStatus !== 'AVAILABLE') reasons.push('EXECUTION_CONFLICT');
  const rows=e.executions.records.filter(r=>r.executionIdentity.methodId===methodId && r.occurredAt<=e.history.asOfDate);
  const latest=rows.map(r=>r.occurredAt).sort().at(-1);
  const recent=rows.filter(r=>r.occurredAt===latest);
  if(recent.some(r=>r.completeness!=='FULL')) reasons.push('LATEST_EXECUTION_REQUIRES_REVIEW');
  const guide=RUNNING_INTENSITY_POLICIES.find(p=>p.methodId===methodId)?.perception;
  if(guide && recent.some(r=>r.intensityObservation && r.intensityObservation.value>guide.max)) reasons.push('REPORTED_RPE_ABOVE_METHOD_GUIDE');
  // Existing check-in semantics: 1/2 is adverse perception. No numeric dose conversion.
  if(e.subjective.score!==null && e.subjective.score<=2) reasons.push('ADVERSE_CURRENT_SUBJECTIVE_CHECKIN');
  const unknown=['hrv','restingHr','sleepDuration','sleepScore'].filter(k=>(e.recovery.objective as any)[k]?.status!=='available');
  const deferred=reasons.includes('CANONICAL_RESTRICTION_ACTIVE') || reasons.includes('EXECUTION_CONFLICT');
  const review=reasons.some(r=>r==='LATEST_EXECUTION_REQUIRES_REVIEW'||r==='REPORTED_RPE_ABOVE_METHOD_GUIDE');
  return {status:deferred?'INCOMPATIBLE_DEFER':review?'HIGH_COST_REVIEW':reasons.includes('ADVERSE_CURRENT_SUBJECTIVE_CHECKIN')?'RECOVERY_PREFERRED'
    :unknown.length || e.subjective.score===null?'COMPATIBLE_WITH_UNCERTAINTY':'COMPATIBLE',reasons,missingPhysiology:unknown,
    subjective:structuredClone(e.subjective),numericModifier:null,numericProgressionAuthorized:false,
    physiologicalInterpretation:'OBSERVATIONS_NOT_AUTOMATIC_NUMERIC_ADJUSTMENTS',
    facts:{executionIds:recent.map(r=>r.executionId),physiologyDate:e.recovery.objective.effectiveDate,historyDigest:e.history.digest}};
}

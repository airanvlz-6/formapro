import type { AllowedTrainingContract } from './allowedTrainingContract';
import { validateSessionTimeDose } from './sessionTimeDoseAuthority';
/** Exact total selected upstream. This gate never clips, selects intensity or invents preparation. */
export function aerobicExecutionGate(c: AllowedTrainingContract) {
  const a=c.runningMethodDose;
  const d = a?.version === 2 && a.status === 'RESOLVED' ? a.dose : null;
  const work = d?.selectedTarget;
  const recovery = d?.composition === 'SINGLE_INTERVAL_MAIN'
    ? (d.structureConstraints.efforts!.maximum - 1) * d.structureConstraints.recoverySeconds!.maximum : 0;
  let target = d?.composition && work ? {minimum:work.minimum + recovery, maximum:work.maximum + recovery} : null;
  if(a?.version===2 && a.allowedSelections?.length) {
    const totals=a.allowedSelections.map(v=>v.selectedTarget!.maximum+(v.structureConstraints.mode==='intervals'?(v.structureConstraints.efforts!.maximum-1)*v.structureConstraints.recoverySeconds!.maximum:0));
    target={minimum:Math.min(...totals),maximum:Math.max(...totals)};
  }
  const compositionStatus=target ? 'RESOLVED' : 'UNRESOLVED';
  const intensityStatus=c.intensityAuthority?.status==='RESOLVED' && c.intensityAuthority.targets.some(t=>c.allowedMovementIds.includes(t.movementId) && (a?.version!==2 || !a.dose?.allowedMovementIds || a.dose.allowedMovementIds.includes(t.movementId))) ? 'RESOLVED' : 'UNRESOLVED';
  const time=c.doseContext?.timeAuthority, maximum=c.doseContext?.timeBudget.maximumSeconds;
  const timeErrors=target && time ? validateSessionTimeDose(time,{minimumSeconds:target.minimum,maximumSeconds:target.maximum,expectedSeconds:target.maximum}) : [];
  const timeStatus=!target || maximum==null || !time ? 'UNRESOLVED'
    : target.maximum>maximum || timeErrors.length ? 'INFEASIBLE' : 'FITS';
  return {compositionStatus,intensityStatus,timeStatus,errors:[
    ...(compositionStatus==='RESOLVED'?[]:['AEROBIC_COMPOSITION_UNRESOLVED']),
    ...(intensityStatus==='RESOLVED'?[]:['AEROBIC_INTENSITY_UNRESOLVED']),
    ...(timeStatus==='FITS'?[]:[timeStatus==='INFEASIBLE'?'SESSION_DOSE_TIME_INFEASIBLE':'SESSION_TIME_UNRESOLVED']),
  ]};
}

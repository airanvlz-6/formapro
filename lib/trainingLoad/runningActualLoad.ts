import type { RunningExecutionRecord } from '../execution/runningExecution';
import { quantity, unknownQuantity, resolveSessionLoad, type SegmentInput } from './trainingLoad';
/** Actual report quantities only. Completed flags never supply missing repetitions or time. */
export function runningActualLoad(r: RunningExecutionRecord) {
  const source=`running_execution_records.${r.executionId}`, segments:SegmentInput[]=[];
  for(const b of r.structure?.bouts ?? []) {
    if(!b.completed) continue; // Partial unfinished bout quantity semantics are not established.
    segments.push({id:`bout:${b.boutIndex}`,movementId:b.movementId,pattern:'run',source,
      durationSeconds:b.durationSeconds,distanceMeters:b.distanceMeters,reps:b.repetitions,sets:1,multiplier:1,
      externalLoadApplicable:false,formatContext:{blockType:'main'}});
  }
  for(const [i,b] of (r.structure?.recoveries ?? []).entries()) if(b.completed)
    segments.push({id:`recovery:${i}`,movementId:null,pattern:null,source,durationSeconds:0,restSeconds:b.durationSeconds,sets:2,multiplier:1,externalLoadApplicable:false,
      formatContext:{blockType:'intra_work_recovery',mode:b.mode}});
  return resolveSessionLoad({id:`running:${r.executionId}`,date:r.occurredAt,kind:'actual',discipline:'carrera',source,segments,
    methodId:r.executionIdentity.methodId ?? null,executionStatus:r.completeness,
    duration:r.quantities.totalDurationSeconds===undefined?unknownQuantity('s'):quantity(r.quantities.totalDurationSeconds,'s',source),
    diagnostics:['STRUCTURED_SELF_REPORTED','FULL_IS_NOT_TOLERATED','METHOD_RPE_NOT_SESSION_RPE']});
}

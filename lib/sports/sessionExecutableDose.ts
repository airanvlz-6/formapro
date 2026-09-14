import type { AllowedTrainingContract } from './allowedTrainingContract';
import type { MovementDose, StructuredSessionProposal } from './structuredSession';
import { WORKOUT_STRUCTURE_LIBRARY } from './workoutStructureLibrary';
import { resolveDoseInstruction, executionInstructionComplete } from './sessionExecution';

/** Facts and explicit cadence only. No universal seconds/rep, setup time or required training duration. */
function movementTime(c: AllowedTrainingContract, d: MovementDose) {
  if (d.sets === 0) return {minimumSeconds:0,maximumSeconds:0};
  let min = 0, max: number | null = null;
  if (d.durationSeconds !== undefined) min = max = d.durationSeconds * (d.perSide ? 2 : 1);
  else if (d.reps && d.tempo?.length === 4 && d.tempo.some(n=>n>0)) {
    min = d.reps * d.tempo.reduce((a,b)=>a+b,0) * (d.perSide ? 2 : 1);
    max = d.perSide === undefined ? null : min;
  } else if (d.distanceMeters && d.intensity && 'referenceId' in d.intensity) {
    const r = c.doseContext?.references.find(r=>r.id === (d.intensity as {referenceId:string}).referenceId);
    if (r?.unit === 'seconds_per_km') {
      const range = typeof r.value === 'number' ? {min:r.value,max:r.value} : r.value;
      min = range.min*d.distanceMeters/1000*(d.perSide?2:1); max = range.max*d.distanceMeters/1000*(d.perSide?2:1);
    }
  }
  const n = d.sets ?? 1, rest = Math.max(0,n-1)*(d.restSeconds??0);
  if (n > 1 && d.restSeconds === undefined || d.doseInstruction && !resolveDoseInstruction(d.doseInstruction)) max = null;
  return {minimumSeconds:n*min+rest,maximumSeconds:max===null?null:n*max+rest};
}
function blockTime(c: AllowedTrainingContract, b: StructuredSessionProposal['blocks'][number]) {
  if (b.formatDose?.rounds === 0) return {minimumSeconds:0,maximumSeconds:0};
  const values=b.movements.map(m=>movementTime(c,m.prescription)), rounds=b.formatDose?.rounds??1;
  const recovery=Math.max(0,rounds-1)*(b.formatDose?.restSeconds??0);
  return { minimumSeconds:values.reduce((n,v)=>n+v.minimumSeconds,0)*rounds+recovery,
    maximumSeconds:values.some(v=>v.maximumSeconds===null)||rounds>1&&b.formatDose?.restSeconds===undefined?null:values.reduce((n,v)=>n+v.maximumSeconds!,0)*rounds+recovery };
}
export function estimateExecutableDuration(c: AllowedTrainingContract, p: StructuredSessionProposal) {
  const parts=p.blocks.map(b=>{
    const f=b.formatDose, time=blockTime(c,b);
    // Clock describes the block, not an analytical estimate of repetitions.
    const clock=f?.durationSeconds ?? (f?.rounds&&f.intervalSeconds?f.rounds*f.intervalSeconds:undefined);
    return {blockType:b.blockType,...(clock!==undefined&&clock>0?{minimumSeconds:clock,maximumSeconds:clock}
      :f?.timeCapSeconds?{minimumSeconds:time.minimumSeconds,maximumSeconds:f.timeCapSeconds}:time)};
  });
  const rawMinimum=Math.ceil(parts.reduce((n,v)=>n+v.minimumSeconds,0));
  const rawMaximum=parts.some(v=>v.maximumSeconds===null)?null:Math.ceil(parts.reduce((n,v)=>n+v.maximumSeconds!,0));
  const minimumSeconds=Number.isFinite(rawMinimum)?rawMinimum:0;
  const maximumSeconds=rawMaximum!==null&&Number.isFinite(rawMaximum)?rawMaximum:null;
  const safeParts=parts.map(p=>({...p,minimumSeconds:Number.isFinite(p.minimumSeconds)?p.minimumSeconds:0,
    maximumSeconds:p.maximumSeconds!==null&&Number.isFinite(p.maximumSeconds)?p.maximumSeconds:null}));
  return {minimumSeconds,maximumSeconds,expectedSeconds:maximumSeconds===minimumSeconds?minimumSeconds:null,parts:safeParts,
    ...(rawMinimum===Infinity?{minimumExceedsNumericRange:true}:{}),
    transitionMaximumSeconds:0,policy:'explicit_time_and_cadence_partial_v1'};
}
export function validateExecutableFormat(c: AllowedTrainingContract, p: StructuredSessionProposal) {
  const errors:string[]=[], main=p.blocks.find(b=>b.blockType==='main')!, f=main.formatDose;
  const format=WORKOUT_STRUCTURE_LIBRARY[p.structureId]?.formato;
  if (f?.durationSeconds && f.timeCapSeconds) errors.push('DOSE_FORMAT_TIME_CONFLICT');
  if(f?.intervalSeconds&&f.rounds&&f.durationSeconds&&f.intervalSeconds*f.rounds!==f.durationSeconds) errors.push('DOSE_FORMAT_CYCLE_CONFLICT');
  if(f?.workSeconds!==undefined || f?.intervalSeconds!==undefined){
    if(!f.intervalSeconds || f.workSeconds===undefined || f.restSeconds===undefined || f.workSeconds+f.restSeconds!==f.intervalSeconds)
      errors.push('SESSION_DOSE_INCOMPLETE:WORK_REST_CYCLE');
  }
  if((format==='emom'&&f?.intervalSeconds!==60)||(format==='e2mom'&&f?.intervalSeconds!==120)) errors.push('DOSE_FORMAT_INTERVAL_MISMATCH');
  if(['amrap','density','death_by','emom','e2mom'].includes(format??'') && !f?.durationSeconds && !(f?.intervalSeconds&&f.rounds)) errors.push('EXECUTION_INSTRUCTION_INCOMPLETE:FORMAT_CLOCK');
  if(f?.intervalSeconds&&f.durationSeconds&&f.durationSeconds%f.intervalSeconds!==0) errors.push('DOSE_FORMAT_CYCLE_CONFLICT');
  // Unsupported combinations of known fields are grammar conflicts, never sport/method membership.
  if(f){
    const allowed=['emom','e2mom'].includes(format??'')?['durationSeconds','rounds','intervalSeconds','workSeconds','restSeconds']
      :['amrap','density','death_by'].includes(format??'')?['durationSeconds']
      :['complex','rounds','couplet','triplet','chipper','ladder','for_time'].includes(format??'')?['rounds','restSeconds','timeCapSeconds']
      :['durationSeconds','timeCapSeconds'];
    if(Object.keys(f).some(k=>!allowed.includes(k))) errors.push('DOSE_FORMAT_FIELDS_CONFLICT');
  }
  for(const b of p.blocks){
    if(b.blockType!=='main'&&b.formatDose) errors.push('DOSE_FORMAT_MAIN_ONLY');
    for(const {prescription:d} of b.movements){
      if(!executionInstructionComplete(d)) errors.push('EXECUTION_INSTRUCTION_INCOMPLETE');
      if(d.reps&&d.durationSeconds&&d.tempo&&d.reps*d.tempo.reduce((a,b)=>a+b,0)>d.durationSeconds) errors.push('DOSE_VOLUME_TIME_CONFLICT');
      if(b.blockType==='main'&&format==='intervals'&&d.sets===undefined&&!f?.rounds) errors.push('EXECUTION_INSTRUCTION_INCOMPLETE:INTERVAL_COUNT');
    }
  }
  const totalDistance = p.blocks.reduce((sum,b)=>sum+b.movements.reduce((n,m)=>n+(m.prescription.distanceMeters??0)*(m.prescription.sets??1)*(m.prescription.perSide?2:1),0)*(b.formatDose?.rounds??1),0);
  if (totalDistance > 100000) errors.push('DOSE_SESSION_TOTAL_BOUND:distanceMeters');
  const clock=f?.durationSeconds??f?.timeCapSeconds??(f?.intervalSeconds&&f.rounds?f.intervalSeconds*f.rounds:undefined);
  // Interval rest belongs to the cycle, not an additional rest between rounds.
  const mainWork = blockTime(c, f?.intervalSeconds ? {...main,formatDose:{rounds:f.rounds??(f.durationSeconds?f.durationSeconds/f.intervalSeconds:1)}} : main);
  if(clock!==undefined&&mainWork.minimumSeconds>clock) errors.push('DOSE_FORMAT_WORK_EXCEEDS_CLOCK');
  if(f?.workSeconds!==undefined && blockTime(c,{...main,formatDose:undefined}).minimumSeconds>f.workSeconds) errors.push('DOSE_FORMAT_WORK_EXCEEDS_CLOCK');
  return errors;
}

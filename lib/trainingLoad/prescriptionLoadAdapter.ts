import { MOVEMENT_LIBRARY, STIMULUS_LIBRARY } from '../sports/movementLibrary';
import { WORKOUT_STRUCTURE_LIBRARY } from '../sports/workoutStructureLibrary';
import { checkSessionShape } from '../sports/structuredSession';
import { buildStructuredExposureReport } from '../sports/exposureEngine';
import { resolveSessionLoad, aggregateLoadSessions, quantity, unknownQuantity, type SegmentInput, type SessionLoad, type Quantity } from './trainingLoad';

const record=(v:unknown):Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0;
/** Reads persisted, server-admitted 3C facts. Does not regenerate a contract from today's benchmarks. */
export function plannedPrescriptionLoad(row: Record<string,any>, date:string, id:string): SessionLoad {
  const stored=record(row.structuredPrescription), source=`weekly_plan.sessions.${id}.structuredPrescription`;
  const checked=checkSessionShape(stored.proposal);
  if(stored.schemaVersion!==2||!checked.ok||checked.proposal.schemaVersion!==2) return resolveSessionLoad({id,date,kind:'planned',discipline:row.tipo||null,
    source,segments:[],executionStatus:row.completada===true?'completed_flag':'unknown',diagnostics:['LEGACY_OR_INVALID_DOSE_UNKNOWN']});
  const proposal=checked.proposal, structure=WORKOUT_STRUCTURE_LIBRARY[proposal.structureId];
  if(!structure) return resolveSessionLoad({id,date,kind:'planned',discipline:row.tipo||null,source,segments:[],executionStatus:'unknown',diagnostics:['STRUCTURE_UNKNOWN']});
  const refs=Array.isArray(stored.references)?stored.references:[], segments:SegmentInput[]=[];
  for(const [bi,b] of proposal.blocks.entries()){
    const format=b.blockType==='main'?structure.formato:null, f=b.formatDose;
    // Unknown clock-driven repetition counts are never multiplied as one completed round.
    const open=!!format&&['amrap','density','death_by','emom','e2mom','ladder'].includes(format);
    const multiplier=open?null:f?.rounds??1;
    for(const [mi,m] of b.movements.entries()){
      const meta=MOVEMENT_LIBRARY[m.movementId],d=m.prescription;
      if(!meta)throw new Error('TRAINING_LOAD_MOVEMENT_UNKNOWN');
      const i=d.intensity,ref=i&&'referenceId'in i?refs.find((r:any)=>r.id===i.referenceId):null;
      let kg:SegmentInput['kg'];
      if(i?.kind==='percent_1rm'&&ref?.kind==='1rm'&&ref.movementId===m.movementId&&ref.unit==='kg'&&positive(ref.value))
        kg={minimum:Math.round(ref.value*i.value)/100,maximum:Math.round(ref.value*(i.max??i.value))/100};
      segments.push({id:`${bi}:${mi}`,movementId:m.movementId,pattern:meta.movement_pattern,source:`${source}.proposal.blocks.${bi}.movements.${mi}`,
        sets:d.sets??1,reps:d.reps,durationSeconds:d.durationSeconds,distanceMeters:d.distanceMeters,restSeconds:d.restSeconds??0,
        perSide:d.perSide,multiplier,externalLoadApplicable:!!kg||meta.equipment.some(e=>['barra','mancuerna','kettlebell','sandbag','balon_medicinal','disco','sled','yoke'].includes(e)),
        ...(kg?{kg}:{}),intensity:i?{prescribed:i,reference:ref||null}:null,formatContext:{blockType:b.blockType,format,dose:f||null},
        categories:{impact:meta.impact,technical:meta.technical_demand,energySystem:STIMULUS_LIBRARY[proposal.stimulusId]?.sistema_energetico||'unknown',structureStimulus:structure.stimulus_type}});
    }
    if(format==='complex'&&f?.rounds&&f.restSeconds!==undefined)segments.push({
      id:`${bi}:round_recovery`,movementId:null,pattern:null,source:`${source}.proposal.blocks.${bi}.formatDose`,
      sets:f.rounds,reps:0,distanceMeters:0,durationSeconds:0,restSeconds:f.restSeconds,multiplier:1,externalLoadApplicable:false,
      formatContext:{blockType:b.blockType,format,dose:f},
    });
  }
  let duration:Quantity|undefined;
  const estimate=record(stored.duration);
  if(typeof estimate.minimumSeconds==='number'&&Number.isFinite(estimate.minimumSeconds)&&estimate.minimumSeconds>=0){
    duration={status:estimate.maximumSeconds===estimate.minimumSeconds?'complete':'partial',minimum:estimate.minimumSeconds,
      maximum:typeof estimate.maximumSeconds==='number'&&Number.isFinite(estimate.maximumSeconds)&&estimate.maximumSeconds>=estimate.minimumSeconds?estimate.maximumSeconds:null,
      unit:'s',sources:[`${source}.duration:${estimate.policy||'stored_estimate'}`]};
  }
  const intent=record(record(stored.objective).intent);
  return resolveSessionLoad({id,date,kind:'planned',discipline:row.tipo||null,source,segments,duration,structureId:proposal.structureId,stimulusId:proposal.stimulusId,
    executionStatus:row.completada===true?'completed_flag':row.modificado?'modified_prescription':'unknown',
    adaptationId:intent.kind==='adaptation'?intent.adaptationId:null,methodId:intent.kind==='adaptation'?intent.methodId:null,weaknessId:record(stored.weakness).id||null,
    diagnostics:['PLANNED_IS_NOT_ACTUAL','NO_LOAD_SCORE','CLOCK_REPETITIONS_UNKNOWN_UNLESS_FIXED']});
}

/** Existing external records declare minutes and perceived session intensity; no prescribed RPE is used. */
export function externalActualLoad(row:Record<string,any>,id:string):SessionLoad{
  const source=`external_training_records.${id}`;
  return resolveSessionLoad({id,date:row.fecha,kind:'actual',discipline:typeof row.disciplina==='string'?row.disciplina:null,source,segments:[],
    duration:positive(row.duracion)?quantity(row.duracion*60,'s',`${source}.duracion`):unknownQuantity('s'),
    sessionRpe:positive(row.intensidad_percibida)?row.intensidad_percibida:undefined,executionStatus:'reported',diagnostics:['EXTERNAL_STRUCTURED_WORK_UNKNOWN','USER_REPORTED_NOT_DEVICE_MEASURED']});
}
export function summarizeLoad(sessions:SessionLoad[]){
  const exposure=(kind:'planned'|'actual')=>buildStructuredExposureReport(sessions.filter(s=>s.kind===kind).flatMap(s=>s.segments.filter(e=>!!e.input.movementId).map(e=>({
    sessionId:s.id,movementId:e.input.movementId!,repetitions:e.vector.repetitions.status==='complete'?e.vector.repetitions.minimum:null}))));
  return {schemaVersion:1,load:aggregateLoadSessions(sessions),exposure:{planned:exposure('planned'),actual:exposure('actual')},sessions,
    diagnostics:['TRAINING_LOAD_RESOLUTION','READINESS_SEPARATE','NO_IMPLICIT_PLANNED_ACTUAL_LINK']};
}

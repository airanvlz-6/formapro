import assert from 'node:assert/strict';
import { sportsRuntime, fakeDatabase, equippedProfileFixture } from './trainingContractTestRuntime.mjs';
export const load = sportsRuntime({console:{info(){},log(){},warn(){}}});
export const methods = ['running_recovery','running_long_run','running_threshold','running_vo2'];
const movement = ['regenerativo','rodaje_largo','series_umbral','series_vo2max'];
export function execution(method, date='2026-09-09') {
  const index=methods.indexOf(method), seconds=[1200,3000,1200,180][index], reps=method==='running_vo2'?4:1;
  return {sourceActivityId:method+'-'+date,occurredAt:date,method:{methodId:method,pattern:'run'},completeness:'FULL',
    quantities:{totalDuration:{value:seconds*reps+(reps-1)*120,unit:'seconds'},mainWorkDuration:{value:seconds*reps,unit:'seconds'}},
    structure:{mode:reps===1?'continuous':'intervals',bouts:Array.from({length:reps},(_,i)=>({boutIndex:i,movementId:movement[index],duration:{value:seconds,unit:'seconds'},completed:true})),
      ...(reps===1?{}:{recoveries:Array.from({length:reps-1},(_,i)=>({afterBout:i,duration:{value:120,unit:'seconds'},mode:'passive',completed:true}))})}};
}
export function fixture({date='2026-09-10',week='2026-09-14',include=methods,goal='half_marathon'}={}) {
  const binding={planningRunId:'b3-reuse',targetWeekStart:week};
  const duration=load('../athlete/runningHabitualDeclarations').habitualRunningFact('habitualEasyRunningDurationMinutes',45,date+'T12:00:00Z');
  const historical=[['2026-07-01','carrera z2',48],['2026-07-09','z2_intervalos',44],['2026-07-12','rodaje_largo_progresivo',70],['2026-07-23','intervalos_z3_cortos'],
    ['2026-07-30','carrera_series'],['2026-08-02','carrera_larga',85],['2026-08-09','rodaje_largo_z2',103],['2026-08-17','rodaje_z2'],['2026-08-21','rodaje_z2'],
    ['2026-08-24','rodaje_z2',52],['2026-08-26','series',62],['2026-08-28','rodaje_regenerativo',35],['2026-08-30','carrera',75],['2026-08-31','rodaje Z2',49],['2026-09-06','carrera',92],['2026-09-08','carrera',50]]
    .map(([fecha,tipo,duracion])=>({fecha,tipo,duracion,workout_id:'fixture-'+fecha,notas:'5000 metros 45 minutos',analisis:'1800 seconds'}));
  const perfil={...equippedProfileFixture(),dias:3,duracion:'90 min',
    targetEvent:load('../athlete/eventAuthority').declareTargetEvent('u',goal,'2026-11-15','2026-09-10',null,'2026-09-10T12:00:00Z'),
    runningHabitualDeclarations:{habitualEasyRunningDurationMinutes:duration},
    runningHabitualConfirmation:load('../athlete/runningHabitualConfirmation').issueRunningHabitualConfirmation('u',binding,duration)};
  const recordDate=new Date(Date.parse(date)-86400000).toISOString().slice(0,10);
  const tables={usuarios:{codigo:'u',modo_entrada:'coach',categoria:'carrera',especialidad:'carrera',objetivo_principal:goal,perfil,
    distribucion_semanal:{carrera:['lunes','miercoles','viernes']},workout_history:historical},weekly_plan:[],
    running_execution_records:include.map(m=>load('../execution/runningExecutionStore').sealRunningExecution('u',execution(m,recordDate),date)),
    session_modification_events:[],physiology_records:[],athlete_state_events:[],athlete_coaching_notes:[],athlete_training_sources:[]};
  return {tables,db:fakeDatabase(tables),request:{...binding,today:date,empezarHoy:false,snapshot:null,strategyVersion:1}};
}
export async function context(f) {
  return load('../planning/prepareAllowedWeeklyPlanContract').loadWeeklyPlanningContext(f.db,'u',f.request);
}
export async function contract(f, method, targetDay='lunes', slotIntent) {
  const ctx=await context(f), athlete=await load('../athlete/loadAthletePrescriptionContext').loadAthletePrescriptionContext(f.db,'u',{asOfDate:f.request.today,runningHabitualInteraction:f.request});
  const m=load('goalTransferModel').transferMethod(method);
  const intent=slotIntent ?? {kind:'adaptation',methodId:method,adaptationId:m.adaptationId,role:method==='running_recovery'?'MAINTENANCE':'PRIMARY',pattern:'run',
    goalId:f.tables.usuarios.objetivo_principal,blockPhase:'unknown',blockWeek:null,weaknessId:null};
  const built=load('allowedTrainingContract').buildAllowedTrainingContract({...ctx.input.contexts.carrera,targetDay,stimulus:m.stimulusId,intent,
    doseContext:load('sessionDoseContext').buildSessionDoseContext(athlete,intent,null,[],true)});
  assert.equal(built.ok,true,JSON.stringify(built));
  const c=built.contract,b3=load('runningMethodDoseAuthority');
  c.runningMethodDose=b3.resolveRunningMethodDose(b3.resolveCompatibleRunningDoseEvidence(athlete.runningDoseEvidenceAdmission,intent),intent);
  c.intensityAuthority=load('methodIntensityAuthority').resolveMethodIntensity(c);
  return c;
}
export function proposal(c) {
  const d=c.runningMethodDose.dose, id=d.allowedMovementIds[0], s=d.structureConstraints;
  return {schemaVersion:2,stimulusId:c.stimulusId,structureId:d.structures[0],blocks:[{blockType:'main',movements:[{movementId:id,prescription:{
    durationSeconds:s.mode==='intervals'?s.bout.range.minimum:d.selectedTarget.minimum,
    ...(s.mode==='intervals'?{sets:s.efforts.minimum,restSeconds:s.recoverySeconds.minimum}:{}),
    intensity:c.intensityAuthority.targets.find(t=>t.movementId===id)?.primary}}]}]};
}

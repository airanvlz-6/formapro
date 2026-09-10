import test from 'node:test';
import assert from 'node:assert/strict';
import {sportsRuntime,fakeDatabase,equippedProfileFixture,plain} from './trainingContractTestRuntime.mjs';
const load=sportsRuntime({console:{log(){},info(){},warn(){}}});
const today='2026-09-10',week='2026-09-14',binding={planningRunId:'d3-positive',targetWeekStart:week};
const historical=[['2026-07-01','carrera z2',48],['2026-07-09','z2_intervalos',44],['2026-07-12','rodaje_largo_progresivo',70],
 ['2026-07-23','intervalos_z3_cortos'],['2026-07-30','carrera_series'],['2026-08-02','carrera_larga',85],['2026-08-09','rodaje_largo_z2',103],
 ['2026-08-17','rodaje_z2'],['2026-08-21','rodaje_z2'],['2026-08-24','rodaje_z2',52],['2026-08-26','series',62],['2026-08-28','rodaje_regenerativo',35],
 ['2026-08-30','carrera',75],['2026-08-31','rodaje Z2',49],['2026-09-06','carrera',92],['2026-09-08','carrera',50]]
 .map(([fecha,tipo,duracion])=>({fecha,tipo,duracion,workout_id:'fixture-'+fecha,notas:'12.3km FC 160 5x1000',analisis:'mejora intensificación'}));
function fixture(numeric=true,date=today,target=week){
 const b={...binding,targetWeekStart:target};
 const facts=load('../athlete/runningHabitualDeclarations');
 const duration=facts.habitualRunningFact('habitualEasyRunningDurationMinutes',45,date+'T12:00:00Z');
 const frequency=facts.habitualRunningFact('habitualRunningSessionsPerWeek',3,date+'T12:00:00Z');
 const event=load('../athlete/eventAuthority').declareTargetEvent('u','half_marathon','2026-11-15',today,null,today+'T12:00:00Z');
 const perfil={...equippedProfileFixture(),dias:3,duracion:'60 min',targetEvent:event,...(numeric?{
 runningHabitualDeclarations:{habitualEasyRunningDurationMinutes:duration,habitualRunningSessionsPerWeek:frequency},
 runningHabitualConfirmation:load('../athlete/runningHabitualConfirmation').issueRunningHabitualConfirmation('u',b,duration)}:{})};
 const tables={usuarios:{codigo:'u',modo_entrada:'coach',categoria:'carrera',especialidad:'carrera',objetivo_principal:'half_marathon',perfil,
 distribucion_semanal:{carrera:['lunes','miercoles','viernes']},workout_history:[...historical,...['2026-08-21','2026-08-24','2026-08-26','2026-08-28','2026-09-06'].map(fecha=>({fecha,tipo:'carrera',source:'safety_net_deterministico'}))]},
 weekly_plan:[],running_execution_records:[],session_modification_events:[],physiology_records:[],athlete_state_events:[],athlete_coaching_notes:[],athlete_training_sources:[]};
 return {tables,db:fakeDatabase(tables),request:{...b,today:date,empezarHoy:false,snapshot:null,strategyVersion:1}};
}
async function positive(){
 const f=fixture(),planner=load('../planning/prepareAllowedWeeklyPlanContract');
 const context=await planner.loadWeeklyPlanningContext(f.db,'u',f.request);
 const prepared=await planner.prepareAllowedWeeklyPlanContract(f.db,'u',f.request);
 assert.equal(prepared.ok,true,JSON.stringify(prepared));
 const option=Object.values(prepared.contract.dayOptions).flat().find(o=>o.intent?.methodId==='running_base');assert.ok(option);
 const athlete=await load('../athlete/loadAthletePrescriptionContext').loadAthletePrescriptionContext(f.db,'u',{asOfDate:today,runningHabitualInteraction:binding});
 const doseContext=load('sessionDoseContext').buildSessionDoseContext(athlete,option.intent,context.input.strategy,[],true);
 const built=load('allowedTrainingContract').buildAllowedTrainingContract({...context.input.contexts.carrera,targetDay:option.optionId.split(':')[0],stimulus:option.stimulusId,intent:option.intent,doseContext});
 assert.equal(built.ok,true,JSON.stringify(built));const c=built.contract;
 const b3=load('runningMethodDoseAuthority');c.runningMethodDose=b3.resolveRunningMethodDose(b3.resolveCompatibleRunningDoseEvidence(athlete.runningDoseEvidenceAdmission,c.intent),c.intent);
 c.intensityAuthority=load('methodIntensityAuthority').resolveMethodIntensity(c);
 assert.equal(c.runningMethodDose.status,'RESOLVED');assert.equal(c.intensityAuthority.status,'RESOLVED');
 const proposal={schemaVersion:2,stimulusId:c.stimulusId,structureId:'continuo_carrera',blocks:[{blockType:'main',movements:[{movementId:'rodaje_z2',prescription:{durationSeconds:2700,intensity:c.intensityAuthority.targets.find(t=>t.movementId==='rodaje_z2').primary}}]}]};
 return {f,context,prepared,c,proposal};
}
test('real history alone lacks B3 quantitative authority, not calendar availability',async()=>{
 const f=fixture(false);delete f.request.planningRunId;
 const context=await load('../planning/prepareAllowedWeeklyPlanContract').loadWeeklyPlanningContext(f.db,'u',f.request);
 assert.equal(context.runningEventPreparation.longitudinalState,'ESTABLISHED_CURRENT');assert.equal(context.runningEventPreparation.daysRemaining,66);
 const base=context.input.doseCapabilities.entries.find(e=>e.methodId==='running_base');assert.equal(base.prescriptionAllowed,false);assert.equal(base.longitudinalDose.selectedDose,null);
 const result=await load('../planning/prepareAllowedWeeklyPlanContract').prepareAllowedWeeklyPlanContract(f.db,'u',f.request);
 assert.equal(result.ok,false);assert.ok(result.errors.includes('D3_REQUIRED_EASY_UNAVAILABLE'));
});
test('positive canonical declaration produces bounded week, Builder call and validated exact dose',async()=>{
 const f=await positive(),w=load('../planning/allowedWeeklyPlanContract');
 const selections=Object.entries(f.prepared.contract.dayOptions).map(([day,opts])=>({day,optionId:opts.find(o=>day==='lunes'&&o.intent?.methodId==='running_base')?.optionId??opts.find(o=>o.state==='REST').optionId}));
 const weekResult=await w.composeBoundedWeek(f.prepared.contract,async()=>JSON.stringify({contractVersion:1,contextDigest:f.prepared.contract.contextDigest,selections}));assert.equal(weekResult.ok,true,JSON.stringify(weekResult));
 let calls=0;const generated=await load('sessionGeneration').generateContractSession(f.c,[],async prompt=>{calls++;assert.match(prompt,/runningEventPreparation/);return JSON.stringify(f.proposal);});
 assert.equal(generated.ok,true,JSON.stringify(generated));assert.equal(calls,1);
 assert.equal(load('structuredSession').validateSessionAgainstTrainingContract(f.c,generated.proposal).ok,true);
});
test('post-Builder increase and forbidden canonical long run are rejected',async()=>{
 const f=await positive(),validate=load('structuredSession').validateSessionAgainstTrainingContract;
 const increase=structuredClone(f.proposal);increase.blocks[0].movements[0].prescription.durationSeconds=3000;assert.equal(validate(f.c,increase).ok,false);
 const forbidden=structuredClone(f.c);forbidden.runningEventPreparation.constraints.longRun='FORBIDDEN';forbidden.intensityAuthority=load('methodIntensityAuthority').resolveMethodIntensity(forbidden);
 assert.ok(forbidden.intensityAuthority.targets.every(t=>t.movementId!=='rodaje_largo'));
 const long=structuredClone(f.proposal);long.blocks[0].movements[0].movementId='rodaje_largo';const result=validate(forbidden,long);assert.equal(result.ok,false);assert.ok(result.violations.includes('D3_LONG_RUN_FORBIDDEN'));
});
test('unresolved C2 cannot reach Builder',async()=>{
 const f=await positive();delete f.c.intensityAuthority;let calls=0;
 const result=await load('sessionGeneration').generateContractSession(f.c,[],async()=>{calls++;return JSON.stringify(f.proposal);});assert.equal(result.ok,false);assert.equal(calls,0);assert.equal(result.code,'D3_C2_INTENSITY_UNRESOLVED');
});
test('missing B3 cannot reach Builder despite resolved C2',async()=>{
 const f=await positive();delete f.c.runningMethodDose;let calls=0;
 const result=await load('sessionGeneration').generateContractSession(f.c,[],async()=>{calls++;return JSON.stringify(f.proposal);});assert.equal(result.ok,false);assert.equal(calls,0);assert.equal(result.code,'D3_B3_DOSE_UNRESOLVED');
});
test('long-run REQUIRED fails explicitly without a canonical dose selector',async()=>{
 const f=await positive();f.context.input.runningEventPreparation.constraints.longRun='REQUIRED';
 const result=load('../planning/allowedWeeklyPlanContract').buildAllowedWeeklyPlanContract(f.context.input);
 assert.equal(result.ok,false);assert.ok(result.errors.includes('D3_REQUIRED_LONG_RUN_NO_AUTHORIZED_SELECTOR'));
});
test('quality allowed still needs C2 and B3; forbidden quality cannot acquire C2 authority',async()=>{
 const f=await positive();const entries=f.context.input.doseCapabilities.entries;
 const threshold=entries.find(e=>e.methodId==='running_threshold'),vo2=entries.find(e=>e.methodId==='running_vo2');
 assert.equal(threshold.weeklyIntensityEligibility,'ALLOWED');assert.equal(threshold.intensityStatus,'RESOLVED');assert.equal(threshold.prescriptionAllowed,false);
 assert.equal(vo2.weeklyIntensityEligibility,'ALLOWED');assert.equal(vo2.intensityStatus,'UNRESOLVED');assert.equal(vo2.prescriptionAllowed,false);
 const c=structuredClone(f.c);c.runningEventPreparation.constraints.quality='FORBIDDEN';c.intent.methodId='running_threshold';
 const intensity=load('methodIntensityAuthority').resolveMethodIntensity(c);assert.equal(intensity.status,'UNRESOLVED');c.intensityAuthority=intensity;
 const generated=await load('sessionGeneration').generateContractSession(c,[],async()=>{throw Error('FORBIDDEN_BUILDER_CALL');});assert.equal(generated.ok,false);assert.ok(generated.violations.includes('D3_METHOD_FORBIDDEN'));
});
test('weekly selection rejects missing easy, recovery and quality requirements',async()=>{
 const f=await positive(),w=load('../planning/allowedWeeklyPlanContract');
 for(const category of ['easy','recovery','quality']){
  const c=structuredClone(f.prepared.contract);c.runningEventPreparation.constraints[category]='REQUIRED';
  const selections=Object.entries(c.dayOptions).map(([day,opts])=>({day,optionId:(category!=='easy'&&day==='lunes'?opts.find(o=>o.intent?.methodId==='running_base'):opts.find(o=>o.state==='REST')).optionId}));
  const result=w.validateWeeklySelection(c,{contractVersion:1,contextDigest:c.contextDigest,selections});assert.equal(result.ok,false);assert.ok(result.errors.includes('D3_REQUIRED_'+category.toUpperCase()+'_MISSING'));
 }
});
test('taper actual orchestration requires recovery; B3 missing recovery selector blocks Builder',async()=>{
 const f=fixture(true,'2026-10-25','2026-10-26'),p=load('../planning/prepareAllowedWeeklyPlanContract');
 const context=await p.loadWeeklyPlanningContext(f.db,'u',f.request);assert.equal(context.runningEventPreparation.preparationState,'TAPER');
 const d=context.runningEventPreparation;assert.equal(d.constraints.recovery,'REQUIRED');assert.equal(d.constraints.overload,'FORBIDDEN');assert.equal(d.constraints.longRun,'FORBIDDEN');
 const built=await p.prepareAllowedWeeklyPlanContract(f.db,'u',f.request);assert.equal(built.ok,false);assert.ok(built.errors.includes('D3_REQUIRED_RECOVERY_UNAVAILABLE'));
 const base=await positive();base.c.runningEventPreparation=d;base.c.intensityAuthority=load('methodIntensityAuthority').resolveMethodIntensity(base.c);
 const generated=await load('sessionGeneration').generateContractSession(base.c,[],async()=>{throw Error('TAPER_BYPASS');});assert.equal(generated.ok,false);
});
test('race orchestration and final session validation protect the civil event date',async()=>{
 const f=fixture(true,'2026-11-09','2026-11-09'),p=load('../planning/prepareAllowedWeeklyPlanContract');
 const context=await p.loadWeeklyPlanningContext(f.db,'u',f.request);assert.equal(context.runningEventPreparation.preparationState,'RACE_WEEK');
 const d=context.runningEventPreparation;assert.equal(d.constraints.protectedDate,'2026-11-15');assert.equal(d.constraints.quality,'FORBIDDEN');
 const collision=structuredClone(context.input);collision.fixed.domingo={state:'TRAIN',discipline:'carrera'};
 const rejected=load('../planning/allowedWeeklyPlanContract').buildAllowedWeeklyPlanContract(collision);assert.equal(rejected.ok,false);assert.ok(rejected.errors.includes('D3_PROTECTED_EVENT_CONFLICT'));
 const base=await positive();base.c.runningEventPreparation=d;base.c.targetWeekStart='2026-11-09';base.c.targetDay='domingo';base.c.intensityAuthority=load('methodIntensityAuthority').resolveMethodIntensity(base.c);
 const validated=load('structuredSession').validateSessionAgainstTrainingContract(base.c,base.proposal);assert.equal(validated.ok,false);assert.ok(validated.violations.includes('CONTRACT:D3_EVENT_DATE_PROTECTED'));
 const generated=await load('sessionGeneration').generateContractSession(base.c,[],async()=>{throw Error('RACE_BYPASS');});assert.equal(generated.ok,false);
});
test('legacy cycle labels cannot replace D3 or change admitted weekly methods',async()=>{
 const f=await positive();f.f.tables.usuarios.ciclo_actual={bloque:'realización',semana:1,totalSemanas:4};
 f.f.tables.weekly_plan.push({week_start:'2026-08-31',bloque:'intensificación',sessions:[]});
 const rebuilt=await load('../planning/prepareAllowedWeeklyPlanContract').prepareAllowedWeeklyPlanContract(f.f.db,'u',f.f.request);
 assert.equal(rebuilt.ok,true,JSON.stringify(rebuilt));assert.deepEqual(plain(rebuilt.runningEventPreparation),plain(f.prepared.runningEventPreparation));
 assert.deepEqual(plain(rebuilt.contract.dayOptions),plain(f.prepared.contract.dayOptions));
});
test('Focus external running remains context and cannot constrain managed Box calendar',async()=>{
 const f=fixture();f.tables.usuarios.modo_entrada='focus';f.tables.usuarios.categoria='box';f.tables.usuarios.especialidad='box';
 f.tables.usuarios.distribucion_semanal={box:['lunes','miercoles','viernes']};
 f.tables.athlete_training_sources=[{disciplina:'box',owner:'forge',activo:true,dias:['lunes','miercoles','viernes']},{disciplina:'carrera',owner:'external',activo:true,dias:['domingo']}];
 const context=await load('../planning/prepareAllowedWeeklyPlanContract').loadWeeklyPlanningContext(f.db,'u',f.request);
 assert.equal(context.ok,true,JSON.stringify(context));assert.equal(context.runningEventPreparation.managed,false);
 assert.equal(context.input.runningEventPreparation,undefined);assert.equal(context.input.contexts.box.runningEventPreparation,undefined);
});

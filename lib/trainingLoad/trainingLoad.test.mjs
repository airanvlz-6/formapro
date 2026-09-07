import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {sportsRuntime,plain,compile} from '../sports/trainingContractTestRuntime.mjs';
const load=sportsRuntime(),core=load('../trainingLoad/trainingLoad'),adapter=load('../trainingLoad/prescriptionLoadAdapter');
const segment=(overrides={})=>({id:'squat',movementId:'back_squat',pattern:'squat',source:'explicit_fixture',sets:4,reps:5,
  kg:{minimum:112.5,maximum:112.5},multiplier:1,externalLoadApplicable:true,restSeconds:120,...overrides});
const session=(segments,overrides={})=>core.resolveSessionLoad({id:'session',date:'2026-09-07',kind:'planned',discipline:null,source:'fixture',segments,executionStatus:'unknown',...overrides});
const value=(s,key)=>s.vector[key].minimum;
test('4x5x112.5 is 20 reps and 2250kg, without a fatigue score',()=>{
  const s=session([segment()]);assert.equal(value(s,'repetitions'),20);assert.equal(value(s,'externalVolumeKg'),2250);assert.equal(s.vector.score,undefined);
  assert.equal(s.segments[0].input.kg.minimum,112.5);
});
test('two strength movements sum to4170kg and retain pattern breakdown',()=>{
  const s=session([segment(),segment({id:'rdl',movementId:'rdl',pattern:'hinge',sets:3,reps:8,kg:{minimum:80,maximum:80}})]);
  assert.equal(value(s,'externalVolumeKg'),4170);const summary=adapter.summarizeLoad([s]);
  assert.equal(summary.load.planned.byPattern.hinge.vector.externalVolumeKg.minimum,1920);
  assert.equal(summary.exposure.planned.byPattern.squat.knownRepetitions,20);
});
test('bodyweight pull-ups retain50reps and no fabricated kg',()=>{
  const s=session([segment({movementId:'pull_up',pattern:'vertical_pull',sets:5,reps:10,kg:undefined,externalLoadApplicable:false})]);
  assert.equal(value(s,'repetitions'),50);assert.equal(s.vector.externalVolumeKg.status,'not_applicable');assert.equal(value(s,'externalVolumeKg'),null);
});
test('weightlifting preserves external volume and existing technical category separately',()=>{
  const s=session([segment({movementId:'snatch',pattern:'olympic_lift',sets:5,reps:2,kg:{minimum:60,maximum:60},categories:{technical:'alta'}})]);
  assert.equal(value(s,'externalVolumeKg'),600);assert.equal(core.aggregateLoadSessions([s]).planned.byCategory['technical:alta'].sessions,1);
});
test('45min8km retains both dimensions and intensity context',()=>{
  const intensity={referenceId:'running:z2'};
  const s=session([segment({movementId:'rodaje_z2',pattern:'run',sets:1,reps:undefined,kg:undefined,externalLoadApplicable:false,durationSeconds:2700,distanceMeters:8000,restSeconds:0,intensity})]);
  assert.equal(value(s,'durationSeconds'),2700);assert.equal(value(s,'distanceMeters'),8000);assert.deepEqual(s.segments[0].input.intensity,intensity);
});
test('6x800m has4800m and five120s recoveries',()=>{
  const s=session([segment({sets:6,reps:undefined,distanceMeters:800,kg:undefined,restSeconds:120,externalLoadApplicable:false})]);
  assert.equal(value(s,'distanceMeters'),4800);assert.equal(value(s,'recoverySeconds'),600);assert.equal(value(s,'durationSeconds'),null);
});
test('interval work duration and recovery stay distinct',()=>{
  const s=session([segment({sets:6,reps:undefined,kg:undefined,durationSeconds:180,distanceMeters:800,externalLoadApplicable:false})]);
  assert.equal(value(s,'workSeconds'),1080);assert.equal(value(s,'recoverySeconds'),600);assert.equal(value(s,'durationSeconds'),1680);
});
test('AMRAP planned duration known, repetitions unknown; observed rounds can resolve actual work',()=>{
  const p=session([segment({multiplier:null})],{duration:core.quantity(720,'s','format_clock')});
  assert.equal(value(p,'durationSeconds'),720);assert.equal(value(p,'repetitions'),null);assert.equal(value(p,'externalVolumeKg'),null);
  const a=session([segment({sets:1,reps:10,multiplier:3})],{kind:'actual',duration:core.quantity(720,'s','observed')});
  assert.equal(value(a,'repetitions'),30);
});
test('planned2500 actual2375 delta-125 without mutation',()=>{
  const p=session([segment({sets:5,kg:{minimum:100,maximum:100}})]),a=session([segment({sets:5,kg:{minimum:95,maximum:95}})],{kind:'actual'});
  assert.equal(value(p,'externalVolumeKg'),2500);assert.equal(value(a,'externalVolumeKg'),2375);
  assert.equal(core.plannedActualDelta(p,a).dimensions.externalVolumeKg.minimum,-125);assert.equal(value(p,'externalVolumeKg'),2500);
});
test('partial execution counts3sets, completed flag never copies planned5sets',()=>{
  const p=session([segment({sets:5,kg:{minimum:100,maximum:100}})]),a=session([segment({sets:3,kg:{minimum:100,maximum:100}})],{kind:'actual',executionStatus:'partial'});
  assert.equal(value(a,'externalVolumeKg'),1500);assert.equal(a.executionStatus,'partial');
  const unknown=session([],{kind:'actual',executionStatus:'completed_flag'});assert.equal(value(unknown,'externalVolumeKg'),null);
  assert.equal(core.plannedActualDelta(p,unknown).dimensions.externalVolumeKg.comparable,false);
});
test('modified cycling execution never retains planned strength actuals',()=>{
  const p=session([segment()]),a=session([segment({movementId:'bike_erg',pattern:'cyclic',sets:1,reps:undefined,kg:undefined,durationSeconds:1800,externalLoadApplicable:false,restSeconds:0})],{kind:'actual',executionStatus:'modified'});
  assert.equal(a.vector.externalVolumeKg.status,'not_applicable');assert.equal(value(a,'durationSeconds'),1800);
  assert.equal(core.plannedActualDelta(p,a).dimensions.externalVolumeKg.comparable,false);
});
test('three endurance and two strength sessions aggregate by date, method and adaptation',()=>{
  const sessions=Array.from({length:3},(_,i)=>session([segment({movementId:'rodaje_z2',pattern:'run',sets:1,reps:undefined,kg:undefined,durationSeconds:2700,distanceMeters:8000,restSeconds:0,externalLoadApplicable:false})],{id:`run${i}`,date:`2026-09-0${7+i}`,discipline:'carrera',adaptationId:'base_aerobica'}));
  sessions.push(session([segment()],{id:'strength1',discipline:'box',adaptationId:'fuerza_general',weaknessId:'known-weakness'}),session([segment()],{id:'strength2',discipline:'box',adaptationId:'fuerza_general'}));
  const s=core.aggregateLoadSessions(sessions).planned;
  assert.equal(s.sessionCount,5);assert.equal(s.byDiscipline.carrera.vector.distanceMeters.minimum,24000);assert.equal(s.byDiscipline.box.vector.externalVolumeKg.minimum,4500);
  assert.equal(s.byDate['2026-09-07'].sessionIds.length,3);assert.equal(s.byAdaptation.base_aerobica.sessionIds.length,3);assert.equal(s.byWeakness['known-weakness'].sessionIds.length,1);
});
test('unknown legacy is not zero and partial sums are identified',()=>{
  const s=core.aggregateLoadSessions([session([segment()],{id:'known'}),session([],{id:'legacy'})]).planned.vector.externalVolumeKg;
  assert.equal(s.status,'partial');assert.equal(s.minimum,2250);assert.equal(s.maximum,null);
});
test('bounded estimates remain ranges when summed',()=>{
  const a={...core.quantity(100,'s','estimate',200),status:'partial'},q=core.sumQuantities([a,a],'s');
  assert.equal(q.status,'partial');assert.equal(q.minimum,200);assert.equal(q.maximum,400);
});
test('internal sessionRPE uses actual whole-session evidence only',()=>{
  const actual=session([],{kind:'actual',duration:core.quantity(3600,'s','reported_duration'),sessionRpe:7});
  assert.equal(value(actual,'sessionRpeMinutes'),420);
  assert.equal(value(session([],{duration:core.quantity(3600,'s','planned'),sessionRpe:7}),'sessionRpeMinutes'),null);
  assert.equal(value(session([],{kind:'actual',duration:{...core.quantity(3000,'s','estimated',3600),status:'partial'},sessionRpe:7}),'sessionRpeMinutes'),null);
});
test('external record preserves only actual available dimensions',()=>{
  const a=adapter.externalActualLoad({fecha:'2026-09-07',disciplina:'cycling',duracion:60,intensidad_percibida:6},'external1');
  assert.equal(value(a,'durationSeconds'),3600);assert.equal(value(a,'sessionRpeMinutes'),360);assert.equal(value(a,'externalVolumeKg'),null);
});
test('core runs cycling-like and powerlifting-like quantities without sport branches or runtime dependencies',()=>{
  const module={exports:{}};const source=readFileSync(new URL('./trainingLoad.ts',import.meta.url),'utf8');
  vm.runInNewContext(compile(source),{module,exports:module.exports,require(){throw Error('runtime dependency');}});
  assert.doesNotMatch(source,/\b(carrera|running|box|crossfit|cycling|powerlifting)\b/i);
  const cycling=module.exports.resolveSessionLoad({id:'bike',date:'2026-09-07',kind:'actual',discipline:null,source:'explicit',segments:[],executionStatus:'reported',duration:core.quantity(1800,'s','report')});
  assert.equal(value(cycling,'durationSeconds'),1800);assert.equal(module.exports.resolveSegmentLoad(segment()).vector.externalVolumeKg.minimum,2250);
});
test('JSON roundtrip preserves all public quantities and evidence',()=>{
  const s=session([segment()],{adaptationId:'fuerza_general'}),reconstructed=JSON.parse(JSON.stringify(s));
  assert.deepEqual(reconstructed,plain(s));assert.deepEqual(plain(core.aggregateLoadSessions([reconstructed])),plain(core.aggregateLoadSessions([s])));
});
test('block label never merges instances: temporal explicit window only, no persistence',()=>{
  const a=session([segment()],{date:'2026-08-01',id:'old'}),b=session([segment()],{date:'2026-09-07',id:'new'});
  const r=core.aggregateLoadWindow([a,b],{fromDate:'2026-09-01',toDate:'2026-09-30',level:'block'});
  assert.equal(r.identityStatus,'temporal_only_identity_unknown');assert.equal(r.persisted,false);assert.equal(r.load.planned.sessionCount,1);
});
for(const overrides of [{sets:-1},{reps:NaN},{multiplier:-1},{kg:{minimum:100,maximum:50}}])test(`invalid numerical input ${JSON.stringify(overrides)} fails closed`,()=>{
  assert.throws(()=>core.resolveSegmentLoad(segment(overrides)),/TRAINING_LOAD_INVALID/);
});
test('duplicate execution identities cannot inflate a summary',()=>assert.throws(()=>core.aggregateLoadSessions([session([segment()]),session([segment()])]),/DUPLICATE_ID/));
test('legacy text and completed flag do not produce structured actual load',()=>{
  const s=adapter.plannedPrescriptionLoad({tipo:'box',completada:true,descripcion:'5x5 100kg',descripcion_real:'igual'},'2026-09-07','legacy');
  assert.equal(s.status,'unknown');assert.equal(value(s,'externalVolumeKg'),null);
});

const stored=(format='strength_sets',dose={sets:4,reps:5,restSeconds:120,intensity:{kind:'percent_1rm',referenceId:'1rm:back_squat',value:75}},formatDose)=>({tipo:'box',structuredPrescription:{schemaVersion:2,
  proposal:{schemaVersion:2,stimulusId:'fuerza_maxima',structureId:format,blocks:[{blockType:'warmup',movements:[{movementId:'back_squat',prescription:{durationSeconds:60,intensity:{kind:'rpe',value:3}}}]},
    {blockType:'main',...(formatDose?{formatDose}:{}),movements:[{movementId:'back_squat',prescription:dose}]}]},references:[{id:'1rm:back_squat',kind:'1rm',movementId:'back_squat',value:150,unit:'kg',source:'usuarios.test_atleta.back_squat'}],
  objective:{intent:{kind:'adaptation',adaptationId:'fuerza_maxima',methodId:'box_max_strength'}},weakness:{id:'weakness'},duration:{minimumSeconds:600,maximumSeconds:900,policy:'3C_estimate'}}});
test('persisted3C adapter calculates percentage using stored benchmark, preserves planned metadata',()=>{
  const r=adapter.plannedPrescriptionLoad(stored(),'2026-09-07','p');assert.equal(value(r,'externalVolumeKg'),2250);
  assert.equal(r.vector.externalVolumeKg.status,'partial');assert.equal(r.adaptationId,'fuerza_maxima');assert.equal(r.weaknessId,'weakness');
  assert.equal(r.segments[1].vector.externalVolumeKg.status,'complete');assert.equal(r.vector.durationSeconds.maximum,900);
});
test('clock-based planned AMRAP refuses fabricated round counts',()=>{
  const s=stored('amrap_corto',{reps:10,intensity:{kind:'rpe',value:7}},{durationSeconds:720});
  const r=adapter.plannedPrescriptionLoad(s,'2026-09-07','p');assert.equal(r.segments[1].vector.repetitions.status,'unknown');
  assert.equal(r.segments[1].input.formatContext.dose.durationSeconds,720);
});
test('Exposure Engine counts session once across warmup/main while preserving known reps subtotal',()=>{
  const report=load('exposureEngine').buildStructuredExposureReport([{sessionId:'a',movementId:'back_squat',repetitions:null},{sessionId:'a',movementId:'back_squat',repetitions:20}]);
  assert.equal(report.byPattern.squat.sessions,1);assert.equal(report.byPattern.squat.knownRepetitions,20);assert.equal(report.byPattern.squat.status,'partial');
});
export {stored};

test('complex includes inter-round recovery once, without duplicating movement repetitions',()=>{
  const r=adapter.plannedPrescriptionLoad(stored('complex_halterofilia',{reps:2,intensity:{kind:'rpe',value:6}},{rounds:4,restSeconds:120}),'2026-09-07','complex');
  assert.equal(r.vector.recoverySeconds.minimum,360);assert.equal(r.segments[1].vector.repetitions.minimum,8);
});
test('impossible calendar dates cannot label an aggregate window',()=>{
  assert.throws(()=>core.aggregateLoadWindow([],{fromDate:'2026-02-30',toDate:'2026-03-10',level:'block'}),/INVALID_WINDOW/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';
const paths=[];
const load=sportsRuntime({console:{info(){},log(){},warn(){},error(){}},fetch(){throw Error('NO_NETWORK');}},(path,exports)=>{paths.push(path.replaceAll('\\','/'));return exports;});
const read=load('../athlete/loadBuilderFacts').loadBuilderFacts;
const bridge=load('weekPrescriptionSessionAdapter');
const fixture=JSON.parse(readFileSync(new URL('../sports/weekPrescriptionProviderContract.fixture.json',import.meta.url),'utf8')).input;
const user=fixture.core.identity.value,referenceDate='2026-09-27';
const weekdays=['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
function input(){
  return {referenceDate,date:fixture.date,discipline:'carrera',intake:load('../core/weekIntake').resolveWeekIntake({referenceDate,
    target:{kind:'week',startDate:fixture.prescription.weekStart,source:'user:week'},disciplines:['carrera','box'],
    weeklyAvailability:{[fixture.prescription.weekStart]:{version:1,source:'explicit_user_declaration',resolution:'DECLARED_AVAILABILITY',
      availability:{carrera:weekdays,box:weekdays},excludedDisciplines:[],unavailableDays:[],unresolvedDays:[]}}})};
}
function database(){
  const tables={usuarios:{codigo:user,modo_entrada:'coach',categoria:'hibrido',especialidad:'hibrido',
    distribucion_semanal:{carrera:weekdays,box:weekdays},perfil:{duracion:'60 min',nivel_carrera:'Avanzado (corro con frecuencia)',
      prescription_signals:{'capability.canMeasureDistance':{state:'available'},'equipment.barra':{state:'available'}}}},
    athlete_training_sources:[{disciplina:'carrera',owner:'forge',activo:true,dias:weekdays},{disciplina:'box',owner:'forge',activo:true,dias:weekdays}],
    weekly_plan:[],athlete_state_events:[],athlete_coaching_notes:[],external_training_records:[],session_modification_events:[],physiology_records:[],running_execution_records:[]};
  const calls=[],failures=new Set();
  return {tables,calls,failures,from(table){
    const call={table,filters:[]};calls.push(call);let single=false;
    const q={select(columns){call.columns=columns;return q;},eq(k,v){call.filters.push([k,v]);return q;},in(){return q;},lt(){return q;},gte(){return q;},
      lte(k,v){call.before=[k,v];return q;},order(){return q;},range(){return q;},limit(){return q;},
      single(){single=true;return q;},maybeSingle(){single=true;return q;},then(resolve,reject){
        let data=structuredClone(tables[table]??[]);
        if(table==='weekly_plan'){
          const week=call.filters.find(([k])=>k==='week_start')?.[1];
          if(week)data=data.filter(p=>p.week_start===week);
          if(call.before)data=data.filter(p=>p[call.before[0]]<=call.before[1]);
        }
        if(single&&Array.isArray(data))data=data[0]??null;
        if(table==='usuarios'&&data)data=Object.fromEntries(call.columns.split(',').map(k=>[k,data[k]]));
        return Promise.resolve({data,error:failures.has(table)?{code:'READ_FAILED'}:null}).then(resolve,reject);
      }};return q;
  }};
}
test('factual loader returns Core scope, technical resources/capabilities and explicit availability without planning decisions',async()=>{
  const db=database(),f=await read(db,user,input());
  assert.deepEqual(plain(f.core.disciplines.value.scope.managedDisciplines),['box','carrera']);
  assert.equal(f.scheduling.value.availability,'available');assert.equal(f.scheduling.value.protection,'clear');
  assert.equal(f.technical.dose.value.sufficiency.signals['capability.canMeasureDistance'].state,'available');
  assert.equal(f.technical.dose.value.sufficiency.signals['equipment.barra'].state,'available');
  assert.equal(f.technical.dose.value.sufficiency.signals['skill.carrera.advanced'].state,'available');
  assert.equal(f.technical.dose.value.weekStrategy,null);assert.equal(f.technical.dose.value.weakness,null);
  assert.equal(f.technical.dose.value.timeBudget.maximumSeconds,3600);
  for(const key of ['frequency','purpose','days','methodId','adaptationId','planningStrategy','weekIntent','blockIntent'])assert.equal(Object.hasOwn(f,key),false);
  assert.equal(db.calls.some(c=>c.table==='session_modification_events'||c.table==='physiology_records'||c.table==='running_execution_records'),false,'does not extract whole legacy context');
  for(const c of db.calls)assert.ok(c.filters.some(([k,v])=>['codigo','user_codigo'].includes(k)&&v===user),c.table);
});
test('canonical TRAIN materializes with real-shaped loaded facts, exact purpose, restriction and discipline fidelity',async()=>{
  const db=database();db.tables.athlete_coaching_notes.push({id:'restriction',status:'pending',constraint_level:'hard',movement:'overhead',issue:'Recorded shoulder constraint',prohibits_overhead_load:true});
  const f=await read(db,user,input());let calls=0;
  const result=await bridge.materializeWeekPrescriptionSession({...fixture,...f},f.history,async()=>{calls++;
    const purpose=fixture.prescription.days[1].purpose;
    return JSON.stringify({schemaVersion:2,stimulusId:purpose,finalDecision:{kind:'session_decision',version:1,stimulus:purpose},structureId:'intervalos_carrera',
      blocks:[{blockType:'main',movements:[{movementId:'series_umbral',prescription:{sets:3,durationSeconds:360,restSeconds:120,intensity:{kind:'rpe',value:7}}}]}]});
  });
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(calls,1);assert.equal(result.decision.purpose,fixture.prescription.days[1].purpose);
  assert.equal(result.contract.discipline,'carrera');assert.ok(result.session.descripcion.length);
  assert.deepEqual(plain(result.contract.restrictionsSnapshot),plain(f.core.restrictions.value));
  assert.equal(result.contract.restrictionsSnapshot.restrictions[0].prohibits_overhead_load,true);
});
test('unknown resources, reference and duration remain unknown instead of acquiring strategy defaults',async()=>{
  const db=database();db.tables.usuarios.perfil={};const f=await read(db,user,input()),d=f.technical.dose.value;
  assert.equal(d.timeBudget.maximumSeconds,null);assert.equal(d.references.length,0);
  assert.equal(d.sufficiency.signals['capability.canMeasureDistance'].state,'unknown');
  assert.equal(d.sufficiency.signals['equipment.barra'].state,'unknown');
});
test('conflicting time evidence surfaces unresolved dose',async()=>{
  const db=database();db.tables.usuarios.perfil.duracion_clase='45 min';const f=await read(db,user,input());
  assert.equal(f.technical.dose.status,'unknown');assert.equal(bridge.adaptWeekPrescriptionSession({...fixture,...f}).code,'BUILDER_FACTS_UNKNOWN');
});
for(const [status,basis,expected] of [['UNKNOWN','unknown','unknown'],['AVAILABLE','habitual','unknown'],['UNAVAILABLE','explicit_week','unavailable']])
  test(`availability ${status}/${basis} never becomes authorization or frequency`,async()=>{
    const i=input();i.intake.availability.days.find(d=>d.date===i.date&&d.discipline===i.discipline).status=status;
    i.intake.availability.days.find(d=>d.date===i.date&&d.discipline===i.discipline).basis=basis;
    assert.equal((await read(database(),user,i)).scheduling.value.availability,expected);
  });
test('protected completed target session and external activity remain protected',async()=>{
  const db=database();db.tables.weekly_plan.push({week_start:fixture.prescription.weekStart,sessions:[{dia:'martes',tipo:'carrera',completada:true}]});
  assert.equal((await read(db,user,input())).scheduling.value.protection,'protected');
  db.tables.weekly_plan=[];db.tables.athlete_training_sources.push({disciplina:'ciclismo',owner:'external',activo:true,dias:['martes']});
  const f=await read(db,user,input());assert.equal(f.scheduling.value.protection,'protected');assert.equal(f.technical.externalLoad.value.activities[0].discipline,'ciclismo');
});
test('unknown external schedule is not silently clear',async()=>{
  const db=database();db.tables.athlete_training_sources.push({disciplina:'ciclismo',owner:'external',activo:true});
  const f=await read(db,user,input());assert.equal(f.scheduling.value.protection,'unknown');assert.equal(f.technical.externalLoad.status,'unknown');
});
for(const table of ['usuarios','weekly_plan','athlete_training_sources','athlete_coaching_notes'])test(`failed ${table} never fabricates usable Builder facts`,async()=>{
  const db=database();db.failures.add(table);
  try{const f=await read(db,user,input());assert.equal(bridge.adaptWeekPrescriptionSession({...fixture,...f}).ok,false);}catch(e){assert.match(e.message,/READ_FAILED/);}
});
test('actual completed reports produce technical exposure; unexecuted prescription does not',async()=>{
  const db=database();db.tables.weekly_plan=[{week_start:'2026-09-21',sessions:[
    {dia:'lunes',tipo:'box',titulo:'Squat',descripcion_real:'back squat',completada:true},
    {dia:'martes',tipo:'box',titulo:'Deadlift',descripcion_real:'deadlift',completada:false}]}];
  const i=input();i.discipline='box';const f=await read(db,user,i);
  assert.equal(f.history.length,1);assert.equal(f.technical.exposure.value.report.exposiciones[0].movementId,'back_squat');
});
test('canonical factual import AND calls do not load any legacy planning authority',()=>{
  assert.doesNotMatch(paths.join('\n'),/strategyResolution|canonicalWeekStrategy|trainingFrequencySafetyNet|coachFirst|(?:Block)?Analyzer|(?:weekly|Weekly)Planner/);
});
test('legacy loader retains strategy and factual behavior through the shared reads and dose projection',async()=>{
  const legacy=sportsRuntime();const db=database();db.tables.usuarios.objetivo_principal={descripcion:'CrossFit Open'};
  const c=await legacy('../athlete/loadAthletePrescriptionContext').loadAthletePrescriptionContext(db,user,{asOfDate:referenceDate});
  const projected=legacy('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile(db.tables.usuarios,referenceDate);
  assert.deepEqual(plain(c.planningStrategy),plain(legacy('../athlete/strategyResolution').resolvePlanningStrategy(projected)));
  assert.equal(c.sessionTimeBudget.resolved.value.maxMinutes,60);assert.equal(c.restrictions.value.active,false);
  assert.deepEqual(plain(legacy('sessionDoseContext').buildSessionDoseContext(c)),plain(legacy('sessionDoseProjection').projectSessionDoseContext(c)));
  assert.equal(db.calls.filter(c=>c.table==='usuarios'&&c.columns.includes('test_atleta')).length,1);assert.equal(db.calls.filter(c=>c.table==='weekly_plan').length,1);
});

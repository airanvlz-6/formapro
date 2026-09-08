import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { sportsRuntime, fakeDatabase, plain, compile } from '../sports/trainingContractTestRuntime.mjs';
const events = [];
const load = sportsRuntime({ console: { log(){}, warn(){}, info: (...args) => events.push(args) } });
const prepare = load('../planning/prepareAllowedWeeklyPlanContract');
const api = load('../planning/allowedWeeklyPlanContract');
const diagnostic = load('../planning/weeklyRemainingDiagnostic');
const days = load('../planning/weeklyCalendar').calendarDays;
const availability = { box: ['martes','jueves','viernes','sabado'], carrera: ['lunes','miercoles','domingo'] };
function fixture(blocked = false) {
  const tables = { usuarios: { modo_entrada:'coach', categoria:'funcional', especialidad:'funcional_crossfit', objetivo_principal:'CrossFit Games',
    perfil:{}, workout_history:[], ciclo_actual:{bloque:'deload'}, distribucion_semanal:availability },
    athlete_training_sources: Object.entries(availability).map(([disciplina,dias]) => ({disciplina,dias,owner:'forge',activo:true})),
    weekly_plan:[], physiology_records:[], session_modification_events:[], athlete_state_events:[],
    athlete_coaching_notes: blocked ? Object.keys(load('movementLibrary').MOVEMENT_LIBRARY).map(movement => ({movement,status:'pending',constraint_level:'hard'})) : [] };
  const db=fakeDatabase(tables), from=db.from.bind(db);
  db.from=t=>{const q=from(t);q.update=q.insert=()=>{throw Error('NO_WRITES')};if(['weekly_plan','physiology_records'].includes(t))q.maybeSingle=async()=>({data:null,error:null});return q;};
  return {db, request:{targetWeekStart:'2026-09-07',today:'2026-09-08',empezarHoy:false,strategyVersion:1,
    snapshot:{sessions:days.map((dia,i)=>({dia,tipo:['carrera','box','descanso','box','carrera','box','descanso'][i]}))}}};
}
test('real adapter, controlled restrictions: rejection exposes calendar, method stages and no selected plan', async()=>{
  events.length=0;
  const f=fixture(true);
  // Obtain the very digest checked by preflight; never equate mere availability with confirmation.
  const c=await load('../planning/weeklyCalendarAuthority').loadWeeklyCalendarContext(f.db,'fixture');
  f.request.confirmedAvailabilityDigest=load('../planning/weeklyCalendarAuthority').weeklyDigest({distribution:c.profile.distribucion_semanal,sources:c.sources,scope:c.scope});
  const r=await prepare.prepareAllowedWeeklyPlanContract(f.db,'fixture',f.request);
  assert.equal(r.reason,'NO_FEASIBLE_REMAINING_SELECTION');
  const d=events.find(e=>e[0]==='WEEKLY_REMAINING_SELECTION_DIAGNOSTIC')[1];
  assert.equal(d.temporalDecision,false);assert.equal(d.validSelectionCount,'0');assert.equal(d.calendarValidSelectionCount,'0');
  assert.equal(d.selectedStatesByDay,null);assert.equal(d.newExecutableDays,null);assert.equal(d.builderTargetCount,null);
  assert.equal(d.preservedExecutableDays,0);assert.equal(d.availableNewExecutableDays,0);
  for(const row of d.calendar.slice(2)){assert.equal(row.protected,false);assert.equal(row.protectionReasonSafe,'NONE');assert.equal(row.availabilityConfirmed,true);assert.equal(row.insideEffectiveTemporalInterval,true);}
  assert.deepEqual(plain(d.adaptations.map(a=>[a.adaptationId,a.candidateMethodsAfterTemporalCalendar,a.candidateMethodsAfterFeasibility])),[
    ['recuperacion_activa',['running_recovery'],[]],['tecnica',['box_technique'],[]]]);
  assert.equal(d.rejectedIntents.length,5);assert.ok(d.rejectedIntents.every(r=>r.errorCodes.includes('MOVEMENT_POOL_EMPTY')));
});
test('same normalized inputs, empty restrictions only restores both methods; causal simulations never bypass feasibility',async()=>{
  const f=fixture(true), loaded=await prepare.loadWeeklyPlanningContext(f.db,'fixture',f.request);
  const input=loaded.input, empty=structuredClone(input);
  for(const context of Object.values(empty.contexts)) {
    context.restrictionsSnapshot.restrictions=[];context.restrictionsSnapshot.reassessments=[];context.restrictionsSnapshot.areas=[];
  }
  const before=JSON.stringify(input), base=api.buildAllowedWeeklyPlanContract(input);
  assert.equal(base.code,'NO_NEW_EXECUTABLE_PRESCRIPTION');assert.equal(JSON.stringify(input),before);
  const result=api.buildAllowedWeeklyPlanContract(empty);assert.equal(result.ok,true);
  const contract=result.contract;
  assert.deepEqual(plain([...new Set(Object.values(contract.dayOptions).flat().flatMap(o=>o.intent?.kind==='adaptation'?[o.intent.methodId]:[]))]).sort(),['box_technique','running_recovery']);
  assert.deepEqual(plain(diagnostic.countRemainingSelections(contract)),{candidateSelectionCount:'32',calendarValidSelectionCount:'31',validSelectionCount:'31'});
  // E3: no REST on future managed days, retaining only already admitted options.
  const noRest=structuredClone(contract);
  for(const day of noRest.regeneration.pendingManagedDays)noRest.dayOptions[day]=noRest.dayOptions[day].filter(o=>o.state!=='REST');
  assert.equal(diagnostic.countRemainingSelections(noRest).validSelectionCount,'1');
  // E4: an artificial cost can only rank this same feasible set, never add options to it.
  const enumerate=(c)=>days.reduce((rows,day)=>rows.flatMap(row=>c.dayOptions[day].map(o=>[...row,o])),[[]]);
  const schedules=enumerate(contract).filter(row=>row.some(o=>!o.protected&&['TRAIN','RECOVERY'].includes(o.state)));
  schedules.sort((a,b)=>a.filter(o=>!o.protected&&o.state==='REST').length*10000-b.filter(o=>!o.protected&&o.state==='REST').length*10000);
  assert.equal(schedules[0].filter(o=>!o.protected&&['TRAIN','RECOVERY'].includes(o.state)).length,5);
  for(const method of ['box_technique','running_recovery']) {
    const forced=structuredClone(contract),day=days.find(d=>forced.dayOptions[d].some(o=>o.intent?.methodId===method));
    forced.dayOptions[day]=forced.dayOptions[day].filter(o=>o.intent?.methodId===method);
    assert.equal(diagnostic.countRemainingSelections(forced).validSelectionCount,'16');
  }
  // None of E3-E6 restores an executable method to the controlled blocked domain.
  const blockedContract=structuredClone(contract);
  for(const day of days)blockedContract.dayOptions[day]=blockedContract.dayOptions[day].filter(o=>o.protected||o.state==='REST');
  assert.equal(diagnostic.countRemainingSelections(blockedContract).validSelectionCount,'0');
  for(const day of blockedContract.regeneration.pendingManagedDays)blockedContract.dayOptions[day]=[];
  assert.equal(diagnostic.countRemainingSelections(blockedContract).validSelectionCount,'0');
});
test('feasible options can fail the ceiling: diagnostic does not incorrectly blame feasibility',async()=>{
  const f=fixture(), loaded=await prepare.loadWeeklyPlanningContext(f.db,'fixture',f.request);
  const input=loaded.input;input.fixed.martes={state:'TRAIN',discipline:'box'};input.maxExecutableDays=1;events.length=0;
  assert.equal(api.buildAllowedWeeklyPlanContract(input).code,'NO_NEW_EXECUTABLE_PRESCRIPTION');
  const d=events.at(-1)[1];assert.equal(d.availableNewExecutableDays,5);assert.equal(d.validSelectionCount,'0');assert.equal(d.rejectedIntents.length,0);
});
test('sink failure is neutral and diagnostic fields reject arbitrary prose',async()=>{
  const f=fixture(true), loaded=await prepare.loadWeeklyPlanningContext(f.db,'fixture',f.request);
  const input=loaded.input;
  const throwing=sportsRuntime({console:{info(){throw Error('SINK')}}})('../planning/allowedWeeklyPlanContract');
  assert.deepEqual(plain(throwing.buildAllowedWeeklyPlanContract(input)),plain(api.buildAllowedWeeklyPlanContract(input)));
  const good=fixture(), goodInput=(await prepare.loadWeeklyPlanningContext(good.db,'fixture',good.request)).input;
  const contract=api.buildAllowedWeeklyPlanContract(goodInput).contract;
  const d=diagnostic.buildRemainingDiagnostic(goodInput,contract,[],{today:'SECRET',planningRunId:'SECRET',snapshot:{sessions:[{dia:'miercoles',tipo:'SECRET',titulo:'SECRET'}]}});
  assert.ok(!JSON.stringify(d).includes('SECRET'));assert.equal(d.calendar[2].availabilityConfirmed,false);
});

test('D1 D4: viable result emits feasible methods and exact counts, without selecting a schedule',async()=>{
  events.length=0;
  const f=fixture(), result=await prepare.prepareAllowedWeeklyPlanContract(f.db,'fixture',f.request);
  assert.equal(result.ok,true);
  const logs=events.filter(e=>e[0]==='WEEKLY_REMAINING_SELECTION_DIAGNOSTIC');assert.equal(logs.length,1);
  const d=logs[0][1];assert.equal(d.reason,null);assert.equal(d.validSelectionCount,'31');
  assert.deepEqual(plain(d.adaptations.flatMap(a=>a.candidateMethodsAfterFeasibility)).sort(),['box_technique','running_recovery']);
  assert.equal(d.selectedStatesByDay,null);assert.equal(d.availableNewExecutableDays,5);
});

test('D5: enabled/disabled/throwing/serialization-failing diagnostics preserve outcome, digest, inputs and feasibility call count',async()=>{
  for(const blocked of [false,true]) {
    const f=fixture(blocked), input=(await prepare.loadWeeklyPlanningContext(f.db,'fixture',f.request)).input;
    const before=JSON.stringify(input), results=[];
    for(const mode of ['disabled','enabled','sink_failure','serialization_failure','projection_failure']) {
      let calls=0;
      const runtime=sportsRuntime({console:{info(...args){
        if(mode==='sink_failure')throw Error('SINK');
        if(mode==='serialization_failure')JSON.stringify(args,()=>{throw Error('SERIALIZATION');});
      }}});
      const testModule={exports:{}};
      vm.runInNewContext(compile(readFileSync('lib/planning/allowedWeeklyPlanContract.ts','utf8')),{
        module:testModule,exports:testModule.exports,structuredClone,
        require(name){
          if(name==='node:crypto')return {createHash};
          if(name==='./weeklyRemainingDiagnostic'&&mode==='disabled')return {emitRemainingDiagnostic(){}};
          if(name==='../sports/trainingFeasibility')return {evaluateTrainingFeasibility(...args){calls++;return runtime('trainingFeasibility').evaluateTrainingFeasibility(...args);}};
          return runtime(name.startsWith('./')?'../planning/'+name.slice(2):name);
        }
      });
      const context=mode==='projection_failure'?{get snapshot(){throw Error('PROJECTION');}}:{};
      const result=testModule.exports.buildAllowedWeeklyPlanContract(input,context);
      results.push({result:plain(result),calls});
      assert.equal(JSON.stringify(input),before);
    }
    assert.equal(results[0].calls,5);
    for(const result of results.slice(1))assert.deepEqual(result,results[0]);
  }
});

test('D6: full serialized projection excludes forbidden fields and unknown string values at every boundary',async()=>{
  const f=fixture(), input=(await prepare.loadWeeklyPlanningContext(f.db,'fixture',f.request)).input;
  const contract=api.buildAllowedWeeklyPlanContract(input).contract;
  const forbidden=['userId','codigo','email','goalFreeText','clinicalNote','restrictionText','descripcion','titulo','prompt','token','generationToken','receipt','physiology'];
  const poison=Object.fromEntries(forbidden.map(k=>[k,'PRIVATE_SENTINEL']));
  Object.assign(input,poison);Object.assign(contract,poison);Object.assign(input.strategy,poison);
  input.strategy.methods.push('PRIVATE_SENTINEL');input.strategy.adaptations.push({id:'PRIVATE_SENTINEL',requiredPattern:'PRIVATE_SENTINEL'});
  contract.regeneration.pendingManagedDays.push('PRIVATE_SENTINEL');
  for(const context of Object.values(input.contexts)){
    Object.assign(context,poison);Object.assign(context.restrictionsSnapshot,poison);
    context.restrictionsSnapshot.areas.push('PRIVATE_SENTINEL');
    context.restrictionsSnapshot.restrictions.push({...poison,movement:'PRIVATE_SENTINEL',prohibits_impact:true});
  }
  const rejected=[{...poison,day:'PRIVATE_SENTINEL',discipline:'PRIVATE_SENTINEL',methodId:'PRIVATE_SENTINEL',adaptationId:'PRIVATE_SENTINEL',requiredPattern:'PRIVATE_SENTINEL',feasible:false,errorCodes:['PRIVATE_SENTINEL']}];
  const context={...poison,planningRunId:'PRIVATE_SENTINEL',today:'PRIVATE_SENTINEL',snapshot:{sessions:[{...poison,dia:'miercoles',tipo:'PRIVATE_SENTINEL'}]}};
  const before=JSON.stringify({input,contract,rejected,context});
  const serialized=JSON.stringify(diagnostic.buildRemainingDiagnostic(input,contract,rejected,context));
  assert.ok(!serialized.includes('PRIVATE_SENTINEL'));
  for(const key of forbidden)assert.ok(!serialized.includes(JSON.stringify(key)+':'),key);
  for(const key of ['snapshot','contexts','contextDigest','restrictionsSnapshot'])assert.ok(!serialized.includes(JSON.stringify(key)+':'),key);
  assert.equal(JSON.stringify({input,contract,rejected,context}),before);
});

import { numericPolicyFixture } from '../sports/runningDoseV2TestFixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sportsRuntime, fakeDatabase, plain } from '../sports/trainingContractTestRuntime.mjs';
const load=sportsRuntime({console:{log(){},warn(){},info(){}}},numericPolicyFixture);
const prep=load('../planning/prepareAllowedWeeklyPlanContract');
const api=load('../planning/allowedWeeklyPlanContract');
const cal=load('../planning/weeklyCalendar');
const effects=load('../planning/weeklyRegeneration');
const days=cal.calendarDays;
const availability={carrera:['lunes','miercoles','domingo'],box:['martes','jueves','viernes','sabado']};
function fixture(restricted=false){
 const tables={usuarios:{modo_entrada:'coach',categoria:'funcional',especialidad:'funcional_crossfit',
  objetivo_principal:{descripcion:'CrossFit Games'},perfil:{},workout_history:[],ciclo_actual:{bloque:'deload'},distribucion_semanal:availability},
  athlete_training_sources:Object.entries(availability).map(([disciplina,dias])=>({disciplina,dias,owner:'forge',activo:true})),
  weekly_plan:[],physiology_records:[],session_modification_events:[],athlete_coaching_notes:[],athlete_state_events:[]};
 const db=fakeDatabase(tables),from=db.from.bind(db);
 db.from=t=>{const q=from(t);q.insert=q.update=()=>{throw Error('NO_WRITES')};if(['weekly_plan','physiology_records'].includes(t))q.maybeSingle=async()=>({data:null,error:null});return q;};
 const sessions=days.map((dia,i)=>({dia,tipo:i===1?'box':'descanso',completada:i===1}));
 return {db,tables,sessions,restricted};
}
async function context(f=fixture(),patch={}) {
 const r=await prep.loadWeeklyPlanningContext(f.db,'fixture',{targetWeekStart:'2026-09-07',today:'2026-09-08',empezarHoy:true,snapshot:{sessions:f.sessions},strategyVersion:1,...patch});
 assert.equal(r.ok,true,JSON.stringify(r));return r;
}
function proposal(c,options){return {contractVersion:1,contextDigest:c.contextDigest,selections:days.map((day,i)=>({day,optionId:options[i].optionId}))};}
function choices(c){const results=[];function visit(i,options){if(i===7){const p=proposal(c,options);if(api.validateWeeklySelection(c,p).ok)results.push(p);return;}for(const o of c.dayOptions[days[i]])visit(i+1,[...options,o]);}visit(0,[]);return results;}
test('R2 R3 R4: active regeneration releases future old states, preserves completed and historical REST',async()=>{
 const f=fixture();f.sessions[2]={dia:'miercoles',tipo:'carrera',stimulusId:'recuperacion_activa'};
 f.sessions[6]={dia:'domingo',tipo:'sin_registrar'};
 const before=JSON.stringify(f.sessions),r=await context(f);
 assert.equal(r.fixedSessions.martes.completada,true);assert.equal(r.fixedSessions.lunes.tipo,'descanso');
 for(const d of ['miercoles','domingo'])assert.equal(r.fixedSessions[d],undefined);
 const c=api.buildAllowedWeeklyPlanContract(r.input);assert.equal(c.ok,true);
 for(const d of ['miercoles','domingo'])assert.ok(c.contract.dayOptions[d].some(o=>o.state==='RECOVERY'&&!o.protected));
 assert.equal(JSON.stringify(f.sessions),before);
});
test('R1 R5: unavailable movement pool cannot be relaxed by a completed TRAIN',async()=>{
 const r=await context();
 const movements=Object.values(load('movementLibrary').MOVEMENT_LIBRARY);
 for(const c of Object.values(r.input.contexts))c.restrictionsSnapshot.restrictions=movements.map(m=>({movement:m.id}));
 const result=api.buildAllowedWeeklyPlanContract(r.input);
 assert.equal(result.ok,false);assert.equal(result.code,'NO_NEW_EXECUTABLE_PRESCRIPTION');assert.equal(result.canContinue,false);
});
test('R6: actual strategy requires new work and exposes preserved/new counts',async()=>{
 const {input}=await context();const built=api.buildAllowedWeeklyPlanContract(input);assert.equal(built.ok,true);
 const c=built.contract;assert.equal(c.frequencyPolicy.minExecutableDays,1);
 const empty=proposal(c,days.map(d=>c.dayOptions[d][0]));
 assert.equal(api.validateWeeklySelection(c,empty).code,'NO_NEW_EXECUTABLE_PRESCRIPTION');
 const all=choices(c);assert.ok(all.length);
 for(const p of all){const r=api.validateWeeklySelection(c,p);assert.equal(r.preservedExecutableDays,1);assert.ok(r.newExecutableDays>0);}
 const planned=await prep.planBoundedWeek(fixture().db,'fixture',{targetWeekStart:'2026-09-07',today:'2026-09-08',empezarHoy:true,snapshot:{sessions:fixture().sessions},strategyVersion:1},async prompt=>{
  const contract=JSON.parse(prompt.split('WEEKLY_CONTRACT:\n')[1].split('\nPropuesta rechazada:')[0]);return JSON.stringify(choices(contract)[0]);});
 assert.equal(planned.ok,true);assert.ok(planned.estructura.sessions.some(s=>!s.weeklyProtected&&s.stimulusId));
});
test('R7: no remaining managed days is a structured no-op before Planner',async()=>{
 const f=fixture();f.tables.athlete_training_sources.forEach(s=>s.dias=s.disciplina==='box'?['martes']:[]);
 const r=await prep.planBoundedWeek(f.db,'fixture',{targetWeekStart:'2026-09-07',today:'2026-09-08',empezarHoy:true,snapshot:{sessions:f.sessions},strategyVersion:1},async()=>{throw Error('NO_PLANNER')});
 assert.equal(r.code,'WEEKLY_REGENERATION_NO_OP');assert.equal(r.noOp,true);assert.equal(r.canContinue,false);
});
test('new option outside remaining calendar capacity is no-prescription',async()=>{
 const {input}=await context();input.maxExecutableDays=1;
 assert.equal(api.buildAllowedWeeklyPlanContract(input).code,'NO_NEW_EXECUTABLE_PRESCRIPTION');
});
test('R8: assembly diagnostics never equate slots with constructed prescriptions',()=>{
 const ui=readFileSync('app/FormaPro.tsx','utf8');assert.ok(!ui.includes('sesiones completas construidas:'));
 for(const field of ['builderTargets','builderSuccesses','preserved','rest','unavailable','assembledSlots'])assert.ok(ui.includes(field+':'));
});
test('outcome distinguishes no-op, no-prescription, cap and technical failure',()=>{
 const results=[effects.noWeeklyPrescription('NO_REMAINING_MANAGED_DAYS'),effects.noWeeklyPrescription('NO_FEASIBLE_REMAINING_SELECTION'),{reason:'MAX_GENERATIONS_REACHED'},null];
 assert.equal(new Set(results.map(effects.weeklyGenerationOutcomeMessage)).size,4);
 assert.deepEqual(plain(effects.executablePrescriptionCounts([{state:'TRAIN',protected:true},{state:'RECOVERY'},{state:'REST'}])),{preservedExecutableDays:1,newExecutableDays:1});
});
test('save failures keep their deterministic outcome instead of the generic technical fallback',()=>{
 assert.match(effects.weeklyGenerationOutcomeMessage({code:'GENERATION_LOG_READ_FAILED'}),/límite de generaciones/);
 assert.match(effects.weeklyGenerationOutcomeMessage({code:'PLAN_PERSISTENCE_UNKNOWN'}),/confirmar/);
 assert.doesNotMatch(effects.weeklyGenerationOutcomeMessage({code:'PLAN_PERSISTENCE_UNKNOWN'}),/error técnico/);
});

test('R7: completed week is no-op even when historical count exceeds current prescription ceiling',async()=>{
 const f=fixture();f.sessions=days.map(dia=>({dia,tipo:availability.box.includes(dia)?'box':'carrera',completada:true}));
 const r=await context(f,{today:'2026-09-13'});
 const built=api.buildAllowedWeeklyPlanContract(r.input);
 assert.equal(built.code,'WEEKLY_REGENERATION_NO_OP');assert.equal(built.noOp,true);
});
test('Planner cannot select history-only twice and report effective regeneration',async()=>{
 const {input}=await context(),c=api.buildAllowedWeeklyPlanContract(input).contract;let calls=0;
 const r=await api.composeBoundedWeek(c,async()=>{calls++;return JSON.stringify(proposal(c,days.map(d=>c.dayOptions[d][0])));});
 assert.equal(calls,2);assert.equal(r.code,'NO_NEW_EXECUTABLE_PRESCRIPTION');assert.equal(r.reason,'NO_NEW_EXECUTABLE_SELECTION');
});

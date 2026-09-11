import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {sportsRuntime,compile,plain} from '../sports/trainingContractTestRuntime.mjs';
const reader=sportsRuntime()('../trainingLoad/loadTrainingLoad').loadTrainingLoad;
function database(overrides={},failure){
  const tables={running_execution_records:[],usuarios:{workout_history:[],ciclo_actual:{bloque:'Base'}},weekly_plan:[],external_training_records:[],session_modification_events:[],...overrides},calls=[];
  return {calls,from(table){
    assert.ok(Object.hasOwn(tables,table),`unexpected table ${table}`);
    const call={table,filters:[]};calls.push(call);let start=0,end=Infinity;
    const response=()=>({data:table==='usuarios'?tables[table]:tables[table].slice(start,end+1),error:table===failure?{message:'failed'}:null});
    return {select(){return this;},eq(k,v){call.filters.push([k,v]);return this;},gte(){return this;},lte(){return this;},order(){return this;},limit(){return this;},range(a,b){start=a;end=b;call.range=[a,b];return this;},single:async()=>response(),then:(yes,no)=>Promise.resolve(response()).then(yes,no)};
  }};
}
const read=db=>reader(db,'athlete','2026-09-07','2026-09-13');
test('completed legacy plan is planned unknown, never executed as prescribed',async()=>{
  const r=await read(database({weekly_plan:[{id:'p',week_start:'2026-09-07',sessions:[{dia:'lunes',tipo:'box',completada:true,descripcion:'5x5 100kg'}]}]}));
  assert.equal(r.planned.load.planned.sessionCount,1);assert.equal(r.actual.history.load.actual.sessionCount,0);
  assert.equal(r.planned.sessions[0].vector.externalVolumeKg.status,'unknown');assert.equal(r.completionFacts[0].completed,true);
});
test('history and external records on same day stay separate without execution relation',async()=>{
  const r=await read(database({usuarios:{workout_history:[{workout_id:'p',fecha:'2026-09-07',tipo:'box',duracion:60,notas:'igual al plan'}]},
    external_training_records:[{id:'e',fecha:'2026-09-07',disciplina:'cycling',duracion:60,intensidad_percibida:6}]}));
  assert.equal(r.actual.combined,null);assert.equal(r.actual.combinedStatus,'unknown_cross_source_overlap');
  assert.equal(r.actual.history.sessions[0].vector.durationSeconds.status,'unknown');
  assert.equal(r.actual.external.sessions[0].vector.sessionRpeMinutes.minimum,360);
});
test('two external activities on same date aggregate once each and retain domains',async()=>{
  const r=await read(database({external_training_records:[{id:'a',fecha:'2026-09-07',disciplina:'cycling',duracion:60},{id:'b',fecha:'2026-09-07',disciplina:'powerlifting',duracion:40}]}));
  const daily=r.actual.external.load.actual.byDate['2026-09-07'];assert.equal(daily.sessionIds.length,2);assert.equal(daily.vector.durationSeconds.minimum,6000);
  assert.equal(r.weeks.externalActual['2026-09-07'].load.actual.sessionCount,2);
  assert.equal(r.block.status,'identity_unresolved_no_persistence');assert.equal(r.cycle.status,'identity_unresolved_no_persistence');
  assert.deepEqual(plain(r),JSON.parse(JSON.stringify(r)));
});
test('text modification records cannot manufacture execution quantities',async()=>{
  const r=await read(database({session_modification_events:[{id:'m',week_start:'2026-09-07',dia:'lunes',original_tipo:'box',modified_tipo:'cycling'}]}));
  assert.equal(r.modifications[0].loadStatus,'unknown_text_only');assert.equal(r.actual.history.load.actual.sessionCount,0);
});
test('pagination reads every external session, scoped to requested athlete',async()=>{
  const db=database({external_training_records:Array.from({length:501},(_,i)=>({id:String(i),fecha:'2026-09-07',duracion:1}))});
  const r=await read(db);assert.equal(r.actual.external.load.actual.sessionCount,501);assert.equal(r.actual.external.load.actual.vector.durationSeconds.minimum,30060);
  assert.equal(db.calls.filter(c=>c.table==='external_training_records').length,2);
  assert.ok(db.calls.every(c=>c.filters.some(([key,value])=>['codigo','user_codigo'].includes(key)&&value==='athlete')));
});
test('read errors fail closed instead of showing a zero total',async()=>assert.rejects(()=>read(database({},'external_training_records')),/READ_FAILED/));
test('malformed plan day fails closed',async()=>assert.rejects(()=>read(database({weekly_plan:[{id:'p',week_start:'2026-09-07',sessions:[{dia:'inventado'}]}]})),/PLAN_DAY_INVALID/));
test('invalid history dates are explicitly excluded',async()=>{
  const r=await read(database({usuarios:{workout_history:[{fecha:'no-date'}]}}));assert.ok(r.diagnostics.includes('history:0:date_unknown'));
});
for(const [from,to] of [['2026-02-30','2026-03-01'],['2026-09-14','2026-09-07'],['2026-01-01','2026-09-07']])test(`invalid window ${from} ${to} rejected before reads`,async()=>{
  const db=database();await assert.rejects(()=>reader(db,'athlete',from,to),/INVALID_WINDOW/);assert.equal(db.calls.length,0);
});
const source=readFileSync('app/api/chat/route.ts','utf8'),root=ts.createSourceFile('route.ts',source,ts.ScriptTarget.Latest,true);
function find(n){if(ts.isIfStatement(n)&&n.expression.getText(root)==='action === "obtener_carga_entrenamiento"')return n;return ts.forEachChild(n,find);}
for(const mode of ['coach','focus','supervision'])test(`shared route reads load in ${mode} without prescribing or writing`,async()=>{
  const db=database({usuarios:{modo_entrada:mode,workout_history:[]}});
  const execute=vm.runInNewContext(compile(`async function execute() ${find(root).thenStatement.getText(root)};execute;`),{
    datos:{fromDate:'2026-09-07',toDate:'2026-09-13'},codigo:'athlete',supabase:db,loadTrainingLoad:reader,NextResponse:{json:body=>plain(body)}});
  const result=await execute();assert.equal(result.ok,true);assert.equal(result.report.schemaVersion,1);assert.equal(db.calls.length,5);
});

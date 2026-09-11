import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sportsRuntime, compile, plain } from '../sports/trainingContractTestRuntime.mjs';
import { planningTestRuntime, withPlanIdentity } from '../planning/planningTestRuntime.mjs';
const temporal = sportsRuntime()('../execution/reportExecutionDate');
const today='2026-09-09';
for(const [text,date] of [
  ['hoy hice carrera',today],['el martes hice fuerza','2026-09-08'],['ayer hice carrera','2026-09-08'],
  ['el 7 de septiembre hice carrera','2026-09-07'],['el 2026-09-07 hice carrera','2026-09-07'],
  ['He terminado tres series de fuerza',today],['el otro día hice carrera',null],['hice fuerza',null],
  ['el lunes o martes hice carrera',null],['el 31 de septiembre hice carrera',null],['el 10 de septiembre hice carrera',null],
  ['el martes de la semana pasada hice fuerza',null],['He terminado la sesión del 8/9/2026',null],
  ['He terminado el lunes de hace dos semanas',null]]) test(text,()=>assert.equal(temporal.resolveReportExecutionDate(text,today),date));
test('Monday/Tuesday clauses have independent dates, including a Wednesday negation',()=>{
  const rows=temporal.splitExecutionReports('el lunes hice carrera y el martes hice fuerza y hoy no entrené',today);
  assert.deepEqual(plain(rows.map(r=>r.date)),['2026-09-07','2026-09-08',today]);
});
test('relative day crosses week, month and Canary year boundaries',()=>{
  assert.equal(temporal.resolveReportExecutionDate('ayer hice fuerza','2026-01-01'),'2025-12-31');
  assert.equal(temporal.resolveReportExecutionDate('el domingo hice fuerza','2026-09-07'),'2026-09-06');
});
class FixedDate extends Date { constructor(...args){super(...(args.length?args:['2026-09-09T12:00:00Z']));} }
const load=planningTestRuntime({Date:FixedDate}),completion=load('recordCompletion');
const route=ts.createSourceFile('route.ts',readFileSync('app/api/chat/route.ts','utf8'),ts.ScriptTarget.Latest,true);
function find(n){if(ts.isIfStatement(n)&&n.expression.getText(route)==='action === "verificar_sesion_completada_deterministico"')return n;return ts.forEachChild(n,find);}
async function report(message){
  let plan=withPlanIdentity({user_codigo:'FORGE12',week_start:'2026-09-07',sessions:[
    {dia:'lunes',tipo:'carrera',titulo:'Rodaje',descripcion:'Carrera prevista',completada:false},
    {dia:'martes',tipo:'box',titulo:'Box',descripcion:'Fuerza prevista',completada:false},
    {dia:'miercoles',tipo:'carrera',titulo:'running_specific',descripcion:'resistencia_especifica',completada:false}
  ]}),history=[];
  const original=plain(plan),calls=[],writes=[];
  const db={from(table){let payload;const filters={};const q={select(){return q;},eq(k,v){filters[k]=v;return q;},single(){return q;},maybeSingle(){return q;},update(p){payload=p;return q;},then(y,n){return Promise.resolve().then(()=>{
    if(payload){writes.push(table);if(table==='usuarios')history=plain(payload.workout_history);else {assert.equal(filters.revision,plan.revision);plan=plain({...plan,...payload});}}
    return {data:table==='usuarios'?{codigo:'FORGE12',workout_history:history}:plan,error:null};
  }).then(y,n);}};return q;}};
  const run=vm.runInNewContext(compile(`async function run() ${find(route).thenStatement.getText(route)};run;`),{
    ...temporal,...completion,Date:FixedDate,codigo:'FORGE12',datos:{mensaje:message},supabase:db,apiKey:'test',console:{log(){},error(){}},
    NextResponse:{json:(body,init)=>({body,status:init?.status||200})},fetch:async(_url,request)=>{
      const prompt=JSON.parse(request.body).messages[0].content;calls.push(prompt);
      const strength=prompt.includes('Mensaje: "martes') || prompt.includes('Mensaje: "el martes');
      return {ok:true,json:async()=>({content:[{text:JSON.stringify({es_reporte_entreno:true,tipo:strength?'Entrenamiento de fuerza':'carrera',notas:strength?'Sesión de 45:09':'Rodaje aeróbico 6.3km',fecha:'2099-01-01'})}]})};
    }
  });
  return {response:plain(await run()),plan,history,original,calls,writes};
}
test('FORGE12 actual route: two past reports, no Wednesday completion, preservation retains planned and actual',async()=>{
  const r=await report('el lunes hice carrera y el martes hice fuerza y hoy no entrené');
  assert.equal(r.response.body.ok,true,JSON.stringify(r.response));assert.equal(r.calls.length,2);
  assert.deepEqual(r.history.map(r=>r.fecha),['2026-09-07','2026-09-08']);
  assert.equal(r.history[0].reported_at,'2026-09-09T12:00:00.000Z');
  assert.deepEqual(r.plan.sessions.map(s=>s.completada),[true,true,false]);
  assert.deepEqual(r.plan.sessions.map(s=>s.titulo_real??null),['carrera','Entrenamiento de fuerza',null]);
  assert.deepEqual(r.plan.sessions[2],r.original.sessions[2]);
  const preparation=load('prepareWeeklyCandidate');
  const preserved=preparation.prepareWeeklyEntries(r.plan.sessions,r.plan).map(e=>preparation.entrySession(e,r.plan));
  assert.deepEqual(plain(preserved),r.plan.sessions);
  assert.deepEqual(r.plan.sessions.map(s=>s.descripcion),r.original.sessions.map(s=>s.descripcion));
});
test('ambiguous extracted workout is unresolved without history/plan writes',async()=>{
  const r=await report('el otro día hice carrera');
  assert.equal(r.response.body.code,'EXECUTION_DATE_UNRESOLVED');assert.equal(r.response.body.clarificationRequired,true);
  assert.equal(r.writes.length,0);assert.deepEqual(r.plan,r.original);
});

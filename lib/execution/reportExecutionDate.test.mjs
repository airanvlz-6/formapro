import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sportsRuntime, compile, plain } from '../sports/trainingContractTestRuntime.mjs';
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
for (const action of ['verificar_sesion_completada_deterministico','marcar_sesion_completada'])
test(action+' requires a confirmed canonical request without database or provider calls',async()=>{
  const source=readFileSync('app/api/chat/route.ts','utf8');
  const ast=ts.createSourceFile('route.ts',source,ts.ScriptTarget.Latest,true);
  let branch;function find(n){if(ts.isIfStatement(n)&&n.expression.getText(ast).includes('verificar_sesion_completada_deterministico'))branch=n;ts.forEachChild(n,find);}find(ast);
  assert.ok(branch);const writes=[];
  const run=vm.runInNewContext(compile('async function run() {'+branch.getText(ast)+'};run;'),{
    action,NextResponse:{json:body=>body},supabase:{from(){writes.push('write');throw Error('Unexpected database');}},fetch(){throw Error('Unexpected provider');}});
  const r=await run();
  assert.equal(r.ok,false);assert.equal(r.code,'WORKOUT_CONFIRMED_REQUEST_REQUIRED');
  assert.equal(r.historyRecorded,false);assert.equal(r.planCompleted,false);assert.equal(r.detectado,false);
  assert.deepEqual(writes,[]);
});

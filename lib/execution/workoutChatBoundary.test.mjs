import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {sportsRuntime,compile} from '../sports/trainingContractTestRuntime.mjs';
const findAll=(node,predicate,out=[])=>{if(predicate(node))out.push(node);ts.forEachChild(node,n=>{findAll(n,predicate,out);});return out;};

test('retired chat CRUD and extractors return a form link before database or provider access',async()=>{
  const source=ts.createSourceFile('route.ts',readFileSync('app/api/chat/route.ts','utf8'),99,true);
  const branch=findAll(source,n=>ts.isIfStatement(n)&&n.expression.getText(source).includes("'registrar_sesion'")&&n.expression.getText(source).includes('.includes(action)'))[0];
  assert.ok(branch);
  for(const action of ['registrar_sesion','borrar_ultima_sesion','borrar_sesion_fecha','verificar_carga_externa_deterministico','extraer_sesion_imagen']){
    const run=vm.runInNewContext(compile('async function run(){'+branch.getText(source)+'};run;'),{
      action,datos:{confirmed:true,requestId:'attempt'},NextResponse:{json:body=>body},
      supabase:{from(){assert.fail('Chat database mutation');}},fetch(){assert.fail('Chat provider extraction');}});
    const r=await run();assert.equal(r.ok,false);assert.equal(r.historyRecorded,false);assert.equal(r.code,'WORKOUT_FORM_REQUIRED');assert.equal(r.url,'/entrenamientos/registrar');
  }
});
test('web chat has no workout extraction/mutation calls or embedded recording form; links to the form',()=>{
  const source=ts.createSourceFile('FormaPro.tsx',readFileSync('app/FormaPro.tsx','utf8'),99,true,ts.ScriptKind.TSX);
  const retired=['registrar_sesion','borrar_sesion_fecha','borrar_ultima_sesion','extraer_sesion_imagen','verificar_sesion_completada_deterministico','verificar_carga_externa_deterministico','marcar_sesion_completada'];
  const actions=findAll(source,n=>ts.isCallExpression(n)&&n.expression.getText(source)==='apiCall').flatMap(n=>
    ts.isObjectLiteralExpression(n.arguments[0])?n.arguments[0].properties.filter(p=>p.name?.getText(source)==='action').map(p=>p.initializer?.text):[]);
  assert.equal(actions.filter(a=>retired.includes(a)).length,0);
  assert.doesNotMatch(source.text,/<RunningExecutionReport|<WorkoutForm|<WorkoutRegisterButton/);
  assert.match(source.text,/href="\/entrenamientos\/registrar"/);
  const schema=sportsRuntime()('../chat/coachFirstOutput').COACH_FIRST_OUTPUT_TOOL;
  assert.ok(!schema.input_schema.properties.mutationIntents.items.enum.includes('record_execution'));
});
for(const kind of ['record_performed','record_response'])test(kind+' cannot create or edit workout evidence from the LLM',async()=>{
  const actions=sportsRuntime()('../chat/chatCoachActions');
  const result=await actions.applyChatCoachActions({from(){assert.fail('Workout evidence write');}},'a','He terminado',
    [{kind,date:'2026-09-30'}],()=>assert.fail('Provider'), '2026-09-30');
  assert.equal(result[0].status,'form_available');assert.equal(result[0].receipt,undefined);
});

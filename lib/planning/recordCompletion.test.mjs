import test from 'node:test';
import assert from 'node:assert/strict';
import {sportsRuntime, plain} from '../sports/trainingContractTestRuntime.mjs';
const {recordPlanCompletion,recordExternalExecution,resolveCompletionDate}=sportsRuntime()('../planning/recordCompletion');
const fixedTime='2026-09-06T23:30:00.000Z';
test('Canary civil dates and explicit-offset timestamps resolve independently of process timezone', () => {
  for (const value of [fixedTime, '2026-09-07', '2026-09-07T00:30:00+01:00']) {
    assert.deepEqual(plain(resolveCompletionDate(value)), { date: '2026-09-07', weekStart: '2026-09-07', day: 'lunes' });
  }
  assert.equal(resolveCompletionDate('2026-01-04T23:30:00Z').day, 'domingo');
  assert.equal(resolveCompletionDate('2026-03-29T00:30:00Z').date, '2026-03-29');
  for (const value of ['', null, {}, '2026-02-30', '2026-09-07T00:30:00', '2026-09-07T24:30:00Z']) assert.equal(resolveCompletionDate(value), null);
});

for(const source of ['explicit_completion','deterministic_completion']) test(source+' cannot resolve an execution by day or mutate prescription',async()=>{
  const db={from(){throw Error('Unexpected database access');}};
  const r=await recordPlanCompletion(db,{source,userCodigo:'synthetic',fecha:'2026-09-07',title:'Carrera',description:'Realizada'});
  assert.equal(r.ok,false);assert.equal(r.planCompleted,false);assert.equal(r.status,'WORKOUT_CONFIRMED_REQUEST_REQUIRED');
});
for(const data of [{}, {requestId:'stable'}, {confirmed:true}]) test('external report requires confirmed stable request '+JSON.stringify(data),async()=>{
  const r=await recordExternalExecution({from(){throw Error('Unexpected database');}},'synthetic',{
    date:'2026-09-07',description:'Entrenamiento',discipline:'box',result:'Completado',...data},
    {operationId:'tool:1',messageId:'message',message:'He terminado'},'2026-09-07');
  assert.equal(r.status,'confirmation_required');assert.equal(r.planCompleted,false);
});

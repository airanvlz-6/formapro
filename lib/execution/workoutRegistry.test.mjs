import {workoutSqlTestDatabase} from './workoutSqlTestDatabase.mjs';
import test, {before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {sportsRuntime, plain, compile} from '../sports/trainingContractTestRuntime.mjs';

const runtime = sportsRuntime();
const registry = runtime('../execution/workoutRegistry');
const store = runtime('../execution/runningExecutionStore');
const history = runtime('../execution/workoutHistory');
const recent = runtime('../core/recentTrainingEvidence');
const coach = runtime('../chat/coachFirstReads');
const load = runtime('../trainingLoad/loadTrainingLoad');
const today = '2026-09-30', athlete = 'synthetic-a';
let sql, db;
const workout = (extra={}) => ({executedOn:'2026-09-29',discipline:'box',title:'Entrenamiento',description:'Sentadilla 3 x 5',result:'Completado',loadKg:60,observations:'Sin molestias',...extra});
const request = (requestId='create-a',extra={}) => ({requestId,confirmed:true,workout:workout(extra)});
const create = (id,extra) => registry.recordWorkout(db,athlete,request(id,extra),today);
const edit = (r,requestId='edit-a',extra={}) => ({executionId:r.executionId,expectedRevision:r.revision,requestId,confirmed:true,workout:workout(extra)});
const remove = r => ({executionId:r.executionId,expectedRevision:r.revision,requestId:'delete-a',confirmed:true});
before(async()=>{
  sql = new PGlite();
  await sql.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE weekly_plan(id text PRIMARY KEY,user_codigo text,week_start text,sessions jsonb);
    CREATE TABLE usuarios(codigo text PRIMARY KEY,workout_history jsonb,ciclo_actual jsonb);
    CREATE TABLE external_training_records(id text,user_codigo text,fecha text);
    CREATE TABLE session_modification_events(id text,user_codigo text,week_start text,created_at text);`);
  await sql.exec(readFileSync('docs/sql/b32c-running-execution-records.sql','utf8'));
  await sql.exec(readFileSync('docs/sql/core-reg-1-workouts.sql','utf8'));
  await sql.exec(readFileSync('docs/sql/core-reg-pagination.sql','utf8'));
  db = workoutSqlTestDatabase(sql);
});
beforeEach(async()=>{
  await sql.exec('TRUNCATE running_execution_records,weekly_plan,usuarios;');
  await sql.query('INSERT INTO usuarios VALUES ($1,$2,$3)',[athlete,'[]','{}']);
  await sql.query('INSERT INTO usuarios VALUES ($1,$2,$3)',['synthetic-b','[]','{}']);
  await sql.query('INSERT INTO weekly_plan VALUES ($1,$2,$3,$4)',['plan-a',athlete,'2026-09-28',JSON.stringify([{session_id:'slot-a',dia:'martes',tipo:'box',titulo:'Prescripción',descripcion:'Original',completada:false},{session_id:'slot-b',dia:'miercoles',tipo:'box',titulo:'Otra',completada:false}])]);
  await sql.query('INSERT INTO weekly_plan VALUES ($1,$2,$3,$4)',['plan-b','synthetic-b','2026-09-28','[{"session_id":"slot-foreign"}]']);
});
after(async()=>{await sql.close();});

test('create: subscription independent, separate same-day IDs, replay and conflicting payload',async()=>{
  const a=await create(),b=await create('create-b');assert.notEqual(a.record.executionId,b.record.executionId);
  assert.equal((await create()).status,'already_applied');
  await assert.rejects(create('create-a',{result:'Different'}),/REQUEST_CONFLICT/);
  assert.equal((await registry.readWorkouts(db,athlete)).length,2);
  assert.equal(a.record.updatedAt,a.record.createdAt);assert.equal(a.record.revision,1);
});
test('SQL arbitration: concurrent duplicate create and revision contention',async()=>{
  const a=await Promise.all([create(),create()]);assert.equal(a.filter(r=>r.status==='committed').length,1);
  const results=await Promise.allSettled([registry.updateWorkout(db,athlete,edit(a[0].record,'edit-1'),today),registry.updateWorkout(db,athlete,edit(a[0].record,'edit-2',{loadKg:70}),today)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.match(results.find(r=>r.status==='rejected').reason.message,/REVISION_CONFLICT/);
});
test('edit load, results, observations, absence and date; same ID, incremented revision, replay without applying twice',async()=>{
  const a=await create();const input=edit(a.record,'edit-a',{loadKg:75,result:'4 x 5',observations:'Corregido',executedOn:'2026-09-27',rpe:0});
  const updated=await registry.updateWorkout(db,athlete,input,today);
  assert.equal(updated.record.executionId,a.record.executionId);assert.equal(updated.record.revision,2);
  assert.ok(updated.record.updatedAt>=a.record.updatedAt);assert.equal(updated.record.data.loadKg,75);
  assert.equal(updated.record.data.result,'4 x 5');assert.equal(updated.record.data.rpe,0);
  assert.equal((await registry.updateWorkout(db,athlete,input,today)).record.revision,2);
  await assert.rejects(registry.updateWorkout(db,athlete,{...input,requestId:'stale'},today),/REVISION_CONFLICT/);
  await assert.rejects(registry.updateWorkout(db,athlete,{...input,workout:workout()},today),/REQUEST_CONFLICT/);
  const absent=edit(updated.record,'edit-b');delete absent.workout.observations;
  assert.equal((await registry.updateWorkout(db,athlete,absent,today)).record.data.observations,undefined);
});
test('prescription create, replace, unlink, foreign reference; original plan never changes',async()=>{
  const before=(await sql.query('SELECT * FROM weekly_plan')).rows;
  const a=await create('a',{prescription:{planId:'plan-a',sessionId:'slot-a',relation:'performed'}});
  const b=await registry.updateWorkout(db,athlete,edit(a.record,'b',{prescription:{planId:'plan-a',sessionId:'slot-b',relation:'replaced'}}),today);
  assert.equal(b.record.data.prescription.sessionId,'slot-b');
  await assert.rejects(registry.updateWorkout(db,athlete,edit(b.record,'bad',{prescription:{planId:'plan-b',sessionId:'slot-foreign',relation:'performed'}}),today),/PRESCRIPTION_NOT_OWNED/);
  const c=await registry.updateWorkout(db,athlete,edit(b.record,'unlink'),today);assert.equal(c.record.data.prescription,undefined);
  assert.deepEqual((await sql.query('SELECT * FROM weekly_plan')).rows,before);
});
for(const linked of [false,true]) test(`delete ${linked?'planned':'unplanned'}: tombstone, replay, no resurrection, no active evidence`,async()=>{
  const a=await create('create-a',linked?{prescription:{planId:'plan-a',sessionId:'slot-a',relation:'performed'}}:{});
  const before=(await sql.query('SELECT * FROM weekly_plan')).rows;
  const deleted=await registry.deleteWorkout(db,athlete,remove(a.record),today);
  assert.ok(deleted.record.deletedAt);assert.equal(deleted.record.revision,2);
  assert.equal((await registry.deleteWorkout(db,athlete,remove(a.record),today)).status,'already_applied');
  assert.equal((await registry.deleteWorkout(db,athlete,{...remove(a.record),requestId:'again'},today)).status,'already_applied');
  assert.ok((await create('create-a',linked?{prescription:{planId:'plan-a',sessionId:'slot-a',relation:'performed'}}:{})).record.deletedAt);
  await assert.rejects(registry.updateWorkout(db,athlete,edit(deleted.record),today),/DELETED/);
  assert.equal((await history.readWorkoutHistory(db,athlete)).records.length,0);
  assert.equal((await recent.loadRecentTrainingEvidence(db,athlete,today)).items.filter(i=>i.state==='REPORTED_EXECUTED').length,0);
  assert.equal((await load.loadTrainingLoad(db,athlete,'2026-09-25',today)).actual.history.sessions.length,0);
  assert.deepEqual((await sql.query('SELECT * FROM weekly_plan')).rows,before);
});
test('foreign edit/delete and request IDs isolated per authenticated athlete',async()=>{
  const a=await create();
  await assert.rejects(registry.updateWorkout(db,'synthetic-b',edit(a.record),today),/NOT_FOUND/);
  await assert.rejects(registry.deleteWorkout(db,'synthetic-b',remove(a.record),today),/NOT_FOUND/);
  const b=await registry.recordWorkout(db,'synthetic-b',request(),today);assert.notEqual(b.record.executionId,a.record.executionId);
});
test('Coach sees corrected date/result immediately even through the same reader, history cursor and exact ID',async()=>{
  const a=await create(),b=await create('backdated',{executedOn:'2026-09-20'});
  const reads=coach.coachFirstReads(db,athlete,today);
  assert.equal((await reads.read({resource:'history',limit:1})).data.records[0].executionId,a.record.executionId);
  await registry.updateWorkout(db,athlete,edit(b.record,'correct',{executedOn:today,result:'Corregido'}),today);
  const latest=(await reads.read({resource:'history',limit:1})).data;
  assert.equal(latest.records[0].executionId,b.record.executionId);assert.equal(latest.records[0].result,'Corregido');
  assert.equal((await history.readWorkoutHistory(db,athlete,{cursor:latest.nextCursor,limit:1})).records[0].executionId,a.record.executionId);
  assert.equal((await history.readWorkoutHistory(db,athlete,{executionId:b.record.executionId})).records[0].revision,2);
});
test('structured running validation survives corrections, fresh signature, no stale evidence after delete',async()=>{
  const running={completeness:'FULL',quantities:{totalDuration:{value:30,unit:'minutes'}}};
  const a=await create('run',{discipline:'carrera',running});
  const corrected={...running,quantities:{totalDuration:{value:20,unit:'minutes'}}};
  const b=await registry.updateWorkout(db,athlete,edit(a.record,'edit-run',{discipline:'carrera',running:corrected}),today);
  const actual=await store.readRunningExecutions(db,athlete);assert.equal(actual.records.length,1);assert.equal(actual.records[0].quantities.totalDurationSeconds,1200);
  assert.equal(actual.conflicts.length,0);assert.equal(actual.records[0].executionId,a.record.executionId);
  await assert.rejects(registry.updateWorkout(db,athlete,edit(b.record,'bad',{discipline:'carrera',durationSeconds:900,running:corrected}),today),/METRIC_CONFLICT/);
  await assert.rejects(registry.updateWorkout(db,athlete,edit(b.record,'bad-unit',{discipline:'carrera',running:{...running,quantities:{totalDuration:{value:2,unit:'unknown'}}}}),today),/UNIT_UNKNOWN/);
  await registry.deleteWorkout(db,athlete,remove(b.record),today);
  assert.equal((await store.readRunningExecutions(db,athlete)).records.length,0);
});
test('v1 rows preserved, v2 other disciplines do not poison running verification',async()=>{
  const v1=store.sealRunningExecution(athlete,{sourceActivityId:'legacy',occurredAt:today,completeness:'FULL',quantities:{}},today);
  await sql.query('INSERT INTO running_execution_records(user_codigo,execution_id,content_digest,record,signature) VALUES ($1,$2,$3,$4,$5)',[athlete,v1.execution_id,v1.content_digest,JSON.stringify(v1.record),v1.signature]);
  await sql.query('UPDATE usuarios SET workout_history=$1 WHERE codigo=$2',[JSON.stringify([{workout_id:v1.execution_id,fecha:today,tipo:'carrera'}]),athlete]);
  await create();assert.equal((await store.readRunningExecutions(db,athlete)).records.length,1);
  assert.equal((await history.readWorkoutHistory(db,athlete)).records.length,2);
  const trainingLoad=await load.loadTrainingLoad(db,athlete,'2026-09-25',today);
  assert.equal(trainingLoad.actual.history.sessions.length,1);assert.equal(trainingLoad.actual.running.sessions.length,1);
  assert.equal((await recent.loadRecentTrainingEvidence(db,athlete,today)).items.filter(r=>r.source==='usuarios.workout_history').length,0);
  assert.deepEqual((await sql.query('SELECT record FROM running_execution_records WHERE record_version IS NULL')).rows[0].record,plain(v1.record));
});
test('transport lost after SQL commit: retry returns receipt once; tampering fails closed',async()=>{
  const unreliable={...db,async rpc(...args){await db.rpc(...args);throw Error('lost');}};
  await assert.rejects(registry.recordWorkout(unreliable,athlete,request(),today),/WRITE_UNCONFIRMED/);
  assert.equal((await create()).status,'already_applied');
  await sql.exec("UPDATE running_execution_records SET signature='bad'");
  await assert.rejects(registry.readWorkouts(db,athlete),/INTEGRITY_INVALID/);
});
test('SQL privileges deny client mutation and service direct insertion; unsupported library and unknown input rejected',async()=>{
  const privileges=await sql.query("SELECT has_function_privilege('authenticated','mutate_workout(text,text,integer,jsonb)','EXECUTE') client, has_table_privilege('service_role','running_execution_records','INSERT') direct");
  assert.deepEqual(privileges.rows[0],{client:false,direct:false});
  await assert.rejects(create('library',{libraryWorkoutId:'future'}),/REFERENCE_UNSUPPORTED/);
  await assert.rejects(create('unknown',{athleteId:'forged'}),/FIELD_NOT_ALLOWED/);
  await assert.rejects(registry.recordWorkout(db,athlete,{...request(),confirmed:false},today),/CONFIRMATION_REQUIRED/);
});
test('authenticated HTTP CRUD without subscription, forged athlete denied, no auth means no database call',async()=>{
  const cache=new Map(),authId='00000000-0000-4000-8000-000000000001';
  function module(file){const path=resolve(file);if(cache.has(path))return cache.get(path).exports;
    const m={exports:{}};cache.set(path,m);class Clock extends Date{constructor(...a){super(...(a.length?a:[today+'T12:00:00Z']));}static now(){return Date.parse(today+'T12:00:00Z');}}
    vm.runInNewContext(compile(readFileSync(path,'utf8')),{module:m,exports:m.exports,Request,Response,URL,Date:Clock,Buffer,structuredClone,
      process:{env:{SUPABASE_SERVICE_ROLE_KEY:'isolated-sports-test-key'}},require(name){if(name==='server-only')return {};if(name==='node:crypto')return crypto;return module(resolve(dirname(path),name+'.ts'));}});return m.exports;}
  const handler=module('lib/execution/workoutHandler.ts').handleWorkouts;let authReads=0;
  const authdb={...db,from(table){if(table!=='usuarios')return db.from(table);return {select(fields){
    if(fields!=='id,codigo,auth_user_id')return db.from(table).select(fields);
    const q={eq(k,v){assert.equal(k,'auth_user_id');assert.equal(v,authId);return q;},async limit(){authReads++;return {data:[{id:'00000000-0000-4000-8000-000000000002',auth_user_id:authId,codigo:athlete}],error:null};}};return q;
  }};}};
  const deps=()=>({db:authdb,auth:{async getUser(){return {data:{user:{id:authId,email_confirmed_at:today}},error:null};}}});
  const call=async(method,body,authorized=true)=>{
    const response=await handler(new Request('https://fixture.invalid/api/workouts',{method,headers:authorized?{Authorization:'Bearer synthetic'}:{},...(body?{body:JSON.stringify(body)}:{})}),deps);
    return {status:response.status,body:await response.json()};};
  assert.equal((await call('POST',request(),false)).status,401);assert.equal(authReads,0);
  assert.equal((await call('POST',{...request(),athleteId:'other'})).body.code,'EXECUTION_FIELD_NOT_ALLOWED');
  const saved=await call('POST',request());assert.equal(saved.status,200);assert.equal(saved.body.record.athleteScope,runtime('../execution/executionIntegrity').canonicalDigest(athlete));
  const changed=await call('PUT',edit(saved.body.record,'http-edit',{result:'Nuevo resultado'}));assert.equal(changed.body.record.revision,2);
  assert.equal((await call('GET')).body.records[0].result,'Nuevo resultado');
  assert.equal((await call('DELETE',remove(changed.body.record))).body.record.revision,3);
  assert.equal((await call('GET')).body.records.length,0);
});
test('old running writer delegates to canonical SQL; repeated create never revives a deleted run',async()=>{
  const input={sourceActivityId:'legacy-client-id',occurredAt:today,completeness:'FULL',quantities:{totalDuration:{value:30,unit:'minutes'}}};
  const a=await store.writeRunningExecution(db,athlete,input,today);assert.equal(a.ok,true);
  assert.equal((await store.writeRunningExecution(db,athlete,input,today)).code,'EXECUTION_ALREADY_RECORDED');
  await assert.rejects(store.writeRunningExecution(db,athlete,{...input,completeness:'PARTIAL'},today),/REQUEST_CONFLICT/);
  const r=(await registry.readWorkouts(db,athlete))[0];await registry.deleteWorkout(db,athlete,remove(r),today);
  assert.equal((await store.writeRunningExecution(db,athlete,input,today)).code,'WORKOUT_DELETED');
});

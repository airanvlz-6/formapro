import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {sportsRuntime,plain} from '../sports/trainingContractTestRuntime.mjs';
import {workoutSqlTestDatabase} from './workoutSqlTestDatabase.mjs';
const runtime=sportsRuntime(),registry=runtime('../execution/workoutRegistry'),history=runtime('../execution/workoutHistory');
const integrity=runtime('../execution/workoutIntegrity'),{canonicalDigest}=runtime('../execution/executionIntegrity');
const running=runtime('../execution/runningExecutionStore'),recent=runtime('../core/recentTrainingEvidence');
const athlete='a',today='2026-09-30';
async function setup(migrate=true){
  const sql=new PGlite();
  await sql.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE usuarios(codigo text PRIMARY KEY,workout_history jsonb);
    CREATE TABLE weekly_plan(id text PRIMARY KEY,user_codigo text,week_start text,sessions jsonb);
    CREATE TABLE session_modification_events(id text,user_codigo text,week_start text,created_at text);
    INSERT INTO usuarios VALUES ('a','[]'),('b','[]');
    GRANT SELECT ON usuarios,weekly_plan TO service_role;`);
  await sql.exec(readFileSync('docs/sql/b32c-running-execution-records.sql','utf8'));
  if(migrate)await migration(sql);
  return sql;
}
async function migration(sql){for(const name of ['core-reg-1-workouts.sql','core-reg-pagination.sql'])await sql.exec(readFileSync('docs/sql/'+name,'utf8'));}
async function seed(sql,count=1300){
  const rows=[];
  for(let i=0;i<count;i++)for(let revision=1;revision<=3;revision++){
    const date=revision===1?'2026-01-01':`2026-09-${String(1+i%28).padStart(2,'0')}`;
    const deleted=revision===3&&i<100;
    const record={version:2,executionId:`execution-${String(i).padStart(5,'0')}`,athleteScope:canonicalDigest(athlete),revision,
      requestId:`request-${i}-${revision}`,requestDigest:canonicalDigest([i,revision]),operation:deleted?'delete':revision===1?'create':'update',
      createdAt:'2026-09-30T00:00:00Z',updatedAt:`2026-09-30T00:00:0${revision}Z`,deletedAt:deleted?'2026-09-30T00:00:03Z':null,
      source:'confirmed_workout',verification:'SERVER_VALIDATED_SELF_REPORT',prescriptionReferences:[],
      data:{executedOn:date,discipline:'senderismo',title:'Fixture',description:`Revision ${revision}`}};
    rows.push({user_codigo:athlete,execution_id:record.executionId,content_digest:canonicalDigest(record),signature:integrity.workoutSignature(athlete,record),record,
      record_version:2,revision,request_id:record.requestId,request_digest:record.requestDigest,executed_on:date,updated_at:record.updatedAt,deleted_at:record.deletedAt});
  }
  await sql.query(`INSERT INTO running_execution_records(user_codigo,execution_id,content_digest,signature,record,record_version,revision,request_id,request_digest,executed_on,updated_at,deleted_at)
    SELECT user_codigo,execution_id,content_digest,signature,record,record_version,revision,request_id,request_digest,executed_on,updated_at,deleted_at
    FROM jsonb_populate_recordset(NULL::running_execution_records,$1)`,[JSON.stringify(rows)]);
}
test('3900 revisions: 1200 visible executions, bounded stable date pages, no tombstones or old revisions',async()=>{
  const sql=await setup();try{
    await seed(sql);const db=workoutSqlTestDatabase(sql,17),all=[];let cursor;
    do{const page=await history.readWorkoutHistory(db,athlete,{limit:37,cursor});all.push(...page.records);cursor=page.nextCursor;}while(cursor);
    assert.equal(all.length,1200);assert.equal(new Set(all.map(r=>r.executionId)).size,1200);
    assert.ok(all.every(r=>r.revision===3&&r.description==='Revision 3'&&r.executedOn>'2026-01-01'));
    const keys=all.map(r=>r.executedOn+'|'+r.executionId);assert.deepEqual(keys,[...keys].sort().reverse());
    assert.ok(db.reads.every(r=>['workout_history_entries','workout_history_version'].includes(r.table)&&r.count<=17));
    assert.equal((await history.readWorkoutHistory(db,athlete,{fromDate:'2026-01-01',toDate:'2026-01-31'})).records.length,0);
    const scoped=await history.readWorkoutHistory(db,athlete,{limit:1,fromDate:'2026-09-01',toDate:'2026-09-30'});
    await assert.rejects(history.readWorkoutHistory(db,athlete,{cursor:scoped.nextCursor}),/CURSOR_INVALID/);
    db.reads.length=0;assert.equal((await registry.readWorkouts(db,athlete,true)).length,1300);
    assert.equal(db.reads.reduce((n,r)=>n+r.count,0),1300); // No 3900-row revision scan.
    assert.equal((await history.readWorkoutHistory(db,'b')).records.length,0);
    const evidence=await recent.loadRecentTrainingEvidence(db,athlete,today);
    assert.equal(evidence.coverage.sourceFailures.length,0);
    assert.ok(evidence.items.every(r=>r.source!=='running_execution_records'||r.description.includes('Revision 3')));
    assert.ok(evidence.coverage.omittedItems>0); // Deliberate response budget, not a source-read failure.
    const coach=runtime('../chat/coachFirstReads').coachFirstReads(db,athlete,today);
    assert.deepEqual(plain((await coach.read({resource:'history',limit:14})).data.records),plain(all.slice(0,14)));
  }finally{await sql.close();}
});
test('large history: exact edit and old receipt recovery do not scan revisions or create a second execution',async()=>{
  const sql=await setup();try{
    await seed(sql);const db=workoutSqlTestDatabase(sql);
    const current=(await history.readWorkoutHistory(db,athlete,{executionId:'execution-00100'})).records[0];db.reads.length=0;
    const request={executionId:current.executionId,expectedRevision:3,requestId:'new-edit',confirmed:true,
      workout:{executedOn:'2026-09-29',discipline:'box',title:'Edited',description:'Corrected'}};
    const saved=await registry.updateWorkout(db,athlete,request,today);
    assert.equal(saved.record.revision,4);assert.equal(saved.record.executionId,current.executionId);
    assert.equal((await registry.updateWorkout(db,athlete,request,today)).status,'already_applied');
    await assert.rejects(registry.updateWorkout(db,athlete,{...request,requestId:'stale'},today),/REVISION_CONFLICT/);
    assert.ok(db.reads.every(r=>['workout_current_records','running_execution_records'].includes(r.table)&&r.count<=1));
  }finally{await sql.close();}
});
test('migration continuity: populated v1/profile/plan unchanged, explicit duplicates collapsed, prescription is not execution',async()=>{
  const sql=await setup(false);try{
    const v1=running.sealRunningExecution(athlete,{sourceActivityId:'old-run',occurredAt:'2026-06-01',completeness:'FULL',quantities:{}},today);
    await sql.query('INSERT INTO running_execution_records(user_codigo,execution_id,content_digest,record,signature) VALUES ($1,$2,$3,$4,$5)',[athlete,v1.execution_id,v1.content_digest,JSON.stringify(v1.record),v1.signature]);
    await sql.query('UPDATE usuarios SET workout_history=$1 WHERE codigo=$2',[JSON.stringify([
      {fecha:'2026-09-01T23:30:00Z',tipo:'box',operationId:'linked-report',descripcion:'Old workout'},
      {fecha:'2026-06-01',workout_id:v1.execution_id,tipo:'carrera'},
      {fecha:'invalid',tipo:'box',descripcion:'Unknown date'}]),athlete]);
    await sql.query('INSERT INTO weekly_plan VALUES ($1,$2,$3,$4)',['p',athlete,'2026-08-31',JSON.stringify([
      {session_id:'prescribed-only',dia:'lunes',tipo:'box',titulo:'Not performed'},
      {session_id:'reported',dia:'martes',chatExecutionEvidence:[{id:'linked-report',kind:'PERFORMED',executionDate:'2026-09-01',source:'athlete_report'}]},
      {session_id:'old-completed',completada:true,tipo:'box'},
      {session_id:'old-report',chatExecutionEvidence:[{id:'unlinked',kind:'PERFORMED',executionDate:'2026-09-01',source:'athlete_report',quote:'Old independent report'}]}
    ])]);
    const snapshot=async()=>JSON.stringify((await sql.query(`SELECT 'run' AS source,record AS value FROM running_execution_records
      UNION ALL SELECT 'profile',to_jsonb(u) FROM usuarios u UNION ALL SELECT 'plan',to_jsonb(p) FROM weekly_plan p ORDER BY source,value`)).rows);
    const before=await snapshot();
    await sql.exec(readFileSync('docs/sql/core-reg-preflight.sql','utf8'));
    assert.equal(running.projectRunningExecutionViews(athlete,[v1]).history.records.length,1);
    await migration(sql);assert.equal(await snapshot(),before);
    await sql.exec(readFileSync('docs/sql/core-reg-postflight.sql','utf8'));
    const db=workoutSqlTestDatabase(sql,2),all=[];let cursor;
    do{const page=await history.readWorkoutHistory(db,athlete,{limit:2,cursor});all.push(...page.records);cursor=page.nextCursor;}while(cursor);
    assert.equal(all.length,5);assert.equal(all.filter(r=>r.source==='running_execution_records.v1').length,1);
    assert.equal(all[0].executedOn,'2026-09-02');assert.equal(all.at(-1).executedOn,null);
    assert.ok(!all.some(r=>r.historyId?.includes('prescribed-only')||r.historyId?.endsWith('linked-report')));
    assert.ok(all.every(r=>!r.revision));assert.equal(await snapshot(),before);
    assert.deepEqual(plain((await running.readRunningExecutions(db,athlete)).records),plain(running.projectRunningExecutionViews(athlete,[v1]).history.records));
    const canonical=await registry.recordWorkout(db,athlete,{requestId:'after',confirmed:true,workout:{executedOn:today,discipline:'box',title:'New',description:'Actual'}},today);
    assert.equal((await history.readWorkoutHistory(db,athlete,{limit:1})).records[0].executionId,canonical.record.executionId);
    await assert.rejects(registry.deleteWorkout(db,athlete,{executionId:v1.execution_id,expectedRevision:1,requestId:'legacy-delete',confirmed:true},today),/NOT_FOUND/);
  }finally{await sql.close();}
});
test('cursor ties, concurrent mutation invalidation, malformed/foreign cursors and v1 conflicting dates remain safe',async()=>{
  const sql=await setup();try{
    const db=workoutSqlTestDatabase(sql,1);
    for(const requestId of ['a','b','c'])await registry.recordWorkout(db,athlete,{requestId,confirmed:true,workout:{executedOn:today,discipline:'box',title:'Same date',description:'Actual'}},today);
    const page=await history.readWorkoutHistory(db,athlete,{limit:1}),first=page.records[0];
    await registry.deleteWorkout(db,athlete,{executionId:first.executionId,expectedRevision:1,requestId:'delete-boundary',confirmed:true},today);
    await assert.rejects(history.readWorkoutHistory(db,athlete,{cursor:page.nextCursor,limit:10}),/CURSOR_STALE/);
    const next=await history.readWorkoutHistory(db,athlete,{limit:10});assert.equal(next.records.length,2);
    assert.ok(next.records.every(r=>r.executionId!==first.executionId));
    await assert.rejects(history.readWorkoutHistory(db,'b',{cursor:page.nextCursor}),/CURSOR_INVALID/);
    await assert.rejects(history.readWorkoutHistory(db,athlete,{cursor:'bad'}),/CURSOR_INVALID/);
    for(const date of ['2026-06-01','2026-09-29']){
      const row=running.sealRunningExecution(athlete,{sourceActivityId:'conflict',occurredAt:date,completeness:'FULL',quantities:{}},today);
      await sql.query('INSERT INTO running_execution_records(user_codigo,execution_id,content_digest,record,signature) VALUES ($1,$2,$3,$4,$5)',[athlete,row.execution_id,row.content_digest,JSON.stringify(row.record),row.signature]);
    }
    const result=await history.readWorkoutHistory(db,athlete);assert.equal(result.legacyRunningConflicts.length,1);
    assert.equal(result.records.filter(r=>r.source==='running_execution_records.v1').length,0);
  }finally{await sql.close();}
});
test('SQL projections: invoker security, effective service read and client denial, date compatibility',async()=>{
  const sql=await setup();try{
    const db=workoutSqlTestDatabase(sql);
    await registry.recordWorkout(db,athlete,{requestId:'security',confirmed:true,workout:{executedOn:today,discipline:'box',title:'One',description:'Actual'}},today);
    for(const role of ['anon','authenticated']){
      const r=await sql.query(`SELECT has_table_privilege($1,'workout_history_entries','SELECT') allowed,has_function_privilege($1,'mutate_workout(text,text,integer,jsonb)','EXECUTE') mutate`,[role]);
      assert.deepEqual(r.rows[0],{allowed:false,mutate:false});
    }
    await sql.exec('SET ROLE service_role');
    assert.equal((await sql.query('SELECT * FROM workout_history_entries')).rows.length,1);
    assert.equal((await sql.query("SELECT has_table_privilege(current_user,'running_execution_records','INSERT') allowed")).rows[0].allowed,false);
    await sql.exec('RESET ROLE');
    const resolver=runtime('../planning/recordCompletion').resolveCompletionDate;
    for(const input of [today,'2026-09-01T23:30:00Z','2026-02-30','invalid','2026-09-01T24:00:00Z','2026-01-01T00:00:00+02:00',
      '2026-09-01T23:60:00Z','2026-09-01T23:59:60Z','2026-01-01T01:00:00+16:30']){
      assert.equal((await sql.query('SELECT workout_civil_date($1) d',[input])).rows[0].d,resolver(input)?.date??null,input);
    }
    assert.match(readFileSync('app/historia/page.tsx','utf8'),/item.source==='running_execution_records.v2'&&<button/);
  }finally{await sql.close();}
});
test('failed migration rolls back schema changes and preserves populated immutable v1 evidence',async()=>{
  const sql=await setup(false);try{
    const row=running.sealRunningExecution(athlete,{sourceActivityId:'rollback',occurredAt:today,completeness:'FULL',quantities:{}},today);
    await sql.query('INSERT INTO running_execution_records(user_codigo,execution_id,content_digest,record,signature) VALUES ($1,$2,$3,$4,$5)',[athlete,row.execution_id,row.content_digest,JSON.stringify(row.record),row.signature]);
    const before=(await sql.query('SELECT * FROM running_execution_records')).rows;
    const failing=readFileSync('docs/sql/core-reg-1-workouts.sql','utf8').replace('CREATE UNIQUE INDEX workout_request_once','SELECT 1/0;\nCREATE UNIQUE INDEX workout_request_once');
    await assert.rejects(sql.exec(failing),/division by zero/);await sql.exec('ROLLBACK');
    assert.deepEqual((await sql.query('SELECT * FROM running_execution_records')).rows,before);
    assert.equal((await sql.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='running_execution_records' AND column_name='record_version'")).rows[0].n,0);
    await migration(sql);assert.equal((await history.readWorkoutHistory(workoutSqlTestDatabase(sql),athlete)).records.length,1);
  }finally{await sql.close();}
});

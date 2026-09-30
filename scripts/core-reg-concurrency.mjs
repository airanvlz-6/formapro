// Explicitly opt-in, EMPTY DISPOSABLE PostgreSQL database only. Never reads .env.local.
// Requires psql and database/role creation privileges on the designated test server.
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {sportsRuntime,plain} from '../lib/sports/trainingContractTestRuntime.mjs';
const check=process.argv.includes('--check');
const available=spawnSync('psql',['--version'],{windowsHide:true,encoding:'utf8'}).status===0;
if(check){console.log(JSON.stringify({psqlAvailable:available,testEndpointConfigured:!!process.env.CORE_REG_TEST_DATABASE_URL,writes:false}));process.exit(0);}
if(!available)throw Error('psql unavailable; no writes attempted');
if(process.env.CORE_REG_TEST_ACK!=='EMPTY_DISPOSABLE_DATABASE')throw Error('Missing disposable-test authorization');
const url=new URL(process.env.CORE_REG_TEST_DATABASE_URL??'');
if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('Invalid PostgreSQL URL');
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&url.hostname!==process.env.CORE_REG_TEST_HOST)
  throw Error('Explicit test host required; never use a production host');
const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.slice(1)),
  PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGCONNECT_TIMEOUT:'10',
  PGSSLMODE:url.searchParams.get('sslmode')??'prefer',PGOPTIONS:'-c statement_timeout=30000 -c lock_timeout=15000'};
function sql(query,onOutput=()=>{}){
  return new Promise((resolve,reject)=>{
    const child=spawn('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1'],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='';child.stdout.on('data',data=>{output+=data;onOutput(output);});
    // Do not echo connection strings, passwords or arbitrary server diagnostics.
    child.stderr.resume();child.on('error',()=>reject(Error('psql could not start')));
    child.on('exit',code=>code===0?resolve(output):reject(Error('Test PostgreSQL command failed; inspect the disposable database')));
    child.stdin.end(query);
  });
}
const present=await sql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('usuarios','weekly_plan','running_execution_records');");
assert.equal(present.trim(),'0','Refusing a populated/already-used target; create an empty disposable database');
await sql(`BEGIN;
  DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
  END $$;
  CREATE TABLE public.usuarios(codigo text PRIMARY KEY,workout_history jsonb);
  CREATE TABLE public.weekly_plan(id text PRIMARY KEY,user_codigo text,week_start text,sessions jsonb);
  INSERT INTO public.usuarios VALUES ('concurrency-a','[]'),('concurrency-b','[]');
  GRANT SELECT ON public.usuarios,public.weekly_plan TO service_role; COMMIT;`);
for(const file of ['b32c-running-execution-records.sql','core-reg-preflight.sql','core-reg-1-workouts.sql','core-reg-pagination.sql','core-reg-postflight.sql'])
  await sql(readFileSync(new URL('../docs/sql/'+file,import.meta.url),'utf8'));
const runtime=sportsRuntime(),registry=runtime('../execution/workoutRegistry');
const integrity=runtime('../execution/workoutIntegrity'),{canonicalDigest}=runtime('../execution/executionIntegrity');
let createRow;
const capture={from(){const q={select(){return q;},eq(){return q;},limit(){return q;},then(a,b){return Promise.resolve({data:[],error:null}).then(a,b);}};return q;},
  async rpc(_,args){createRow=plain(args.p_row);return {data:{status:'committed',row:createRow},error:null};}};
await registry.recordWorkout(capture,'concurrency-a',{requestId:'same-request',confirmed:true,workout:{executedOn:'2026-09-01',discipline:'box',title:'Test',description:'Synthetic'}},'2026-09-30');
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
const mutate=(row,operation,expected)=>`SELECT public.mutate_workout('concurrency-a',${literal(operation)},${expected},${literal(JSON.stringify(row))}::jsonb);`;
async function race(firstQuery,secondQuery){
  let held;const locked=new Promise(resolve=>{held=resolve;});
  const first=sql(`BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('forge-workout:concurrency-a',0));
    SELECT 'CORE_REG_LOCK_HELD'; SELECT pg_sleep(2); ${firstQuery} COMMIT;`,output=>{if(output.includes('CORE_REG_LOCK_HELD'))held();});
  await Promise.race([locked,first.then(()=>{throw Error('Lock marker not observed');})]);
  const results=await Promise.all([first,sql(secondQuery)]);
  return results.map(output=>JSON.parse(output.split(/\r?\n/).findLast(line=>line.startsWith('{'))));
}
const created=await race(mutate(createRow,'create',0),mutate(createRow,'create',0));
assert.deepEqual(created.map(r=>r.status).sort(),['already_applied','committed']);
const update=id=>{
  const record={...createRow.record,operation:'update',revision:2,requestId:id,requestDigest:canonicalDigest(id),updatedAt:new Date(Date.now()+1000).toISOString()};
  return {record,signature:integrity.workoutSignature('concurrency-a',record),content_digest:canonicalDigest(record)};
};
const edited=await race(mutate(update('edit-a'),'update',1),mutate(update('edit-b'),'update',1));
assert.equal(edited.filter(r=>r.status==='committed').length,1);
assert.equal(edited.filter(r=>r.code==='WORKOUT_REVISION_CONFLICT').length,1);
assert.equal((await sql("SELECT count(*) FROM public.running_execution_records WHERE user_codigo='concurrency-a';")).trim(),'2');
assert.equal((await sql("SELECT count(*) FROM public.workout_history_entries WHERE user_codigo='concurrency-b';")).trim(),'0');
console.log(JSON.stringify({duplicateCreate:'one commit + one replay',concurrentEdit:'one commit + one revision conflict',rows:2,
  note:'Disposable fixture retained for inspection; no production target or LLM used'}));

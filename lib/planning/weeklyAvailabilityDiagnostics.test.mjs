import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sportsRuntime, fakeDatabase, plain, compile } from '../sports/trainingContractTestRuntime.mjs';

const raw = { box:['martes','jueves','sabado'], pista:['lunes','miercoles','viernes'], carrera_larga:['domingo'] };
const week = type => ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'].map(dia=>({dia,tipo:dia==='domingo'?type:'descanso'}));
function setup(distribution=raw, sources=[], overrides={}) {
 const logs=[];
 const load=sportsRuntime({console:{warn:(...args)=>logs.push(plain(args))}});
 const profile={modo_entrada:'planificacion',categoria:'box',perfil:{dias:7},workout_history:[],distribucion_semanal:distribution,...overrides};
 const db=fakeDatabase({usuarios:profile,athlete_training_sources:sources});
 return {logs,load,db,authority:load('../planning/weeklyCalendarAuthority')};
}

for (const [name,value,reason] of [['null',null,'null'],['object',{dias:['domingo']},'non_array'],
 ['mixed array',['domingo',42],'non_string_member'],['legacy string','domingo','non_array'],['undefined',undefined,'missing']]) {
 test(`diagnostics preserve rejection of ${name} and explain origin versus resolved shape`,async()=>{
  const s=setup({...raw,carrera_larga:value});
  await assert.rejects(s.authority.issueWeeklyCalendar(s.db,'private-code','2026-09-07',week('carrera')),e=>{
   assert.equal(e.message,'CALENDAR_AVAILABILITY_UNRESOLVED');
   assert.deepEqual(plain(e.availabilityDiagnostic),{code:e.message,reason,discipline:'carrera',resolvedType:'object'});return true;
  });
  assert.equal(s.logs.length,1);
  const [event,d]=s.logs[0];assert.equal(event,'WEEKLY_AVAILABILITY_UNRESOLVED');
  assert.equal(d.canonicalCapabilityResult.isNull,true);assert.equal(d.canonicalCapabilityResult.isArray,false);
  assert.equal(d.canonicalCapabilityResult.reason,'null');
  const category=d.relevantCategories.find(x=>x.category==='carrera_larga');
  assert.equal(category.runtimeType,typeof value);assert.equal(category.isArray,Array.isArray(value));
  assert.equal(category.reason,reason);assert.equal(Object.hasOwn(category,'days'),false);
  assert.deepEqual(d.relevantCategories[0].days,raw.pista);
 });
}

test('missing capability is reported without claiming an unsupported category',async()=>{
 const s=setup(raw,[],{categoria:'fuerza'});
 await assert.rejects(s.authority.issueWeeklyCalendar(s.db,'private-code','2026-09-07',week('descanso')),e=>e.availabilityDiagnostic.reason==='missing');
 const d=s.logs[0][1];assert.equal(d.discipline,'fuerza');assert.deepEqual(d.relevantCategories,[]);
 assert.deepEqual(d.scope,{mode:'coach',managedDisciplines:['box','carrera','fuerza']});
});

test('explicit source diagnostics describe the actual overriding non-string member',async()=>{
 const s=setup(raw,[{activo:true,owner:'forge',disciplina:'carrera',dias:{privateText:'do not log'}}]);
 await assert.rejects(s.authority.issueWeeklyCalendar(s.db,'private-code','2026-09-07',week('carrera')),/CALENDAR_AVAILABILITY_UNRESOLVED/);
 const d=s.logs[0][1];assert.equal(d.reason,'non_string_member');assert.equal(d.resolutionSource,'explicit_sources');
 assert.equal(d.canonicalCapabilityResult.isArray,true);assert.equal(d.canonicalCapabilityResult.length,1);
 assert.equal(d.explicitSources[0].reason,'non_array');assert.doesNotMatch(JSON.stringify(d),/privateText|do not log/);
});

test('logs omit identifiers, arbitrary keys, mixed day values, and all unrelated source/profile fields',async()=>{
 const secret='private-name-email-uuid-token';
 const s=setup({...raw,[secret]:[secret]},[{activo:true,owner:'forge',disciplina:'carrera',dias:['domingo',secret,42],id:secret,user_codigo:secret}],
  {nombre:secret,email:secret,restrictions:secret,chat:secret});
 await assert.rejects(s.authority.issueWeeklyCalendar(s.db,secret,'2026-09-07',week('carrera')),/CALENDAR_AVAILABILITY_UNRESOLVED/);
 const text=JSON.stringify(s.logs);assert.ok(!text.includes(secret));assert.match(text,/redacted_category/);
 assert.equal(Object.hasOwn(s.logs[0][1].explicitSources[0],'days'),false);
});

for(const mode of ['planificacion','focus']) test(`${mode}: valid arrays, REST, RECOVERY and source priority retain decisions`,async()=>{
 const sources=mode==='focus'?[{activo:true,owner:'forge',disciplina:'carrera',dias:null}]:[];
 const s=setup(raw,sources,{modo_entrada:mode});const sessions=week('carrera');sessions[6].stimulusId='recuperacion_activa';
 const snapshot=JSON.stringify({raw,sources,sessions});
 const receipt=await s.authority.issueWeeklyCalendar(s.db,'test','2026-09-07',sessions);
 await s.authority.assertWeeklyCalendar(s.db,'test','2026-09-07',sessions,receipt);
 assert.equal(JSON.stringify({raw,sources,sessions}),snapshot);
 const changed=sessions.map(x=>({...x}));delete changed[6].stimulusId;
 await assert.rejects(s.authority.assertWeeklyCalendar(s.db,'test','2026-09-07',changed,receipt),/PROTECTED/);
 changed[0].tipo='carrera';await assert.rejects(s.authority.assertWeeklyCalendar(s.db,'test','2026-09-07',changed,receipt),/PROTECTED/);
 assert.equal(s.logs.length,0);
});

test('DAY_UNAVAILABLE remains distinct and emits no UNRESOLVED diagnostics',async()=>{
 const s=setup();await assert.rejects(s.authority.issueWeeklyCalendar(s.db,'test','2026-09-07',week('box')),e=>{
  assert.equal(e.message,'CALENDAR_DAY_UNAVAILABLE');assert.equal(e.availabilityDiagnostic,undefined);return true;
 });assert.deepEqual(s.logs,[]);
});

test('logging failure cannot change the original rejection',async()=>{
 const load=sportsRuntime({console:{warn(){throw new Error('logger unavailable');}}});
 const db=fakeDatabase({usuarios:{modo_entrada:'planificacion',categoria:'box',distribucion_semanal:{box:null}},athlete_training_sources:[]});
 await assert.rejects(load('../planning/weeklyCalendarAuthority').issueWeeklyCalendar(db,'test','2026-09-07',week('descanso')),/CALENDAR_AVAILABILITY_UNRESOLVED/);
});

test('actual planner catch returns only minimal diagnostics with unchanged code and retryability',async()=>{
 const source=ts.createSourceFile('route.ts',readFileSync('app/api/chat/route.ts','utf8'),ts.ScriptTarget.Latest,true);
 let body;function visit(n){if(ts.isCatchClause(n)&&n.block.getText(source).includes('err.availabilityDiagnostic'))body=n.block;ts.forEachChild(n,visit);}visit(source);assert.ok(body);
 const s=setup({...raw,carrera_larga:null});let error;
 try{await s.authority.issueWeeklyCalendar(s.db,'private-code','2026-09-07',week('carrera'));}catch(e){error=e;}
 const result=vm.runInNewContext(compile('(()=>'+body.getText(source)+')()'),{err:error,NextResponse:{json:x=>x},console:{warn(){}}});
 assert.deepEqual(plain(result),{ok:false,error:'Error en Week Planner: CALENDAR_AVAILABILITY_UNRESOLVED',code:'CALENDAR_AVAILABILITY_UNRESOLVED',retryable:false,
  reason:'null',discipline:'carrera',resolvedType:'object'});
});

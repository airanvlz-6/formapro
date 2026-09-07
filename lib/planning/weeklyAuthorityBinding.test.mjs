import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { equippedProfileFixture, sportsRuntime, fakeDatabase, plain, compile, completeDoseFixture, contractFixture } from '../sports/trainingContractTestRuntime.mjs';

const diagnostics = [];
const load = sportsRuntime({console:{warn:(...args)=>diagnostics.push(args)}});
const weekly = load('../planning/weeklyCalendarAuthority');
const planner = load('../planning/prepareAllowedWeeklyPlanContract');
const sessions = load('sessionAuthority');
const days = load('../planning/weeklyCalendar').calendarDays;
const week = '2026-09-07', user = 'fixture-user', token = 'fixture-generation';
const request = {targetWeekStart:week,today:'2026-09-06',empezarHoy:false,snapshot:null};
const note = {id:'private-note',status:'pending',constraint_level:'reassessment',prohibits_impact:true,
  prohibits_jump:true,prohibits_deep_flexion:true,prohibits_axial_load:false};
function database(restricted = true) {
  const data = {usuarios:{modo_entrada:'coach',categoria:'box',perfil:{...equippedProfileFixture(),dias:6},workout_history:[],
    distribucion_semanal:{box:['martes','jueves','sabado'],pista:['lunes','miercoles','viernes'],carrera_larga:['domingo']}},
    athlete_training_sources:[],athlete_state_events:[],athlete_coaching_notes:restricted?[{...note}]:[],weekly_plan:[]};
  const db = fakeDatabase(data), from = db.from.bind(db); db.row = null; db.data = data;
  db.from = table => {
    const query = from(table);
    if (table === 'weekly_plan') query.maybeSingle = async () => ({data:db.row,error:null});
    return query;
  };
  return db;
}
function choices(c, choose) {
  return {contractVersion:1,contextDigest:c.contextDigest,selections:days.map(day=>({day,
    optionId:(choose?.(c.dayOptions[day],day) || c.dayOptions[day].find(o=>day==='jueves'&&o.stimulusId==='fuerza_maxima') || c.dayOptions[day][0]).optionId}))};
}
async function plan(db=database(), choose, overrides={}) {
  const result = await planner.planBoundedWeek(db,user,{...request,...overrides},async prompt=>{
    const c = JSON.parse(prompt.split('WEEKLY_CONTRACT:\n')[1]); return JSON.stringify(choices(c,choose));
  },token);
  assert.equal(result.ok,true,JSON.stringify(result)); return result.estructura;
}
function builderRequest(p,day='jueves') {
  const slot=p.sessions.find(s=>s.dia===day);
  return {targetWeekStart:week,day,discipline:slot.discipline,stimulus:slot.stimulusId,intent:slot.intent,state:slot.state,
    weekly:{receipt:p.calendarReceipt,generationToken:token,optionId:slot.optionId,
      claims:{contractDigest:p.contractDigest,contextDigest:p.contextDigest,targetDate:slot.targetDate,
        discipline:slot.discipline,tipo:slot.tipo,stimulusId:slot.stimulusId,intent:slot.intent,state:slot.state,
        titulo_breve:slot.titulo_breve,focus:slot.focus}}};
}
function compose(prompt) {
  const c=JSON.parse(prompt.split('CONTRACT:\n')[1].split('\nContexto no autoritativo:')[0]);
  return JSON.stringify(completeDoseFixture(c,{stimulusId:c.stimulusId,structureId:c.allowedStructureIds[0],blocks:['warmup','main','cooldown'].map(blockType=>({blockType,
    movements:[{movementId:c.allowedMovementIds[0],prescription:{reps:5}}]}))}));
}
async function build(db,p,mutate=()=>{},day='jueves',builder=sessions.generateTrainingSession,who=user) {
  const r=builderRequest(p,day);mutate(r);let calls=0;
  const result=await builder(db,who,r,async prompt=>{calls++;return compose(prompt);});
  return {result,calls};
}
const decoded = receipt => JSON.parse(Buffer.from(receipt.split('.')[0],'base64url'));
// Test-only signing simulates receipts issued by a previous policy/deployment; never used to validate attacker HMACs.
function signed(evidence,domain='forge-week-calendar-v1:') {
  const payload=Buffer.from(JSON.stringify(evidence)).toString('base64url');
  return payload+'.'+createHmac('sha256','isolated-sports-test-key').update(domain+payload).digest('base64url');
}

test('production valid option: real Planner -> calendar v2 -> exact Builder v2 -> session receipt -> save chain',async()=>{
  const db=database(), p=await plan(db), {result,calls}=await build(db,p);
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(calls,1);
  const c=result.trainingContract, w=decoded(p.calendarReceipt), s=decoded(result.sesion.sessionReceipt);
  assert.equal(w.protocolVersion,2);assert.equal(w.contractDigest,p.contractDigest);assert.equal(w.contextDigest,p.contextDigest);
  assert.deepEqual(plain(c.allowedMovementIds),['bench_press']);assert.equal(c.contractVersion,3);
  const slot=w.admittedSlots.find(o=>o.day==='jueves');
  assert.equal(slot.targetDate,'2026-09-10');assert.equal(slot.optionId,'jueves:box:fuerza_maxima:generic');
  assert.equal(c.discipline,slot.discipline);assert.equal(c.stimulusId,slot.stimulusId);assert.deepEqual(c.intent,slot.intent);
  assert.deepEqual(c.prescriptionScope,w.prescriptionScope);assert.equal(s.weekly.calendarReceipt,p.calendarReceipt);
  const proposal=p.sessions.map(day=>day.dia==='jueves'?result.sesion:day);
  await weekly.assertWeeklyCalendar(db,user,week,proposal,p.calendarReceipt,{requireV2:true,generationToken:token});
  await sessions.assertFreshSessionRestrictions(db,user,week,result.sesion);
  for(const forbidden of ['private-note','restrictionsSnapshot','reassessments','prohibits_impact']) assert.equal(JSON.stringify(w).includes(forbidden),false);
});

for (const [name,mutate] of [
  ['optionId',r=>r.weekly.optionId='martes:box:fuerza_maxima:generic'],
  ['day',r=>r.day='martes'],['date',r=>r.weekly.claims.targetDate='2026-09-11'],
  ['state',r=>r.state='RECOVERY'],['discipline',r=>r.discipline='carrera'],
  ['stimulus',r=>r.stimulus='halterofilia_tecnica'],['intent',r=>r.intent={kind:'main_pattern',pattern:'squat'}],
  ['week',r=>r.targetWeekStart='2026-09-14'],['contract digest',r=>r.weekly.claims.contractDigest='other'],
  ['context digest',r=>r.weekly.claims.contextDigest='other'],['generation',r=>r.weekly.generationToken='other'],
  ['UI discipline',r=>r.weekly.claims.discipline='carrera'],['UI tipo',r=>r.weekly.claims.tipo='carrera'],
  ['UI stimulusId',r=>r.weekly.claims.stimulusId='tecnica'],['UI intent',r=>r.weekly.claims.intent={kind:'main_pattern',pattern:'squat'}],
  ['title',r=>r.weekly.claims.titulo_breve='sentadillas'],['focus',r=>r.weekly.claims.focus='squat'],
]) test(`${name} substitution rejects BEFORE LLM`,async()=>{
  const db=database(),p=await plan(db),out=await build(db,p,mutate);
  assert.equal(out.result.ok,false,JSON.stringify(out.result));assert.equal(out.calls,0);assert.equal(out.result.retryable,false);
});

test('cross-athlete replay rejects before LLM',async()=>{
  const db=database(),p=await plan(db),out=await build(db,p,()=>{},'jueves',sessions.generateTrainingSession,'other');
  assert.equal(out.result.ok,false);assert.equal(out.calls,0);
});
for(const field of ['optionId','day','targetDate','state','discipline','stimulusId','intent']) test(`unsigned receipt ${field} tampering rejects before LLM`,async()=>{
  const db=database(),p=await plan(db),e=decoded(p.calendarReceipt);e.admittedSlots[3][field]='forged';
  p.calendarReceipt=Buffer.from(JSON.stringify(e)).toString('base64url')+'.'+p.calendarReceipt.split('.')[1];
  const out=await build(db,p);assert.equal(out.result.ok,false);assert.equal(out.calls,0);
});

for(const [name,change] of [
  ['stricter restrictions',db=>db.data.athlete_coaching_notes[0].prohibits_axial_load=true],
  ['relaxed restrictions',db=>db.data.athlete_coaching_notes.length=0],
  ['availability removed',db=>db.data.usuarios.distribucion_semanal.box=['martes','sabado']],
  ['availability added',db=>db.data.usuarios.distribucion_semanal.box.push('lunes')],
  ['scope to Focus',db=>{db.data.usuarios.modo_entrada='focus';db.data.athlete_training_sources.push({disciplina:'box',owner:'forge',activo:true,dias:['martes','jueves','sabado']});}],
  ['new persisted revision',db=>db.row={id:'plan',user_codigo:user,week_start:week,revision:1,sessions:[]}],
]) test(`${name} invalidates old authority BEFORE LLM`,async()=>{
  const db=database(),p=await plan(db);change(db);const out=await build(db,p);
  assert.equal(out.result.ok,false,JSON.stringify(out));assert.equal(out.calls,0);
});

test('same-context alternatives coexist; sessions cannot be mixed across receipts; persistence invalidates both',async()=>{
  const db=database(),a=await plan(db),b=await plan(db,(options,day)=>day==='martes'?options.find(o=>o.stimulusId==='fuerza_maxima'):undefined);
  assert.equal(a.contractDigest,b.contractDigest);assert.equal(a.contextDigest,b.contextDigest);
  const out=await build(db,a);assert.equal(out.result.ok,true);
  assert.equal((await build(db,b)).result.ok,true);
  assert.throws(()=>sessions.verifySessionReceipt(out.result.sesion.sessionReceipt,out.result.sesion,user,week,b.calendarReceipt),/CHAIN_MISMATCH/);
  db.row={id:'plan',user_codigo:user,week_start:week,revision:1,sessions:[]};
  for(const p of [a,b]) {const rejected=await build(db,p);assert.equal(rejected.result.code,'WEEKLY_REVISION_STALE');assert.equal(rejected.calls,0);}
});

test('new material contract rejects previous receipt and cannot lend its option/digest to it',async()=>{
  const db=database(),a=await plan(db);db.data.athlete_coaching_notes.length=0;const b=await plan(db);
  assert.notEqual(a.contractDigest,b.contractDigest);assert.notEqual(a.contextDigest,b.contextDigest);
  const out=await build(db,a,r=>r.weekly.claims.contractDigest=b.contractDigest);
  assert.equal(out.result.ok,false);assert.equal(out.calls,0);
});

test('completed/protected changes reject even if a writer forgot to increment revision',async()=>{
  const db=database();db.row={id:'plan',user_codigo:user,week_start:week,revision:1,sessions:[{dia:'domingo',tipo:'descanso',titulo:'original'}]};
  const p=await plan(db,undefined,{snapshot:structuredClone(db.row)});
  db.row.sessions[0].completada=true;
  const out=await build(db,p);assert.equal(out.result.code,'WEEKLY_REVISION_STALE');assert.equal(out.calls,0);
});

test('REST never composes; external fixed day never composes',async()=>{
  const db=database(),p=await plan(db),rest=await build(db,p,()=>{},'lunes');
  assert.equal(rest.result.code,'WEEKLY_SLOT_NOT_EXECUTABLE');assert.equal(rest.calls,0);
  db.data.usuarios.modo_entrada='focus';db.data.athlete_training_sources.push(
    {disciplina:'box',owner:'forge',activo:true,dias:['martes','jueves','sabado']},
    {disciplina:'carrera',owner:'external',activo:true,dias:['lunes']});
  const external=await plan(db),out=await build(db,external,()=>{},'lunes');
  assert.equal(out.result.code,'WEEKLY_SLOT_NOT_EXECUTABLE');assert.equal(out.calls,0);
});

test('RECOVERY exact stimulus survives contract and rendering; TRAIN substitution rejects before LLM',async()=>{
  const db=database(false),p=await plan(db,(options,day)=>day==='lunes'?options.find(o=>o.state==='RECOVERY'):undefined);
  const out=await build(db,p,()=>{},'lunes');assert.equal(out.result.ok,true,JSON.stringify(out.result));
  assert.equal(out.result.trainingContract.stimulusId,'recuperacion_activa');
  assert.equal(load('../planning/weeklyCalendar').calendarState(out.result.sesion),'RECOVERY');
  const bad=await build(db,p,r=>{r.state='TRAIN';r.stimulus='base_aerobica';},'lunes');
  assert.equal(bad.result.ok,false);assert.equal(bad.calls,0);
});

test('expiry, unsupported protocol and policy versions reject before LLM',async()=>{
  const db=database(),p=await plan(db);
  for(const change of [e=>e.expires=0,e=>e.protocolVersion=3,e=>e.policyVersion='retired',e=>e.contractVersion=9]) {
    const e=decoded(p.calendarReceipt);change(e);const out=await build(db,{...p,calendarReceipt:signed(e)});
    assert.equal(out.result.ok,false);assert.equal(out.calls,0);
  }
});

test('legacy calendar and unbound v1/v2 sessions receive no new weekly privileges',async()=>{
  const db=database(),p=await plan(db),legacy=await weekly.issueWeeklyCalendar(db,user,week,p.sessions);
  weekly.verifyWeeklyCalendarReceipt(legacy,user,week);
  const bad=await build(db,{...p,calendarReceipt:legacy});assert.equal(bad.result.code,'WEEKLY_RECEIPT_UPGRADE_REQUIRED');assert.equal(bad.calls,0);
  for(const intent of [undefined,{kind:'stimulus_only'}]) {
    const r={targetWeekStart:week,day:'jueves',discipline:'box',stimulus:'fuerza_maxima',...(intent?{intent}:{})};
    const result=await sessions.generateTrainingSession(db,user,r,async prompt=>compose(prompt));assert.equal(result.ok,true);
    sessions.verifySessionReceipt(result.sesion.sessionReceipt,result.sesion,user,week);
    assert.throws(()=>sessions.verifySessionReceipt(result.sesion.sessionReceipt,result.sesion,user,week,p.calendarReceipt),/CHAIN_MISMATCH/);
  }
});

test('safe diagnostics contain no receipt, user, restriction text or identifiers',()=>{
  assert.ok(diagnostics.length);
  for(const [event,fields] of diagnostics) {
    assert.equal(event,'WEEKLY_AUTHORITY_REJECTED');assert.deepEqual(Object.keys(fields).sort(),['code','protocolVersion']);
    assert.match(fields.code,/^WEEKLY_[A-Z_]+$/);
  }
});

test('actual weekly Builder route cannot omit weekly evidence or bypass it via legacy fields',async()=>{
  const source=ts.createSourceFile('route.ts',readFileSync('app/api/chat/route.ts','utf8'),ts.ScriptTarget.Latest,true);
  function find(n) {if(ts.isIfStatement(n)&&n.expression.getText(source)==='action === "construir_sesion_dia"')return n;return ts.forEachChild(n,find);}
  let calls=0;
  const execute=vm.runInNewContext(compile(`async function run() ${find(source).thenStatement.getText(source)};run;`),{
    datos:{targetWeekStart:week,dia:'jueves',tipo:'box',stimulusId:'fuerza_maxima'},codigo:user,supabase:database(),
    resolveWeeklyGeneration:()=>({currentWeek:'2026-08-31',nextWeek:week}),generateTrainingSession:sessions.generateTrainingSession,
    NextResponse:{json:v=>v},fetch:async()=>{calls++;throw new Error('must not run');},
  });
  const result=await execute();assert.equal(result.ok,false);assert.equal(calls,0);
});

async function saveRoute(db,p,generated,transport={}) {
  const previousSnapshot=db.row;
  const source=ts.createSourceFile('route.ts',readFileSync('app/api/chat/route.ts','utf8'),ts.ScriptTarget.Latest,true);
  function find(n) {if(ts.isIfStatement(n)&&n.expression.getText(source)==='action === "guardar_plan_semana"')return n;return ts.forEachChild(n,find);}
  const from=db.from.bind(db);db.writes=[];
  db.from=table=>{
    const q=from(table);
    for(const method of ['insert','update']) q[method]=payload=>{
      db.writes.push({table,method,payload:plain(payload)});
      const result={data:{id:'saved-plan',user_codigo:user,week_start:week,revision:payload.revision},error:null};
      if(table==='weekly_plan') db.row={...payload,...result.data};
      q.maybeSingle=async()=>result;q.then=(yes,no)=>Promise.resolve(result).then(yes,no);return q;
    };
    return q;
  };
  const execute=vm.runInNewContext(compile(`async function run() ${find(source).thenStatement.getText(source)};run;`),{
    datos:{plan:{week_start:week,week_number:1,block_name:'Test',sessions:p.sessions.map(s=>generated[s.dia] || s)},
      weeklyContractVersion:1,calendarReceipt:p.calendarReceipt,generationToken:token},
    codigo:user,supabase:db,structuredClone,console:{log(){},error(){}},NextResponse:{json:v=>v},
    resolveWeeklyGeneration:()=>({currentWeek:week,nextWeek:'2026-09-14',snapshots:{[week]:previousSnapshot}}),
    ...load('../planning/prepareWeeklyCandidate'),...load('../planning/planPersistence'),...load('../planning/planMutation'),
    ...sessions,...weekly,...load('../planning/weeklyCalendar'),...load('../athlete/getCanonicalRestrictions'),
    ...load('../planning/enforceWholeWeek'),...load('../planning/wholeWeekAdapter'),...load('../planning/wholeWeekFailure'),apiKey:'test',...transport,
    buildFocusContext:async()=>({esModoFocus:false,disciplinasExternas:[]}),
  });
  return execute();
}

test('actual save route verifies real weekly/session chain, admits identity and INSERT revision 1; replay fails without another write',async()=>{
  const db=database(),p=await plan(db),out=await build(db,p);assert.equal(out.result.ok,true);
  const saved=await saveRoute(db,p,{jueves:out.result.sesion});assert.equal(saved.ok,true,JSON.stringify(saved));assert.equal(saved.revision,1);
  const write=db.writes.find(w=>w.table==='weekly_plan');assert.equal(write.method,'insert');assert.equal(write.payload.sessions.length,7);
  assert.equal(write.payload.sessions.filter(s=>s.tipo==='descanso').length,6);
  assert.deepEqual(write.payload.sessions.find(s=>s.dia==='jueves').structuredPrescription, plain(out.result.sesion.structuredPrescription));
  for(const s of write.payload.sessions) {assert.match(s.session_id,/^[a-f0-9-]{36}$/);assert.equal(s.sessionReceipt,undefined);}
  const replay=await build(db,p);assert.equal(replay.result.code,'WEEKLY_REVISION_STALE');assert.equal(replay.calls,0);
});

for(const repairWorks of [false,true])test(`real parallel-candidate batch gate: repair success=${repairWorks}, invalid week never writes`,async()=>{
  const db=database(),p=await plan(db,(options,day)=>['martes','jueves'].includes(day)?options.find(o=>o.stimulusId==='fuerza_maxima'):undefined);
  const [tue,thu]=await Promise.all([build(db,p,()=>{},'martes'),build(db,p)]);
  assert.equal(tue.result.ok,true);assert.equal(thu.result.ok,true);let calls=0;
  const saved=await saveRoute(db,p,{martes:tue.result.sesion,jueves:thu.result.sesion},{fetch:async(_url,request)=>{
    calls++;const prompt=JSON.parse(request.body).messages[0].content;
    const proposal=JSON.parse(prompt.split('REJECTED_PROPOSAL:\n')[1].split('\nWHOLE_WEEK_DIAGNOSTICS:')[0]);
    if(repairWorks)proposal.blocks[1].movements[0].prescription.reps=6;
    return {ok:true,json:async()=>({content:[{text:JSON.stringify(proposal)}]})};
  }});
  assert.equal(calls,repairWorks?1:2);assert.equal(saved.ok,repairWorks,JSON.stringify(saved));
  assert.equal(db.writes.filter(w=>w.table==='weekly_plan').length,Number(repairWorks));
  if(repairWorks){assert.equal(saved.wholeWeekValidation.status,'pass');assert.ok(saved.wholeWeekReceipt);}
  else assert.equal(saved.code,'WEEK_REPAIR_FAILED');
});

for(const succeeds of [false,true])test(`existing valid week and CAS after targeted exhaustion/success=${succeeds}`,async()=>{
  const db=database(),choose=(options,day)=>['martes','jueves'].includes(day)?options.find(o=>o.stimulusId==='fuerza_maxima'):undefined;
  const p=await plan(db,choose),a=await build(db,p,()=>{},'martes'),b=await build(db,p);
  const provider=modify=>({fetch:async(_url,request)=>{
    const prompt=JSON.parse(request.body).messages[0].content;
    const proposal=JSON.parse(prompt.split('REJECTED_PROPOSAL:\n')[1].split('\nWHOLE_WEEK_DIAGNOSTICS:')[0]);
    modify(proposal,prompt);return {ok:true,json:async()=>({content:[{text:JSON.stringify(proposal)}]})};
  }});
  const first=await saveRoute(db,p,{martes:a.result.sesion,jueves:b.result.sesion},provider(proposal=>proposal.blocks[1].movements[0].prescription.reps=6));
  assert.equal(first.ok,true,JSON.stringify(first));const before=plain(db.row);
  const next=await plan(db,choose,{snapshot:db.row}),a2=await build(db,next,()=>{},'martes'),b2=await build(db,next);
  let calls=0;
  const result=await saveRoute(db,next,{martes:a2.result.sesion,jueves:b2.result.sesion},provider((proposal,prompt)=>{
    calls++;if(succeeds&&prompt.includes('STAGE:targeted'))proposal.blocks[1].movements[0].prescription.reps=7;
  }));
  assert.equal(calls,2);assert.equal(result.ok,succeeds,JSON.stringify(result));
  if(succeeds){
    assert.equal(db.row.revision,before.revision+1);assert.equal(db.writes.filter(w=>w.table==='weekly_plan')[0].method,'update');
    const receipt=decoded(result.wholeWeekReceipt);assert.equal(receipt.orchestration.targetedRegenerationCount,1);
    assert.equal(receipt.contentDigest,weekly.weeklyDigest(result.sessions));
  }else{
    assert.deepEqual(plain(db.row),before);assert.equal(db.writes.length,0);assert.equal(result.retryable,false);
    assert.equal(result.planningStatus,'could_not_build_valid_week');assert.equal(result.result,undefined);assert.equal(result.reason,undefined);
  }
});

test('actual save cannot substitute REST for TRAIN or admit a session from another calendar receipt',async()=>{
  for(const mutate of ['rest','other-receipt']) {
    const db=database(),p=await plan(db),out=await build(db,p);let session=out.result.sesion;
    if(mutate==='rest')session={dia:'jueves',tipo:'descanso',titulo:'Descanso'};
    else {
      const other=await plan(db,(options,day)=>day==='martes'?options.find(o=>o.stimulusId==='fuerza_maxima'):undefined);
      session=(await build(db,other)).result.sesion;
    }
    const saved=await saveRoute(db,p,{jueves:session});assert.equal(saved.ok,false,JSON.stringify(saved));assert.equal(db.writes.length,0);
  }
});

test('save rejects changed restrictions even after Builder success; existing session restriction gate remains active',async()=>{
  const db=database(),p=await plan(db),out=await build(db,p);db.data.athlete_coaching_notes.length=0;
  await assert.rejects(sessions.assertFreshSessionRestrictions(db,user,week,out.result.sesion),/SESSION_RESTRICTIONS_CHANGED_REGENERATE/);
  const saved=await saveRoute(db,p,{jueves:out.result.sesion});assert.equal(saved.code,'WEEKLY_CONTEXT_STALE');assert.equal(db.writes.length,0);
});

const recoveryChoice = (options,day) => day === 'lunes' ? options.find(o=>o.state==='RECOVERY') : undefined;
test('RECOVERY v2 round trip through actual weekly save and context reload preserves canonical identity',async()=>{
  const db=database(false),p=await plan(db,recoveryChoice);
  const recovery=await build(db,p,()=>{},'lunes'),train=await build(db,p);
  assert.equal(recovery.result.ok,true);assert.equal(train.result.ok,true);
  const original=decoded(p.calendarReceipt).admittedSlots.find(s=>s.day==='lunes');
  const saved=await saveRoute(db,p,{lunes:recovery.result.sesion,jueves:train.result.sesion});
  assert.equal(saved.ok,true,JSON.stringify(saved));
  // Simulate the JSON storage/reload boundary, not an in-memory object reference.
  db.row=JSON.parse(JSON.stringify(db.row));db.data.weekly_plan=[db.row];
  const persisted=db.row.sessions.find(s=>s.dia==='lunes');
  assert.equal(persisted.stimulusId,original.stimulusId);assert.deepEqual(persisted.intent,original.intent);
  assert.equal(persisted.tipo,original.discipline);assert.equal(load('../planning/weeklyCalendar').calendarState(persisted),'RECOVERY');
  assert.equal(persisted.state,undefined,'state is already determined by canonical stimulus, no redundant field');
  assert.equal(persisted.discipline,undefined,'tipo already preserves discipline');assert.equal(persisted.sessionReceipt,undefined);
  const reloaded=await planner.prepareAllowedWeeklyPlanContract(db,user,{...request,snapshot:db.row});
  assert.equal(reloaded.ok,true,JSON.stringify(reloaded));
  assert.equal(reloaded.fixedSessions.lunes.stimulusId,original.stimulusId);
  assert.deepEqual(plain(reloaded.fixedSessions.lunes.intent),original.intent);
  assert.equal(reloaded.fixedSessions.lunes.session_id,persisted.session_id);
  assert.equal(reloaded.contract.dayOptions.lunes[0].state,'RECOVERY');assert.equal(reloaded.contract.dayOptions.lunes[0].protected,true);
});

test('valid main_pattern RECOVERY v2 round trips structured intent without inferring from prose',async()=>{
  const db=database(false),intent={kind:'main_pattern',pattern:'run'};
  // Weekly enumeration currently publishes stimulus_only. Use the existing canonical
  // session-contract seam for the valid main_pattern case; do not broaden weekly policy.
  const result=await sessions.generateTrainingSession(db,user,{targetWeekStart:week,day:'lunes',discipline:'carrera',
    stimulus:'recuperacion_activa',intent},async prompt=>{
    const c=JSON.parse(prompt.split('CONTRACT:\n')[1].split('\nIntent canónico:')[0].split('\nContexto no autoritativo:')[0]);
    const movementId=load('prescriptionIntent').intentMatchingMovementIds(c.intent,c.allowedMovementIds)[0];
    assert.ok(movementId,'real catalog has a feasible running pattern');
    return JSON.stringify(completeDoseFixture(c,{stimulusId:c.stimulusId,structureId:c.allowedStructureIds[0],blocks:['warmup','main','cooldown'].map(blockType=>({
      blockType,movements:[{movementId,prescription:{durationSeconds:300}}]}))}));
  });
  assert.equal(result.ok,true,JSON.stringify(result));
  const persisted=JSON.parse(JSON.stringify(sessions.admitSessionContent(result.sesion,user,week)));
  assert.deepEqual(persisted.intent,intent);assert.equal(persisted.stimulusId,'recuperacion_activa');
  const reloaded=await planner.prepareAllowedWeeklyPlanContract(db,user,{...request,snapshot:{sessions:[persisted]}});
  assert.equal(reloaded.ok,true,JSON.stringify(reloaded));assert.deepEqual(plain(reloaded.fixedSessions.lunes.intent),intent);
  const reordered={...result.sesion,intent:{pattern:'run',kind:'main_pattern'}};
  assert.deepEqual(plain(sessions.verifySessionReceipt(reordered.sessionReceipt,reordered,user,week).intent),intent);
});

for(const [name,mutate] of [
  ['stimulus substitution',s=>s.stimulusId='base_aerobica'],
  ['intent substitution',s=>s.intent={kind:'main_pattern',pattern:'run'}],
  ['stimulus deletion',s=>delete s.stimulusId],['intent deletion',s=>delete s.intent],
]) test(`RECOVERY persisted ${name} fails receipt admission and actual save without writes`,async()=>{
  const db=database(false),p=await plan(db,recoveryChoice),recovery=await build(db,p,()=>{},'lunes'),train=await build(db,p);
  const changed=plain(recovery.result.sesion);mutate(changed);
  assert.throws(()=>sessions.admitSessionContent(changed,user,week),/SESSION_CONTENT_MISMATCH/);
  const saved=await saveRoute(db,p,{lunes:changed,jueves:train.result.sesion});
  assert.equal(saved.code,'SESSION_CONTENT_MISMATCH');assert.equal(db.writes.length,0);
});

for(const intent of [null,'stimulus_only',[],{kind:'main_pattern',pattern:'unknown'},{kind:'stimulus_only',pattern:'run'}])
  test(`malformed persisted RECOVERY intent ${JSON.stringify(intent)} remains fail-closed`,async()=>{
    const db=database(false),p=await plan(db,recoveryChoice),out=await build(db,p,()=>{},'lunes');
    const persisted=plain(sessions.admitSessionContent(out.result.sesion,user,week));persisted.intent=intent;
    const result=await planner.prepareAllowedWeeklyPlanContract(db,user,{...request,snapshot:{sessions:[persisted]}});
    assert.equal(result.ok,false);assert.deepEqual(plain(result.errors),['PROTECTED_RECOVERY_INFEASIBLE']);
  });

test('legacy/corrupt protected RECOVERY without stimulus metadata remains unresolved despite its title',async()=>{
  const db=database(false);
  for(const extra of [{},{intent:{kind:'stimulus_only'}}]) {
    let calls=0;
    const result=await planner.planBoundedWeek(db,user,{...request,snapshot:{sessions:[{
      dia:'lunes',tipo:'carrera',titulo:'recuperacion activa · continuo carrera',...extra,
    }]}},async()=>{calls++;return '{}';},token);
    assert.equal(result.ok,false);assert.deepEqual(plain(result.errors),['PROTECTED_RECOVERY_UNRESOLVED']);assert.equal(calls,0);
  }
});

function legacyFixture(recovery) {
  const input = contractFixture({ targetWeekStart: week, targetDay: recovery ? 'lunes' : 'jueves', discipline: recovery ? 'carrera' : 'box',
    stimulus: recovery ? 'recuperacion_activa' : 'fuerza_maxima', ...(recovery ? {} : { intent: { kind: 'stimulus_only' } }) });
  input.exposureContext.report.disciplina = input.discipline;
  const contract = load('allowedTrainingContract').buildAllowedTrainingContract(input).contract;
  const proposal = { stimulusId: contract.stimulusId, structureId: contract.allowedStructureIds[0], blocks: ['warmup','main','cooldown'].map(blockType=>({
    blockType, movements: [{ movementId: contract.allowedMovementIds[0], prescription: { durationSeconds: 60 } }] })) };
  const session = load('structuredSession').renderContractSession(contract, proposal);
  return { ...session, sessionReceipt: signed({ userCodigo: user, expiresAt: Date.now() + 60000, contract, proposal }, 'forge-session-contract-v1:') };
}
test('TRAIN v2 representation remains unchanged and client canonical-looking metadata is not persisted',async()=>{
  const session=legacyFixture(false);
  const persisted=sessions.admitSessionContent({...session,stimulusId:'invented',intent:{kind:'main_pattern',pattern:'squat'}},user,week);
  assert.deepEqual(Object.keys(persisted).sort(),['dia','tipo','titulo','por_que','debilidad_relacionada','descripcion'].sort());
  assert.equal(persisted.titulo,session.titulo);assert.equal(persisted.descripcion,session.descripcion);
});

test('legacy v1 RECOVERY representation remains unchanged; no intent is manufactured',async()=>{
  const persisted=sessions.admitSessionContent(legacyFixture(true),user,week);
  assert.equal(Object.hasOwn(persisted,'stimulusId'),false);assert.equal(Object.hasOwn(persisted,'intent'),false);
});

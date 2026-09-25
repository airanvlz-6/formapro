import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { sportsRuntime, equippedProfileFixture, fakeDatabase, plain } from '../sports/trainingContractTestRuntime.mjs';

const week = '2026-09-14', today = '2026-09-13', user = 'synthetic', token = 'synthetic-token';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const guidance = {kind:'weekly_guidance',version:2,stimulus:'fuerza_maxima'};
function proposal(c) {
  return {schemaVersion:2,stimulusId:'tecnica',structureId:'strength_sets',explanation:'Práctica controlada.',
    finalDecision:{kind:'session_decision',version:1,stimulus:'tecnica',reason:'Práctica técnica conservadora.'},
    blocks:[{blockType:'main',movements:[{movementId:'goblet_squat',prescription:{sets:3,reps:5,restSeconds:90,intensity:{kind:'rpe',value:6}}}]}]};
}
async function fixture(count=2, options={}) {
  const events=[];
  const load=sportsRuntime({console:{info:(...a)=>events.push(a),log(){},warn(){},error(){}}},(path,m)=>{
    if(path.endsWith('weeklyGenerationPreflight.ts'))return {...m,resolveWeeklyGenerationPreflight:async()=>({canContinue:true})};
    if(path.endsWith('weeklyGeneration.ts'))return {...m,beginWeeklyGeneration:async()=>({token,planningRunId:'run',currentWeek:week,nextWeek:'2026-09-21',snapshots:{[week]:options.snapshot??null}})};
    if(path.endsWith('chatAvailability.ts'))return {...m,readAvailabilityConfirmation:async()=>({ok:true,snapshotDigest:'availability',availability:{}})};
    return m;
  });
  const days=plain(load('../planning/weeklyCalendar').calendarDays);
  const tables={usuarios:{modo_entrada:'coach',categoria:'box',especialidad:'crossfit',objetivo_principal:{descripcion:'crossfit'},
    ciclo_actual:{bloque:'acumulacion',semana:1,totalSemanas:4,planningWeekStart:week,blockId:'synthetic'},
    perfil:{...equippedProfileFixture(),dias:6,duracion:'60 min'},workout_history:[],distribucion_semanal:{box:days,pista:[],carrera_larga:[]}},
    athlete_training_sources:[],athlete_state_events:[],athlete_coaching_notes:[],weekly_plan:[]};
  options.configure?.(tables);
  const db=fakeDatabase(tables), from=db.from.bind(db);let stored=options.snapshot??null;
  db.from=table=>{const q=from(table);q.gte=()=>q;if(table==='weekly_plan')q.maybeSingle=async()=>({data:stored,error:null});return q;};
  const selectedDays=days.filter(day=>!options.snapshot?.sessions.some(s=>s.dia===day)).slice(0,count);
  const planned=await load('../planning/prepareAllowedWeeklyPlanContract').planBoundedWeek(db,user,{
    targetWeekStart:week,today:options.today??today,empezarHoy:true,snapshot:options.snapshot??null,
    strategyVersion:1,coherenceVersion:1,openCoachVersion:2,parallelBuilders:options.historical?undefined:true,planningRunId:'run',
    builderTurnIntent:{version:1,purpose:'reintroduction',approach:'conservative',volumeIntent:'unspecified',intensityIntent:'unspecified',operationId:'op',weekStart:week},
  },async (_prompt,c)=>({text:'',weeklySelection:{contractVersion:3,contextDigest:c.contextDigest,selections:days.map(day=>{
    const fixed=c.dayOptions[day].find(o=>o.protected);
    return fixed?{day,optionId:fixed.optionId}:selectedDays.includes(day)?{day,state:'TRAIN',discipline:'box',guidance}:{day,state:'REST'};
  })}}),token);
  assert.equal(planned.ok,true,JSON.stringify(planned));
  const receipt=planned.estructura.calendarReceipt;
  const cal=load('../planning/weeklyCalendarAuthority'), authority=load('sessionAuthority');
  const slots=planned.estructura.sessions.filter(s=>selectedDays.includes(s.dia));
  const request=slot=>({targetWeekStart:week,day:slot.dia,discipline:slot.tipo,stimulus:slot.stimulusId,state:slot.state,
    weekly:{receipt,generationToken:token,optionId:slot.optionId,claims:slot},...(options.historical?{acceptedCurrentWeek:[]}: {})});
  const contexts=[];
  const build=(slot,complete,req=request(slot))=>authority.generateTrainingSession(db,user,req,async prompt=>{
    const c=JSON.parse(prompt.split('CONTRACT:\n')[1].split('\nContexto no autoritativo:')[0]);
    return complete?complete(c,prompt):JSON.stringify(proposal(c));
  },'', 'run');
  const save=async sessions=>{
    const sources=sessions.filter(s=>s.sessionReceipt),rows=sessions.map(s=>s.sessionReceipt?authority.verifySessionReceipt(s.sessionReceipt,s,user,week,receipt):s);
    const admitted=await cal.assertWeeklyCalendar(db,user,week,rows,receipt,{requireV2:true,generationToken:token,sessionEvidence:sources});
    const checked=await load('../planning/enforceWholeWeek').enforceWholeWeek(user,week,rows,sources,receipt,admitted,async()=>JSON.stringify({decision:'KEEP',rationale:'Distribución deliberada.',days:[]}));
    assert.equal(checked.ok,true,JSON.stringify(checked));
    for(const s of checked.sessionEvidence)await authority.assertFreshSessionRestrictions(db,user,week,s);
    return checked;
  };
  return {load,events,days,tables,db,planned,receipt,cal,authority,slots,request,build,save,contexts,setStored:v=>{stored=v;tables.weekly_plan=v?[v]:[];}};
}

for(const count of [2,5])test(`${count} real Builders overlap, share one context, finish backwards and save only after complete fan-in`,{timeout:90000},async()=>{
  const f=await fixture(count),gate=deferred(),started=[],finished=[],releases=new Map(),built=new Map();let saved=0;
  const generating=f.load('../chat/coachFirstGeneration').generateCoachFirstWeek(f.db,user,{week,includeToday:true,snapshotDigest:'availability'},'op',today,
    async(action,args)=>{
      if(action==='analizar_bloque_semana')return {ok:true,analisis:{tipo_semana:'acumulacion'}};
      if(action==='planificar_semana')return f.planned;
      if(action==='construir_sesion_dia'){
        assert.equal(args.acceptedCurrentWeek,undefined);
        const r=await f.build(f.slots.find(s=>s.dia===args.dia),async(c,prompt)=>{
          const d=deferred();releases.set(c.targetDay,d);started.push(c.targetDay);if(started.length===count)gate.resolve();
          await d.promise;return JSON.stringify(proposal(c));
        });
        assert.equal(r.ok,true,JSON.stringify(r));built.set(args.dia,r.sesion);finished.push(args.dia);return r;
      }
      assert.equal(action,'guardar_plan_semana');assert.equal(finished.length,count);saved++;
      assert.deepEqual(plain(args.plan.sessions.map(s=>s.dia)),f.days);
      await f.save(args.plan.sessions);return {ok:true,commitConfirmed:true};
    });
  await gate.promise;
  assert.equal(started.length,count);assert.equal(finished.length,0);assert.equal(saved,0);
  for(const day of [...started].reverse()){
    releases.get(day).resolve();
    while(!finished.includes(day))await new Promise(r=>setTimeout(r,1));
  }
  const result=await generating;assert.equal(result.status,'committed');assert.equal(saved,1);
  assert.deepEqual(finished,[...started].reverse());
  const proofs=[...built.values()].map(s=>JSON.parse(Buffer.from(s.sessionReceipt.split('.')[0],'base64url')));
  assert.equal(new Set(proofs.map(p=>p.weekly.authorization.commonWeekContextDigest)).size,1);
  assert.equal(new Set(proofs.map(p=>p.weekly.authorization.factualContractDigest)).size,count);
  for(const p of proofs){
    assert.equal(p.weekly.priorSessions,undefined);
    assert.deepEqual(p.coachingContext.commonWeekContext,proofs[0].coachingContext.commonWeekContext);
    assert.equal(p.coachingContext.commonWeekContext.executionHistory.completed.length,0);
    assert.equal(p.coachingContext.currentWeek,undefined);
    assert.equal(p.coachingContext.commonWeekContext.slots.length,7);
    assert.equal(p.coachingContext.commonWeekContext.turnPlanningIntent.purpose,'reintroduction');
    assert.equal(p.coachingContext.commonWeekContext.slots.some(s=>s.structuredPrescription||s.proposal||s.finalDecision),false);
  }
  const diagnostics=f.events.filter(e=>e[0].startsWith('PARALLEL_'));
  assert.equal(diagnostics.filter(e=>e[0]==='PARALLEL_BUILDER_COMPLETE').length,count);
  assert.deepEqual(plain(diagnostics.at(-1)[1]),{planningRunId:'run',totalDurationMs:diagnostics.at(-1)[1].totalDurationMs,successCount:count,failureCount:0});
  assert.doesNotMatch(JSON.stringify(diagnostics),/restrictions|commonWeekContext|conservative|prompt/);
});

test('one failed Builder waits for all in-flight Builders and makes zero save calls',{timeout:60000},async()=>{
  const f=await fixture(),both=deferred(),release=deferred();let calls=0,settled=false,saves=0;
  const task=f.load('../chat/coachFirstGeneration').generateCoachFirstWeek(f.db,user,{week,includeToday:true,snapshotDigest:'availability'},'op',today,async(action)=>{
    if(action==='analizar_bloque_semana')return {ok:true,analisis:{}};
    if(action==='planificar_semana')return f.planned;
    if(action==='guardar_plan_semana'){saves++;return {ok:true,commitConfirmed:true};}
    calls++;if(calls===1)return {ok:false};both.resolve();await release.promise;throw Error('provider failed');
  }).then(r=>{settled=true;return r;});
  await both.promise;await new Promise(r=>setTimeout(r,5));assert.equal(settled,false);assert.equal(saves,0);
  release.resolve();assert.equal((await task).code,'BUILDER_NOT_ADMITTED');assert.equal(saves,0);
});

test('common context digest is stable, immutable, bounded and independent of key insertion order',async()=>{
  const f=await fixture(),m=f.load('../planning/commonWeekContext'),e=f.cal.verifyWeeklyCalendarReceipt(f.receipt,user,week,true);
  assert.ok(Object.isFrozen(e.commonWeekContext));assert.ok(Object.isFrozen(e.commonWeekContext.slots));
  assert.equal(m.commonContextDigest({b:2,a:{d:4,c:3}}),m.commonContextDigest({a:{c:3,d:4},b:2}));
  for(const key of ['user','weekStart','generationDigest','sourceSnapshotDigest','weeklyContractDigest','admittedCalendarDigest']){
    const bad=plain(e);bad.commonWeekContext[key]='wrong';assert.throws(()=>m.verifyCommonWeekContext(bad),/COMMON_WEEK_CONTEXT_INVALID/);
  }
  assert.throws(()=>m.verifyCommonWeekContext({...plain(e),builderProtocol:undefined}),/COMMON_WEEK_CONTEXT_INVALID/);
  const oversized=plain(e);oversized.commonWeekContext.canonicalFacts.extra='x'.repeat(48001);
  oversized.commonWeekContextDigest=m.commonContextDigest(oversized.commonWeekContext);
  assert.throws(()=>m.verifyCommonWeekContext(oversized),/COMMON_WEEK_CONTEXT_INVALID/);
});

test('new protocol rejects wrong day, discipline, REST, protected and unavailable slots before provider',async()=>{
  const f=await fixture(2,{today:week,snapshot:{id:'old',user_codigo:user,week_start:week,revision:1,sessions:[{dia:'lunes',tipo:'box',titulo:'Completed',completada:true}]},
    configure:t=>{t.usuarios.perfil.prescription_access={'2026-09-20':{availability:'unavailable'}};}});
  for(const change of [{day:'viernes'},{discipline:'carrera'},{day:'lunes'},{day:'domingo'}]){
    const req={...f.request(f.slots[0]),...change};
    if(change.day){const slot=f.cal.verifyWeeklyCalendarReceipt(f.receipt,user,week,true).admittedSlots.find(s=>s.day===change.day);req.weekly={...req.weekly,optionId:slot.optionId};}
    const r=await f.build(f.slots[0],()=>{assert.fail('provider must not run');},req);assert.equal(r.ok,false);
    assert.match(JSON.stringify(r),change.day?/WEEKLY_SLOT_NOT_EXECUTABLE/:/WEEKLY_SLOT_MISMATCH/);
  }
});

test('new protocol authenticates receipts, individual facts, complete coverage and repair provenance',async()=>{
  const f=await fixture(),results=await Promise.all(f.slots.map(s=>f.build(s)));
  assert.ok(results.every(r=>r.ok),JSON.stringify(results));
  const sources=results.map(r=>r.sesion),a=f.authority,cal=f.cal;
  const rows=f.planned.estructura.sessions.map(s=>sources.find(b=>b.dia===s.dia)??a.admitSessionContent({dia:s.dia,tipo:s.tipo},user,week));
  const raw=JSON.parse(Buffer.from(sources[0].sessionReceipt.split('.')[0],'base64url'));
  raw.weekly.authorization.day='domingo';
  const tampered=Buffer.from(JSON.stringify(raw)).toString('base64url')+'.'+sources[0].sessionReceipt.split('.')[1];
  assert.throws(()=>a.verifySessionReceipt(tampered,sources[0],user,week,f.receipt),/INVALID/);
  assert.throws(()=>a.verifySessionReceipt(sources[0].sessionReceipt,{...sources[0],dia:'domingo'},user,week,f.receipt),/MISMATCH/);
  assert.throws(()=>a.verifySessionReceipt(sources[0].sessionReceipt,sources[0],'other',week,f.receipt),/MISMATCH/);
  // Even a server-signed inconsistent envelope must not bypass slot/common/factual bindings.
  for(const mutate of [p=>p.weekly.authorization.day='domingo',p=>p.weekly.authorization.commonWeekContextDigest='wrong',
    p=>p.contract.doseContext.timeBudget.maximumSeconds=1,p=>p.coachingContext.commonWeekContext.executionHistory.completed.push({date:week})]){
    const proof=JSON.parse(Buffer.from(sources[0].sessionReceipt.split('.')[0],'base64url'));mutate(proof);
    const payload=Buffer.from(JSON.stringify(proof)).toString('base64url');
    const receipt=payload+'.'+createHmac('sha256','isolated-sports-test-key').update('forge-session-contract-v1:'+payload).digest('base64url');
    assert.throws(()=>a.verifySessionReceipt(receipt,sources[0],user,week,f.receipt),/MISMATCH/);
  }
  await assert.rejects(cal.assertWeeklyCalendar(f.db,user,week,rows,f.receipt,{requireV2:true,sessionEvidence:[sources[0],sources[0]]}),/COVERAGE/);
  await assert.rejects(cal.assertWeeklyCalendar(f.db,user,week,rows.slice(1),f.receipt,{requireV2:true,sessionEvidence:sources}),/COVERAGE/);
  const checked=await f.save(rows);assert.equal(checked.ok,true);
  const repaired=await a.repairSessionWithinReceipt(sources[0],user,week,f.receipt,[],[],async()=>{
    const p=proposal(raw.contract);p.stimulusId='control';p.finalDecision.stimulus='control';return JSON.stringify(p);
  });
  const proof=JSON.parse(Buffer.from(repaired.sessionReceipt.split('.')[0],'base64url'));
  assert.equal(proof.revision,1);assert.ok(proof.previousDecisionDigest);assert.deepEqual(proof.weekly.authorization,JSON.parse(Buffer.from(sources[0].sessionReceipt.split('.')[0],'base64url')).weekly.authorization);
  a.verifySessionReceipt(repaired.sessionReceipt,repaired,user,week,f.receipt);
  await assert.rejects(a.repairSessionWithinReceipt(sources[0],user,week,f.receipt,[],[],async()=>JSON.stringify({...proposal(raw.contract),day:'domingo'})),/AUTHORIZATION_CHANGED/);
  f.tables.usuarios.perfil.prescription_access={'2026-09-14':{availability:'unavailable'}};
  await assert.rejects(a.assertFreshSessionRestrictions(f.db,user,week,sources[0]),/AVAILABILITY_CHANGED/);
  const stale=await f.build(f.slots[0],()=>assert.fail('stale provider'));assert.equal(stale.ok,false);
});

test('parallel prescriptions never enter confirmed history, actual load, exposure or longitudinal outcomes',async()=>{
  const f=await fixture(),loader=f.load('../athlete/loadAthletePrescriptionContext'),loadActual=f.load('../trainingLoad/loadTrainingLoad');
  const before=await loader.loadAthletePrescriptionContext(f.db,user,{asOfDate:week});
  const actualBefore=plain((await loadActual.loadTrainingLoad(f.db,user,week,'2026-09-20')).actual);
  const cycle=plain(f.tables.usuarios.ciclo_actual),history=plain(f.tables.usuarios.workout_history);
  const results=await Promise.all(f.slots.map(s=>f.build(s)));assert.ok(results.every(r=>r.ok));
  const sessions=f.planned.estructura.sessions.map(s=>results.find(r=>r.sesion.dia===s.dia)?.sesion??{dia:s.dia,tipo:s.tipo});
  assert.ok(sessions.every(s=>s.completada!==true));
  const adapter=f.load('../trainingLoad/prescriptionLoadAdapter');
  assert.equal(adapter.plannedPrescriptionLoad(results[0].sesion,week,'new').kind,'planned');
  f.setStored({id:'new',revision:1,week_start:week,sessions});
  const after=await loader.loadAthletePrescriptionContext(f.db,user,{asOfDate:week});
  assert.deepEqual(plain(after.history.completedSessions),plain(before.history.completedSessions));
  assert.deepEqual(plain(after.history.exposure),plain(before.history.exposure));
  assert.deepEqual(plain(after.history.recentFrequency),plain(before.history.recentFrequency));
  assert.deepEqual(plain((await loadActual.loadTrainingLoad(f.db,user,week,'2026-09-20')).actual),actualBefore);
  assert.deepEqual(f.tables.usuarios.workout_history,history);assert.deepEqual(f.tables.usuarios.ciclo_actual,cycle);
  assert.equal(after.history.prescriptions.some(p=>p.factualState==='PLANNED_ONLY'),true);
  // Confirmation remains the existing boundary: only now may the recorded session enter completed history.
  sessions[0]={...sessions[0],completada:true,descripcion_real:'Trabajo confirmado',titulo_real:'Confirmado'};
  f.setStored({id:'new',revision:2,week_start:week,sessions});
  const confirmed=await loader.loadAthletePrescriptionContext(f.db,user,{asOfDate:week});
  assert.equal(confirmed.history.completedSessions.length,before.history.completedSessions.length+1);
});

test('historical receipts still use historical sibling verification',async()=>{
  const f=await fixture(1,{historical:true}),r=await f.build(f.slots[0]);assert.equal(r.ok,true);
  const proof=JSON.parse(Buffer.from(r.sesion.sessionReceipt.split('.')[0],'base64url'));
  assert.deepEqual(proof.weekly.priorSessions,{});assert.equal(proof.weekly.authorization,undefined);
  f.authority.verifySessionReceipt(r.sesion.sessionReceipt,r.sesion,user,week,f.receipt);
});

for(const [name,configure,code] of [
  ['restriction',t=>t.athlete_coaching_notes.push({id:'restriction',status:'pending',constraint_level:'hard',movement:'goblet_squat'}),/RESTRICT/],
  ['resources',t=>{for(const e of ['mancuerna','kettlebell'])t.usuarios.perfil.prescription_signals[`equipment.${e}`]={state:'unavailable',updatedAt:today};},/FACTUAL_REQUIREMENT_UNAVAILABLE/],
])test(`parallel authority retains ${name} guardrails`,async()=>{
  const f=await fixture(1,{configure}),r=await f.build(f.slots[0]);
  assert.equal(r.ok,false);assert.match(JSON.stringify(r),code);
});

test('parallel authority retains known reference incompatibility',async()=>{
  const f=await fixture(1),r=await f.build(f.slots[0]);assert.equal(r.ok,true);
  const c=plain(r.trainingContract);delete c.intensityAuthority;
  c.doseContext.references=[{id:'1rm:bench_press',kind:'1rm',movementId:'bench_press',value:100,unit:'kg',source:'synthetic',observedAt:null}];
  const p=proposal(c);p.blocks[0].movements[0].prescription.intensity={kind:'percent_1rm',referenceId:'1rm:bench_press',value:60};
  const checked=f.load('structuredSession').validateSessionAgainstTrainingContract(c,p);
  assert.equal(checked.ok,false);assert.ok(checked.violations.includes('BENCHMARK_RESOLUTION:ONE_RM_MOVEMENT_REQUIRED'));
});

test('parallel fan-in uses whole-week admission and CAS conflict cannot overwrite a newer revision',async()=>{
  const f=await fixture(),r=await Promise.all(f.slots.map(s=>f.build(s)));assert.ok(r.every(s=>s.ok));
  const rows=f.planned.estructura.sessions.map(s=>r.find(b=>b.sesion.dia===s.dia)?.sesion??f.authority.admitSessionContent({dia:s.dia,tipo:s.tipo},user,week));
  const checked=await f.save(rows);
  const {sessions,identityProof}=f.load('../planning/prescriptionIdentity').preparePrescriptionSessions(checked.sessions.map(session=>({kind:'new',session})));
  const candidate={week_start:week,revision:1,sessions};
  const v=await f.load('../planning/planMutation').validatePlanMutation({command:{operationType:'create_week',source:'weekly_orchestrator',target:{userCodigo:user,weekStart:week},proposal:candidate},candidate,context:{identityProof},changeSet:{operationType:'create_week',affectedDays:f.days,changedFields:['sessions']}});
  assert.equal(v.status,'ready_for_commit');let stored;
  const created=await f.load('../planning/planPersistence').createPlan({from:()=>({insert(row){stored={...row,id:'saved'};return {select:()=>({maybeSingle:async()=>({data:stored,error:null})})};}})},v.mutation);
  assert.equal(created.status,'committed');assert.equal(stored.sessions.length,7);
  const changed={...stored,resumen_semana:'Reviewed'};
  const mutation=await f.load('../planning/planMutation').validatePlanMutation({command:{operationType:'set_week_summary',source:'direct_session_update',target:{userCodigo:user,weekStart:week},expectedRevision:1,proposal:{summary:'Reviewed'}},candidate:changed,context:{existingPlan:stored},changeSet:{operationType:'set_week_summary',affectedDays:[],changedFields:['resumen_semana']}});
  assert.equal(mutation.status,'ready_for_commit');const actual={...stored,revision:2},before=plain(actual),filters={};let applied=0;
  const db={from:()=>({update(row){this.row=row;return this;},eq(k,v){filters[k]=v;return this;},select(){return this;},async maybeSingle(){if(filters.revision!==actual.revision)return {data:null,error:null};applied++;Object.assign(actual,this.row);return {data:actual,error:null};}})};
  const conflict=await f.load('../planning/planPersistence').mutatePlanWithCAS(db,mutation.mutation);
  assert.equal(conflict.status,'conflict');assert.equal(filters.revision,1);assert.equal(applied,0);assert.deepEqual(plain(actual),before);
});

test('production Coach-first selects the new protocol server-side; the client cannot request it',()=>{
  const route=readFileSync('app/api/chat/route.ts','utf8');
  assert.match(route,/coachFirstPlanning \? \{ parallelBuilders: true as const, builderTurnIntent: coachFirstPlanning.turnIntent \}/);
  assert.doesNotMatch(route,/parallelBuilders:\s*datos\./);
});

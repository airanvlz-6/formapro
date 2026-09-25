import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, equippedProfileFixture, fakeDatabase, plain } from '../sports/trainingContractTestRuntime.mjs';

const week = '2026-09-14', today = '2026-09-13';
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [today + 'T12:00:00Z'])); } static now() { return Date.parse(today + 'T12:00:00Z'); } }
const runtime = (events=[]) => sportsRuntime({ process:{env:{SUPABASE_SERVICE_ROLE_KEY:'isolated-sports-test-key',FORGE_WEEKLY_COACHING_DIAGNOSTICS:'1'}}, Date: FixedDate, console: { log() {}, info(...args) {events.push(args);}, warn() {}, error() {} } });
function proposal(c, movementId = 'bench_press') {
  return { schemaVersion: 2, stimulusId: c.stimulusId, structureId: 'strength_sets', explanation: 'Trabajo controlado con dosis elegida para el contexto.',
    blocks: [{ blockType: 'main', movements: [{ movementId, prescription: { sets: 3, reps: 5, restSeconds: 90, intensity: { kind: 'rpe', value: 6 } } }] }] };
}
function database(load, snapshot = null) {
  const days = plain(load('../planning/weeklyCalendar').calendarDays);
  const tables = { usuarios: { modo_entrada: 'coach', categoria: 'box', especialidad: 'crossfit', objetivo_principal: { descripcion: 'crossfit' },
    ciclo_actual: { bloque: 'acumulacion', semana: 1, totalSemanas: 4, planningWeekStart: week, blockId: 'synthetic' },
    perfil: { ...equippedProfileFixture(), dias: 6, duracion: '60 min' }, workout_history: [], distribucion_semanal: { box: days, pista: [], carrera_larga: [] } },
    athlete_training_sources: [], athlete_state_events: [], athlete_coaching_notes: [], weekly_plan: [] };
  const db = fakeDatabase(tables), from = db.from.bind(db);
  db.from = table => { const q = from(table); if (table === 'weekly_plan') q.maybeSingle = async () => ({ data: snapshot, error: null }); return q; };
  return { db, tables, days };
}


const guidance = {kind:'weekly_guidance',version:2,adaptation:'Fuerza y control',stimulus:'fuerza_maxima',patterns:['squat','hinge'],reason:'Recomendación descriptiva.'};
const finalDecision = {kind:'session_decision',version:1,stimulus:'tecnica',reason:'Reintroducción conservadora con práctica técnica.'};
async function setup(options={}) {
  const events=[],load=runtime(events),{db,tables,days}=database(load,options.snapshot ?? null);
  options.configure?.(tables);
  const r=await load('../planning/prepareAllowedWeeklyPlanContract').planBoundedWeek(db,'synthetic',{
    targetWeekStart:week,today:options.today ?? today,empezarHoy:true,snapshot:options.snapshot ?? null,strategyVersion:1,coherenceVersion:1,openCoachVersion:2,
  },async prompt=>{
    const c=JSON.parse(prompt.split('WEEKLY_CONTRACT:\n')[1]);
    assert.equal(c.contractVersion,3);
    return load('../planning/weeklyGuidanceOutput').readWeeklyGuidanceOutput({stop_reason:'tool_use',content:[{type:'tool_use',id:'weekly',name:'submit_weekly_guidance',input:{contractVersion:3,contextDigest:c.contextDigest,selections:days.map(day=>{
      const fixed=c.dayOptions[day].find(o=>o.protected);
      return fixed?{day,optionId:fixed.optionId}:day==='martes'?{guidance:options.guidance ?? guidance,discipline:'box',state:options.state ?? 'TRAIN',day}:{day,state:'REST'};
    })}}]});
  },'synthetic-token');
  assert.equal(r.ok,true,JSON.stringify(r));
  const receipt=r.estructura.calendarReceipt, slot=r.estructura.sessions.find(s=>s.dia==='martes');
  const request={targetWeekStart:week,day:slot.dia,discipline:slot.tipo,stimulus:slot.stimulusId,state:slot.state,acceptedCurrentWeek:[],weekly:{receipt,generationToken:'synthetic-token',optionId:slot.optionId,claims:slot}};
  const build=async (mutate=p=>p,req=request)=>load('sessionAuthority').generateTrainingSession(db,'synthetic',req,async prompt=>{
    assert.match(prompt,/reintroduction/); assert.match(prompt,/conservative/);
    const c=JSON.parse(prompt.split('CONTRACT:\n')[1].split('\nContexto no autoritativo:')[0]);
    const p=proposal(c,'goblet_squat');p.stimulusId='tecnica';p.finalDecision=structuredClone(finalDecision);mutate(p);
    return JSON.stringify(p);
  },'TurnPlanningIntent: reintroduction + conservative');
  return {load,db,tables,days,r,receipt,slot,request,build,events};
}
async function admit(x,built) {
  const a=x.load('sessionAuthority'), cal=x.load('../planning/weeklyCalendarAuthority');
  const content=a.verifySessionReceipt(built.sesion.sessionReceipt,built.sesion,'synthetic',week,x.receipt);
  const rows=x.r.estructura.sessions.map(s=>s.dia==='martes'?content:s.weeklyProtected?s:a.admitSessionContent({dia:s.dia,tipo:s.tipo},'synthetic',week));
  const authority=await cal.assertWeeklyCalendar(x.db,'synthetic',week,rows,x.receipt,{requireV2:true,sessionEvidence:[built.sesion]});
  const review=await x.load('../planning/enforceWholeWeek').enforceWholeWeek('synthetic',week,rows,[built.sesion],x.receipt,authority,async()=>JSON.stringify({decision:'KEEP',rationale:'Decisión técnica consciente.',days:[]}));
  assert.equal(review.ok,true,JSON.stringify(review));
  cal.weeklySaveAdmission(x.receipt,'synthetic',week,review.sessions);
  await a.assertFreshSessionRestrictions(x.db,'synthetic',week,built.sesion);
  return {content,rows:review.sessions,authority};
}

test('guidance v2 E2E: fuerza_maxima -> tecnica passes Builder, receipts, whole-week, save admission and persists final identity',async()=>{
  const x=await setup(), b=await x.build();assert.equal(b.ok,true,JSON.stringify({ok:b.ok,code:b.code,errors:b.errors,violations:b.violations}));
  assert.equal(b.trainingContract.contractVersion,5);
  assert.equal(b.attempts,1);assert.equal(x.r.attempts,1);
  const {rows}=await admit(x,b);
  const rendered=rows.find(s=>s.dia==='martes');
  assert.equal(rendered.stimulusId,'tecnica');assert.match(rendered.titulo,/tecnica/);
  assert.doesNotMatch(rendered.titulo+rendered.descripcion+rendered.por_que,/fuerza.maxima/);
  assert.equal(rendered.structuredPrescription.coachingGuidance.stimulus,'fuerza_maxima');
  assert.equal(rendered.structuredPrescription.finalDecision.stimulus,'tecnica');
  const proof=JSON.parse(Buffer.from(b.sesion.sessionReceipt.split('.')[0],'base64url'));
  assert.equal(proof.revision,0);assert.match(proof.contextDigest,/^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(proof),/reintroduction|TurnPlanningIntent/);
  const {sessions,identityProof}=x.load('../planning/prescriptionIdentity').preparePrescriptionSessions(rows.map(session=>({kind:'new',session})));
  const candidate={week_start:week,revision:1,sessions};
  const validated=await x.load('../planning/planMutation').validatePlanMutation({command:{operationType:'create_week',source:'weekly_orchestrator',target:{userCodigo:'synthetic',weekStart:week},proposal:candidate},candidate,context:{identityProof},changeSet:{operationType:'create_week',affectedDays:x.days,changedFields:['sessions']}});
  assert.equal(validated.status,'ready_for_commit',JSON.stringify(validated));
  let written;
  const db={from:()=>({insert(v){written=v;return {select(){return {maybeSingle:async()=>({data:{...v,id:'persisted'},error:null})}}}}})};
  const persisted=await x.load('../planning/planPersistence').createPlan(db,validated.mutation);
  assert.equal(persisted.status,'committed',JSON.stringify(persisted));
  assert.equal(written.sessions.find(s=>s.dia==='martes').stimulusId,'tecnica');
  const existing={...written,id:'persisted',revision:1};
  const changed={...existing,resumen_semana:'Reviewed'};
  const mutation=await x.load('../planning/planMutation').validatePlanMutation({command:{operationType:'set_week_summary',source:'direct_session_update',target:{userCodigo:'synthetic',weekStart:week},expectedRevision:1,proposal:{summary:'Reviewed'}},candidate:changed,context:{existingPlan:existing},changeSet:{operationType:'set_week_summary',affectedDays:[],changedFields:['resumen_semana']}});
  assert.equal(mutation.status,'ready_for_commit',JSON.stringify(mutation));
  const filters={};let writes=0;
  const casDb={from:()=>({update(){writes++;return this},eq(k,v){filters[k]=v;return this},select(){return this},maybeSingle:async()=>({data:null,error:null})})};
  const conflict=await x.load('../planning/planPersistence').mutatePlanWithCAS(casDb,mutation.mutation);
  assert.equal(conflict.status,'conflict');assert.equal(filters.revision,1);assert.equal(writes,1);

  const diagnostics=x.events.filter(e=>e[0].startsWith('WEEKLY_GUIDANCE_'));
  assert.ok(diagnostics.some(e=>e[0]==='WEEKLY_GUIDANCE_ADMISSION'));assert.ok(diagnostics.some(e=>e[0]==='WEEKLY_GUIDANCE_SESSION_ADMITTED'));assert.ok(diagnostics.some(e=>e[0]==='WEEKLY_GUIDANCE_SAVE'));
  assert.doesNotMatch(JSON.stringify(diagnostics),/Reintroducción|conservative|Recomendación/);
  assert.equal(x.load('../planning/weeklyCalendarAuthority').admittedWeekObjective(x.receipt,'synthetic',week,'old',rows),'tecnica');
});
for (const [name,mutate] of [
  ['changed day',p=>p.day='jueves'],['unauthorized discipline',p=>p.discipline='carrera'],
  ['missing revision reason',p=>delete p.finalDecision.reason],
]) test(`guidance v2 rejects ${name}`,async()=>{
  const x=await setup(),b=await x.build(mutate);assert.equal(b.ok,false,JSON.stringify({ok:b.ok,code:b.code,errors:b.errors,violations:b.violations}));
});
test('guidance v2 accepts optional role/method and absent sports details without invented IDs',async()=>{
  const x=await setup({guidance:{kind:'weekly_guidance',version:2}}),b=await x.build();assert.equal(b.ok,true,JSON.stringify({ok:b.ok,code:b.code,errors:b.errors,violations:b.violations}));await admit(x,b);
  assert.deepEqual(plain(b.trainingContract.coachingGuidance),{kind:'weekly_guidance',version:2});assert.equal(b.trainingContract.intent,undefined);
});
test('guidance v2 unavailable day remains forbidden at signed slot resolution',async()=>{
  const x=await setup({configure:t=>t.usuarios.distribucion_semanal.box=['martes']}),b=await x.build(p=>p,{...x.request,day:'jueves'});
  assert.equal(b.ok,false);assert.match(JSON.stringify(b),/WEEKLY_SLOT/);
});
test('guidance v2 explicit absent equipment still rejects final technique',async()=>{
  const x=await setup({configure:t=>{for(const e of ['mancuerna','kettlebell']) t.usuarios.perfil.prescription_signals[`equipment.${e}`]={state:'unavailable',updatedAt:today}}}),b=await x.build();
  assert.equal(b.ok,false,JSON.stringify({ok:b.ok,code:b.code,errors:b.errors,violations:b.violations}));assert.match(JSON.stringify(b),/FACTUAL_REQUIREMENT_UNAVAILABLE/);
});
test('guidance v2 known movement restriction still rejects final technique',async()=>{
  const x=await setup({configure:t=>t.athlete_coaching_notes.push({id:'restriction',status:'pending',constraint_level:'hard',movement:'goblet_squat'})}),b=await x.build();
  assert.equal(b.ok,false,JSON.stringify({ok:b.ok,code:b.code,errors:b.errors,violations:b.violations}));assert.match(JSON.stringify(b),/RESTRICT/);
});
test('guidance v2 stale context cannot be saved or used to build',async()=>{
  const x=await setup(),b=await x.build();assert.equal(b.ok,true,JSON.stringify({ok:b.ok,code:b.code,errors:b.errors,violations:b.violations}));
  x.tables.usuarios.perfil.prescription_signals['equipment.mancuerna']={state:'unavailable',updatedAt:today};
  await assert.rejects(admit(x,b),/STALE/);assert.equal((await x.build()).ok,false);
});
test('guidance v2 unknown reference is preserved without fabricated kilograms',async()=>{
  const x=await setup(),b=await x.build(p=>p.blocks[0].movements[0].prescription.intensity={kind:'percent_1rm',referenceId:'invented-rm',value:60});
  assert.equal(b.ok,true,JSON.stringify({ok:b.ok,code:b.code,errors:b.errors,violations:b.violations}));await admit(x,b);
  assert.equal(b.sesion.structuredPrescription.calculatedLoads.length,0);
});
test('guidance v2 repair replaces final decision, keeps original provenance and revalidates receipt',async()=>{
  const x=await setup(),b=await x.build();assert.equal(b.ok,true,JSON.stringify({ok:b.ok,code:b.code,errors:b.errors,violations:b.violations}));
  const repaired=await x.load('sessionAuthority').repairSessionWithinReceipt(b.sesion,'synthetic',week,x.receipt,[],[],async prompt=>{
    assert.match(prompt,/Last admitted finalDecision/);assert.match(prompt,/tecnica/);
    const c=JSON.parse(prompt.split('CONTRACT:\n')[1].split('\nWEEK_STRATEGY:')[0]);
    const p=proposal(c,'goblet_squat');p.stimulusId='control';p.finalDecision={kind:'session_decision',version:1,stimulus:'control',reason:'Revisión tras observar las sesiones hermanas.'};return JSON.stringify(p);
  });
  const verified=x.load('sessionAuthority').verifySessionReceipt(repaired.sessionReceipt,repaired,'synthetic',week,x.receipt);
  assert.equal(verified.stimulusId,'control');assert.equal(verified.structuredPrescription.coachingGuidance.stimulus,'fuerza_maxima');
  const proof=JSON.parse(Buffer.from(repaired.sessionReceipt.split('.')[0],'base64url'));assert.equal(proof.revision,1);assert.ok(proof.previousDecisionDigest);
  await admit(x,{sesion:repaired});
});
test('guidance v2 protected completed session cannot be selected, mutated or replaced',async()=>{
  const snapshot={id:'plan',user_codigo:'synthetic',week_start:week,revision:1,sessions:[{dia:'lunes',tipo:'box',titulo:'Completed',descripcion:'Done',completada:true}]};
  const x=await setup({snapshot,today:week}),b=await x.build();assert.equal(b.ok,true,JSON.stringify({ok:b.ok,code:b.code,errors:b.errors,violations:b.violations}));
  const cal=x.load('../planning/weeklyCalendarAuthority'),proof=cal.verifyWeeklyCalendarReceipt(x.receipt,'synthetic',week,true);
  const fixed=proof.admittedSlots.find(s=>s.day==='lunes');
  assert.throws(()=>cal.resolveWeeklySlot(proof,{day:'lunes',optionId:fixed.optionId}),/NOT_EXECUTABLE/);
  const rows=x.r.estructura.sessions.map(s=>s.dia==='martes'?b.sesion:s.weeklyProtected?{...snapshot.sessions[0],titulo:'Changed'}:{dia:s.dia,tipo:'descanso'});
  await assert.rejects(cal.assertWeeklyCalendar(x.db,'synthetic',week,rows,x.receipt,{sessionEvidence:[b.sesion]}),/PROTECTED_SESSION_MISMATCH/);
});
test('weekly structured output never consumes prose or ambiguous tool calls',()=>{
  const load=runtime(),read=load('../planning/weeklyGuidanceOutput').readWeeklyGuidanceOutput;
  assert.throws(()=>read({stop_reason:'end_turn',content:[{type:'text',text:'{}'}]}),/OUTPUT_INVALID/);
  assert.throws(()=>read({stop_reason:'tool_use',content:[{type:'tool_use',id:'x',name:'submit_weekly_guidance',input:{}},{type:'tool_use',id:'y',name:'submit_weekly_guidance',input:{}}]}),/OUTPUT_INVALID/);
});

test('guidance v2 executable calendar recommendation can change RECOVERY to TRAIN without authorizing a REST day',async()=>{
  const x=await setup({state:'RECOVERY'}),b=await x.build();assert.equal(b.ok,true);await admit(x,b);
  const proof=x.load('../planning/weeklyCalendarAuthority').verifyWeeklyCalendarReceipt(x.receipt,'synthetic',week,true);
  const rest=proof.admittedSlots.find(s=>s.day==='jueves');
  assert.throws(()=>x.load('../planning/weeklyCalendarAuthority').resolveWeeklySlot(proof,{day:'jueves',optionId:rest.optionId}),/NOT_EXECUTABLE/);
});
test('guidance v2 save rejects tampered final identity and foreign user',async()=>{
  const x=await setup(),b=await x.build();assert.equal(b.ok,true);
  const verify=x.load('sessionAuthority').verifySessionReceipt;
  assert.throws(()=>verify(b.sesion.sessionReceipt,{...b.sesion,stimulusId:'fuerza_maxima'},'synthetic',week,x.receipt),/CONTENT_MISMATCH/);
  assert.throws(()=>verify(b.sesion.sessionReceipt,b.sesion,'another-user',week,x.receipt),/CONTEXT_MISMATCH/);
});
test('guidance v2 repair cannot widen authorization or replace an admitted decision after failed guardrails',async()=>{
  const x=await setup(),b=await x.build();assert.equal(b.ok,true);
  await assert.rejects(x.load('sessionAuthority').repairSessionWithinReceipt(b.sesion,'synthetic',week,x.receipt,[],[],async()=>JSON.stringify({
    ...proposal({stimulusId:'tecnica'},'goblet_squat'),day:'jueves',finalDecision,
  })),/AUTHORIZATION_CHANGED/);
  await admit(x,b);
});
test('guidance v2 known incompatible reference still rejects',async()=>{
  const x=await setup(),b=await x.build();assert.equal(b.ok,true);
  const c=plain(b.trainingContract);
  delete c.intensityAuthority;
  c.doseContext.references=[{id:'1rm:bench_press',kind:'1rm',movementId:'bench_press',value:100,unit:'kg',source:'synthetic',observedAt:null}];
  const p={...proposal(c,'goblet_squat'),finalDecision};
  p.blocks[0].movements[0].prescription.intensity={kind:'percent_1rm',referenceId:'1rm:bench_press',value:60};
  const result=x.load('structuredSession').validateSessionAgainstTrainingContract(c,p);
  assert.equal(result.ok,false);assert.ok(result.violations.includes('BENCHMARK_RESOLUTION:ONE_RM_MOVEMENT_REQUIRED'),JSON.stringify(result));
});
test('guidance v2 explicit absent capability still rejects distance work',async()=>{
  const x=await setup({configure:t=>t.usuarios.perfil.prescription_signals['capability.canMeasureDistance']={state:'unavailable',updatedAt:today}});
  const b=await x.build(p=>{p.blocks[0].movements=[{movementId:'run',prescription:{distanceMeters:400,intensity:{kind:'rpe',value:4}}}]});
  assert.equal(b.ok,false);assert.match(JSON.stringify(b),/FACTUAL_REQUIREMENT_UNAVAILABLE/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { sportsRuntime, contractFixture, equippedProfileFixture, fakeDatabase, plain } from './trainingContractTestRuntime.mjs';
const week='2026-09-14',today='2026-09-13';
class FixedDate extends Date { constructor(...args){super(...(args.length?args:[today+'T12:00:00Z']));} static now(){return Date.parse(today+'T12:00:00Z');} }
const load=sportsRuntime({Date:FixedDate,console:{info(){},warn(){},log(){},error(){}}});
const api=load('structuredSession'),dose=load('sessionDose');
const intent={kind:'open_coach',version:1,discipline:'box',adaptationId:'lower_body_skill',stimulusId:'controlled_lower_body',pattern:'lunge',role:'PRIMARY',method:{kind:'coach_defined',label:'Controlled practice'}};
function contract({pattern='lunge',user={},notes=[]}={}){
  const i={...intent,pattern};
  const profile=load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile({...user,perfil:{...equippedProfileFixture(),duracion:'60 min',...user.perfil}});
  const doseContext=load('sessionDoseContext').buildSessionDoseContext(profile,i,null,[],true,'coach');
  const restrictionsSnapshot=load('../athlete/getCanonicalRestrictions').projectCanonicalRestrictions([],notes,today);
  const result=load('allowedTrainingContract').buildAllowedTrainingContract(contractFixture({targetWeekStart:week,intent:i,stimulus:i.stimulusId,doseContext,restrictionsSnapshot}));
  assert.equal(result.ok,true,JSON.stringify(result));return result.contract;
}
function proposal(c,d={sets:3,reps:8},id='bulgarian_split_squat',structureId='strength_sets'){
  return {schemaVersion:2,stimulusId:c.stimulusId,structureId,explanation:'Dosis elegida para la intención y hechos disponibles.',blocks:[{blockType:'main',movements:[{movementId:id,prescription:structuredClone(d)}]}]};
}
const validate=(c,p)=>api.validateSessionAgainstTrainingContract(c,p);
function pass(c,p){const r=validate(c,p);assert.equal(r.ok,true,JSON.stringify(r));return r.proposal;}
function fail(c,p,code){const r=validate(c,p);assert.equal(r.ok,false);assert.ok(r.violations.some(v=>v.includes(code)),JSON.stringify(r));}

test('explicit each-side instruction resolves without changing the original proposal',()=>{
  const c=contract(),p=proposal(c,{doseInstruction:'3 x 8 por pierna'}),before=structuredClone(p),q=pass(c,p);
  assert.deepEqual(p,before);assert.deepEqual(plain(q.blocks[0].movements[0].prescription),{doseInstruction:'3 x 8 por pierna',sets:3,reps:8,perSide:true});
  assert.match(api.renderContractSession(c,p,'human_v3').descripcion,/3 × 8 por lado/);
});
test('3x8 without side semantics is executable; analytics never invents 24 or 48 total reps',()=>{
  const c=contract(),p=pass(c,proposal(c));assert.equal(Object.hasOwn(p.blocks[0].movements[0].prescription,'perSide'),false);
  const row=api.renderContractSession(c,p),analytics=load('../trainingLoad/prescriptionLoadAdapter').plannedPrescriptionLoad(row,week,'test');
  assert.equal(analytics.segments[0].vector.repetitions.status,'unknown');
  assert.equal(row.structuredPrescription.analytics[0].sideSemantics,'UNKNOWN');
});
test('sets alone fail for execution incompleteness, not analytics',()=>{
  const c=contract();for(const d of [{sets:3},{doseInstruction:'3 sets'},{}])fail(c,proposal(c,d),'EXECUTION_INSTRUCTION_INCOMPLETE');
});
for(const instruction of ['3 series moderadas','2 sets técnicos','acumula 30 reps de calidad','3 pasadas controladas','trabajo técnico y fluido a RPE 6'])
  test(`partial executable instruction: ${instruction}`,()=>{
    const c=contract(),p=pass(c,proposal(c,{doseInstruction:instruction}));
    for(const presentation of ['legacy','human_v2','human_v3']){
      const row=api.renderContractSession(c,p,presentation);assert.ok(row.descripcion.includes(instruction));assert.doesNotMatch(row.descripcion,/NaN|undefined/);
    }
  });
test('production-equivalent double DOSE_SIDE_REPS_REQUIRED: two timed unilateral movements pass on first attempt',async()=>{
  const c=contract(),p=proposal(c,{sets:3,durationSeconds:30,perSide:true,intensity:{kind:'rpe',value:6},restSeconds:60});
  p.blocks[0].movements.push({movementId:'single_leg_rdl',prescription:structuredClone(p.blocks[0].movements[0].prescription)});
  const old={...c};delete old.executionPolicy;
  const oldResult=validate(old,p);assert.equal(oldResult.ok,false);assert.ok(oldResult.violations.includes('DOSE_SIDE_REPS_REQUIRED'));
  assert.equal(p.blocks[0].movements.filter(m=>m.prescription.perSide&&!m.prescription.reps).length,2);
  let calls=0;const result=await load('sessionGeneration').generateContractSession(c,[],async prompt=>{calls++;assert.match(prompt,/YOU are responsible for deciding HOW/);return JSON.stringify(p);});
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(calls,1);assert.equal(result.attempts,1);
  for(const m of result.proposal.blocks[0].movements){assert.equal(m.prescription.perSide,true);assert.equal(Object.hasOwn(m.prescription,'reps'),false);}
  assert.match(result.session.descripcion,/30 s por lado/);
});
test('same two unilateral movements with reps and no side stay unspecified',()=>{
  const c=contract(),p=proposal(c);p.blocks[0].movements.push({movementId:'single_leg_rdl',prescription:{sets:3,reps:8}});
  for(const m of pass(c,p).blocks[0].movements)assert.equal(Object.hasOwn(m.prescription,'perSide'),false);
});
test('verified squat 155kg at75% remains exactly116.25kg; no-RM RPE passes',()=>{
  const c=contract({pattern:'squat',user:{test_atleta:{back_squat:155}}});
  const p=pass(c,proposal(c,{sets:5,reps:3,intensity:{kind:'percent_1rm',referenceId:'1rm:back_squat',value:75}},'back_squat'));
  assert.equal(api.renderContractSession(c,p).structuredPrescription.calculatedLoads[0].minimumKg,116.25);
  const no=contract({pattern:'squat'});fail(no,p,'REFERENCE_NOT_ALLOWED');pass(no,proposal(no,{sets:3,intensity:{kind:'rpe',value:6}},'back_squat'));
});
for(const text of ['3 x 8 @ 75% 1RM','3 x 30 s @ 140 ppm','3 x 30 s @ 4:30 min/km'])test(`objective instruction cannot bypass reference authority: ${text}`,()=>{
  const c=contract();fail(c,proposal(c,{doseInstruction:text}),'DOSE_INSTRUCTION_REFERENCE_REQUIRED');
});
test('reference mentioned in text must match the structured exact authorized reference',()=>{
  const c=contract({pattern:'squat',user:{test_atleta:{back_squat:155}}});
  pass(c,proposal(c,{doseInstruction:'3 x 8 @ 75% 1RM',intensity:{kind:'percent_1rm',referenceId:'1rm:back_squat',value:75}},'back_squat'));
  fail(c,proposal(c,{doseInstruction:'3 x 8 @ 75% 1RM',intensity:{kind:'percent_1rm',referenceId:'invented',value:75}},'back_squat'),'REFERENCE_NOT_ALLOWED');
});
test('HR text is checked against authorized values as well as reference identity',()=>{
  const c=contract({pattern:'run',user:{datos_entrenamiento:{z2_fc:'130–145'}}});
  const ref=c.doseContext.references.find(r=>r.unit==='bpm');assert.ok(ref);
  const d={doseInstruction:'30 min @ 140 ppm',intensity:{kind:'reference',referenceId:ref.id}};
  pass(c,proposal(c,d,'rodaje_z2','continuo_carrera'));
  fail(c,proposal(c,{...d,doseInstruction:'30 min @ 190 ppm'},'rodaje_z2','continuo_carrera'),'INSTRUCTION_REFERENCE_MISMATCH');
});
for(const text of ['3 x 8 y 10 burpees','3 x 8 @ 180 kg','3 x 8; safe for knee','3 x 8 con barra disponible','3 x 8 luego correr 90 min','100000 pasadas controladas'])
  test(`bounded grammar rejects hidden work/facts: ${text}`,()=>fail(contract(),proposal(contract(),{doseInstruction:text}),'DOSE_INSTRUCTION_UNRESOLVED'));
test('contradictory fields and instruction reject; instruction quantities obey numeric bounds',()=>{
  const c=contract();fail(c,proposal(c,{sets:3,reps:8,doseInstruction:'3 x 80'}),'DOSE_INSTRUCTION_CONFLICT');
  fail(c,proposal(c,{doseInstruction:'100 x 1000'}),'DOSE_TOTAL_REPS_BOUND');
  fail(c,proposal(c,{doseInstruction:'3 x 8',perSide:false,intensity:{kind:'rpe',value:99}}),'DOSE_INTENSITY_INVALID');
});
test('unregistered resolved variant and absent suitable_for/mapping do not veto execution',()=>{
  const c=contract({pattern:'horizontal_push'});c.generatedMovementAuthority=plain(load('movementVariants').GENERATED_MOVEMENT_AUTHORITY);
  const p=proposal(c,{doseInstruction:'2 sets técnicos',tempo:[3,1,1,0]},'generated:push');
  p.blocks[0].movements[0].variant={version:1,canonicalFamily:'bench_press',displayName:'Tempo 3-1-1-0 bench press',modifiers:{tempo:[3,1,1,0]}};
  assert.equal(load('movementLibrary').MOVEMENT_LIBRARY['generated:push'],undefined);pass(c,p);
});
for(const state of ['unavailable','unknown'])test(`actual equipment requirement remains ${state}`,()=>{
  const profile=equippedProfileFixture();profile.prescription_signals['equipment.banco']={state,updatedAt:today};
  const c=contract({user:{perfil:profile}});fail(c,proposal(c,{doseInstruction:'2 sets técnicos'}),state==='unknown'?'REQUIREMENT_UNKNOWN':'FACTUAL_REQUIREMENT_UNAVAILABLE');
});
test('known restriction and genuine UNKNOWN_SAFETY remain hard',()=>{
  const c=contract({pattern:'horizontal_push',notes:[{id:'r',status:'pending',constraint_level:'hard',prohibits_axial_load:true}]});
  const evidence=load('movementLibrary').MOVEMENT_RESTRICTION_EVIDENCE.bench_press.properties,original=evidence.axial_load;
  try{evidence.axial_load=true;fail(c,proposal(c,{doseInstruction:'2 sets técnicos'},'bench_press'),'MOVEMENT_RESTRICTED');
    delete evidence.axial_load;fail(c,proposal(c,{doseInstruction:'2 sets técnicos'},'bench_press'),'UNKNOWN_SAFETY');}
  finally{evidence.axial_load=original;}
});
test('computable hard budget overflow fails, incomplete analytics alone passes',()=>{
  const c=contract();fail(c,proposal(c,{durationSeconds:3601}),'SESSION_BUDGET_EXCEEDED');
  fail(c,proposal(c,{doseInstruction:'61 min'}),'SESSION_BUDGET_EXCEEDED');
  const p=pass(c,proposal(c,{doseInstruction:'3 series moderadas'}));assert.equal(dose.estimateSessionDuration(c,p).maximumSeconds,null);
});
test('mathematically impossible format and cadence conflict fail',()=>{
  const c=contract(),p=proposal(c,{durationSeconds:90},'bulgarian_split_squat','emom_fuerza');p.blocks[0].formatDose={durationSeconds:60,intervalSeconds:60,workSeconds:40,restSeconds:20};
  fail(c,p,'DOSE_FORMAT_WORK_EXCEEDS_CLOCK');
  p.blocks[0].movements[0].prescription.durationSeconds=50;
  fail(c,p,'DOSE_FORMAT_WORK_EXCEEDS_CLOCK');
  fail(c,proposal(c,{reps:10,durationSeconds:10,tempo:[3,1,1,0]}),'DOSE_VOLUME_TIME_CONFLICT');
});
test('historical v4 keeps old dose/render semantics and policy is signed against tampering',()=>{
  const current=contract(),old={...current};delete old.executionPolicy;
  const p=proposal(old,{sets:3,reps:8,restSeconds:60,intensity:{kind:'rpe',value:6}});
  function receipt(c){const payload=Buffer.from(JSON.stringify({userCodigo:'synthetic',expiresAt:FixedDate.now()+100000,contract:c,proposal:p})).toString('base64url');return `${payload}.${createHmac('sha256','isolated-sports-test-key').update('forge-session-contract-v1:'+payload).digest('base64url')}`;}
  const historical=api.renderContractSession(old,p),signed=receipt(old);
  assert.deepEqual(plain(load('sessionAuthority').verifySessionReceipt(signed,historical,'synthetic',week)),plain(historical));
  fail(old,proposal(old,{doseInstruction:'2 sets técnicos'}),'DOSE_FIELDS_INVALID');
  const [payload,mac]=signed.split('.'),body=JSON.parse(Buffer.from(payload,'base64url'));body.contract.executionPolicy='coach-executable-v1';
  assert.throws(()=>load('sessionAuthority').verifySessionReceipt(Buffer.from(JSON.stringify(body)).toString('base64url')+'.'+mac,historical,'synthetic',week),/INVALID/);
});

test('partial dose travels through Weekly -> two Builders -> signed save, siblings, KEEP and freshness',async()=>{
  const days=plain(load('../planning/weeklyCalendar').calendarDays);
  const tables={usuarios:{modo_entrada:'coach',categoria:'box',especialidad:'crossfit',objetivo_principal:{descripcion:'crossfit'},
    ciclo_actual:{bloque:'acumulacion',semana:1,totalSemanas:4,planningWeekStart:week,blockId:'synthetic'},
    perfil:{...equippedProfileFixture(),dias:6,duracion:'60 min'},workout_history:[],distribucion_semanal:{box:days,pista:[],carrera_larga:[]}},
    athlete_training_sources:[],athlete_state_events:[],athlete_coaching_notes:[],weekly_plan:[]};
  const db=fakeDatabase(tables),from=db.from.bind(db);db.from=table=>{const q=from(table);if(table==='weekly_plan')q.maybeSingle=async()=>({data:null,error:null});return q;};
  const r=await load('../planning/prepareAllowedWeeklyPlanContract').planBoundedWeek(db,'synthetic',{targetWeekStart:week,today,empezarHoy:true,snapshot:null,openCoachVersion:1,strategyVersion:1,coherenceVersion:1,planningRunId:'synthetic-open-dose'},async prompt=>{
    if(!prompt.includes('WEEKLY_CONTRACT:\n'))return JSON.stringify({summary:'Contexto sintético.',objective:'Práctica controlada.',phase:'accumulation',durationWeeks:4});
    const c=JSON.parse(prompt.split('WEEKLY_CONTRACT:\n')[1]);
    return JSON.stringify({contractVersion:2,contextDigest:c.contextDigest,selections:days.map(day=>({day,state:['martes','jueves'].includes(day)?'TRAIN':'REST',decision:{role:'PRIMARY',reason:'Elección contextual.'},...(['martes','jueves'].includes(day)?{intent}:{})}))});
  },'synthetic-token');
  assert.equal(r.ok,true,JSON.stringify(r));const receipt=r.estructura.calendarReceipt,sessions=[],prompts=[];
  for(const slot of r.estructura.sessions.filter(s=>s.state==='TRAIN')){
    const out=await load('sessionAuthority').generateTrainingSession(db,'synthetic',{targetWeekStart:week,day:slot.dia,discipline:slot.tipo,stimulus:slot.stimulusId,intent:slot.intent,state:slot.state,acceptedCurrentWeek:sessions,
      weekly:{receipt,generationToken:'synthetic-token',optionId:slot.optionId,claims:slot}},async prompt=>{
        prompts.push(prompt);const c=JSON.parse(prompt.split('CONTRACT:\n')[1].split('\nIntent canónico:')[0].split('\nContexto no autoritativo:')[0]);
        const output=proposal(c,{doseInstruction:'3 series técnicas, lejos del fallo'});delete output.schemaVersion;return JSON.stringify(output);
      });
    assert.equal(out.ok,true,JSON.stringify(out));sessions.push(out.sesion);assert.equal(out.trainingContract.executionPolicy,'coach-executable-v1');
  }
  assert.match(prompts[1],/3 series técnicas, lejos del fallo/);assert.match(prompts[1],/currentWeek/);
  const proof=JSON.parse(Buffer.from(sessions[1].sessionReceipt.split('.')[0],'base64url'));assert.ok(proof.weekly.priorSessions.martes);
  assert.equal(proof.proposal.schemaVersion,2);
  assert.equal(proof.proposal.blocks[0].movements[0].prescription.sets,3);
  assert.equal(proof.proposal.blocks[0].movements[0].prescription.doseInstruction,'3 series técnicas, lejos del fallo');
  const rows=r.estructura.sessions.map(s=>sessions.find(x=>x.dia===s.dia)??load('sessionAuthority').admitSessionContent({dia:s.dia,tipo:'descanso'},'synthetic',week));
  const admitted=await load('../planning/weeklyCalendarAuthority').assertWeeklyCalendar(db,'synthetic',week,rows,receipt,{requireV2:true,sessionEvidence:sessions});
  let reviews=0;const review=await load('../planning/enforceWholeWeek').enforceWholeWeek('synthetic',week,rows,sessions,receipt,admitted,async()=>{reviews++;return JSON.stringify({decision:'KEEP',rationale:'Repetición deliberada de práctica controlada.',days:[]});});
  assert.equal(review.ok,true,JSON.stringify(review));assert.equal(reviews,1);
  const altered=plain(sessions[0]);altered.structuredPrescription.proposal.blocks[0].movements[0].prescription.doseInstruction='30 series moderadas';
  assert.throws(()=>load('sessionAuthority').verifySessionReceipt(altered.sessionReceipt,altered,'synthetic',week,receipt),/CONTENT_MISMATCH/);
  tables.usuarios.perfil.prescription_signals['equipment.banco']={state:'unavailable',updatedAt:today};
  await assert.rejects(load('sessionAuthority').assertFreshSessionRestrictions(db,'synthetic',week,sessions[0]),/CHANGED|STALE/);
});

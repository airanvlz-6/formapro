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

for(const name of ['Spanish squat','Copenhagen plank','seal row','cyclist squat','snatch grip RDL','single-arm front rack carry'])test(`open movement is rendered and never retried: ${name}`,async()=>{
  const c=contract({user:{perfil:{prescription_signals:{}}}});let calls=0;
  const r=await load('sessionGeneration').generateContractSession(c,[],async()=>{calls++;return JSON.stringify(proposal(c,{doseInstruction:'3 series técnicas, carga moderada'},name,'Coach format'));});
  assert.equal(r.ok,true,JSON.stringify(r));assert.equal(calls,1);assert.ok(r.session.descripcion.includes(name));
  assert.equal(load('movementVariants').resolvedMovement({movementId:name}),undefined);
  const analytics=load('../trainingLoad/prescriptionLoadAdapter').plannedPrescriptionLoad(r.session,week,'open');
  assert.equal(analytics.segments[0].vector.externalVolumeKg.status,'unknown');
  assert.equal(analytics.segments[0].input.pattern,null);
});

test('readable prescriptions survive textual quantities, optional labels and extra block names',()=>{
  const c=contract();const p={blocks:[{blockType:'Accesorios elegidos',movements:[{name:'seal row',prescription:{reps:'8–12 por lado',intensity:'carga moderada'}}]}]};
  const q=pass(c,p),row=api.renderContractSession(c,q,'human_v3');
  assert.equal(q.stimulusId,c.stimulusId);assert.match(row.descripcion,/seal row|8–12 por lado/);assert.match(row.descripcion,/Accesorios elegidos/);
  const f=proposal(c,{doseInstruction:'3 carries cortos'});f.blocks[0].formatDose='EMOM 12';
  assert.match(api.renderContractSession(c,pass(c,f),'human_v3').descripcion,/EMOM 12/);
});

test('textual percentage resolves only an exact known RM, otherwise remains symbolic',()=>{
  const known=contract({user:{test_atleta:{back_squat:155}}}),p=proposal(known,{doseInstruction:'3 x 8 @ 85% 1RM'},'back_squat');
  assert.equal(api.renderContractSession(known,p).structuredPrescription.calculatedLoads[0].minimumKg,131.75);
  const unknown=contract();assert.equal(api.renderContractSession(unknown,p).structuredPrescription.calculatedLoads.length,0);
  const bare=proposal(unknown,{durationSeconds:300,intensity:{kind:'reference',referenceId:'missing'}},'rodaje_z2');
  assert.doesNotMatch(api.renderContractSession(unknown,bare,'human_v3').descripcion,/NaN|undefined/);
});

test('known resource absence cannot be hidden behind an unresolved modifier',()=>{
  const c=contract({user:{perfil:{prescription_signals:{'equipment.banco':{state:'unavailable',updatedAt:today}}}}});
  const p=proposal(c,{doseInstruction:'3 series técnicas'},'generated:novel');
  p.blocks[0].movements[0].variant={canonicalFamily:'bench_press',displayName:'New bench press variant',modifiers:{unknownPosition:'new'}};
  fail(c,p,'FACTUAL_REQUIREMENT_UNAVAILABLE');
});

test('explicit discipline restriction is respected; unknown restriction semantics remain context',()=>{
  const c=contract({notes:[{id:'r',movement:'box',issue:'No box',constraint_level:'hard',status:'pending'}]});
  fail(c,proposal(c),'EXPLICIT_DISCIPLINE_RESTRICTED');
  const uncertain=contract({notes:[{id:'u',movement:'uncatalogued restriction',issue:'User restriction in context',constraint_level:'hard',status:'pending'}]});
  pass(uncertain,proposal(uncertain,{doseInstruction:'3 series técnicas'},'seal row'));
});

test('a truly unusable JSON response receives one repair and never more than two attempts',async()=>{
  const c=contract();let calls=0;
  const r=await load('sessionGeneration').generateContractSession(c,[],async()=>{calls++;return '{broken JSON';});
  assert.equal(r.ok,false);assert.equal(calls,2);
});

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
  const c=contract();for(const d of [{sets:3},{}])fail(c,proposal(c,d),'EXECUTION_INSTRUCTION_INCOMPLETE');
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
  const no=contract({pattern:'squat'});pass(no,p);assert.equal(api.renderContractSession(no,p).structuredPrescription.calculatedLoads.length,0);pass(no,proposal(no,{sets:3,intensity:{kind:'rpe',value:6}},'back_squat'));
});
for(const text of ['3 x 30 s @ 140 ppm','3 x 30 s @ 4:30 min/km'])test(`missing reference preserves independently executable work: ${text}`,()=>{
  const c=contract(),p=pass(c,proposal(c,{doseInstruction:text}));const row=api.renderContractSession(c,p,'human_v3');assert.equal(row.structuredPrescription.calculatedLoads.length,0);assert.match(row.descripcion,/Referencia numérica no disponible/);assert.doesNotMatch(row.descripcion,/140 ppm|4:30 min\/km/);
});
test('reference mentioned in text must match the structured exact authorized reference',()=>{
  const c=contract({pattern:'squat',user:{test_atleta:{back_squat:155}}});
  pass(c,proposal(c,{doseInstruction:'3 x 8 @ 75% 1RM',intensity:{kind:'percent_1rm',referenceId:'1rm:back_squat',value:75}},'back_squat'));
  const missing=pass(c,proposal(c,{doseInstruction:'3 x 8 @ 75% 1RM',intensity:{kind:'percent_1rm',referenceId:'invented',value:75}},'back_squat'));assert.equal(api.renderContractSession(c,missing).structuredPrescription.calculatedLoads.length,0);
});
test('HR text is checked against authorized values as well as reference identity',()=>{
  const c=contract({pattern:'run',user:{datos_entrenamiento:{z2_fc:'130–145'}}});
  const ref=c.doseContext.references.find(r=>r.unit==='bpm');assert.ok(ref);
  const d={doseInstruction:'30 min @ 140 ppm',intensity:{kind:'reference',referenceId:ref.id}};
  pass(c,proposal(c,d,'rodaje_z2','continuo_carrera'));
  fail(c,proposal(c,{...d,doseInstruction:'30 min @ 190 ppm'},'rodaje_z2','continuo_carrera'),'NUMERIC_TRUTH');
});
for(const text of ['3 x 8 y 10 burpees','3 carries cortos','carga moderada','deja 3 reps en recámara','3 series técnicas','3 sets controlados','2x30s por lado','10 min suave','4x400m','EMOM 12','AMRAP 15'])
  test(`open executable instruction preserved: ${text}`,()=>{const c=contract(),p=pass(c,proposal(c,{doseInstruction:text}));assert.ok(api.renderContractSession(c,p,'human_v3').descripcion.includes(text));});
test('unsupported objective values and contradictory parsed quantities stay hard',()=>{
  const c=contract();const target=pass(c,proposal(c,{doseInstruction:'3 x 8 @ 20 kg'}));assert.equal(api.renderContractSession(c,target).structuredPrescription.calculatedLoads.length,0);
  fail(c,proposal(c,{sets:3,reps:8,intensity:{kind:'reference',referenceId:'fabricated',value:200}}),'NUMERIC_TRUTH');
  fail(c,proposal(c,{sets:3,reps:8,doseInstruction:'3 x 80'}),'DOSE_INSTRUCTION_CONFLICT');
  pass(c,proposal(c,{doseInstruction:'100 x 1000'}));
});

test('unregistered resolved variant and absent suitable_for/mapping do not veto execution',()=>{
  const c=contract({pattern:'horizontal_push'});c.generatedMovementAuthority=plain(load('movementVariants').GENERATED_MOVEMENT_AUTHORITY);
  const p=proposal(c,{doseInstruction:'2 sets técnicos',tempo:[3,1,1,0]},'generated:push');
  p.blocks[0].movements[0].variant={version:1,canonicalFamily:'bench_press',displayName:'Tempo 3-1-1-0 bench press',modifiers:{tempo:[3,1,1,0]}};
  assert.equal(load('movementLibrary').MOVEMENT_LIBRARY['generated:push'],undefined);pass(c,p);
});
for(const state of ['unavailable','unknown'])test(`actual equipment requirement remains ${state}`,()=>{
  const profile=equippedProfileFixture();profile.prescription_signals['equipment.banco']={state,updatedAt:today};
  const c=contract({user:{perfil:profile}});
  if(state==='unknown')pass(c,proposal(c,{doseInstruction:'2 sets técnicos'}));else fail(c,proposal(c,{doseInstruction:'2 sets técnicos'}),'FACTUAL_REQUIREMENT_UNAVAILABLE');
});
test('known incompatibility stays hard; unknown restriction compatibility is coaching context',()=>{
  const c=contract({pattern:'horizontal_push',notes:[{id:'r',status:'pending',constraint_level:'hard',prohibits_axial_load:true}]});
  const evidence=load('movementLibrary').MOVEMENT_RESTRICTION_EVIDENCE.bench_press.properties,original=evidence.axial_load;
  try{evidence.axial_load=true;fail(c,proposal(c,{doseInstruction:'2 sets técnicos'},'bench_press'),'MOVEMENT_RESTRICTED');
    delete evidence.axial_load;pass(c,proposal(c,{doseInstruction:'2 sets técnicos'},'bench_press'));}
  finally{evidence.axial_load=original;}
});

for(const [environment,id,signal] of [['CrossFit box','kettlebell_swing','kettlebell'],['crossfit_box','db_deadlift','mancuerna'],['GYM','bench_press','banco'],['CASA','db_deadlift','mancuerna']])
test(`modern environment-derived admission: ${environment}/${id}`,()=>{
  const c=contract({user:{perfil:{lugar_entreno:environment,material:environment==='CASA'?['Mancuernas']:[],prescription_signals:{}}}});
  assert.equal(c.doseContext.sufficiency.signals[`equipment.${signal}`].state,'available');
  const assessments=[];const r=api.validateSessionAgainstTrainingContract(c,proposal(c,{sets:2,reps:5},id),undefined,undefined,undefined,a=>assessments.push(plain(a)));
  assert.equal(r.ok,true,JSON.stringify(r));assert.ok(assessments.some(a=>a.state==='AVAILABLE'&&a.category==='equipment'));
});
test('unknown skill/capability/equipment remains unknown, explicit unavailable remains hard, historical admission unchanged',()=>{
  for(const [signal,id,d] of [['equipment.barra','snatch',{sets:2,reps:3,restSeconds:60,intensity:{kind:'rpe',value:5}}],['skill.box.advanced','snatch',{sets:2,reps:3,restSeconds:60,intensity:{kind:'rpe',value:5}}],['capability.canMeasureDistance','rodaje_z2',{distanceMeters:1000,intensity:{kind:'rpe',value:5}}]]){
    for(const state of ['unknown','unavailable']){
      const c=contract({user:{perfil:{prescription_signals:{...equippedProfileFixture().prescription_signals,[signal]:{state,updatedAt:today}}}}});
      const p=proposal(c,d,id,id==='rodaje_z2'?'continuo_carrera':'strength_sets'),before=JSON.stringify(c.doseContext.sufficiency);
      const r=validate(c,p);assert.equal(r.ok,state==='unknown',JSON.stringify(r));assert.equal(JSON.stringify(c.doseContext.sufficiency),before);
      if(state==='unavailable')assert.ok(r.violations.some(v=>v.startsWith('FACTUAL_REQUIREMENT_UNAVAILABLE')));
      else if(id!=='rodaje_z2'){const historical={...c,intent:{...c.intent,pattern:load('movementLibrary').MOVEMENT_LIBRARY[id].movement_pattern}};delete historical.executionPolicy;
        assert.ok(validate(historical,p).violations.some(v=>v.startsWith('REQUIREMENT_UNKNOWN')),JSON.stringify(validate(historical,p)));}
    }
  }
});
test('home explicit absence overrides material and broad environment never forces unknown equipment to available',()=>{
  const c=contract({user:{perfil:{lugar_entreno:'CASA',prescription_signals:{'equipment.barra':{state:'unavailable',updatedAt:today}}}}});
  fail(c,proposal(c,{sets:2,reps:3},'snatch'),'FACTUAL_REQUIREMENT_UNAVAILABLE');
  for(const lugar_entreno of ['BOX','GYM','LIMITED']){
    const c=contract({user:{perfil:{lugar_entreno,prescription_signals:{'equipment.banco':{state:'unknown',updatedAt:today}}}}});
    pass(c,proposal(c,{sets:2,reps:5},'bench_press'));assert.equal(c.doseContext.sufficiency.signals['equipment.banco'].state,'unknown');
  }
});
test('computable hard budget overflow fails, incomplete analytics alone passes',()=>{
  const c=contract();fail(c,proposal(c,{durationSeconds:3601}),'SESSION_BUDGET_EXCEEDED');
  fail(c,proposal(c,{doseInstruction:'61 min'}),'SESSION_BUDGET_EXCEEDED');
  const p=pass(c,proposal(c,{doseInstruction:'3 series moderadas'}));assert.equal(dose.estimateSessionDuration(c,p).maximumSeconds,null);
  fail(c,proposal(c,{reps:10,tempo:[-3,1,1,0]}),'EXECUTION_TEMPO_INVALID');
  const incomplete=pass(c,proposal(c,{reps:10,tempo:[]}));assert.equal(dose.estimateSessionDuration(c,incomplete).maximumSeconds,null);
});
test('format templates and incomplete cadence analytics cannot veto executable instructions',()=>{
  const c=contract(),p=proposal(c,{durationSeconds:90},'bulgarian_split_squat','emom_fuerza');p.blocks[0].formatDose={durationSeconds:60,intervalSeconds:60,workSeconds:40,restSeconds:20};
  pass(c,p);
  p.blocks[0].movements[0].prescription.durationSeconds=50;
  pass(c,p);
  pass(c,proposal(c,{reps:10,durationSeconds:10,tempo:[3,1,1,0]}));
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

for(const declaredWeek of [false,true])test(`partial dose and declared week=${declaredWeek} travel through Weekly -> two Builders -> signed save, siblings, KEEP and freshness`,async()=>{
  const days=plain(load('../planning/weeklyCalendar').calendarDays);
  const tables={usuarios:{modo_entrada:'coach',categoria:'box',especialidad:'crossfit',objetivo_principal:{descripcion:'crossfit'},
    ciclo_actual:{bloque:'acumulacion',semana:1,totalSemanas:4,planningWeekStart:week,blockId:'synthetic'},
    perfil:{...equippedProfileFixture(),dias:6,duracion:'60 min'},workout_history:[],distribucion_semanal:{box:days,pista:[],carrera_larga:[]}},
    athlete_training_sources:[],athlete_state_events:[],athlete_coaching_notes:[],weekly_plan:[]};
  if(declaredWeek){
    tables.usuarios.distribucion_semanal.carrera=[...days];
    tables.usuarios.perfil.weekly_availability={[week]:plain(load('weeklyAvailabilityDeclaration').parseWeeklyAvailabilityDeclaration('Box martes y jueves. No corro esta semana.',['box','carrera']))};
    tables.usuarios.perfil.prescription_signals['equipment.banco']={state:'unknown',updatedAt:today};
  }
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
  assert.deepEqual(proof.contract.intent,intent);
  assert.equal(proof.proposal.schemaVersion,2);
  assert.equal(proof.proposal.blocks[0].movements[0].prescription.sets,3);
  assert.equal(proof.proposal.blocks[0].movements[0].prescription.doseInstruction,'3 series técnicas, lejos del fallo');
  const rows=r.estructura.sessions.map(s=>sessions.find(x=>x.dia===s.dia)??load('sessionAuthority').admitSessionContent({dia:s.dia,tipo:'descanso'},'synthetic',week));
  const admitted=await load('../planning/weeklyCalendarAuthority').assertWeeklyCalendar(db,'synthetic',week,rows,receipt,{requireV2:true,sessionEvidence:sessions});
  let reviews=0;const review=await load('../planning/enforceWholeWeek').enforceWholeWeek('synthetic',week,rows,sessions,receipt,admitted,async()=>{reviews++;return JSON.stringify({decision:'KEEP',rationale:'Repetición deliberada de práctica controlada.',days:[]});});
  assert.equal(review.ok,true,JSON.stringify(review));assert.equal(reviews,1);
  await assert.rejects(load('../planning/weeklyCalendarAuthority').assertWeeklyCalendar(db,'synthetic',week,rows.filter(s=>s.dia!=='martes'),receipt,{requireV2:true,sessionEvidence:sessions}));
  // Continue the admitted complete candidate through the actual identity and
  // persistence adapters, with only the database transport replaced in memory.
  const identity=load('../planning/prescriptionIdentity').preparePrescriptionSessions(rows.map(session=>({kind:'new',session})));
  const candidate={week_start:week,revision:1,sessions:identity.sessions};
  const mutation=await load('../planning/planMutation').validatePlanMutation({command:{operationType:'create_week',source:'weekly_orchestrator',target:{userCodigo:'synthetic',weekStart:week},proposal:candidate},
    candidate,context:{identityProof:identity.identityProof},changeSet:{operationType:'create_week',affectedDays:days,changedFields:['sessions']}});
  assert.equal(mutation.status,'ready_for_commit',JSON.stringify(mutation));
  const persisted=[];
  const persistenceDb={from(table){assert.equal(table,'weekly_plan');return {insert(payload){persisted.push(plain(payload));return {select(){return {maybeSingle:async()=>({data:{id:'synthetic-plan',user_codigo:'synthetic',week_start:week,revision:1},error:null})}}}}}}};
  assert.equal((await load('../planning/planPersistence').createPlan(persistenceDb,mutation.mutation)).status,'committed');
  assert.equal(persisted.length,1);assert.equal(persisted[0].sessions.length,7);assert.equal(persisted[0].sessions.filter(s=>s.tipo==='box').length,2);
  const altered=plain(sessions[0]);altered.structuredPrescription.proposal.blocks[0].movements[0].prescription.doseInstruction='30 series moderadas';
  assert.throws(()=>load('sessionAuthority').verifySessionReceipt(altered.sessionReceipt,altered,'synthetic',week,receipt),/CONTENT_MISMATCH/);
  if(declaredWeek){
    tables.usuarios.perfil.weekly_availability[week].availability.box=[];
    tables.usuarios.perfil.weekly_availability[week].resolution='EXPLICIT_ZERO_TRAINING';
    await assert.rejects(load('../planning/weeklyCalendarAuthority').assertFreshWeeklyAuthority(db,'synthetic',week,receipt),/STALE/);
    await assert.rejects(load('sessionAuthority').assertFreshSessionRestrictions(db,'synthetic',week,sessions[0]),/AVAILABILITY_CHANGED/);
    tables.usuarios.perfil.weekly_availability[week].availability.box=['martes','jueves'];
    tables.usuarios.perfil.weekly_availability[week].resolution='DECLARED_AVAILABILITY';
  }
  tables.usuarios.perfil.prescription_signals['equipment.banco']={state:'unavailable',updatedAt:today};
  await assert.rejects(load('sessionAuthority').assertFreshSessionRestrictions(db,'synthetic',week,sessions[0]),/CHANGED|STALE/);
});

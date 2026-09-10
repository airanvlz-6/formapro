import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { sportsRuntime, plain, contractFixture, fakeDatabase } from './trainingContractTestRuntime.mjs';
const load=sportsRuntime({console:{log(){},info(){},warn(){}}});
const capture=load('../athlete/runningHabitualDeclarations'), confirmation=load('../athlete/runningHabitualConfirmation');
const binding={planningRunId:'fixture-current-run',targetWeekStart:'2026-09-14'}, date='2026-09-09T12:00:00.000Z';
const intent={kind:'adaptation',methodId:'running_base',adaptationId:'base_aerobica',pattern:'run',role:'PRIMARY',
  goalId:'half_marathon',blockPhase:'unknown',blockWeek:null,weaknessId:null};
const scope={mode:'coach',prescriptionAllowed:true,managedDisciplines:['carrera'],externalDisciplines:[]};
function fixture({minutes=45,frequency=4,available=90,confirmed=true,extra={},method='running_base'}={}) {
  const facts=minutes===null?[]:[capture.habitualRunningFact('habitualEasyRunningDurationMinutes',minutes,date)];
  if(frequency!==null) facts.push(capture.habitualRunningFact('habitualRunningSessionsPerWeek',frequency,date));
  const perfil={duracion:`${available} min`,...extra,runningHabitualDeclarations:Object.fromEntries(facts.map(f=>[f.field,f]))};
  const user={especialidad:'carrera',objetivo_principal:method==='running_vo2'?'10k':'half_marathon',perfil};
  const canonical=load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile(user);
  const baseline=load('../athlete/runningDoseEvidence').projectRunningDoseBaseline(user,[],canonical.running.references,'2026-09-09');
  if(confirmed && minutes!==null) {
    perfil.runningHabitualConfirmation=confirmation.issueRunningHabitualConfirmation('fixture',binding,facts[0]);
    baseline.habitualConfirmation=confirmation.readRunningHabitualConfirmation(perfil.runningHabitualConfirmation,'fixture',binding,baseline.habitualDeclarations.facts);
  }
  const admission=load('runningDoseEvidenceAuthority').admitRunningDoseEvidence(baseline);
  const i={...intent,goalId:user.objetivo_principal,blockPhase:method==='running_recovery'?'deload':'unknown',role:method==='running_recovery'?'MAINTENANCE':'PRIMARY',methodId:method,adaptationId:load('goalTransferModel').transferMethod(method).adaptationId};
  const evidence=load('runningDoseCompatibility').resolveCompatibleRunningDoseEvidence(admission,i);
  const dose=load('runningMethodDoseAuthority').resolveRunningMethodDose(evidence,i);
  const doseContext=load('sessionDoseContext').buildSessionDoseContext(canonical,i,null,[],true);
  const input=contractFixture({prescriptionScope:scope,targetWeekStart:binding.targetWeekStart,targetDay:'lunes',discipline:'carrera',
    stimulus:load('goalTransferModel').transferMethod(method).stimulusId,intent:i,doseContext});
  input.exposureContext.report.disciplina='carrera';
  const built=load('allowedTrainingContract').buildAllowedTrainingContract(input);
  assert.equal(built.ok,true,JSON.stringify(built));
  const c=built.contract;c.runningMethodDose=dose;c.intensityAuthority=load('methodIntensityAuthority').resolveMethodIntensity(c);
  const p={schemaVersion:2,stimulusId:c.stimulusId,structureId:'continuo_carrera',blocks:[{blockType:'main',movements:[
    {movementId:'rodaje_z2',prescription:{durationSeconds:typeof minutes==='number'?minutes*60:2700,intensity:c.intensityAuthority.targets.find(t=>t.movementId==='rodaje_z2')?.primary??{kind:'rpe',value:2,max:3}}}]}]};
  return {c,p,dose,evidence,baseline,admission,canonical,user,input};
}
const validate=(f,p=f.p)=>load('structuredSession').validateSessionAgainstTrainingContract(f.c,p);
for(const available of [90,60,45]) test(`1/2 exact declared 45-minute outing fits ${available} minutes with independent RPE fallback`,async()=>{
  const f=fixture({available});assert.equal(f.dose.status,'RESOLVED');
  assert.equal(f.dose.policy.id,'running_base_declared_habitual_duration_v1');
  assert.deepEqual(plain(f.dose.dose.selectedTarget),{minimum:2700,maximum:2700});
  assert.equal(f.dose.dose.maximumAuthorized,2700);assert.equal(f.dose.dose.minimumUseful,null);assert.equal(f.dose.dose.compositionTolerance,null);
  assert.deepEqual(plain(f.p.blocks[0].movements[0].prescription.intensity),{kind:'rpe',value:2,max:3});
  assert.equal(validate(f).ok,true,JSON.stringify(validate(f)));
  const result=await load('sessionGeneration').generateContractSession(f.c,[],async()=>JSON.stringify(f.p),'',undefined,'human_v3');
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(load('sessionDose').estimateSessionDuration(f.c,f.p).maximumSeconds,2700);
});
test('3: time rejects without clipping or a Builder call',async()=>{
  const f=fixture({available:30});assert.equal(f.dose.dose.selectedTarget.minimum,2700);
  let calls=0;const r=await load('sessionGeneration').generateContractSession(f.c,[],async()=>{calls++;return JSON.stringify(f.p);});
  assert.equal(r.code,'SESSION_DOSE_TIME_INFEASIBLE');assert.equal(calls,0);
  assert.ok(validate(f).violations.includes('SESSION_BUDGET_EXCEEDED'));
  assert.equal(f.dose.dose.selectedTarget.maximum,2700);
});
test('4: weekly km cannot select a session target',()=>{
  const f=fixture({minutes:null,extra:{km_semana:30}});assert.equal(f.dose.status,'UNRESOLVED');assert.equal(f.dose.dose,null);
});
test('5: habitual frequency is not required or multiplied for one outing',()=>{
  const a=fixture({frequency:null}),b=fixture({frequency:4,extra:{km_semana:30}});
  assert.deepEqual(plain(a.dose.dose),plain(b.dose.dose));assert.equal(a.dose.status,'RESOLVED');
  assert.equal(a.dose.dose.selectedTarget.minimum,2700);
});
test('6: no habitual outing needs a separate first-exposure policy',()=>{
  const f=fixture({minutes:'NO_HABITUAL_EASY_RUN',frequency:0});assert.equal(f.dose.reason,'FIRST_EXPOSURE_POLICY_REQUIRED');assert.equal(f.dose.dose,null);
});
for(const method of ['running_threshold','running_vo2','running_specific','running_recovery','running_economy'])test(`7/8/9 permanent separation: ${method}`,()=>{
  const f=fixture({method});assert.equal(f.dose.status,'UNRESOLVED');assert.equal(f.dose.dose,null);assert.equal(f.evidence.habitualDeclarations,undefined);
});
test('10: confirmedAt alone, wrong run/week/user, changed fact and tampered proof cannot establish freshness',()=>{
  const f=fixture({confirmed:false});assert.equal(f.dose.reason,'HABITUAL_RECONFIRMATION_REQUIRED');
  const fact=f.baseline.habitualDeclarations.facts.find(f=>f.field==='habitualEasyRunningDurationMinutes');
  const token=confirmation.issueRunningHabitualConfirmation('fixture',binding,fact);
  for(const [user,b,proof,facts] of [['other',binding,token,[fact]],['fixture',{...binding,planningRunId:'other'},token,[fact]],
    ['fixture',{...binding,targetWeekStart:'2026-09-21'},token,[fact]],['fixture',binding,token+'x',[fact]],
    ['fixture',binding,token,[{...fact,value:35}]],['fixture',undefined,token,[fact]]])
    assert.equal(confirmation.readRunningHabitualConfirmation(proof,user,b,facts),null);
});
function writable(profile){
  const store={data:{perfil:profile}};
  store.db={from(){return {select(){return this;},eq(){return this;},single:async()=>({data:store.data,error:null}),
    update(patch){store.data=plain(patch);return this;},then(yes){return Promise.resolve({error:null}).then(yes);}};}};
  return store;
}
test('11/12: structured reconfirmation refreshes provenance; 45 -> 35 overwrites without averaging',async()=>{
  const f=fixture({confirmed:false}),store=writable(f.user.perfil),later='2026-09-10T12:00:00Z';
  await capture.saveHabitualRunningAnswer(store.db,'fixture','habitualEasyRunningDurationMinutes','CONFIRMAR',later,binding,45);
  const facts=capture.projectHabitualRunningDeclarations(store.data.perfil);
  assert.equal(facts.find(f=>f.field==='habitualEasyRunningDurationMinutes').confirmedAt,later);
  assert.equal(facts.find(f=>f.field==='habitualEasyRunningDurationMinutes').value,45);
  assert.ok(confirmation.readRunningHabitualConfirmation(store.data.perfil.runningHabitualConfirmation,'fixture',binding,facts));
  await capture.saveHabitualRunningAnswer(store.db,'fixture','habitualEasyRunningDurationMinutes',35,later,binding);
  assert.equal(capture.projectHabitualRunningDeclarations(store.data.perfil)[0].value,35);
  assert.equal(fixture({minutes:35}).dose.dose.selectedTarget.minimum,2100);
  const before=JSON.stringify(store.data);
  await assert.rejects(()=>capture.saveHabitualRunningAnswer(store.db,'fixture','habitualEasyRunningDurationMinutes','CONFIRMAR',later,binding,45),/RECONFIRMATION_INVALID/);
  assert.equal(JSON.stringify(store.data),before,'confirmation of a displayed old value must not confirm a concurrently changed value');
});
test('preparation escape, intervals, other movements, units and intensity all fail closed',()=>{
  const f=fixture();
  const changed=[];
  for(const blockType of ['warmup','cooldown']) {
    const p=plain(f.p); const extra={blockType,movements:[{movementId:'rodaje_z2',prescription:{durationSeconds:900,intensity:{kind:'rpe',value:2,max:3}}}]};
    if(blockType==='warmup')p.blocks.unshift(extra);else p.blocks.push(extra);changed.push(p);
  }
  for(const patch of [{durationSeconds:1800},{durationSeconds:2701},{sets:2},{restSeconds:90},{intensity:{kind:'rpe',value:6,max:7}},{distanceMeters:5000}]){
    const p=plain(f.p);Object.assign(p.blocks[0].movements[0].prescription,patch);changed.push(p);
  }
  for(const id of ['tempo_run','strides','series_vo2max','progresivo','row','box_jump']) {const p=plain(f.p);p.blocks[0].movements[0].movementId=id;changed.push(p);}
  for(const p of changed)assert.equal(validate(f,p).ok,false,JSON.stringify(p));
  const other=fixture({method:'running_recovery'});assert.ok(validate(other).violations.includes('SINGLE_BLOCK_COMPOSITION_NOT_AUTHORIZED'));
});
test('relevant conflict remains closed, never minimum/mean',()=>{
  const f=fixture(),b=f.baseline;b.habitualDeclarations.facts.push(capture.habitualRunningFact('habitualEasyRunningDurationMinutes',35,date));
  const a=load('runningDoseEvidenceAuthority').admitRunningDoseEvidence(b),e=load('runningDoseCompatibility').resolveCompatibleRunningDoseEvidence(a,intent);
  assert.equal(load('runningMethodDoseAuthority').resolveRunningMethodDose(e,intent).status,'CONFLICT');
});
test('numeric capability stays separate from scope, intensity, composition and time',()=>{
  for(const available of [90,30]) {
    const f=fixture({available}),c=load('doseCapabilityProfile').buildDoseCapabilityProfile(f.admission,scope,
      {...intent,athlete:f.canonical,contexts:{carrera:f.input}}).entries.find(e=>e.methodId==='running_base');
    assert.equal(c.doseCapability,'QUANTIFIABLE');assert.equal(c.compositionStatus,'RESOLVED');assert.equal(c.intensityStatus,'RESOLVED');
    assert.equal(c.timeStatus,available===90?'FITS':'INFEASIBLE');assert.equal(c.prescriptionAllowed,available===90);
  }
  const f=fixture();const c=load('doseCapabilityProfile').buildDoseCapabilityProfile(f.admission,{...scope,prescriptionAllowed:false,managedDisciplines:[]},intent);
  assert.ok(c.entries.every(e=>!e.prescriptionAllowed));
});
test('retry remains immutable, with exact single-block instructions',async()=>{
  const f=fixture(),before=JSON.stringify(f.c),prompts=[];const bad=plain(f.p);bad.blocks[0].movements[0].prescription.durationSeconds=2800;
  const r=await load('sessionGeneration').generateContractSession(f.c,[],async prompt=>{prompts.push(prompt);return JSON.stringify(prompts.length===1?bad:f.p);});
  assert.equal(r.ok,true,JSON.stringify(r));assert.equal(prompts.length,2);assert.equal(JSON.stringify(f.c),before);
  assert.ok(prompts.every(p=>p.includes('exactly ONE main block')));
});
test('real preflight asks for current interaction, admits only after matching confirmation, and defers quality',async()=>{
  const f=fixture({confirmed:false});
  const tables={usuarios:{...f.user,modo_entrada:'coach',categoria:'carrera',distribucion_semanal:{carrera:['lunes','miercoles','viernes']},workout_history:[]},
    athlete_training_sources:[],weekly_plan:[],physiology_records:[],session_modification_events:[],athlete_coaching_notes:[],athlete_state_events:[]};
  const db=fakeDatabase(tables),req={...binding,today:'2026-09-09',snapshot:null,empezarHoy:false,strategyVersion:1};
  const prep=load('../planning/prepareAllowedWeeklyPlanContract');
  const first=await prep.prepareAllowedWeeklyPlanContract(db,'fixture',req);
  assert.equal(first.code,'RUNNING_HABITUAL_RECONFIRMATION_REQUIRED');assert.match(first.runningHabitualRequirement.text,/CONFIRMAR/);
  tables.usuarios.perfil=fixture().user.perfil;
  const second=await prep.prepareAllowedWeeklyPlanContract(db,'fixture',req);assert.equal(second.ok,true,JSON.stringify(second));
  const methods=Object.values(second.contract.dayOptions).flat().map(o=>o.intent?.methodId);
  assert.ok(methods.includes('running_base'));assert.ok(!methods.includes('running_threshold'));assert.ok(!methods.includes('running_specific'));
  assert.ok(second.contract.strategy.deferred.some(d=>d.reference.includes('umbral')));
  const complete=await prep.prepareAllowedWeeklyPlanContract(db,'fixture',{...req,today:'2026-09-20',
    snapshot:{sessions:['lunes','martes','miercoles','jueves','viernes','sabado','domingo'].map(dia=>({dia,tipo:'descanso',completada:true}))}});
  assert.equal(complete.runningHabitualRequirement,undefined);assert.equal(complete.code,'WEEKLY_REGENERATION_NO_OP');
  delete tables.usuarios.perfil.runningHabitualConfirmation;
  const completeUnconfirmed=await prep.prepareAllowedWeeklyPlanContract(db,'fixture',{...req,today:'2026-09-20',
    snapshot:{sessions:['lunes','martes','miercoles','jueves','viernes','sabado','domingo'].map(dia=>({dia,tipo:'descanso',completada:true}))}});
  assert.equal(completeUnconfirmed.runningHabitualRequirement,undefined);assert.equal(completeUnconfirmed.code,'WEEKLY_REGENERATION_NO_OP');
});

test('time insufficiency never asks for habitual frequency or reduces the target',()=>{
  const f=fixture({available:30,frequency:null});
  const capabilities=load('doseCapabilityProfile').buildDoseCapabilityProfile(f.admission,scope,{...intent,athlete:f.canonical,contexts:{carrera:f.input}});
  assert.equal(capabilities.requirement,null);
  const strategy=load('../planning/canonicalWeekStrategy').buildCanonicalWeekStrategy(f.canonical,scope,3);
  strategy.methods=strategy.methods.filter(m=>m==='running_base');
  const r=load('../planning/allowedWeeklyPlanContract').buildAllowedWeeklyPlanContract({targetWeekStart:binding.targetWeekStart,prescriptionScope:scope,
    contexts:{carrera:f.input},allowed:{carrera:['lunes']},fixed:{},maxExecutableDays:3,completeNewWeek:true,strategy,doseCapabilities:capabilities});
  assert.equal(r.code,'SESSION_DOSE_TIME_INFEASIBLE');assert.equal(r.runningHabitualRequirement,null);
  assert.equal(f.dose.dose.selectedTarget.minimum,2700);
});

test('UI confirmation resumes the same pending generation and temporal choice',async()=>{
  const ui=readFileSync('app/FormaPro.tsx','utf8'),start=ui.indexOf('    if(pendingRunningHabitualQuestion){');
  const code=ui.slice(start,ui.indexOf('    if(pendingPrescriptionQuestion){',start)),calls=[],resumes=[];
  const run=vm.runInNewContext('(async()=>{'+code+'})',{
    pendingRunningHabitualQuestion:{codigo:'fixture',field:'habitualEasyRunningDurationMinutes',generationToken:'signed-generation',
      targetWeekStart:binding.targetWeekStart,includeToday:false,expectedDurationMinutes:45},codigoUsuario:'fixture',texto:'CONFIRMAR',
    setCargando(){},setGenerandoSemana(){},setInput(){},setMensajes(){},setPendingRunningHabitualQuestion(){},
    apiCall:async body=>{calls.push(body);return {ok:true,requirement:null,message:'confirmed'};},
    orquestarGeneracionSemana:async value=>{resumes.push(value);return {ok:true};},
  });
  await run();assert.equal(calls[0].datos.generationToken,'signed-generation');assert.equal(calls[0].datos.expectedDurationMinutes,45);
  assert.deepEqual(resumes,[false]);
  assert.ok(ui.includes('if(preflight?.preflightRequirement || preflight?.runningHabitualRequirement){weeklyPlanningContinuationRef.current=continuation;return preflight;}'));
});

test('production weekly receipt -> Builder -> signed session -> freshness retains current interaction',async()=>{
  const f=fixture(),tables={usuarios:{...f.user,modo_entrada:'coach',categoria:'carrera',distribucion_semanal:{carrera:['lunes','miercoles','viernes']},workout_history:[]},
    athlete_training_sources:[],weekly_plan:[],physiology_records:[],session_modification_events:[],athlete_coaching_notes:[],athlete_state_events:[]};
  const db=fakeDatabase(tables),from=db.from.bind(db);
  db.from=table=>{const q=from(table);if(['weekly_plan','physiology_records'].includes(table))q.maybeSingle=async()=>({data:null,error:null});return q;};
  const generation=await load('../planning/weeklyGeneration').beginWeeklyGeneration(db,'fixture','2026-09-09');
  const active={planningRunId:generation.planningRunId,targetWeekStart:generation.nextWeek};
  const fact=capture.projectHabitualRunningDeclarations(tables.usuarios.perfil).find(f=>f.field==='habitualEasyRunningDurationMinutes');
  tables.usuarios.perfil.runningHabitualConfirmation=confirmation.issueRunningHabitualConfirmation('fixture',active,fact);
  const planned=await load('../planning/prepareAllowedWeeklyPlanContract').planBoundedWeek(db,'fixture',{
    ...active,today:'2026-09-09',empezarHoy:false,snapshot:null,strategyVersion:1},async prompt=>{
    const c=JSON.parse(prompt.split('WEEKLY_CONTRACT:\n')[1].split('\nPropuesta rechazada:')[0]);
    // Preserve all coverage: one admitted base day and supporting strength if required by the real strategy.
    const chosen=new Set();
    const selections=Object.entries(c.dayOptions).map(([day,options])=>{
      const option=options.find(o=>o.intent?.kind==='adaptation'&&!chosen.has(o.intent.adaptationId))??options[0];
      if(option.intent)chosen.add(option.intent.adaptationId);return {day,optionId:option.optionId};
    });
    return JSON.stringify({contractVersion:1,contextDigest:c.contextDigest,selections});
  },generation.token);
  assert.equal(planned.ok,true,JSON.stringify(planned));
  const slot=planned.estructura.sessions.find(s=>s.intent?.methodId==='running_base');assert.ok(slot);
  const receipt=planned.estructura.calendarReceipt,server=load('sessionAuthority');let builderPrompt;
  const result=await server.generateTrainingSession(db,'fixture',{targetWeekStart:active.targetWeekStart,day:slot.dia,discipline:'carrera',stimulus:'base_aerobica',
    weekly:{receipt,generationToken:generation.token,optionId:slot.optionId}},async prompt=>{
    builderPrompt=prompt;const c=JSON.parse(prompt.split('CONTRACT:\n')[1].split('\n')[0]);
    return JSON.stringify({schemaVersion:2,stimulusId:c.stimulusId,structureId:'continuo_carrera',blocks:[{blockType:'main',movements:[{
      movementId:'rodaje_z2',prescription:{durationSeconds:c.runningMethodDose.dose.selectedTarget.minimum,
        intensity:c.intensityAuthority.targets.find(t=>t.movementId==='rodaje_z2').primary}}]}]});
  },'',active.planningRunId);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.ok(!builderPrompt.includes(tables.usuarios.perfil.runningHabitualConfirmation));
  assert.ok(!builderPrompt.split('Contexto no autoritativo:')[1].includes('runningHabitualDeclarations'));
  server.verifySessionReceipt(result.sesion.sessionReceipt,result.sesion,'fixture',active.targetWeekStart,receipt);
  await server.assertFreshSessionRestrictions(db,'fixture',active.targetWeekStart,result.sesion);
  tables.usuarios.perfil.runningHabitualDeclarations.habitualEasyRunningDurationMinutes.value=35;
  await assert.rejects(()=>server.assertFreshSessionRestrictions(db,'fixture',active.targetWeekStart,result.sesion),/CONTEXT_CHANGED|STALE/);
});

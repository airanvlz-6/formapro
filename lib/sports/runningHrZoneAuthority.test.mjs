import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {sportsRuntime,contractFixture,plain} from './trainingContractTestRuntime.mjs';
const load=sportsRuntime({console:{info(){},log(){},warn(){}}});
const project=load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const zones={z1_fc:'100–129',z2_fc:'130–145',z3_fc:'146–159',z4_fc:'160–174',z5_fc:'175–190'};
const monitor='Sí, reloj GPS con pulsómetro';
function contract(methodId='running_base',data=zones,device=monitor) {
  const m=load('goalTransferModel').transferMethod(methodId),goalId=methodId==='running_vo2'?'10k':'half_marathon';
  const intent={kind:'adaptation',goalId,adaptationId:m.adaptationId,methodId,role:methodId==='running_recovery'?'MAINTENANCE':['running_vo2','running_economy'].includes(methodId)?'SUPPORTING':'PRIMARY',pattern:'run',blockPhase:methodId==='running_recovery'?'deload':'unknown',blockWeek:null,weaknessId:null};
  const athlete=project({objetivo_principal:goalId,perfil:{dispositivo:device,duracion:'60 min',nivel_carrera:'Avanzado (corro con frecuencia)'},datos_entrenamiento:data});
  const dc=load('sessionDoseContext').buildSessionDoseContext(athlete,intent,null,[],true);
  const input=contractFixture({discipline:'carrera',targetWeekStart:'2026-09-07',targetDay:'viernes',stimulus:m.stimulusId,intent,doseContext:dc});
  input.exposureContext.report.disciplina='carrera';
  const built=load('allowedTrainingContract').buildAllowedTrainingContract(input);
  assert.equal(built.ok,true,JSON.stringify(built));
  built.contract.intensityAuthority=load('methodIntensityAuthority').resolveMethodIntensity(built.contract);return built.contract;
}
function proposal(c) {
  const movementId={running_base:'rodaje_z2',running_threshold:'series_umbral',running_recovery:'regenerativo',running_vo2:'series_vo2max'}[c.intent.methodId];
  const target=c.intensityAuthority.targets.find(t=>t.movementId===movementId);assert.ok(target,JSON.stringify({method:c.intent.methodId,authority:c.intensityAuthority}));
  const intensity=target.primary;
  return {schemaVersion:2,stimulusId:c.stimulusId,structureId:c.allowedStructureIds[0],blocks:[
    {blockType:'warmup',movements:[{movementId,prescription:{durationSeconds:120,intensity:{kind:'rpe',value:2}}}]},
    {blockType:'main',movements:[{movementId,prescription:{durationSeconds:300,...(c.allowedStructureIds[0]==='intervalos_carrera'?{sets:3,restSeconds:120}:{}),intensity:plain(intensity)}}]},
  ]};
}
const main=p=>p.blocks[1].movements[0].prescription;
const validate=(c,p)=>load('structuredSession').validateSessionAgainstTrainingContract(c,p);
const sign=value=>{const payload=Buffer.from(JSON.stringify(value)).toString('base64url');return payload+'.'+createHmac('sha256','isolated-sports-test-key').update('forge-session-contract-v1:'+payload).digest('base64url');};

test('A/H existing admitted Z2 supplies exact HR primary and secondary guidance to Builder and every renderer',async()=>{
  const c=contract(),p=proposal(c),ref=c.doseContext.references.find(r=>r.id===main(p).intensity.referenceId);
  assert.deepEqual(plain(ref.value),{min:130,max:145});assert.equal(ref.intensityEvidence.zoneCompatibility.sourceZone,'Z2');
  assert.equal(c.intensityAuthority.targets.find(t=>t.movementId==='rodaje_z2').secondary.purpose,'perception_guide');
  assert.equal(validate(c,p).ok,true);
  const built=await load('sessionGeneration').generateContractSession(c,[],async prompt=>{assert.match(prompt,/running:confirmedBaseZone/);return JSON.stringify(p);});
  assert.equal(built.ok,true,JSON.stringify(built));
  for(const version of ['legacy','human_v2','human_v3']) {
    const rendered=load('structuredSession').renderContractSession(c,p,version);
    assert.match(rendered.descripcion,/Z2 · 130–145 ppm/);assert.doesNotMatch(rendered.descripcion,/confirmedBaseZone/);
    if(version==='human_v3')assert.match(rendered.descripcion,/Z2 · 130–145 ppm · RPE esperado 2–3/);
  }
});

for(const [name,mutate] of [
  ['B modified HR bounds',p=>Object.assign(main(p).intensity,{min:135,max:150})],
  ['C primary RPE downgrade',p=>main(p).intensity={kind:'rpe',value:2,max:3}],
  ['wrong zone',p=>main(p).intensity={kind:'reference',referenceId:'running:z3'}],
  ['invented reference',p=>main(p).intensity={kind:'reference',referenceId:'running:invented'}],
])test(name+' is rejected before save',()=>{const c=contract(),p=proposal(c);mutate(p);assert.equal(validate(c,p).ok,false);});

test('D all four incompatible purposes reject at direct dose boundary as well as StructuredSession',()=>{
  for(const [method,intensity] of [['running_threshold',{kind:'reference',referenceId:'running:z2'}],['running_recovery',{kind:'rpe',value:8}],['running_base',{kind:'rpe',value:7}],['running_vo2',{kind:'rpe',value:1}]]) {
    const c=contract(method),p=proposal(c);main(p).intensity=intensity;
    assert.ok(load('sessionDose').validateSessionDose(c,p).includes('METHOD_INTENSITY_OUTSIDE_DOMAIN'));
    assert.equal(validate(c,p).ok,false);
  }
});

test('HR precedes compatible pace, pace precedes RPE; no monitor or compatible HR never fabricates a range',()=>{
  const c=contract('running_threshold',{...zones,umbral_fc:'160–170',ritmo_umbral:'5:00 min/km'});
  assert.equal(c.intensityAuthority.targets[0].primary.referenceId,'running:thresholdHr');
  const pace=contract('running_threshold',{...zones,ritmo_umbral:'5:00 min/km'});
  assert.equal(pace.intensityAuthority.targets[0].primary.referenceId,'running:thresholdPace');
  for(const c of [contract('running_base',zones,'No, entreno por sensación (RPE)'),contract('running_base',{}),contract('running_base',{fc_max:190,fc_reposo:55})]) {
    assert.equal(c.intensityAuthority.targets[0].primary.kind,'rpe');assert.equal(validate(c,proposal(c)).ok,true);
    assert.ok(!c.doseContext.references.some(r=>r.metric==='confirmedBaseZone')||c.doseContext.sufficiency.signals['capability.canMeasureHeartRate'].state==='unavailable');
  }
});

test('storage formats use the existing parser; partial zones and unknown purpose are not silently mapped',()=>{
  for(const raw of ['130-145','130–145 ppm',{value:'130–145',unit:'bpm'}]) {
    const r=project({datos_entrenamiento:{z2_fc:raw}}).running.byMetric.z2;
    assert.equal(r.reason,'resolved');assert.deepEqual(plain(r.resolved.value.value),{min:130,max:145});
  }
  for(const raw of [{min:130,max:145},'Z2 desde 130 hasta 145','145-130'])assert.equal(project({datos_entrenamiento:{z2_fc:raw}}).running.byMetric.z2?.reason??'unknown','unknown');
  assert.equal(contract('running_base',{z2_fc:'130–145'}).intensityAuthority.targets[0].primary.kind,'rpe');
  for(const method of ['running_recovery','running_vo2','running_specific'])assert.ok(contract(method).intensityAuthority.targets.every(t=>t.primary.kind==='rpe'));
  assert.equal(contract('running_economy').intensityAuthority.status,'UNRESOLVED');
});

test('G signed save admission and JSON storage/reload preserve exact zone, range, identity and provenance',async()=>{
  const c=contract(),p=proposal(c),version='human_v3';
  const s=load('structuredSession').renderContractSession(c,p,version);
  const receipt=sign({userCodigo:'fixture',expiresAt:Date.now()+60000,contract:c,proposal:p,presentationVersion:version});
  const admitted=load('sessionAuthority').admitSessionContent({...s,sessionReceipt:receipt},'fixture',c.targetWeekStart);
  const candidates=load('../planning/prepareWeeklyCandidate'),entries=candidates.prepareWeeklyEntries([admitted],null);
  const prepared=candidates.admitWeeklyCandidate({week_start:c.targetWeekStart,sessions:[admitted]},entries,null);
  const command={source:'weekly_orchestrator',operationType:'create_week',target:{userCodigo:'fixture',weekStart:c.targetWeekStart}};
  const checked=await load('../planning/planMutation').validatePlanMutation({command,candidate:prepared.candidate,context:{identityProof:prepared.identityProof},
    changeSet:{operationType:'create_week',affectedDays:['viernes'],changedFields:['sessions']}});
  assert.equal(checked.status,'ready_for_commit',JSON.stringify(checked));
  let stored;
  const db={from(table){assert.equal(table,'weekly_plan');return {insert(payload){stored=JSON.stringify(payload);return this;},select(){return this;},
    maybeSingle:async()=>({data:{id:'hr-fixture',user_codigo:'fixture',week_start:c.targetWeekStart,revision:1},error:null})};}};
  assert.equal((await load('../planning/planPersistence').createPlan(db,checked.mutation)).status,'committed');
  const reloaded=JSON.parse(stored).sessions[0];
  assert.deepEqual(reloaded.structuredPrescription,plain(s.structuredPrescription));
  const ref=reloaded.structuredPrescription.references.find(r=>r.id==='running:confirmedBaseZone');
  assert.deepEqual(ref.value,{min:130,max:145});assert.equal(ref.intensityEvidence.zoneCompatibility.sourceZone,'Z2');
  assert.equal(ref.intensityEvidence.source,'USER_DECLARED');
  assert.equal(load('sessionAuthority').verifySessionReceipt(receipt,reloaded,'fixture',c.targetWeekStart).descripcion,s.descripcion);
  for(const mutate of [s=>s.structuredPrescription.references[0].value.max=150,s=>s.structuredPrescription.references[0].intensityEvidence.zoneCompatibility.sourceZone='Z3',
    s=>main(s.structuredPrescription.proposal).intensity={kind:'rpe',value:2,max:3}]) {
    const altered=plain(reloaded);mutate(altered);assert.throws(()=>load('sessionAuthority').admitSessionContent({...altered,sessionReceipt:receipt},'fixture',c.targetWeekStart));
  }
  const forged=plain(c);forged.doseContext.references.find(r=>r.id==='running:confirmedBaseZone').value.max=150;
  assert.equal(validate(forged,p).ok,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { sportsRuntime, contractFixture, fakeDatabase, plain } from './trainingContractTestRuntime.mjs';

const load = sportsRuntime({ console: { info(){}, log(){}, warn(){} } });
const authority = load('../athlete/hrZoneEstimationAuthority');
const bootstrap = load('../athlete/hrZoneBootstrap');
const project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const profile = { fc_max: 190, fc_reposo: 55, dispositivo: 'Sí, reloj GPS con pulsómetro', duracion: '60 min', nivel_carrera: 'Avanzado (corro con frecuencia)' };
const inputs = { maxHr: 190, restingHr: 55, sources: ['usuarios.perfil.fc_max', 'usuarios.perfil.fc_reposo'] };
const stamp = '2026-09-11T10:00:00.000Z', now = Date.parse(stamp);
const running = p => project({ perfil: p }).running;
function confirmed() {
  const p = bootstrap.hrZoneProposal(running(profile), stamp);
  return bootstrap.confirmHrZoneProposal('fixture', bootstrap.issueHrZoneProposal('fixture', p, null, now), p.proposalDigest, running(profile), null, now + 1);
}
function database(p) {
  let user = { especialidad: 'carrera', objetivo_principal: 'half_marathon', perfil: plain(p) }, writes = 0;
  return { get user(){ return plain(user); }, get writes(){ return writes; }, from(table) {
    assert.equal(table, 'usuarios'); let update, expected;
    return { eq(k,v){ if(k === 'perfil') expected = v; return this; }, is(){ return this; },
      single: async()=>({ data: plain(user), error: null }), update(v){ update = plain(v); return this; },
      select(){ if(!update) return this;
        if(expected !== JSON.stringify(user.perfil)) return Promise.resolve({ data: [], error: null });
        user = {...user, ...update}; writes++; return Promise.resolve({ data: [{codigo:'fixture'}], error:null });
      } };
  } };
}

test('A/B deterministic physiological proposal and source digest, independent of issuance clock',()=>{
  const a = authority.estimateHrZoneProposal(inputs, 1), b = authority.estimateHrZoneProposal(plain(inputs), 1);
  assert.deepEqual(plain(a), plain(b));
  assert.deepEqual(plain(a.zones), [{id:'Z1',lower:123,upper:135},{id:'Z2',lower:136,upper:149},{id:'Z3',lower:150,upper:162},{id:'Z4',lower:163,upper:176},{id:'Z5',lower:177,upper:190}]);
  assert.equal(a.measurementBasis, 'ESTIMATED'); assert.equal(a.algorithm, 'HRR'); assert.equal(a.policyVersion, 1);
  const p = bootstrap.hrZoneProposal(running(profile), stamp), q = bootstrap.hrZoneProposal(running(profile), '2026-09-12T10:00:00Z');
  assert.deepEqual(plain(p.estimation), plain(q.estimation)); assert.equal(p.proposalDigest, q.proposalDigest);
  assert.notEqual(p.snapshotSignature, q.snapshotSignature); // issuance metadata is authenticated separately
  assert.equal(authority.estimateHrZoneProposal(inputs, 2), null);
});
test('C/D/E invalid or missing HR inputs never use age or observed HR',()=>{
  for(const p of [{...profile, fc_reposo:190}, {...profile,fc_reposo:191}, {...profile,fc_max:undefined,edad:30},
    {...profile,fc_reposo:undefined,restingHrObserved:51}, {...profile,fc_reposo:0}])
    assert.equal(bootstrap.hrZoneProposal(running(p),stamp),null);
});
test('F/H/I exact confirmation survives real action persistence and JSON reload with estimated provenance',async()=>{
  const db = database(profile), action = load('../athlete/hrZoneActions').hrZoneAction;
  const p = await action(db,'fixture','propose',{});
  assert.equal(db.writes,0);
  await action(db,'fixture','confirm',{token:p.token,digest:p.proposal.proposalDigest});
  const s = db.user.perfil.hrZoneBootstrap;
  assert.equal(db.writes,1); assert.equal(s.confirmation,'USER_CONFIRMED');
  assert.deepEqual(s.estimation,plain(p.proposal.estimation));
  assert.deepEqual(s.estimation.inputs,inputs); assert.equal(s.estimation.origin,'FORGE_ESTIMATED_HRR');
  assert.equal(s.estimation.containsEstimatedData,true); assert.equal(s.estimation.measurementBasis,'ESTIMATED');
  assert.ok(s.estimation.sourceDigest); assert.equal(s.estimation.algorithm,'HRR');
  assert.deepEqual(plain(bootstrap.admittedHrZones(project(db.user).running,s)),s);
  assert.ok(!Object.keys(db.user.perfil).some(k=>/^z[1-5]_fc$/.test(k)));
  const before = JSON.stringify(db.user);
  const existing = await action(db,'fixture','propose',{});
  assert.equal(existing.state,'ADMITTED'); assert.equal(existing.proposal,undefined);
  assert.equal(JSON.stringify(db.user),before); assert.equal(db.writes,1);
});
for(const field of ['fc_max','fc_reposo']) test(`G explicit ${field} change rejects pending confirmation and reports stale stored system`,async()=>{
  const p = bootstrap.hrZoneProposal(running(profile), stamp);
  const token = bootstrap.issueHrZoneProposal('fixture',p,null,now);
  const changed = {...profile,[field]:profile[field]+1};
  assert.throws(()=>bootstrap.confirmHrZoneProposal('fixture',token,p.proposalDigest,running(changed),null,now+1),/STALE/);
  const db=database({...changed,hrZoneBootstrap:confirmed()}), before=JSON.stringify(db.user);
  assert.equal((await load('../athlete/hrZoneActions').hrZoneAction(db,'fixture','propose',{})).state,'STALE_INPUTS');
  assert.equal(db.writes,0); assert.equal(JSON.stringify(db.user),before);
  assert.equal(bootstrap.admittedHrZones(project(db.user).running,db.user.perfil.hrZoneBootstrap),null);
});
test('I new snapshots are admitted and resolved without invoking the HRR formula again',()=>{
  const stored=plain(confirmed()); let calls=0;
  const read=sportsRuntime({},(path,exports)=>path.endsWith('hrrZonePolicy.ts')
    ? {...exports,estimateHrrZones(){calls++;throw Error('Unexpected recalculation');}} : exports);
  const canonical=read('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile({perfil:{...profile,hrZoneBootstrap:stored}});
  assert.deepEqual(plain(read('../athlete/hrZoneBootstrap').admittedHrZones(canonical.running,canonical.hrZoneBootstrap)),stored);
  const refs=read('runningReferenceAuthority').resolveRunningReferences(canonical);
  assert.ok(JSON.stringify(refs).includes('confirmedBaseZone')); assert.equal(calls,0);
});
test('J observed HealthKit RHR changes in the real loader do not alter declared input or confirmed snapshot',async()=>{
  const stored=plain(confirmed()), loader=load('../athlete/loadAthletePrescriptionContext').loadAthletePrescriptionContext;
  const outputs=[];
  for(const observed of [55,51]) {
    const db=fakeDatabase({usuarios:{perfil:{...profile,hrZoneBootstrap:stored}},weekly_plan:[],session_modification_events:[]});
    // Device-observed RHR is a prepared recovery signal, separate from prescription inputs.
    const prepared=await load('../physiology/recoveryContext').prepareRecoveryContext(db,'fixture','2026-09-11');
    prepared.objective.restingHr={...prepared.objective.restingHr,status:'available',value:observed};
    const c=await loader(db,'fixture',{asOfDate:'2026-09-11',recovery:prepared});
    assert.equal(c.physiology.recovery.objective.restingHr.value,observed);
    assert.equal(c.running.byMetric.restingHr.resolved.value.value,55);
    outputs.push(plain(bootstrap.admittedHrZones(c.running,c.hrZoneBootstrap)));
  }
  assert.deepEqual(outputs[0],stored); assert.deepEqual(outputs[1],stored);
});
test('K complete declared system is returned without automatic proposal or persistence',async()=>{
  const declared={z1_fc:'100-129',z2_fc:'130-145',z3_fc:'146-159',z4_fc:'160-174',z5_fc:'175-190'};
  const db=database({...profile,...declared,hrZoneBootstrap:confirmed()});
  const result=await load('../athlete/hrZoneActions').hrZoneAction(db,'fixture','propose',{});
  assert.equal(result.state,'ADMITTED'); assert.equal(result.system.origin,'USER_DECLARED');
  assert.equal(result.proposal,undefined); assert.equal(db.writes,0);
});
const mutations=[['maxHr',s=>s.inputs.maxHr++],['restingHr',s=>s.estimation.inputs.restingHr++],
  ['bounds',s=>s.zones[1].upper++],['identity',s=>s.zones[1].id='Z3'],['policy',s=>s.policy.version++],
  ['coherent replacement bounds',s=>s.zones.forEach(z=>{z.lower++;z.upper++;})],
  ['policy provenance',s=>s.estimation.policyVersion++],['origin',s=>s.origin='USER_DECLARED'],
  ['basis',s=>s.estimation.measurementBasis='MEASURED'],['digest',s=>s.estimation.sourceDigest='other'],
  ['confirmation',s=>{s.confirmation='USER_CONFIRMED';s.confirmedAt=stamp;}]];
for(const [name,mutate] of mutations) test(`M ${name} tampering fails snapshot and confirmation even with a newly issued transport token`,()=>{
  const s=plain(bootstrap.hrZoneProposal(running(profile),stamp));mutate(s);
  assert.equal(bootstrap.validHrZoneSystem(s),false);
  const token=bootstrap.issueHrZoneProposal('fixture',s,null,now);
  assert.throws(()=>bootstrap.confirmHrZoneProposal('fixture',token,s.proposalDigest,running(profile),null,now+1));
});
test('legacy confirmed HRR snapshots remain readable without being rewritten or reissued',async()=>{
  const old=plain(confirmed());delete old.estimation;delete old.snapshotSignature;
  const body={zoneSystemId:old.zoneSystemId,policy:old.policy,domain:old.domain,zones:old.zones,origin:old.origin,
    inputs:old.inputs,inputDigest:old.inputDigest,generatedAt:old.generatedAt,containsEstimatedData:old.containsEstimatedData};
  old.proposalDigest=createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const db=database({...profile,hrZoneBootstrap:old});
  const result=await load('../athlete/hrZoneActions').hrZoneAction(db,'fixture','propose',{});
  assert.equal(result.state,'ADMITTED');assert.deepEqual(plain(result.system),old);assert.equal(db.writes,0);
});
test('policy version change rejects an issued proposal and never silently regenerates a confirmed system',async()=>{
  const p=bootstrap.hrZoneProposal(running(profile),stamp), s=confirmed();
  const token=bootstrap.issueHrZoneProposal('fixture',p,null,now);
  const upgraded=sportsRuntime({},(path,exports)=>path.endsWith('hrrZonePolicy.ts')?{...exports,HRR_POLICY:{...exports.HRR_POLICY,version:2}}:exports);
  assert.throws(()=>upgraded('../athlete/hrZoneBootstrap').confirmHrZoneProposal('fixture',token,p.proposalDigest,running(profile),null,now+1));
  const db=database({...profile,hrZoneBootstrap:s});
  assert.equal((await upgraded('../athlete/hrZoneActions').hrZoneAction(db,'fixture','propose',{})).state,'STALE_SYSTEM');
  assert.equal(db.writes,0);
});

function contract(canonical,methodId) {
  const method=load('goalTransferModel').transferMethod(methodId);
  const intent={kind:'adaptation',goalId:'half_marathon',adaptationId:method.adaptationId,methodId,role:'PRIMARY',pattern:'run',blockPhase:'unknown',blockWeek:null,weaknessId:null};
  const dc=load('sessionDoseContext').buildSessionDoseContext(canonical,intent,null,[],true);
  const input=contractFixture({discipline:'carrera',targetWeekStart:'2026-09-07',targetDay:'viernes',stimulus:method.stimulusId,intent,doseContext:dc});
  input.exposureContext.report.disciplina='carrera';
  const built=load('allowedTrainingContract').buildAllowedTrainingContract(input);assert.equal(built.ok,true,JSON.stringify(built));
  built.contract.intensityAuthority=load('methodIntensityAuthority').resolveMethodIntensity(built.contract);return built.contract;
}
test('confirmed estimated system precedes compatible individual HR and pace, without relabeling evidence',()=>{
  const c=contract(project({objetivo_principal:'half_marathon',perfil:{...profile,hrZoneBootstrap:confirmed()},datos_entrenamiento:{fc_suave:140,ritmo_z2:'6:00'}}),'running_base');
  assert.equal(c.intensityAuthority.targets[0].primary.referenceId,'running:confirmedBaseZone');
  assert.equal(c.intensityAuthority.targets[0].evidence.kind,'ESTIMATED');
});
const sign=value=>{const payload=Buffer.from(JSON.stringify(value)).toString('base64url');return payload+'.'+createHmac('sha256','isolated-sports-test-key').update('forge-session-contract-v1:'+payload).digest('base64url');};
for(const methodId of ['running_base','running_long_run']) test(`L ${methodId}: onboarding → proposal → confirmed profile → Builder → validation → signed save → reload → renderer`,async()=>{
  const db=database(profile), action=load('../athlete/hrZoneActions').hrZoneAction;
  const proposed=await action(db,'fixture','propose',{});
  await action(db,'fixture','confirm',{token:proposed.token,digest:proposed.proposal.proposalDigest});
  const canonical=project(db.user), c=contract(canonical,methodId);
  assert.equal(canonical.prescriptionSignals.signals['capability.canMeasureHeartRate'].state,'available');
  const target=c.intensityAuthority.targets[0],movementId=target.movementId;
  assert.equal(target.primary.referenceId,'running:confirmedBaseZone');assert.equal(target.secondary.purpose,'perception_guide');
  const proposal={schemaVersion:2,stimulusId:c.stimulusId,structureId:c.allowedStructureIds[0],blocks:[
    {blockType:'warmup',movements:[{movementId,prescription:{durationSeconds:120,intensity:{kind:'rpe',value:2}}}]},
    {blockType:'main',movements:[{movementId,prescription:{durationSeconds:300,intensity:plain(target.primary)}}]}]};
  const built=await load('sessionGeneration').generateContractSession(c,[],async prompt=>{assert.match(prompt,/running:confirmedBaseZone/);return JSON.stringify(proposal);});
  assert.equal(built.ok,true,JSON.stringify(built));
  assert.deepEqual(plain(load('sessionDose').validateSessionDose(c,proposal)),[]);
  assert.equal(load('structuredSession').validateSessionAgainstTrainingContract(c,proposal).ok,true);
  const s=load('structuredSession').renderContractSession(c,proposal,'human_v3');
  const receipt=sign({userCodigo:'fixture',expiresAt:Date.now()+60000,contract:c,proposal,presentationVersion:'human_v3'});
  const admitted=load('sessionAuthority').admitSessionContent({...s,sessionReceipt:receipt},'fixture',c.targetWeekStart);
  const candidates=load('../planning/prepareWeeklyCandidate'),entries=candidates.prepareWeeklyEntries([admitted],null);
  const prepared=candidates.admitWeeklyCandidate({week_start:c.targetWeekStart,sessions:[admitted]},entries,null);
  const command={source:'weekly_orchestrator',operationType:'create_week',target:{userCodigo:'fixture',weekStart:c.targetWeekStart}};
  const checked=await load('../planning/planMutation').validatePlanMutation({command,candidate:prepared.candidate,context:{identityProof:prepared.identityProof},
    changeSet:{operationType:'create_week',affectedDays:['viernes'],changedFields:['sessions']}});
  assert.equal(checked.status,'ready_for_commit',JSON.stringify(checked));
  let stored;
  const planDb={from(table){assert.equal(table,'weekly_plan');return {insert(payload){stored=JSON.stringify(payload);return this;},select(){return this;},
    maybeSingle:async()=>({data:{id:'hr-fixture',user_codigo:'fixture',week_start:c.targetWeekStart,revision:1},error:null})};}};
  assert.equal((await load('../planning/planPersistence').createPlan(planDb,checked.mutation)).status,'committed');
  const reloaded=JSON.parse(stored).sessions[0], ref=reloaded.structuredPrescription.references.find(r=>r.id==='running:confirmedBaseZone');
  assert.deepEqual(ref.value,{min:136,max:149});assert.equal(ref.intensityEvidence.kind,'ESTIMATED');
  assert.equal(ref.intensityEvidence.measurementBasis,'ESTIMATED');assert.equal(ref.intensityEvidence.source,'FORGE_ESTIMATED_HRR');
  assert.equal(ref.intensityEvidence.zoneCompatibility.proposalDigest,proposed.proposal.proposalDigest);
  const rendered=load('sessionAuthority').verifySessionReceipt(receipt,reloaded,'fixture',c.targetWeekStart);
  assert.match(rendered.descripcion,/Z2 · 136–149 ppm · RPE esperado 2–3/);
  assert.deepEqual(plain(c.doseContext.runningReferenceAuthority.hrZoneSystem.estimation),plain(proposed.proposal.estimation));
  const altered=plain(reloaded);altered.structuredPrescription.references.find(r=>r.id===ref.id).value.max++;
  assert.throws(()=>load('sessionAuthority').admitSessionContent({...altered,sessionReceipt:receipt},'fixture',c.targetWeekStart));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sportsRuntime, contractFixture, plain } from './trainingContractTestRuntime.mjs';
const load = sportsRuntime({ console: { info(){}, log(){}, warn(){} } });
const zones = load('../athlete/hrZoneBootstrap'), policy = load('hrrZonePolicy');
const project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const monitor = 'Sí, reloj GPS con pulsómetro';
const profile = { dispositivo: monitor, fc_max: 190, fc_reposo: 55, duracion: '60 min' };
const running = p => project({ perfil: p }).running;
const now = Date.parse('2026-09-10T10:00:00Z');
function confirmed(p = profile, declared) {
  const proposal = zones.hrZoneProposal(running(p), new Date(now).toISOString(), declared);
  const token = zones.issueHrZoneProposal('fixture', proposal, null, now);
  return zones.confirmHrZoneProposal('fixture', token, proposal.proposalDigest, running(p), null, now + 1);
}
function contract(p = profile, data = {}) {
  const method = load('goalTransferModel').transferMethod('running_base');
  const intent = { kind:'adaptation', goalId:'half_marathon', adaptationId:method.adaptationId, methodId:method.id,
    role:'PRIMARY', pattern:'run', blockPhase:'accumulation', blockWeek:1, weaknessId:null };
  const c = project({ especialidad:'carrera', objetivo_principal:'media maratón', perfil:p, datos_entrenamiento:data });
  const dc = load('sessionDoseContext').buildSessionDoseContext(c, intent, null, [], true);
  const input = contractFixture({ discipline:'carrera', stimulus:method.stimulusId, intent, doseContext:dc });
  input.exposureContext.report.disciplina = 'carrera';
  const result = load('allowedTrainingContract').buildAllowedTrainingContract(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  result.contract.intensityAuthority = load('methodIntensityAuthority').resolveMethodIntensity(result.contract);
  return result.contract;
}
function database(p) {
  let user = { perfil:p, especialidad:'carrera' };
  return { get user(){return user;}, from(table) { assert.equal(table,'usuarios'); let update;
    return { select(){ if(update){user= {...user,...update}; return Promise.resolve({data:[{codigo:'fixture'}],error:null});} return this; },
      eq(){return this;}, is(){return this;}, single:async()=>({data:user,error:null}), update(v){update=v;return this;} }; } };
}
for(const [name, p, state] of [['no monitor',{},'NO_MONITOR'],['blank',{dispositivo:monitor},'MISSING_INPUTS'],
  ['only max',{dispositivo:monitor,fc_max:190},'MISSING_INPUTS'],['only resting',{dispositivo:monitor,fc_reposo:55},'MISSING_INPUTS']])
test(`onboarding ${name}: continues with explicit RPE state, no estimate`,async()=>{
  const db=database(p), action=load('../athlete/hrZoneActions').hrZoneAction;
  assert.equal((await action(db,'fixture','propose',{})).state,state);
  assert.equal((await action(db,'fixture','rpe',{})).state,'RPE');
});
test('HRR policy is deterministic, integer, ordered, and nonoverlapping',()=>{
  assert.deepEqual(plain(policy.estimateHrrZones(190,55)),[{id:'Z1',lower:123,upper:135},{id:'Z2',lower:136,upper:149},
    {id:'Z3',lower:150,upper:162},{id:'Z4',lower:163,upper:176},{id:'Z5',lower:177,upper:190}]);
  for(const pair of [[NaN,55],[190,Infinity],[190,0],[55,55],[54,55],[300,55],[55.01,55]]) assert.equal(policy.estimateHrrZones(...pair),null);
});
test('estimate is never executable before confirmation; confirmed range and provenance survive',()=>{
  const proposal=zones.hrZoneProposal(running(profile),new Date(now).toISOString());
  assert.equal(zones.admittedHrZones(running(profile),proposal),null);
  const c=contract({...profile,hrZoneBootstrap:confirmed()});
  assert.equal(c.intensityAuthority.targets[0].primary.referenceId,'running:confirmedBaseZone');
  const ref=c.doseContext.references.find(r=>r.id==='running:confirmedBaseZone');
  assert.deepEqual(plain(ref.value),{min:136,max:149});assert.equal(ref.intensityEvidence.kind,'ESTIMATED');
  assert.equal(ref.intensityEvidence.containsEstimatedData,true);assert.equal(ref.intensityEvidence.zoneCompatibility.sourceZone,'Z2');
  assert.ok(load('sessionDoseContext').validateDoseContext(c.doseContext));
  assert.ok(!c.doseContext.references.some(r=>['easyHr','thresholdHr','LT1','LT2'].includes(r.metric)));
});
for(const field of ['fc_max','fc_reposo'])test(`changed ${field} invalidates confirmation and issuance`,()=>{
  const p={...profile,[field]:profile[field]+1};const proposal=zones.hrZoneProposal(running(profile),new Date(now).toISOString());
  const token=zones.issueHrZoneProposal('fixture',proposal,null,now);
  assert.equal(zones.admittedHrZones(running(p),confirmed()),null);
  assert.throws(()=>zones.confirmHrZoneProposal('fixture',token,proposal.proposalDigest,running(p),null,now+1));
});
test('confirmation rejects altered proposal, wrong user, expiry, digest and replay',()=>{
  const proposal=zones.hrZoneProposal(running(profile),new Date(now).toISOString());
  const token=zones.issueHrZoneProposal('fixture',proposal,null,now);
  for(const args of [['other',token,proposal.proposalDigest,null,now],['fixture',token,'bad',null,now],
    ['fixture',token,proposal.proposalDigest,null,now+1800001],['fixture',token,proposal.proposalDigest,confirmed(),now],
    ['fixture','bad',proposal.proposalDigest,null,now]])
    assert.throws(()=>zones.confirmHrZoneProposal(args[0],args[1],args[2],running(profile),args[3],args[4]));
  const [payload,sig]=token.split('.'), parsed=JSON.parse(Buffer.from(payload,'base64url'));parsed.proposal.zones[1].upper++;
  assert.throws(()=>zones.confirmHrZoneProposal('fixture',Buffer.from(JSON.stringify(parsed)).toString('base64url')+'.'+sig,proposal.proposalDigest,running(profile),null,now));
});
test('easyHr wins; complete declared zones win over estimate; no generic Z2 alias',()=>{
  const p={...profile,hrZoneBootstrap:confirmed()}, declared=Object.fromEntries(policy.estimateHrrZones(180,50).map((z,i)=>[`z${i+1}_fc`,`${z.lower}-${z.upper}`]));
  assert.equal(contract(p,{fc_suave:140,...declared}).intensityAuthority.targets[0].primary.referenceId,'running:easyHr');
  const c=contract(p,declared);assert.equal(c.doseContext.runningReferenceAuthority.hrZoneSystem.origin,'USER_DECLARED');
  assert.equal(c.intensityAuthority.targets[0].evidence.kind,'DIRECT');
  assert.ok(load('sessionDoseContext').validateDoseContext(c.doseContext));
  assert.equal(contract(profile,{z2_fc:'130-145'}).intensityAuthority.targets[0].primary.kind,'rpe');
});
test('partial/incoherent sets rejected; manual declaration independent of HR inputs',()=>{
  for(const z of [[],[{id:'Z1',lower:1,upper:2}],policy.estimateHrrZones(190,55).map(z=>({...z,lower:1}))])
    assert.equal(zones.hrZoneProposal(running(profile),new Date(now).toISOString(),z),null);
  const s=confirmed(profile,policy.estimateHrrZones(190,55));
  assert.equal(zones.admittedHrZones(running({}),s).origin,'USER_DECLARED');
});
test('Builder cannot replace authorized intensity or mutate snapshot range',()=>{
  const c=contract({...profile,hrZoneBootstrap:confirmed()});
  const m=c.intensityAuthority.targets[0].movementId;
  assert.deepEqual(plain(load('methodIntensityAuthority').validateMethodIntensity(c,{blocks:[{blockType:'main',movements:[{movementId:m,prescription:{intensity:{kind:'rpe',value:3}}}]}]})),['METHOD_INTENSITY_OUTSIDE_DOMAIN']);
  c.doseContext.runningReferenceAuthority.hrZoneSystem.zones[1].upper++;
  assert.equal(load('sessionDoseContext').validateDoseContext(c.doseContext),false);
});
test('RPE and pace fallback retain their authority without confirmed zones',()=>{
  assert.deepEqual(plain(contract().intensityAuthority.targets[0].primary),{kind:'rpe',value:2,max:3});
  assert.equal(contract(profile,{ritmo_z2:'6:00'}).intensityAuthority.targets[0].primary.referenceId,'running:easyPace');
});
test('real actions issue, confirm, persist and reject replay',async()=>{
  const db=database(profile), action=load('../athlete/hrZoneActions').hrZoneAction;
  const p=await action(db,'fixture','propose',{});
  assert.equal(db.user.perfil.hrZoneBootstrap,undefined);
  await action(db,'fixture','confirm',{token:p.token,digest:p.proposal.proposalDigest});
  assert.equal(db.user.perfil.hrZoneBootstrap.confirmation,'USER_CONFIRMED');
  await assert.rejects(action(db,'fixture','confirm',{token:p.token,digest:p.proposal.proposalDigest}));
  await action(db,'fixture','rpe',{});
  assert.equal(zones.admittedHrZones(running(profile),db.user.perfil.hrZoneBootstrap),null);
});
test('UI optional HR regression and dedicated profile protection',()=>{
  const ui=readFileSync('app/FormaPro.tsx','utf8');
  assert.match(ui,/const optionalHrField = categoria === 'carrera' && \['fc_max', 'fc_reposo'\]/);
  assert.match(ui,/pregActual.tipo==="texto"&&!optionalHrField&&!textoTemp.trim\(\)/);
  assert.match(ui,/condicionValor: \/pulsómetro\/i/);
  assert.equal(load('../auth/legacyContainment').projectLegacyCreate({perfil:{hrZoneBootstrap:confirmed()}}).perfil.hrZoneBootstrap,undefined);
  assert.match(readFileSync('app/api/chat/route.ts','utf8'),/delete profilePatch.perfil.hrZoneBootstrap/);
});
test('actual onboarding advance handler permits blank HR but not other required text',()=>{
  const source=ts.createSourceFile('ui.tsx',readFileSync('app/FormaPro.tsx','utf8'),99,true,ts.ScriptKind.TSX);
  function find(n){if(ts.isVariableDeclaration(n)&&n.name.getText(source)==='avanzar')return n;return ts.forEachChild(n,find);}
  const expression=find(source).initializer.getText(source);
  for(const optionalHrField of [true,false]){
    let advanced=false;
    const run=vm.runInNewContext(expression,{optionalHrField,pregActual:{id:'fc_max',tipo:'texto'},textoTemp:'',selMulti:[],respuestas:{},pregIdx:0,preguntas:[{},{}],
      setRespuestas(){},setSelMulti(){},setTextoTemp(){},setPregIdx(){advanced=true;},setPantalla(){advanced=true;}});
    run();assert.equal(advanced,optionalHrField);
  }
});
test('human session displays final HR range followed by RPE guide',()=>{
  const c=contract({...profile,hrZoneBootstrap:confirmed()}), target=c.intensityAuthority.targets[0];
  const p={schemaVersion:2,stimulusId:c.stimulusId,structureId:'continuo_carrera',blocks:[{blockType:'main',movements:[{movementId:target.movementId,prescription:{durationSeconds:1800,intensity:target.primary}}]}]};
  const rendered=JSON.stringify(load('humanCoachingProjection').humanCoachingProjection(c,p,true));
  assert.match(rendered,/Z2/);assert.match(rendered,/136–149 ppm/);assert.match(rendered,/RPE esperado 2–3/);
});

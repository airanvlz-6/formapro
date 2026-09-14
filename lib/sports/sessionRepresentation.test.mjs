import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain, contractFixture, equippedProfileFixture } from './trainingContractTestRuntime.mjs';
const events=[];
const load=sportsRuntime({console:{info:(...x)=>events.push(x),warn(){},log(){},error(){}}});
const api=load('structuredSession'), variants=load('movementVariants'), execution=load('sessionExecution');
function contract(notes=[]){
  const intent={kind:'open_coach',version:1,discipline:'box',adaptationId:'lower_body_skill',stimulusId:'controlled_lower_body',pattern:'lunge',role:'PRIMARY',method:{kind:'coach_defined',label:'Practice'}};
  const profile=load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile({perfil:{...equippedProfileFixture(),duracion:'60 min'}});
  const doseContext=load('sessionDoseContext').buildSessionDoseContext(profile,intent,null,[],true,'coach');
  const restrictionsSnapshot=load('../athlete/getCanonicalRestrictions').projectCanonicalRestrictions([],notes,'2026-09-13');
  const c=load('allowedTrainingContract').buildAllowedTrainingContract(contractFixture({targetWeekStart:'2026-09-14',intent,stimulus:intent.stimulusId,doseContext,restrictionsSnapshot}));
  assert.equal(c.ok,true,JSON.stringify(c));return {...c.contract,generatedMovementAuthority:plain(variants.GENERATED_MOVEMENT_AUTHORITY)};
}
const entry=(instruction='3 series técnicas, lejos del fallo')=>({movementId:'generated:practice',variant:{version:1,canonicalFamily:'db_lunge',modifiers:{direction:'reverse',loadPosition:'contralateral'}},prescription:{doseInstruction:instruction}});
const proposal=(c,m=[entry()])=>({schemaVersion:2,stimulusId:c.stimulusId,structureId:'strength_sets',explanation:'Práctica contextual.',blocks:[{blockType:'main',movements:m}]});
const validate=(c,p)=>api.validateSessionAgainstTrainingContract(c,p);

// Only the reported identities and field presence are incident evidence. Numeric values,
// layout outside main and optional missing discriminator here are synthetic test choices.
function canonicalIncident(c,version=2){
  const p={schemaVersion:version,stimulusId:c.stimulusId,structureId:'strength_sets',explanation:'Práctica contextual.',blocks:[
    {blockType:'warmup',movements:[{movementId:'goblet_squat',prescription:{reps:5}}]},
    {blockType:'main',movements:['goblet_squat','single_leg_rdl','bulgarian_split_squat'].map((movementId,i)=>({movementId,
      prescription:{sets:3,reps:8,intensity:{kind:i===2?'rir':'rpe',value:i===2?3:6},restSeconds:60,...(i?{perSide:true}:{})}}))},
    {blockType:'cooldown',movements:[{movementId:'goblet_squat',prescription:{reps:5}}]},
  ]};if(version===undefined)delete p.schemaVersion;return p;
}
test('confirmed canonical field shapes pass unchanged under explicit modern schema',()=>{
  const c=contract(),p=canonicalIncident(c);assert.equal(validate(c,p).ok,true,JSON.stringify(validate(c,p)));
  assert.deepEqual(plain(api.inspectSessionRepresentation(p,true).proposal),p);
});
test('isolated missing discriminator explains three legacy field failures, without claiming production discriminator',()=>{
  const c=contract(),p=canonicalIncident(c);delete p.schemaVersion;
  const details=[];const legacy=api.inspectSessionRepresentation(p,false,d=>details.push(d));
  assert.deepEqual(plain(legacy.violations),Array(3).fill('MOVEMENT_SHAPE_INVALID:1'));
  assert.deepEqual(details.map(d=>d.canonicalMovementId),['goblet_squat','single_leg_rdl','bulgarian_split_squat']);
  for(const d of details){assert.deepEqual(plain(d.failedPredicates),['MOVEMENT_LEGACY_DOSE_FIELDS']);assert.equal(d.representation.sourceSchema,'absent');assert.equal(d.receivedShape.prescription.fields.intensity,'object');assert.doesNotMatch(d.repair,/variant recipe/);}
  const before=structuredClone(p),r=validate(c,p);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.proposal.schemaVersion,2);assert.deepEqual(p,before);
  assert.deepEqual(plain(r.proposal.blocks),p.blocks);
  assert.deepEqual(plain(api.inspectSessionRepresentation(r.proposal,true).proposal),plain(r.proposal));
});
test('additional entry fields can produce the same logged symptoms: production predicate still unknown',()=>{
  const p=canonicalIncident(contract());for(const e of p.blocks[1].movements)e.role='private-value';
  const details=[];const r=api.inspectSessionRepresentation(p,true,d=>details.push(d));assert.equal(r.ok,false);
  assert.deepEqual(plain(r.violations),Array(3).fill('MOVEMENT_SHAPE_INVALID:1'));
  for(const d of details){assert.deepEqual(plain(d.failedPredicates),['MOVEMENT_EXTRA_FIELD']);assert.equal(d.receivedShape.entry.fields.role,'string');assert.equal(d.representation.sourceSchema,2);}
  assert.doesNotMatch(JSON.stringify(details),/private-value|typed variant/);
});
for(const [code,mutate] of [
  ['MOVEMENT_OBJECT_INVALID',p=>p.blocks[1].movements[0]=null],
  ['MOVEMENT_ID_MISSING',p=>delete p.blocks[1].movements[0].movementId],
  ['MOVEMENT_ID_TYPE_INVALID',p=>p.blocks[1].movements[0].movementId=42],
  ['MOVEMENT_PRESCRIPTION_MISSING',p=>delete p.blocks[1].movements[0].prescription],
  ['MOVEMENT_PRESCRIPTION_SHAPE_INVALID',p=>p.blocks[1].movements[0].prescription=[]],
  ['MOVEMENT_EXTRA_FIELD',p=>p.blocks[1].movements[0].privatePatientKey='secret'],
])test(`canonical shape predicate and actionable repair: ${code}`,()=>{
  const p=canonicalIncident(contract());mutate(p);const details=[];
  assert.equal(api.inspectSessionRepresentation(p,true,d=>details.push(d)).ok,false);
  assert.ok(details[0].failedPredicates.includes(code));assert.doesNotMatch(JSON.stringify(details),/privatePatientKey|secret|typed variant/);
});
test('identity aliases and dose aliases are diagnosed, never guessed',()=>{
  const p=canonicalIncident(contract()),m=p.blocks[1].movements[0];m.canonicalMovementId=m.movementId;delete m.movementId;m.dose=m.prescription;delete m.prescription;
  const details=[];assert.equal(api.inspectSessionRepresentation(p,true,d=>details.push(d)).ok,false);
  assert.deepEqual(plain(details[0].failedPredicates),['MOVEMENT_EXTRA_FIELD','MOVEMENT_ID_MISSING','MOVEMENT_PRESCRIPTION_MISSING']);
  assert.equal(details[0].receivedShape.entry.fields.canonicalMovementId,'string');assert.equal(details[0].receivedShape.dose.fields.reps,'number');
});
test('unknown ID reaches movement resolution, not canonical shape rejection',()=>{
  const c=contract(),p=canonicalIncident(c);p.blocks[1].movements[0].movementId='unknown';
  assert.equal(api.inspectSessionRepresentation(p,true).ok,true);const r=validate(c,p);assert.equal(r.ok,false);assert.ok(r.violations.some(v=>v.startsWith('MOVEMENT_SEMANTICS_UNRESOLVED:')));
});
test('schema normalization does not admit false references, unknown fields or malformed doses',()=>{
  for(const modify of [m=>m.prescription.intensity={kind:'percent_1rm',value:75,referenceId:'invented'},m=>m.prescription.reps=-1,m=>m.prescription.kg=42]){
    const c=contract(),p=canonicalIncident(c);delete p.schemaVersion;modify(p.blocks[1].movements[0]);assert.equal(validate(c,p).ok,false);
  }
  const p=canonicalIncident(contract());p.schemaVersion=1;assert.equal(api.inspectSessionRepresentation(p,true).ok,false);
});
test('already admitted legacy numeric representation remains unchanged even with execution policy',()=>{
  const p=canonicalIncident(contract());delete p.schemaVersion;
  for(const b of p.blocks)for(const m of b.movements){delete m.prescription.intensity;delete m.prescription.perSide;}
  assert.deepEqual(plain(api.inspectSessionRepresentation(p,true).proposal),p);
});
test('canonical representation metadata is advisory and needs no exercise repair',async()=>{
  const c=contract(),good=canonicalIncident(c),bad=structuredClone(good);for(const e of bad.blocks[1].movements)e.role='primary';let calls=0;
  const result=await load('sessionGeneration').generateContractSession(c,[],async prompt=>{
    if(calls++){const repair=prompt.split('REPAIR_SHAPE_DETAILS:\n')[1];assert.ok(repair);assert.match(repair,/MOVEMENT_EXTRA_FIELD/);assert.doesNotMatch(repair,/variant recipe|derived display name/);return JSON.stringify(good);}
    return JSON.stringify(bad);
  });assert.equal(result.ok,true,JSON.stringify(result));assert.equal(calls,1);assert.deepEqual(plain(result.proposal.blocks),bad.blocks);
});

for(const instruction of ['3 x 8 per side','3 x 8 por pierna','3 series de 8 por lado','3 sets of 8 each side','3 sets, 8 each side'])test(`semantic quantity class: ${instruction}`,()=>{
  const r=execution.resolveDoseInstruction(instruction);assert.deepEqual(plain(r.fields),{sets:3,reps:8,perSide:true});
});
test('bounded partial instruction preserves unknown analytics and derives missing redundant label',()=>{
  const c=contract(),p=proposal(c),r=validate(c,p);assert.equal(r.ok,true,JSON.stringify(r));
  const d=r.proposal.blocks[0].movements[0].prescription;assert.equal(d.sets,3);assert.equal(d.reps,undefined);assert.equal(d.intensity,undefined);
  assert.equal(load('sessionDose').estimateSessionDuration(c,r.proposal).maximumSeconds,null);
  const row=api.renderContractSession(c,r.proposal,'human_v3');assert.match(row.descripcion,/lejos del fallo/);
  assert.equal(p.blocks[0].movements[0].prescription.sets,undefined);
  const named=entry();named.variant.displayName=variants.movementVariantDisplayName('db_lunge',named.variant.modifiers);
  assert.equal(variants.resolvedMovement(named).identity,variants.resolvedMovement(entry()).identity);
});
for(const [text,classification] of [['haz algo técnico','NON_EXECUTABLE_INSTRUCTION'],['3 x 8 y 10 burpees','HIDDEN_WORK'],['3 x 8 luego correr 90 min','HIDDEN_WORK'],['3 x 8 @ 140 bpm','OBJECTIVE_REFERENCE_UNRESOLVED'],['\n3 x 8','MALFORMED_OUTPUT']])test(`isolated ${classification}: remains hard`,()=>{
  const result=api.inspectSessionRepresentation(proposal(contract(),[entry(text)]),true);assert.equal(result.ok,false);
  assert.ok(result.violations.includes(classification==='OBJECTIVE_REFERENCE_UNRESOLVED'?'DOSE_INSTRUCTION_REFERENCE_REQUIRED':'DOSE_INSTRUCTION_UNRESOLVED'));
});
test('isolated shape rule reports typed paths without private keys or values',()=>{
  const m=entry();m.variant.modifiers={privatePatientName:'private-secret'};
  const seen=[];const r=api.inspectSessionRepresentation(proposal(contract(),[m]),true,d=>seen.push(d));
  assert.equal(r.ok,false);assert.deepEqual(plain(r.violations),['GENERATED_VARIANT_SHAPE_INVALID']);
  assert.deepEqual(plain(seen[0].generatedVariant.failedFields),['variant.modifiers.extraFields']);
  assert.doesNotMatch(JSON.stringify(seen),/privatePatientName|private-secret/);
});
for(const [field,mutate] of [
  ['movementId',m=>m.movementId='db_lunge'],
  ['variant',m=>m.variant='opaque'],
  ['variant.extraFields',m=>m.variant.geometry={safe:true}],
  ['variant.version',m=>m.variant.version=99],
  ['variant.canonicalFamily',m=>m.variant.canonicalFamily=42],
  ['variant.displayName',m=>m.variant.displayName=42],
  ['variant.displayName',m=>m.variant.displayName='x'.repeat(161)],
  ['variant.modifiers',m=>m.variant.modifiers=[]],
  ['variant.modifiers',m=>m.variant.modifiers={}],
])test(`isolated exact variant shape condition: ${field}`,()=>{
  const m=entry();mutate(m);const details=[];
  const r=api.inspectSessionRepresentation(proposal(contract(),[m]),true,d=>details.push(d));
  assert.equal(r.ok,false);assert.ok(r.violations.includes('GENERATED_VARIANT_SHAPE_INVALID'));
  assert.ok(details[0].generatedVariant.failedFields.includes(field),JSON.stringify(details));
});
test('separate movement diagnostics distinguish simultaneous codes; this is synthetic, not incident reconstruction',()=>{
  const a=entry();a.variant.modifiers={better:true};
  const b={movementId:'db_lunge',prescription:{doseInstruction:'haz algo técnico'}};
  const details=[];const r=api.inspectSessionRepresentation(proposal(contract(),[a,b]),true,d=>details.push(d));
  assert.deepEqual(plain(r.violations),['GENERATED_VARIANT_SHAPE_INVALID','DOSE_INSTRUCTION_UNRESOLVED']);
  assert.equal(details[0].movementOrdinal,1);assert.equal(details[1].movementOrdinal,2);
  assert.equal(details[1].instructionResolutionCode,'UNRECOGNIZED_GRAMMAR');
});
test('both violations on one movement survive the early dose return and observer failure',()=>{
  const m=entry('haz algo técnico');m.variant.modifiers={better:true};const details=[];
  const p=proposal(contract(),[m]),r=api.inspectSessionRepresentation(p,true,d=>details.push(d));
  assert.equal(details.length,1);assert.equal(details[0].violationCodes.length,2);
  assert.deepEqual(plain(api.inspectSessionRepresentation(p,true,()=>{throw Error('observer');})),plain(r));
});
test('unknown family or operation stays unresolved; display mismatch still fails',()=>{
  for(const mutate of [m=>m.variant.canonicalFamily='unknown',m=>m.variant.modifiers.direction='better',m=>m.variant.displayName='snatch']){
    const m=entry();mutate(m);assert.equal(validate(contract(),proposal(contract(),[m])).ok,false);
  }
});
test('resolved geometry passes without restriction, but active unknown biomechanics remains hard',()=>{
  const c=contract(),p=proposal(c);assert.equal(validate(c,p).ok,true);
  const restricted=contract([{id:'r',status:'pending',constraint_level:'hard',prohibits_axial_load:true}]);
  const r=validate(restricted,proposal(restricted));assert.equal(r.ok,false);assert.ok(r.violations.some(x=>/GENERATED_RESTRICTION_UNKNOWN|UNKNOWN_SAFETY/.test(x)),JSON.stringify(r));
});
test('retry receives actionable ordinals and both attempts emit safe diagnostics; limit remains two',async()=>{
  events.length=0;const c=contract(),bad=entry('haz algo técnico');bad.variant.modifiers={privateKey:'private-secret'};let count=0;
  const run='dd312b54-1407-4b13-982c-9901e44894dc';
  const result=await load('sessionGeneration').generateContractSession(c,[],async prompt=>{
    if(count++){assert.match(prompt,/REPAIR_SHAPE_DETAILS/);assert.match(prompt,/variant.modifiers.extraFields/);assert.match(prompt,/movementOrdinal/);assert.doesNotMatch(prompt,/private-secret|privateKey/);}
    return {text:JSON.stringify(proposal(c,[bad])),planningRunId:run};
  });
  assert.equal(count,2);assert.equal(result.ok,false);
  const details=events.filter(x=>x[0]==='SESSION_SHAPE_VIOLATION').map(x=>x[1]);assert.deepEqual(details.map(x=>x.attempt),[1,2]);
  assert.ok(details.every(x=>x.planningRunId===run&&x.movementOrdinal===1));assert.doesNotMatch(JSON.stringify(details),/haz algo|private-secret|privateKey/);
});
test('actionable retry accepts a corrected Coach output',async()=>{
  const c=contract();let count=0;
  const result=await load('sessionGeneration').generateContractSession(c,[],async prompt=>{
    if(count++) {assert.match(prompt,/REPAIR_SHAPE_DETAILS/);return JSON.stringify(proposal(c));}
    return JSON.stringify(proposal(c,[entry('haz algo técnico')]));
  });assert.equal(result.ok,true,JSON.stringify(result));assert.equal(count,2);assert.equal(result.proposal.blocks[0].movements[0].prescription.sets,3);
});

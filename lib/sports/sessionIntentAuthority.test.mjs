import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain, contractFixture, equippedProfileFixture } from './trainingContractTestRuntime.mjs';
const events=[];
const load=sportsRuntime({console:{info:(...v)=>events.push(v),warn(){},log(){},error(){}}});
const api=load('structuredSession'),assess=load('sessionIntentAssessment').assessSessionIntent;
function contract(notes=[]){
  const intent={kind:'open_coach',version:1,discipline:'box',adaptationId:'upper_body_control',stimulusId:'technical_push_density',pattern:'horizontal_push',role:'PRIMARY',method:{kind:'coach_defined',label:'Contextual practice'}};
  const profile=load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile({perfil:{...equippedProfileFixture(),duracion:'60 min'}});
  const doseContext=load('sessionDoseContext').buildSessionDoseContext(profile,intent,null,[],true,'coach');
  const restrictionsSnapshot=load('../athlete/getCanonicalRestrictions').projectCanonicalRestrictions([],notes,'2026-09-13');
  const c=load('allowedTrainingContract').buildAllowedTrainingContract(contractFixture({targetWeekStart:'2026-09-14',intent,stimulus:intent.stimulusId,doseContext,restrictionsSnapshot}));
  assert.equal(c.ok,true,JSON.stringify(c));return {...c.contract,generatedMovementAuthority:plain(load('movementVariants').GENERATED_MOVEMENT_AUTHORITY)};
}
function proposal(c,id='bench_press') {return {schemaVersion:2,stimulusId:c.stimulusId,structureId:'strength_sets',explanation:'Implementación elegida para el contexto.',blocks:[{blockType:'main',movements:[{movementId:id,prescription:{sets:3,reps:5,restSeconds:60,intensity:{kind:'rpe',value:6}}}]}]};}
const validate=(c,p)=>api.validateSessionAgainstTrainingContract(c,p);
test('positive sporting evidence is SATISFIED without candidate membership requirement',()=>{
  const c=contract(),p=proposal(c);assert.equal(validate(c,p).ok,true);
  const observation={...c,allowedMovementIds:c.allowedMovementIds.filter(id=>id!=='bench_press')};
  assert.equal(assess(observation,p).status,'SATISFIED');
});
test('different legitimate implementation is UNKNOWN, not a sports-policy veto',()=>{
  const c=contract(),p=proposal(c,'bike_erg');p.blocks[0].movements[0].prescription={durationSeconds:600,intensity:{kind:'rpe',value:5}};
  assert.equal(assess(c,p).status,'UNKNOWN');assert.equal(validate(c,p).ok,true,JSON.stringify(validate(c,p)));
});
test('explicit authority contradiction remains hard and intent is never rewritten',()=>{
  const c=contract(),before=structuredClone(c.intent),p=proposal(c);p.stimulusId='another_direction';
  assert.equal(assess(c,p).status,'CONTRADICTED');assert.ok(validate(c,p).violations.includes('STIMULUS_MISMATCH'));assert.deepEqual(c.intent,before);
});
test('wrong admitted discipline binding still fails the contract authority',()=>{
  const c=contract();c.intent.discipline='carrera';const r=validate(c,proposal(c));assert.equal(r.ok,false,JSON.stringify(r));
});
test('explicit session discipline contradicting admitted scope remains hard',()=>{
  const c=contract(),p=proposal(c);p.discipline='carrera';assert.equal(assess(c,p).status,'CONTRADICTED');
  assert.ok(validate(c,p).violations.includes('SESSION_DISCIPLINE_SCOPE_MISMATCH'));
});
test('missing commentary is not a modern execution requirement and metadata is not logged',async()=>{
  events.length=0;const c=contract(),p=proposal(c);delete p.explanation;p.blocks[0].movements[0].privateMetadata='private patient annotation';
  const r=await load('sessionGeneration').generateContractSession(c,[],async()=>JSON.stringify(p));
  assert.equal(r.ok,true,JSON.stringify(r));assert.doesNotMatch(JSON.stringify(events),/private patient annotation/);
  const requirement=events.find(e=>e[0]==='REQUIREMENT_ASSESSMENT')[1];assert.equal(requirement.attempt,1);
  assert.equal(requirement.movementOrdinal,1);assert.equal(requirement.family,'bench_press');assert.equal(requirement.category,'equipment');assert.equal(requirement.state,'AVAILABLE');
});
test('active incompatible restriction is hard despite sporting UNKNOWN',()=>{
  const c=contract([{id:'r',status:'pending',constraint_level:'hard',prohibits_axial_load:true}]),p=proposal(c,'back_squat');
  assert.equal(assess(c,p).status,'UNKNOWN');const r=validate(c,p);assert.equal(r.ok,false);assert.ok(r.violations.some(v=>v.startsWith('MOVEMENT_RESTRICTED:')));
});
test('modern shape is normalize/observe/minimal: arbitrary representation is preserved, not rendered as work',()=>{
  const c=contract(),p=proposal(c);p.schemaVersion='decorative';p.analytics={unquantified:true};const e=p.blocks[0].movements[0];e.role='support';e.prescription.analytics={certainty:'unknown'};
  const details=[],shape=api.checkSessionShape(p,true,d=>details.push(d));assert.equal(shape.ok,true);assert.equal(shape.proposal.schemaVersion,2);
  const r=validate(c,p);assert.equal(r.ok,true,JSON.stringify(r));assert.deepEqual(plain(r.proposal.analytics),{unquantified:true});
  assert.doesNotMatch(api.renderContractSession(c,p).descripcion,/certainty|unquantified/);
  assert.equal(p.schemaVersion,'decorative');
});
test('entry representation diagnostics remain advisory with modern policy',()=>{
  const p=proposal(contract());p.blocks[0].movements[0].role='support';const details=[];
  assert.equal(api.checkSessionShape(p,true,d=>details.push(d)).ok,true);assert.equal(details[0].advisory,true);assert.ok(details[0].failedPredicates.includes('MOVEMENT_EXTRA_FIELD'));
});
test('repeated executable entries remain explicit work and computable totals cannot be hidden',()=>{
  const c=contract(),p=proposal(c);p.blocks[0].movements.push(structuredClone(p.blocks[0].movements[0]));
  assert.equal(validate(c,p).ok,true,JSON.stringify(validate(c,p)));assert.equal(validate(c,p).proposal.blocks[0].movements.length,2);
  for(const m of p.blocks[0].movements)m.prescription={durationSeconds:2000};
  assert.ok(validate(c,p).violations.includes('SESSION_BUDGET_EXCEEDED'));
});
test('an exactly redundant dose representation is not additional work; a differing one stays hard',()=>{
  const c=contract(),p=proposal(c),m=p.blocks[0].movements[0];m.dose=structuredClone(m.prescription);m.rest=60;
  assert.equal(validate(c,p).ok,true,JSON.stringify(validate(c,p)));
  m.dose.reps=10;assert.ok(validate(c,p).violations.includes('HIDDEN_WORK_OR_CONFLICTING_REPRESENTATION'));
});
test('known alternative identity resolves invalid ID, conflicting known identities are hard',()=>{
  const c=contract(),p=proposal(c),e=p.blocks[0].movements[0];e.movementId=null;e.canonicalMovementId='bench_press';
  assert.equal(validate(c,p).ok,true);e.movementId='goblet_squat';assert.ok(validate(c,p).violations.includes('MOVEMENT_IDENTITY_CONFLICT'));
});
test('generated recipe missing decorative version enriches without adding domain semantics',()=>{
  const c=contract(),p=proposal(c),e=p.blocks[0].movements[0];e.movementId='generated:practice';e.variant={canonicalFamily:'bench_press',modifiers:{tempo:[3,1,1,0]}};e.prescription.tempo=[3,1,1,0];
  assert.equal(validate(c,p).ok,true,JSON.stringify(validate(c,p)));
  e.variant.modifiers={better:true};assert.equal(validate(c,p).ok,false);
});
for(const mutate of [p=>p.blocks[0].movements[0]=null,p=>p.blocks[0].movements[0].prescription=[],p=>delete p.blocks[0].movements[0].movementId])test('unusable object/identity/dose remains minimal hard failure',()=>{
  const p=proposal(contract());mutate(p);assert.equal(api.checkSessionShape(p,true).ok,false);
});
test('dose failures move after shape, remain hard including hidden work, false reference and impossible clock',()=>{
  const c=contract();for(const d of [{doseInstruction:'3 x 8 y 10 burpees'},{sets:3,reps:5,intensity:{kind:'percent_1rm',referenceId:'invented',value:75}},{durationSeconds:3601},{reps:-1}]){
    const p=proposal(c);p.blocks[0].movements[0].prescription=d;assert.equal(api.checkSessionShape(p,true).ok,true);assert.equal(validate(c,p).ok,false);
  }
  const p=proposal(c);p.blocks[0].movements[0].additionalWork=[{movementId:'burpee',prescription:{reps:10}}];assert.ok(validate(c,p).violations.includes('HIDDEN_WORK_OR_CONFLICTING_REPRESENTATION'));
});
test('historical contracts keep exact pattern admission and modern diagnostics carry safe context',async()=>{
  const c=contract(),p=proposal(c,'goblet_squat'),historical={...c};delete historical.executionPolicy;
  assert.ok(validate(historical,p).violations.includes('INTENT_NOT_SATISFIED'));
  events.length=0;const r=await load('sessionGeneration').generateContractSession(c,[],async()=>JSON.stringify(p),'','cc616ecf-041b-4f09-b6e2-28f5c467c2ce');
  assert.equal(r.ok,true,JSON.stringify(r));const event=events.find(e=>e[0]==='SESSION_INTENT_ASSESSMENT')[1];assert.equal(event.status,'UNKNOWN');assert.equal(event.attempt,1);assert.equal(event.planningRunId,'cc616ecf-041b-4f09-b6e2-28f5c467c2ce');assert.doesNotMatch(JSON.stringify(event),/Contextual practice/);
});

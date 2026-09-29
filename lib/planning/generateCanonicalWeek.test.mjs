import test from 'node:test';
import assert from 'node:assert/strict';
import { api, load, plain, paths, fixture, proposal, confirm, run, dates, start, end, all, usual, known } from './canonicalWeekTestFixture.mjs';

test('habitual only requires weekly confirmation with zero providers, exposing proposal without prose',async()=>{
  const {result,coachCalls,builderCalls}=await run(fixture());assert.equal(result.status,'NEEDS_INPUT');
  assert.deepEqual(plain(result.unresolved),['WEEK_AVAILABILITY']);assert.equal(coachCalls,0);assert.equal(builderCalls,0);
  assert.equal(result.targetWindow.startDate,start);assert.equal(result.targetWindow.endDate,end);
  assert.ok(result.availabilityProposal.every(d=>d.basis==='habitual'));
});
test('explicit same-as-usual creates a new confirmation for Oct 12–18 and allows Coach',async()=>{
  const f=fixture(),before=plain(f.request.habitual),pending=await run(f);
  f.confirmation=api.confirmWeeklyAvailability({targetWindow:pending.result.targetWindow,days:pending.result.availabilityProposal,
    provenance:{authority:'user',sourceReference:'reply:same-as-usual',confirmedAt:'2026-10-05T10:00:00Z'}});
  assert.deepEqual(plain(f.confirmation.targetWindow),{startDate:start,endDate:end});
  assert.deepEqual(plain(f.confirmation.declaration.availability.carrera),usual);
  assert.equal(f.confirmation.provenance.authority,'user');assert.equal(f.confirmation.declaration.source,'explicit_user_declaration');
  const {result,coachCalls,builderCalls}=await run(f);assert.equal(result.status,'READY',JSON.stringify(result));
  assert.equal(coachCalls,1);assert.equal(builderCalls,3);assert.deepEqual(plain(f.request.habitual),before);
  f.request.habitual.byDiscipline.carrera.value.push('domingo');assert.deepEqual(plain(f.confirmation.declaration.availability.carrera),usual);
});
test('changed life circumstances replace weekly facts with Tue Wed Sun, without preserving habitual frequency',async()=>{
  const f=confirm(fixture(),['martes','miercoles','domingo']);const {result,requests,builderCalls}=await run(f,{indices:[1,2,6]});
  assert.equal(result.status,'READY',JSON.stringify(result));assert.equal(builderCalls,3);
  assert.deepEqual(requests[0].intake.availability.days.filter(d=>d.discipline==='carrera'&&d.status==='AVAILABLE').map(d=>d.date),[dates[1],dates[2],dates[6]]);
  assert.equal(result.prescription.days.filter(d=>d.state==='UNAVAILABLE').length,4);
});
test('another week confirmation never authorizes this target',async()=>{
  const f=confirm(fixture());f.confirmation.targetWindow={startDate:'2026-10-19',endDate:'2026-10-25'};
  const r=await run(f);assert.equal(r.result.status,'NEEDS_INPUT');assert.ok(r.result.unresolved.includes('WEEK_AVAILABILITY'));assert.equal(r.coachCalls+r.builderCalls,0);
});
test('current week unknown includeToday blocks both providers despite weekly confirmation',async()=>{
  const f=confirm(fixture(all,start)),r=await run(f);assert.equal(r.result.status,'NEEDS_INPUT');
  assert.deepEqual(plain(r.result.unresolved),['INCLUDE_TODAY']);assert.equal(r.coachCalls+r.builderCalls,0);
});
test('future week does not ask includeToday',async()=>{
  const r=await run(confirm(fixture(all)));assert.equal(r.result.status,'READY');assert.equal(r.result.intake.temporalDecision.status,'not_applicable');
});
for(const indices of [[0,2,4],[0,1,2,4,5]])test(`${indices.length} Coach TRAIN choices produce exactly that many Builders and an authentic mutation`,async()=>{
  const f=confirm(fixture(all)),before=plain(f),r=await run(f,{indices});assert.equal(r.result.status,'READY',JSON.stringify(r.result));
  assert.equal(r.coachCalls,1);assert.equal(r.builders,indices.length);assert.equal(r.builderCalls,indices.length);assert.equal(r.plans,1);
  assert.deepEqual(r.received.map(d=>d.date),indices.map(i=>dates[i]));
  assert.equal(load('../planning/planMutation').isValidatedPlanMutation(r.result.mutation),true);
  assert.equal(load('../planning/planMutation').isValidatedPlanMutation(plain(r.result.mutation)),false);
  assert.equal(r.result.candidate.sessions.length,7);
  for(const [n,s] of r.result.candidate.sessions.entries()){
    assert.equal(s.completada,false);assert.deepEqual(plain(s.weekPrescriptionDecision.day),plain(r.result.prescription.days[n]));
    assert.deepEqual(plain(s.weekPrescriptionDecision.weekIntentReference),plain(r.result.prescription.weekIntentReference));
    if(!indices.includes(n)){assert.equal(s.tipo,'descanso');assert.equal(Object.hasOwn(s,'structuredPrescription'),false);}
  }
  assert.equal(r.result.week.positionInBlock,null);assert.equal(r.result.block.revision,1);assert.equal(r.result.week.revision,2);assert.equal(r.result.prescription.revision,3);
  assert.deepEqual(plain(f),before);
});
test('Builder purpose mutation fails fidelity and returns no partial week or mutation',async()=>{
  const r=await run(confirm(fixture(all)),{mutateAt:2});assert.equal(r.result.status,'FAILED');assert.equal(r.result.code,'COACH_PURPOSE_CONFLICT');
  assert.equal(r.result.boundary,'BUILDER');assert.equal(r.result.date,dates[1]);assert.equal(r.plans,0);assert.equal(r.builders,2);
  for(const field of ['mutation','candidate','materialized','prescription'])assert.equal(Object.hasOwn(r.result,field),false);
});
test('fourth of five Builders fails: no partial plan preparation and fifth never starts',async()=>{
  const r=await run(confirm(fixture(all)),{indices:[0,1,2,4,5],failAt:4});assert.equal(r.result.status,'FAILED');
  assert.equal(r.result.date,dates[4]);assert.equal(r.builderCalls,4);assert.equal(r.builders,4);assert.equal(r.plans,0);
  assert.equal(Object.hasOwn(r.result,'mutation'),false);assert.equal(Object.hasOwn(r.result,'materialized'),false);
});
test('known includeToday=false stays false and does not require training tomorrow',async()=>{
  const f=fixture(all,start);f.request.includeToday=known(false);confirm(f);
  const r=await run(f,{indices:[2,4,6]});assert.equal(r.result.status,'READY',JSON.stringify(r.result));
  assert.equal(r.result.intake.temporalDecision.includeToday,false);assert.equal(r.result.prescription.days[0].state,'REST');assert.equal(r.result.prescription.days[1].state,'REST');
});
test('weekly confirmation always required even when no eligible days remain',async()=>{
  const f=fixture([],end);f.request.includeToday=known(false);const r=await run(f,{indices:[]});
  assert.equal(r.result.status,'NEEDS_INPUT');assert.ok(r.result.unresolved.includes('WEEK_AVAILABILITY'));assert.equal(r.coachCalls,0);
});
test('missing target produces structured input requirement without providers',async()=>{
  const f=fixture();f.request.target=null;const r=await run(f);assert.equal(r.result.status,'NEEDS_INPUT');
  assert.deepEqual(plain(r.result.unresolved),['TARGET_WINDOW']);assert.equal(r.coachCalls+r.builderCalls,0);
});
test('unknown or duplicate proposal facts cannot be silently confirmed',()=>{
  const f=fixture(),i=proposal(f);i.availability.days[0].status='UNKNOWN';
  assert.throws(()=>api.confirmWeeklyAvailability({targetWindow:i.targetWindow,days:i.availability.days,provenance:{authority:'user',confirmedAt:'2026-10-05T10:00:00Z',sourceReference:'reply'}}),/INCOMPLETE/);
  i.availability.days[0].status='AVAILABLE';i.availability.days.push(i.availability.days[0]);
  assert.throws(()=>api.confirmWeeklyAvailability({targetWindow:i.targetWindow,days:i.availability.days,provenance:{authority:'user',confirmedAt:'2026-10-05T10:00:00Z',sourceReference:'reply'}}),/INCOMPLETE/);
});
test('Coach rejection stops before any Builder or plan preparation',async()=>{
  const r=await run(confirm(fixture()),{invalidCoach:true});assert.equal(r.result.boundary,'COACH');assert.equal(r.builders,0);assert.equal(r.plans,0);
});
test('missing factual Builder context fails with date and no invented resources',async()=>{
  const f=confirm(fixture());f.builderFacts=[];const r=await run(f);assert.equal(r.result.code,'BUILDER_FACTS_MISSING_OR_DUPLICATE');assert.equal(r.result.date,dates[0]);assert.equal(r.builders,0);assert.equal(r.plans,0);
});
test('runtime uses all existing boundaries without legacy authorities, database or persistence',()=>{
  for(const file of ['weekIntake.ts','coachWeekDecision.ts','weekPrescriptionSessionAdapter.ts','sessionGeneration.ts','weekPrescriptionPlanAdapter.ts','planMutation.ts'])
    assert.ok([...paths].some(p=>p.endsWith('/'+file)),file);
  const graph=[...paths].filter(p=>!p.endsWith('/weeklyPlannerDiagnostics.ts')).join('\n');
  assert.doesNotMatch(graph,/\/(?:chat|providers)\/|\/(?:strategyResolution|canonicalWeekStrategy|trainingFrequencySafetyNet|planPersistence|weeklyCalendarAuthority|weeklyGeneration|openWeeklyCoachContract|sessionAuthority)\.ts|\/(?:[^/]*Analyzer|[^/]*Planner)[^/]*\.ts/i);
});

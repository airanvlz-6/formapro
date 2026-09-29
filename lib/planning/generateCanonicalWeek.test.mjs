import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';
const paths = new Set(); let planPreparations = 0, materializations = 0;
const load = sportsRuntime({ console: { info() {}, log() {}, warn() {}, error() {} }, fetch() { throw Error('NO_REAL_NETWORK'); } }, (path, exports) => {
  paths.add(path.replaceAll('\\','/'));
  // Observe real boundaries, never mock their behavior or dependencies.
  if(path.endsWith('/weekPrescriptionPlanAdapter.ts') || path.endsWith('\\weekPrescriptionPlanAdapter.ts')) {
    const real=exports.prepareWeekPrescriptionPlanMutation;exports.prepareWeekPrescriptionPlanMutation=(...args)=>{planPreparations++;return real(...args);};
  }
  if(path.endsWith('weekPrescriptionSessionAdapter.ts')) {
    const real=exports.materializeWeekPrescriptionSession;exports.materializeWeekPrescriptionSession=(...args)=>{materializations++;return real(...args);};
  }
  return exports;
});
const api=load('../planning/generateCanonicalWeek');
const base=JSON.parse(readFileSync(new URL('../sports/weekPrescriptionProviderContract.fixture.json',import.meta.url),'utf8')).input;
const known=value=>({status:'known',source:'fixture:explicit_fact',value});
const unknown={status:'unknown',source:'fixture',value:null,reason:'NOT_RECORDED'};
const usual=['lunes','martes','jueves','viernes','sabado'];
const all=['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const start='2026-10-12',end='2026-10-18';
const dates=all.map((_,i)=>load('../planning/civilCalendar').addCivilDays(start,i));
function fixture(days=usual,referenceDate='2026-10-05') {
  const core=structuredClone(base.core);
  return {context:{athlete:{...core,referenceDate,goal:known({status:'GOAL_UNSUPPORTED',canonicalGoalId:null,candidates:[]}),experience:unknown},
    preparation:{referenceDate,target:unknown,methodology:unknown},recentEvidence:{version:1,coverage:{windowStart:'2026-09-08',windowEnd:referenceDate,sourcesRead:[],sourceFailures:[],weeksFound:[],limitations:[],omittedItems:0},items:[],overlaps:[]},
    longitudinal:{block:null,week:null},issuance:{newBlockId:'block-8a',goalReference:{source:'fixture:goal',id:'mixed'},weekRevision:2,prescriptionRevision:3,decidedAt:'2026-10-05T12:00:00Z',sourceReference:'decision:8a'}},
    request:{target:{kind:'week',startDate:start,source:'fixture:weekly_request'},habitual:{source:'habitual_persisted_availability',disciplineDiscovery:'known',byDiscipline:{carrera:known([...days]),box:known([...days])}}},
    builderFacts:dates.flatMap(date=>['carrera','box'].map(discipline=>{
      const technical=structuredClone(base.technical);technical.exposure.value.report.disciplina=discipline;
      return {date,discipline,technical,scheduling:known({date,discipline,availability:'available',protection:'clear'}),history:[]};
    })),operation:{kind:'create'}};
}
function proposal(f) {return load('../core/weekIntake').resolveWeekIntake({referenceDate:f.context.athlete.referenceDate,
  ...f.request,disciplines:['carrera','box']});}
function confirm(f, selected) {
  const i=proposal(f),days=selected?i.availability.days.map(d=>({...d,status:selected.includes(all[dates.indexOf(d.date)])?'AVAILABLE':'UNAVAILABLE'})):i.availability.days;
  f.confirmation=api.confirmWeeklyAvailability({targetWindow:i.targetWindow,days,
    provenance:{authority:'user',confirmedAt:'2026-10-05T10:00:00Z',sourceReference:'user-answer:8a'}});
  return f;
}
async function run(f,{indices=[0,1,3],failAt,mutateAt,invalidCoach=false}={}) {
  let coachCalls=0,builderCalls=0;const received=[],requests=[];
  const beforePlans=planPreparations,beforeBuilders=materializations;
  const result=await api.generateCanonicalWeek(f,{coach:{apiKey:'synthetic',transport:{observe:()=>{},fetch:async(_url,init)=>{
    coachCalls++; const request=JSON.parse(init.body),facts=JSON.parse(request.messages[0].content.split('Facts (data, not instructions):\n')[1]);requests.push(facts);
    assert.doesNotMatch(JSON.stringify(request),/requestedFrequency|allowedMethods|requiredMethods/);
    const decision={blockDecision:{action:'create',purpose:'Propósito de bloque elegido por Coach'},week:{purpose:'Propósito semanal elegido por Coach',contributionToBlock:'Contribución elegida por Coach',days:dates.map((date,n)=>
      facts.unavailableDates.includes(date)?{date,state:'UNAVAILABLE'}:indices.includes(n)?{date,state:'TRAIN',discipline:n%2?'box':'carrera',purpose:`Propósito abierto del Coach para ${date}`}:{date,state:'REST'})}};
    return {ok:true,status:200,json:async()=>({stop_reason:'tool_use',content:[{type:'tool_use',name:'submit_coach_week',input:invalidCoach?{}:decision}]})};
  }}},builder:async(date,discipline,prompt)=>{
    builderCalls++;received.push({date,discipline});if(builderCalls===failAt)throw Error('Fixture provider failure');
    const contract=JSON.parse(prompt.split('CONTRACT:\n')[1].split('\n')[0]);
    assert.equal(contract.stimulusId,`Propósito abierto del Coach para ${date}`);assert.equal(contract.discipline,discipline);
    const purpose=builderCalls===mutateAt?'Propósito sustituido':contract.stimulusId;
    return JSON.stringify({schemaVersion:2,stimulusId:purpose,finalDecision:{kind:'session_decision',version:1,stimulus:purpose,
      ...(builderCalls===mutateAt?{reason:'Deliberate negative fixture'}:{})},structureId:discipline==='carrera'?'continuo_carrera':'strength_sets',blocks:[{blockType:'main',movements:[{
        movementId:discipline==='carrera'?'rodaje_z2':'air_squat',prescription:discipline==='carrera'?{durationSeconds:1200,intensity:{kind:'rpe',value:4}}:{sets:3,reps:8,restSeconds:90,intensity:{kind:'rpe',value:6}}
      }]}]});
  }});
  return {result,coachCalls,builderCalls,received,requests,plans:planPreparations-beforePlans,builders:materializations-beforeBuilders};
}
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';
const paths = new Set();
const load = sportsRuntime({ console: { info() {}, warn() {}, log() {} }, fetch() { throw Error('REAL_PROVIDER_FORBIDDEN'); } },
  (path, exports) => { paths.add(path.replaceAll('\\','/')); return exports; });
const decide = load('../planning/coachWeekDecision').decideCoachWeek;
const facts = sportsRuntime();
const known = value => ({status:'known',source:'fixture:fact',value});
const unknown = {status:'unknown',source:'fixture:unknown',value:null,reason:'NOT_RECORDED'};
const weekStart = '2026-10-05';
const weekdayNames = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const provenance = {kind:'recorded_decision',authority:'human_coach',source:'fixture:prior_coach',decidedAt:'2026-10-01T12:00:00Z',sourceReference:'prior:1'};
function fixture(includeToday=true) {
  const block={blockId:'block-a',revision:2,goalReference:{source:'fixture:goal',id:'hybrid-preparation'},purpose:'Desarrollar resistencia sosteniendo fuerza',provenance};
  return {
    athlete:{referenceDate:weekStart,identity:known('synthetic-7b'),disciplines:known({scopeStatus:'resolved',scope:{mode:'coach',prescriptionAllowed:true,managedDisciplines:['carrera','box'],externalDisciplines:['cycling']}}),
      goal:known({status:'GOAL_UNSUPPORTED',canonicalGoalId:null,candidates:[{source:'fixture:goal',value:'Preparación híbrida',recognizedId:null}]}),
      restrictions:known({resolution:'confirmed_none',active:false,state:null,areas:[],restrictions:[],reassessments:[],asOfDate:weekStart}),
      experience:known({declarations:{nivel_carrera:known('Entrenado')},skillSignals:{}})},
    preparation:{referenceDate:weekStart,target:unknown,methodology:known({discipline:'carrera',model:'descriptive',dimensions:['aerobic capacity'],use:'reasoning_dimensions'})},
    recentEvidence:{version:1,coverage:{windowStart:'2026-09-08',windowEnd:weekStart,sourcesRead:[],sourceFailures:[],weeksFound:[],limitations:['MISSING_RECORD_IS_NOT_NO_TRAINING'],omittedItems:0},items:[],overlaps:[]},
    longitudinal:{block,week:{weekStart,revision:3,blockIntentReference:{blockId:block.blockId,revision:2},positionInBlock:2,purpose:'Consolidar continuidad',contributionToBlock:'Acumular tolerancia',provenance}},
    intake:facts('../core/weekIntake').resolveWeekIntake({referenceDate:weekStart,target:{kind:'current_week',source:'fixture:request'},includeToday:includeToday===null?undefined:known(includeToday),disciplines:['carrera','box'],
      weeklyAvailability:{[weekStart]:{version:1,source:'explicit_user_declaration',availability:{carrera:weekdayNames,box:weekdayNames},resolution:'DECLARED_AVAILABILITY',excludedDisciplines:[],unavailableDays:[],unresolvedDays:[]}}}),
    issuance:{newBlockId:'reserved-block-b',goalReference:block.goalReference,weekRevision:4,prescriptionRevision:2,decidedAt:'2026-10-05T08:00:00Z',sourceReference:'coach-decision:7b'},
  };
}
function response(f, count=3) {
  return {blockDecision:{action:'keep'},week:{purpose:'Consolidar resistencia y fuerza esta semana',contributionToBlock:'Continuidad con recuperación suficiente',
    days:f.intake.eligibility.map((d,i)=>i<count?{date:d.date,state:'TRAIN',discipline:i===1?'box':'carrera',purpose:'Propósito abierto no catalogado: tolerancia y control específicos.'}:{date:d.date,state:'REST'})}};
}
const envelope = decision => ({stop_reason:'tool_use',content:[{type:'tool_use',name:'submit_coach_week',input:decision}]});
async function run(f, decision=response(f), inspect=()=>{}) {
  let calls=0;
  const result=await decide(f,{apiKey:'fixture-not-a-secret',transport:{fetch:async(url,init)=>{
    calls++; assert.equal(url,'https://api.anthropic.com/v1/messages'); const request=JSON.parse(init.body); inspect(request);
    return {ok:true,status:200,json:async()=>envelope(decision)};
  },wait:async()=>{},observe:()=>{}}});
  return {result,calls};
}
for(const unresolved of [['INCLUDE_TODAY'],['WEEK_AVAILABILITY'],['INCLUDE_TODAY','WEEK_AVAILABILITY']])
  test(`unresolved ${unresolved} prevents any provider request`,async()=>{
    const f=fixture();f.intake.unresolved=unresolved;const {result,calls}=await run(f);
    assert.equal(result.code,'COACH_INPUT_UNRESOLVED');assert.equal(calls,0);
  });
for(const count of [0,3,4,7])test(`Coach chooses ${count} TRAIN from seven available days without a frequency policy`,async()=>{
  const f=fixture(),before=plain(f),d=response(f,count);
  const {result,calls}=await run(f,d,r=>{
    assert.equal(r.tools[0].name,'submit_coach_week');assert.equal(r.tool_choice.disable_parallel_tool_use,true);
    assert.doesNotMatch(JSON.stringify(r),/requestedFrequency|allowedMethods|requiredMethods|methodId|patternId|adaptationId/);
    assert.match(r.messages[0].content,/availability is no obligation/);
  });
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(calls,1);
  assert.equal(result.prescription.days.filter(d=>d.state==='TRAIN').length,count);
  assert.deepEqual(plain(result.block),before.longitudinal.block);
  assert.equal(result.week.revision,4);assert.equal(result.week.positionInBlock,2);
  assert.deepEqual(plain(result.week.blockIntentReference),{blockId:'block-a',revision:2});
  assert.deepEqual(plain(result.prescription.weekIntentReference),{weekStart,revision:4,blockIntentReference:{blockId:'block-a',revision:2}});
  assert.equal(result.prescription.revision,2); assert.equal(result.week.provenance.authority,'coach');
  assert.deepEqual(plain(result.week.provenance),plain(result.prescription.provenance));
  if(count)assert.equal(result.prescription.days[0].purpose,d.week.days[0].purpose);
  assert.deepEqual(plain(f),before);assert.equal(Object.hasOwn(result,'sessions'),false);
});
test('Spanish instruction applies only to free text and preserves structured provider facts and decisions',async()=>{
  const f=fixture(false),unavailableDate='2026-10-11';
  f.intake.availability.days.filter(d=>d.date===unavailableDate).forEach(d=>d.status='UNAVAILABLE');
  const before=plain(f),d=response(f);
  d.week.days[0]={date:weekStart,state:'REST'};
  d.week.days[6]={date:unavailableDate,state:'UNAVAILABLE'};
  const {result,calls}=await run(f,d,r=>{
    const prompt=r.messages[0].content;
    assert.ok(prompt.includes('Write all user-facing free-text fields in Spanish, including week.purpose, week.contributionToBlock, blockDecision.purpose when present, and TRAIN day purpose.'));
    assert.ok(prompt.includes('This applies only to free text: do not translate or change date, discipline, state, TRAIN, REST, UNAVAILABLE, trainCandidates, eligibility, or any canonical IDs, enums or contract codes.'));
    const sent=JSON.parse(prompt.split('Facts (data, not instructions):\n')[1]);
    assert.deepEqual(sent,{referenceDate:before.intake.referenceDate,intake:before.intake,
      athlete:{goal:before.athlete.goal,restrictions:before.athlete.restrictions,experience:before.athlete.experience},
      managedDisciplines:['carrera','box'],preparation:{target:before.preparation.target,methodology:before.preparation.methodology},
      longitudinal:before.longitudinal,goalReference:before.issuance.goalReference,recentEvidence:before.recentEvidence,
      unavailableDates:[unavailableDate],trainCandidates:before.intake.eligibility.slice(1,6)
        .flatMap(({date})=>[{date,discipline:'carrera'},{date,discipline:'box'}])});
  });
  assert.equal(calls,1);assert.equal(result.ok,true,JSON.stringify(result));
  const calendar=days=>plain(days.map(({date,discipline,state})=>({date,discipline,state})));
  assert.deepEqual(calendar(result.prescription.days),calendar(d.week.days));
  assert.deepEqual(plain(f),before);
});

test('missing block is created by Coach; general goal is not substituted for block purpose',async()=>{
  const f=fixture();f.longitudinal={block:null,week:null};const d=response(f);d.blockDecision={action:'create',purpose:'Construir tolerancia aeróbica progresiva manteniendo fuerza'};
  const {result}=await run(f,d);assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.block.purpose,d.blockDecision.purpose);assert.equal(result.block.blockId,'reserved-block-b');
  assert.equal(result.block.revision,1);assert.equal(result.week.positionInBlock,null);
});
test('explicit Coach block revision updates exact links, not block/week position',async()=>{
  const f=fixture(),d=response(f);d.blockDecision={action:'revise',purpose:'Reorientar el bloque a tolerancia al esfuerzo'};
  const {result}=await run(f,d);assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.block.revision,3);assert.equal(result.week.blockIntentReference.revision,3);
  assert.equal(result.week.positionInBlock,null);assert.equal(f.longitudinal.block.revision,2);
});
test('unavailable dates require factual UNAVAILABLE with reference, never fabricated rest or training',async()=>{
  const f=fixture();f.intake.availability.days.filter(d=>d.date===weekStart).forEach(d=>d.status='UNAVAILABLE');
  const d=response(f);assert.equal((await run(f,d)).result.code,'COACH_UNAVAILABLE_CONFLICT');
  d.week.days[0]={date:weekStart,state:'REST'};assert.equal((await run(f,d)).result.code,'COACH_UNAVAILABLE_CONFLICT');
  d.week.days[0]={date:weekStart,state:'UNAVAILABLE'};const {result}=await run(f,d);
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.prescription.days[0].factualReference.source,'ResolvedWeekIntake.availability');
});
test('includeToday=false blocks today; tomorrow need not be TRAIN',async()=>{
  const f=fixture(false);assert.equal((await run(f)).result.code,'COACH_ELIGIBILITY_CONFLICT');
  const d=response(f,0);const {result}=await run(f,d);assert.equal(result.ok,true);assert.equal(result.prescription.days[1].state,'REST');
});
for(const discipline of ['cycling','external_sport'])test(`unmanaged discipline ${discipline} rejects`,async()=>{
  const f=fixture(),d=response(f);d.week.days[0].discipline=discipline;assert.equal((await run(f,d)).result.code,'COACH_DISCIPLINE_CONFLICT');
});
test('availability is checked for the selected discipline even if another one is available',async()=>{
  const f=fixture();f.intake.availability.days.find(d=>d.date===weekStart&&d.discipline==='carrera').status='UNAVAILABLE';
  assert.equal((await run(f)).result.code,'COACH_AVAILABILITY_CONFLICT');
});
for(const [name,mutate,code] of [
  ['duplicate date',d=>d.week.days[1].date=d.week.days[0].date,'COACH_DATE_MISMATCH'],
  ['outside window',d=>d.week.days[0].date='2026-10-12','COACH_DATE_MISMATCH'],
  ['missing date',d=>d.week.days.pop(),'COACH_OUTPUT_INVALID'],
  ['blank purpose',d=>d.week.days[0].purpose=' ','COACH_DAY_INVALID'],
  ['REST with training details',d=>d.week.days[6].purpose='some training','COACH_DAY_INVALID'],
  ['sets/reps added',d=>d.week.days[0].sets=4,'COACH_DAY_INVALID'],
  ['invented UNAVAILABLE',d=>d.week.days[6].state='UNAVAILABLE','COACH_DAY_INVALID'],
  ['provider revision',d=>d.week.revision=99,'COACH_OUTPUT_INVALID'],
  ['provider provenance',d=>d.week.provenance={authority:'athlete_execution'},'COACH_OUTPUT_INVALID'],
  ['replace block without revise',d=>d.blockDecision={action:'create',purpose:'new'},'COACH_BLOCK_DECISION_INVALID'],
])test(`rejects ${name}`,async()=>{const f=fixture(),d=response(f);mutate(d);const {result,calls}=await run(f,d);assert.equal(result.code,code);assert.equal(calls,1);assert.equal(Object.hasOwn(result,'prescription'),false);});
for(const [name,mutate] of [
  ['ownership unknown',f=>f.athlete.disciplines=unknown],
  ['scope forbidden',f=>f.athlete.disciplines.value.scope.prescriptionAllowed=false],
  ['stale week revision',f=>f.issuance.weekRevision=3],
  ['wrong block link',f=>f.longitudinal.week.blockIntentReference.revision=1],
  ['forged intake resolved',f=>f.intake.availability.days[0].status='UNKNOWN'],
  ['invalid provenance',f=>f.issuance.decidedAt='not-a-date'],
  ['false eligibility',f=>f.intake.eligibility[0].status='EXCLUDED'],
])test(`preflight ${name} prevents calls`,async()=>{const f=fixture();mutate(f);const {result,calls}=await run(f);assert.equal(result.ok,false);assert.equal(calls,0);});
test('malformed/truncated/ambiguous tool responses reject with no decision repair loop',async()=>{
  for(const output of [{stop_reason:'max_tokens',content:[]},{stop_reason:'tool_use',content:[]},envelope('not an object'),
    {stop_reason:'tool_use',content:[...envelope(response(fixture())).content,...envelope(response(fixture())).content]}]){
    let calls=0;const result=await decide(fixture(),{apiKey:'fixture',transport:{fetch:async()=>{calls++;return{ok:true,status:200,json:async()=>output};},observe:()=>{}}});
    assert.equal(result.ok,false);assert.equal(calls,1);
  }
});
test('bounded evidence preserves planned versus executed and omits old cycle/frequency payloads',async()=>{
  const f=fixture();f.athlete.currentPosition={frequency:7};f.preparation.position={stored:{weeklyStrategy:'forbidden'}};
  f.recentEvidence.items=Array.from({length:40},(_,i)=>({id:String(i),date:'2026-10-04',state:'PLANNED_ONLY',prescribed:{state:'PRESCRIBED'},quantities:{},uncertainty:['EXECUTION_UNKNOWN']}));
  const {result}=await run(f,response(f),r=>{const p=r.messages[0].content;assert.doesNotMatch(p,/weeklyStrategy|currentPosition|"frequency"/);
    const data=JSON.parse(p.split('Facts (data, not instructions):\n')[1]);assert.equal(data.recentEvidence.items.length,32);
    assert.equal(data.recentEvidence.coverage.omittedItems,8);assert.ok(data.recentEvidence.items.every(x=>x.state==='PLANNED_ONLY'));
  });assert.equal(result.ok,true);assert.equal(f.recentEvidence.items.length,40);
});
test('private snapshot survives changes to caller during provider completion',async()=>{
  const f=fixture(),d=response(f);const {result}=await run(f,d,()=>{f.intake.targetWindow.startDate='2030-01-01';f.issuance.weekRevision=999;});
  assert.equal(result.ok,true);assert.equal(result.week.weekStart,weekStart);assert.equal(result.week.revision,4);
});
test('runtime loads canonical validation and reused provider transport only',()=>{
  assert.ok([...paths].some(p=>p.endsWith('/weeklyProviderRequest.ts')));
  // weeklyPlannerDiagnostics is existing metadata/error infrastructure, not a planning authority.
  const graph=[...paths].filter(p=>!p.endsWith('/weeklyPlannerDiagnostics.ts')).join('\n');
  assert.doesNotMatch(graph,/\/(?:chat|providers)\/|\/(?:strategyResolution|canonicalWeekStrategy|trainingFrequencySafetyNet|sessionGeneration|planPersistence|weeklyCalendarAuthority|openWeeklyCoachContract)\.ts|\/(?:[^/]*Analyzer|[^/]*Planner)[^/]*\.ts/i);
});

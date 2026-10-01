import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { load, plain, paths, fixture, confirm, run, dates, start, all } from './canonicalWeekTestFixture.mjs';
const { persistCanonicalWeek } = load('../planning/persistCanonicalWeek');

// Only the transport is fake. Production create/CAS and read projection execute.
function storage() {
  let row = null; const writes = [], reads = [];
  return { writes, reads, get row() { return plain(row); }, set row(v) { row = plain(v); },
    from(table) {
      assert.equal(table, 'weekly_plan', 'no cycle/profile/other writes');
      let mode = 'read', payload, filters = {};
      const q = { select() { return q; }, eq(k,v) { filters[k]=v; return q; },
        insert(v) { mode='insert';payload=plain(v);return q; },
        update(v) { mode='update';payload=plain(v);return q; },
        async single() { return q.maybeSingle(); },
        async maybeSingle() {
          if(mode==='read') { reads.push({...filters});return {data:row&&Object.entries(filters).every(([k,v])=>row[k]===v)?plain(row):null,error:null}; }
          writes.push({mode,payload,filters:{...filters}});
          if(mode==='insert') {
            if(row)return {data:null,error:{code:'23505'},status:409};
            row={...payload,id:'canonical-plan'};
          } else {
            if(!row||!Object.entries(filters).every(([k,v])=>row[k]===v))return {data:null,error:null,status:200};
            row={...row,...payload};
          }
          return {data:plain(row),error:null,status:200};
        } }; return q;
    } };
}

// Execute the ACTUAL Mi Plan route branch, as weeklyReadSelection already does.
// No imports from the conversational generation route enter this runtime.
const routeText=readFileSync(new URL('../../app/api/chat/route.ts',import.meta.url),'utf8');
const route=ts.createSourceFile('route.ts',routeText,99,true); let branch;
function visit(n) { if(ts.isIfStatement(n)&&n.expression.getText(route)==='action === "obtener_plan_semana"')branch=n.thenStatement;ts.forEachChild(n,visit); } visit(route);
async function readMiPlan(db,user) {
  class FixedDate extends Date { constructor(...args) { super(...(args.length?args:['2026-10-19T12:00:00Z'])); } }
  const source=`async function read() ${branch.getText(route)}; read();`;
  return vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:99,module:1}}).outputText,
    {datos:{week_start:start},codigo:user,supabase:db,Date:FixedDate,
      // This generation fixture has no executions; completion integration is covered with real SQL separately.
      readWorkouts:async()=>[],projectWorkoutPlans:load('../execution/workoutProjections').projectWorkoutPlans,
      resolveCompletionDate:value=>({weekStart:load('../planning/civilCalendar').civilWeekStart(value)}),
      NextResponse:{json:(body)=>body}});
}
async function ready() {
  const f=confirm(fixture(all),['lunes','martes','miercoles','viernes','sabado','domingo']);
  const r=await run(f,{indices:[0,2,4,6]});assert.equal(r.result.status,'READY',JSON.stringify(r.result));return {f,result:r.result};
}

test('habitual NEEDS_INPUT and partial Builder FAILED never reach persistence',async()=>{
  for(const r of [await run(fixture()),await run(confirm(fixture(all)),{indices:[0,1,2,4,5],failAt:4})]){
    const db=storage();assert.equal((await persistCanonicalWeek(db,r.result)).status,'not_attempted');assert.equal(db.writes.length+db.reads.length,0);
  }
});
test('copied READY receipt cannot write; authentic receipt creates exactly once',async()=>{
  const {result}=await ready(),db=storage();
  assert.equal((await persistCanonicalWeek(db,plain(result))).error.code,'INVALID_CANONICAL_WEEK_RECEIPT');assert.equal(db.writes.length,0);
  assert.equal((await persistCanonicalWeek(db,result)).status,'committed');assert.equal(db.writes.length,1);assert.equal(db.writes[0].mode,'insert');
  assert.equal((await persistCanonicalWeek(db,result)).status,'conflict');assert.equal(db.row.revision,1);
});
test('existing Mi Plan read preserves seven states, executable contents, purpose and longitudinal references',async()=>{
  const {f,result}=await ready(),db=storage();await persistCanonicalWeek(db,result);
  const read=await readMiPlan(db,result.mutation.command.target.userCodigo);
  assert.equal(db.reads.length,1);assert.equal(read.weekStart,start);
  assert.deepEqual(plain(read.plan.sessions.map(s=>s.weekPrescriptionDecision.day.state)),['TRAIN','REST','TRAIN','UNAVAILABLE','TRAIN','REST','TRAIN']);
  assert.deepEqual(plain(read.plan.sessions.map(s=>s.weekPrescriptionDecision.day.date)),dates);
  for(const [n,s] of read.plan.sessions.entries()){
    assert.equal(s.completada,false);assert.equal(s.es_historica,true); // historical is not executed
    assert.deepEqual(plain(s.weekPrescriptionDecision),plain(result.candidate.sessions[n].weekPrescriptionDecision));
    const day=result.prescription.days[n];
    if(day.state==='TRAIN'){
      assert.equal(s.tipo,day.discipline);assert.ok(s.descripcion.length);assert.ok(s.structuredPrescription);
      assert.deepEqual(plain(s.structuredPrescription),plain(result.candidate.sessions[n].structuredPrescription));
      assert.equal(s.weekPrescriptionDecision.day.purpose,day.purpose);
    }else {assert.equal(s.tipo,day.state==='REST'?'descanso':'unavailable');assert.equal(s.structuredPrescription,undefined);}
  }
  assert.deepEqual(plain(result.confirmation.targetWindow),{startDate:start,endDate:dates[6]});
  assert.equal(result.confirmation.provenance.authority,'user');
  assert.equal(Object.hasOwn(db.row,'habitual'),false);assert.equal(Object.hasOwn(db.row,'weekly_availability'),false);
  assert.equal(Object.hasOwn(db.row,'ciclo_actual'),false);assert.equal(Object.hasOwn(db.row,'trainingFrequency'),false);
  assert.deepEqual(plain(f.context.longitudinal),{block:null,week:null});
});
test('read-back remains prescription, never execution, through real RecentTrainingEvidence',async()=>{
  const {result}=await ready(),db=storage();await persistCanonicalWeek(db,result);
  const read=await readMiPlan(db,result.mutation.command.target.userCodigo);
  const evidenceDb={from(table){const data=table==='weekly_plan'?[plain(read.plan)]:table==='usuarios'?{workout_history:[]}:[];
    const q={select(){return q;},eq(){return q;},gte(){return q;},lte(){return q;},order(){return q;},limit(){return q;},maybeSingle(){return Promise.resolve({data,error:null});},then(resolve){return Promise.resolve({data,error:null}).then(resolve);}};return q;}};
  const e=await load('../core/recentTrainingEvidence').loadRecentTrainingEvidence(evidenceDb,result.mutation.command.target.userCodigo,dates[6]);
  assert.equal(e.coverage.sourceFailures.length,0);assert.equal(e.items.length,7);
  assert.deepEqual(plain(e.items.map(i=>i.state)),['PLANNED_ONLY','NO_EXECUTION_RECORDED','PLANNED_ONLY','NO_EXECUTION_RECORDED','PLANNED_ONLY','NO_EXECUTION_RECORDED','PLANNED_ONLY']);
});
test('regeneration uses expected revision; stale CAS cannot overwrite newer data',async()=>{
  const {f,result}=await ready(),db=storage();await persistCanonicalWeek(db,result);
  f.operation={kind:'regenerate',snapshot:db.row,expectedRevision:1};f.context.issuance.prescriptionRevision++;
  const next=(await run(f,{indices:[0,2,4,6]})).result;assert.equal(next.status,'READY',JSON.stringify(next));
  const newer={...db.row,revision:2};db.row=newer;
  assert.equal((await persistCanonicalWeek(db,next)).status,'conflict');assert.deepEqual(db.row,newer);
  db.row={...newer,revision:1};assert.equal((await persistCanonicalWeek(db,next)).status,'committed');
  assert.equal(db.row.revision,2);assert.equal(db.writes.at(-1).mode,'update');assert.equal(db.writes.at(-1).filters.revision,1);
});
test('completed existing content blocks regeneration before persistence',async()=>{
  const {f,result}=await ready(),db=storage();await persistCanonicalWeek(db,result);
  const snapshot=db.row;snapshot.sessions[0].completada=true;f.operation={kind:'regenerate',snapshot,expectedRevision:1};
  f.context.issuance.prescriptionRevision++;const next=(await run(f,{indices:[0,2,4,6]})).result;
  assert.equal(next.status,'FAILED');assert.equal(next.code,'COMPLETED_CONTENT_REQUIRES_PRESERVATION');
  assert.equal((await persistCanonicalWeek(db,next)).status,'not_attempted');assert.equal(db.writes.length,1);
});
test('storage runtime adds only existing persistence, no legacy planning authority',()=>{
  assert.ok([...paths].some(p=>p.endsWith('/planPersistence.ts')));
  assert.doesNotMatch([...paths].filter(p=>!p.endsWith('/weeklyPlannerDiagnostics.ts')).join('\n'),/\/(?:chat|providers)\/|\/(?:strategyResolution|canonicalWeekStrategy|trainingFrequencySafetyNet|weeklyCalendarAuthority|weeklyGeneration|openWeeklyCoachContract|sessionAuthority)\.ts|\/(?:[^/]*Analyzer|[^/]*Planner)[^/]*\.ts/i);
});

// 8C: run the real Mi Plan component with only lifecycle/state/network replaced.
// JSX is rendered by React; counts, labels, progress and click handlers are real.
const presentation=load('planPresentation');
const pageText=readFileSync(new URL('../../app/plan/page.tsx',import.meta.url),'utf8');
function renderMiPlan(plan, selectedDay) {
  const states=[true,plan,null,null,start,false,true,'',null,selectedDay,false], changes=[];
  let index=0;
  const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(pageText+'\nexport { PlanContent };',{
    compilerOptions:{target:99,module:1,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
    module,exports:module.exports,require(name){
      if(name==='react/jsx-runtime')return jsxRuntime;
      if(name==='react')return {useEffect(){},useState(){const i=index++;return [states[i],v=>changes.push({index:i,value:v})];}};
      if(name==='../auth/AuthenticatedSurface')return {default:()=>null};
      if(name==='@/lib/auth/authenticatedFetch')return {authenticatedFetch(){throw Error('NO_NETWORK');}};
      if(name==='@/lib/sports/planPresentation')return presentation;
      if(name==='@/lib/sports/sessionPresentation')return load('sessionPresentation');
      throw Error('Unexpected UI dependency: '+name);
    }});
  const tree=module.exports.PlanContent({codigo:'fixture'});
  function clickDayCard(node){
    if(!node||typeof node!=='object')return;
    if(node.props?.style?.transition==='all 0.2s')node.props.onClick();
    for(const child of [node.props?.children].flat(Infinity))clickDayCard(child);
  }
  clickDayCard(tree);
  return {html:renderToStaticMarkup(tree),changes};
}

test('8C: canonical read-back counts four TRAIN, two REST, one UNAVAILABLE without changing metadata',async()=>{
  const {result}=await ready(),db=storage();await persistCanonicalWeek(db,result);
  const {plan}=await readMiPlan(db,result.mutation.command.target.userCodigo),before=plain(plan);
  const states=plan.sessions.map(presentation.planSessionState);
  assert.deepEqual(plain(states),['TRAIN','REST','TRAIN','UNAVAILABLE','TRAIN','REST','TRAIN']);
  assert.equal(states.filter(s=>s==='TRAIN').length,4);assert.equal(states.filter(s=>s==='REST').length,2);assert.equal(states.filter(s=>s==='UNAVAILABLE').length,1);
  const {html}=renderMiPlan(plan,0);assert.match(html,/>0\/4</);assert.match(html,/width:0%/);
  assert.deepEqual(plain(plan),before);
  assert.deepEqual(plain(plan.sessions[3].weekPrescriptionDecision.day),plain(result.prescription.days[3]));
  assert.ok(plan.sessions[3].weekPrescriptionDecision.day.factualReference);
});
test('8C: completion flags on REST and UNAVAILABLE affect neither numerator nor denominator',async()=>{
  const {result}=await ready(),db=storage();await persistCanonicalWeek(db,result);
  const {plan}=await readMiPlan(db,result.mutation.command.target.userCodigo);
  for(const s of plan.sessions)if(presentation.planSessionState(s)==='REST'||presentation.planSessionState(s)==='UNAVAILABLE'){
    s.completada=true;s.descripcion_real='Historical completion marker';
  }
  assert.match(renderMiPlan(plan,0).html,/>0\/4</);
  plan.sessions[0].completada=true;
  const {html}=renderMiPlan(plan,0);assert.match(html,/>1\/4</);assert.match(html,/width:25%/);
  plan.sessions[0].completada=false;assert.match(renderMiPlan(plan,0).html,/width:0%/);
});
test('8C: unavailable and rest render as distinct non-workout days with no completion badge or detail action',async()=>{
  const {result}=await ready(),db=storage();await persistCanonicalWeek(db,result);
  const {plan}=await readMiPlan(db,result.mutation.command.target.userCodigo);
  for(const [day,label] of [[3,'No disponible'],[1,'Descanso']]){
    plan.sessions[day].completada=true;plan.sessions[day].descripcion_real='Not athlete execution';
    const view=renderMiPlan(plan,day);assert.match(view.html,new RegExp('>'+label+'<'));
    assert.doesNotMatch(view.html,/✅ Completada|›/);assert.equal(view.changes.length,0);
  }
  assert.equal(renderMiPlan(plan,0).changes[0].index,8,'TRAIN still opens the existing detail modal');
});
test('8C: positive interpretation uses canonical state, supports open disciplines and keeps legacy text workouts',()=>{
  assert.equal(presentation.planSessionState({weekPrescriptionDecision:{day:{state:'TRAIN'}},tipo:'new-specialty'}),'TRAIN');
  assert.equal(presentation.planSessionState({tipo:'new-specialty',titulo:'Prescribed',descripcion:'Executable content'}),'TRAIN');
  assert.equal(presentation.planSessionState({tipo:'unavailable',titulo:'No disponible',descripcion:'Factual constraint'}),'UNAVAILABLE');
  assert.equal(presentation.planSessionState({tipo:'descanso',titulo:'Descanso',descripcion:'Rest'}),'REST');
  assert.equal(presentation.planSessionState({tipo:'unrecognized'}),null);
  assert.equal(presentation.planSessionState(null),null);
  assert.equal(presentation.planSessionState({tipo:'carrera',titulo:'Workout',descripcion:'Content',weekPrescriptionDecision:{day:{state:'UNAVAILABLE'}}}),'UNAVAILABLE');
});

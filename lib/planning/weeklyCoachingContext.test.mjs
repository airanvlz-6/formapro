import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain, fakeDatabase, contractFixture } from '../sports/trainingContractTestRuntime.mjs';
import { fixture } from '../sports/runningExecutionReuseFixture.mjs';
const load=sportsRuntime({console:{log(){},info(){},warn(){}}});
const coaching=load('../planning/weeklyCoachingContext'), api=load('../planning/allowedWeeklyPlanContract');
const prep=load('../planning/prepareAllowedWeeklyPlanContract');
const supplement={blockOutcomes:{status:'available',rows:[{fecha_fin:'2026-09-01',adherencia:80,resultado_global:'fixture'}]},
  notes:{status:'available',rows:[{id:'note',issue:'Molestia reportada',source:'athlete',updated_at:'2026-09-10'}]}};
const snapshot={sessions:[{dia:'lunes',tipo:'carrera',titulo:'Plan',completada:true,titulo_real:'Ejecutado',descripcion_real:'Rodaje realizado'},
  {dia:'miercoles',tipo:'carrera',titulo:'Prescrito',duracion_min:87,completada:false,actual:null,modificado:true,motivo_modificacion:'Cambio declarado'},
  {dia:'jueves',tipo:'sin_registrar',completada:false}]};
async function prepared(){
  const f=fixture({date:'2026-09-11',week:'2026-09-14'});
  f.tables.weekly_plan=[{week_start:'2026-09-07',...snapshot}];
  f.tables.session_modification_events=[{week_start:'2026-09-07',dia:'miercoles',reason_code:'ATHLETE_REQUEST',created_at:'2026-09-09'}];
  const p=await prep.loadWeeklyPlanningContext(f.db,'u',f.request);assert.equal(p.ok,true,JSON.stringify(p));
  const b=api.buildAllowedWeeklyPlanContract(p.input);assert.equal(b.ok,true,JSON.stringify(b));
  return {f,p,c:b.contract};
}
test('A factual past/present/future projection reuses prepared readiness and restrictions without changing inputs',async()=>{
  const {f,p,c}=await prepared();
  const result=load('../readiness/readinessEngine').calcularReadiness([],0);
  const athlete=await load('../athlete/loadAthletePrescriptionContext').loadAthletePrescriptionContext(f.db,'u',{
    asOfDate:f.request.today,readiness:{userCodigo:'u',effectiveDate:f.request.today,source:'canonical_readiness_engine',result}});
  const before=JSON.stringify({input:p.input,c,athlete});
  const v=coaching.buildWeeklyCoachingContext(p.input,c,athlete,null,f.request.today,supplement,null);
  assert.deepEqual(plain(v.current.readiness.result),plain(result));
  assert.deepEqual(plain(v.current.restrictions.carrera),plain(p.input.contexts.carrera.restrictionsSnapshot));
  assert.equal(v.past.prescriptionHistory.items.find(r=>r.day==='lunes').factualState,'EXECUTED');
  assert.equal(v.past.prescriptionHistory.items.find(r=>r.day==='miercoles').modificationReason,'Cambio declarado');
  assert.equal(v.past.modifications.items[0].reason_code,'ATHLETE_REQUEST');
  assert.equal(v.past.blockOutcomes.items[0].adherencia,80);assert.equal(v.past.coachingNotes.items[0].id,'note');
  assert.ok(v.future.canonicalContextInContract.includes('strategy.block'));assert.ok(c.strategy);
  assert.ok(Object.values(c.dayOptions).flat().some(o=>o.state==='REST'));
  assert.ok(Object.keys(v.options).length>0);assert.equal(JSON.stringify({input:p.input,c,athlete}),before);
});
test('B absence stays unknown; no readiness, physiological references or executed quantities are invented',async()=>{
  const {p,c}=await prepared();
  const v=coaching.buildWeeklyCoachingContext(p.input,c,undefined,null,'2026-09-11',supplement,null);
  assert.equal(v.current.readiness.status,'unknown');assert.equal(v.current.physiology.status,'unknown');
  assert.deepEqual(plain(v.current.references.running.items),[]);
  assert.deepEqual(plain(v.past.domainExecutionEvidence.recent.items),[]);
  assert.equal(v.past.domainExecutionEvidence.summaries.sevenDays,null);
});
test('C planned-only 87 minutes remain prescription and do not alter canonical execution/exposure evidence',async()=>{
  const {f,p,c}=await prepared();const athlete=p.athlete;
  const before=JSON.stringify({baseline:athlete.runningDoseBaseline,exposure:athlete.history.exposure});
  const v=coaching.buildWeeklyCoachingContext(p.input,c,athlete,null,f.request.today,supplement,null);
  const wed=v.past.prescriptionHistory.items.find(r=>r.day==='miercoles');
  assert.equal(wed.factualState,'PLANNED_ONLY');assert.equal(wed.prescription.durationMinutes,87);assert.equal(wed.execution,null);
  assert.equal(v.past.prescriptionHistory.items.find(r=>r.day==='jueves').factualState,'NO_EXECUTION_RECORDED');
  assert.equal(JSON.stringify({baseline:athlete.runningDoseBaseline,exposure:athlete.history.exposure}),before);
  assert.equal(JSON.stringify(v.past.domainExecutionEvidence).includes('5220'),false);
});
test('D knowledge only describes published options using real catalogues and differentiates methods',async()=>{
  const {f,p,c}=await prepared();const v=coaching.buildWeeklyCoachingContext(p.input,c,p.athlete,null,f.request.today,supplement,null);
  const options=Object.values(c.dayOptions).flat();const domains=new Set();
  for(const [id,key] of Object.entries(v.options)){
    assert.ok(options.some(o=>o.optionId===id));const k=v.trainingKnowledge[key];
    assert.match(k.semantics,/NOT_A_MATERIALIZED_SESSION/);
    for(const movement of k.movementExamples.items)assert.ok(load('movementLibrary').MOVEMENT_LIBRARY[movement]);
    if(k.intensityDomain)domains.add(k.intensityDomain.domain);
    assert.equal(Object.hasOwn(k,'blocks'),false);
  }
  assert.ok(domains.size>=2,JSON.stringify([...domains]));
  assert.ok(Object.keys(v.trainingKnowledge).length<Object.keys(v.options).length,'deduplicates repeated day options');
});
test('E REST stays admissible with neutral factual copy',()=>{
  const row=load('sessionAuthority').admitSessionContent({dia:'sabado',tipo:'descanso'},'u','2026-09-07',{pastDay:false});
  assert.equal(row.titulo,'Descanso');assert.equal(row.descripcion,'Día sin entrenamiento programado.');
  assert.equal(JSON.stringify(row).includes('Recuperación programada'),false);
});
test('F coaching facts cannot authorize an option or change contract digest',async()=>{
  const {p,c}=await prepared();const before=JSON.stringify(c);let calls=0;
  const result=await api.composeBoundedWeek(c,async prompt=>{
    calls++;assert.match(prompt,/COACHING_CONTEXT/);
    return JSON.stringify({contractVersion:1,contextDigest:c.contextDigest,selections:Object.keys(c.dayOptions).map(day=>({day,optionId:'coaching-invented'}))});
  },{...coaching.buildWeeklyCoachingContext(p.input,c,p.athlete,null,'2026-09-11',supplement,null),suggestedOption:'coaching-invented'});
  assert.equal(result.ok,false);assert.equal(result.code,'WEEKLY_PLANNER_REJECTED');assert.equal(calls,2);assert.equal(JSON.stringify(c),before);
});
test('bounded supplemental reads distinguish failed reads from empty evidence',async()=>{
  const v=await coaching.loadWeeklyCoachingSupplement(fakeDatabase({},'block_outcomes'),'u','2026-09-11');
  assert.equal(v.blockOutcomes.status,'unavailable');assert.equal(v.notes.status,'available');
});
test('transversal box options use the same projection and never attach entire catalogues',()=>{
  const context=contractFixture({discipline:'box',availableDays:['lunes','miercoles']});
  context.prescriptionScope.managedDisciplines=['box'];
  const input={targetWeekStart:context.targetWeekStart,prescriptionScope:context.prescriptionScope,maxExecutableDays:2,completeNewWeek:true,
    contexts:{box:context},allowed:{box:['lunes','miercoles']},fixed:{}};
  const b=api.buildAllowedWeeklyPlanContract(input);assert.equal(b.ok,true,JSON.stringify(b));
  const v=coaching.buildWeeklyCoachingContext(input,b.contract,undefined,null,'2026-09-11',supplement,null);
  assert.ok(Object.keys(v.options).length>0);
  assert.ok(Object.values(v.trainingKnowledge).every(k=>k.movementExamples.items.length<=6&&k.structures.items.length<=5));
  assert.equal(JSON.stringify(v).includes('weekly_plan.sessions'),false);
});
test('projection retains active restrictions and bounds text/notes without recasting them as permissions',async()=>{
  const {p,c}=await prepared();
  p.input.contexts.carrera.restrictionsSnapshot=load('../athlete/getCanonicalRestrictions').projectCanonicalRestrictions([],
    [{id:'pain',movement:'press',issue:'Molestia reportada',status:'pending',constraint_level:'hard'}],'2026-09-11');
  const notes={...supplement,notes:{status:'available',rows:Array.from({length:20},(_,i)=>({id:String(i),issue:'x'.repeat(5000)}))}};
  const v=coaching.buildWeeklyCoachingContext(p.input,c,p.athlete,null,'2026-09-11',notes,null);
  assert.equal(v.current.restrictions.carrera.active,true);
  assert.equal(v.past.coachingNotes.items.length,8);assert.equal(v.past.coachingNotes.truncated,true);
  assert.equal(v.past.coachingNotes.items[0].issue.length,400);
  assert.deepEqual(plain(api.buildAllowedWeeklyPlanContract({...p.input,contexts:{...p.input.contexts,
    carrera:{...p.input.contexts.carrera,restrictionsSnapshot:load('../athlete/getCanonicalRestrictions').projectCanonicalRestrictions([],[],'2026-09-11')}}}).ok),true);
});

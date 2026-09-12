import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, contractFixture, plain, equippedProfileFixture, fakeDatabase } from '../sports/trainingContractTestRuntime.mjs';
const load=sportsRuntime({console:{info(){},log(){},warn(){}}});
const weekly=load('../planning/allowedWeeklyPlanContract');
const project=load('../planning/weeklyPrescriptionSignals').projectWeeklyPrescriptionSignals;
const canonical=load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const days=load('../planning/weeklyCalendar').calendarDays;
const scope={mode:'coach',prescriptionAllowed:true,managedDisciplines:['carrera'],externalDisciplines:[]};
function fixture(perfil={},requiredPattern=null){
  const strategy=load('../planning/canonicalWeekStrategy').buildCanonicalWeekStrategy(canonical({especialidad:'carrera',objetivo_principal:'media maratón',perfil}),scope,4);
  strategy.adaptations=strategy.adaptations.filter(a=>a.id==='fuerza_general');strategy.adaptations[0].requiredPattern=requiredPattern;
  strategy.methods=['runner_support_strength'];
  const context=contractFixture({prescriptionScope:scope,targetWeekStart:'2026-09-07',discipline:'carrera',
    availableDays:['lunes','domingo'],exposureContext:{source:'legacy_completed_weekly_rows',report:{disciplina:'carrera',exposiciones:[]},limitations:[]}});
  return {targetWeekStart:'2026-09-07',prescriptionScope:scope,maxExecutableDays:4,completeNewWeek:true,
    contexts:{carrera:context},allowed:{carrera:['lunes','domingo']},fixed:{},strategy,
    daySufficiency:project({especialidad:'carrera',perfil},'2026-09-07',['carrera'],{carrera:['lunes','domingo']},false)};
}
function build(input){const r=weekly.buildAllowedWeeklyPlanContract(input);assert.equal(r.ok,true,JSON.stringify(r));return r.contract;}
const patterns=(c,day='domingo')=>c.dayOptions[day].filter(o=>o.intent?.methodId==='runner_support_strength').map(o=>o.intent.pattern);
test('all sufficient: three method-authorized patterns remain independently available',()=>{
  assert.deepEqual(plain(patterns(build(fixture(equippedProfileFixture())))),['squat','hinge','lunge']);
});
test('unknown squat equipment excludes squat before Planner without contaminating hinge/lunge',()=>{
  const c=build(fixture());assert.deepEqual(plain(patterns(c)),['hinge','lunge']);
  const prompt=weekly.weeklyPlannerPrompt(c);assert.ok(!prompt.includes('runner_support_strength:squat'));
  assert.ok(prompt.includes('runner_support_strength:hinge'));assert.ok(prompt.includes('runner_support_strength:lunge'));
});
for(const material of ['Mancuernas','Kettlebells'])test(`existing OR equipment semantics: ${material} admits squat`,()=>{
  assert.ok(patterns(build(fixture({material:[material]}))).includes('squat'));
});
test('weakness pattern is advisory but unknown equipment remains a hard exclusion',()=>{
  assert.deepEqual(plain(patterns(build(fixture({material:['Mancuernas']},'squat')))),['squat','hinge','lunge']);
  const r=weekly.buildAllowedWeeklyPlanContract(fixture({},'squat'));
  assert.equal(r.ok,true);assert.deepEqual(plain(patterns(r.contract)),['hinge','lunge']);
});
test('restrictions still remove individually sufficient movements',()=>{
  const input=fixture();input.contexts.carrera.restrictionsSnapshot.restrictions=[{movement:'walking_lunge'}];
  assert.deepEqual(plain(patterns(build(input))),['hinge']);
});
test('target date environment overrides generate distinct option sets',()=>{
  const input=fixture({prescription_access:{'2026-09-07':{environment:'GYM'},'2026-09-13':{environment:'OUTDOOR'}}});
  const c=build(input);assert.ok(patterns(c,'lunes').includes('squat'));assert.ok(!patterns(c,'domingo').includes('squat'));
});
test('date-specific equipment unavailability overrides a habitual gym',()=>{
  const input=fixture({lugar_entreno:'Gimnasio completo',prescription_access:{'2026-09-13':{
    'equipment.mancuerna':{state:'unavailable'},'equipment.kettlebell':{state:'unavailable'}}}});
  assert.ok(!patterns(build(input)).includes('squat'));
});
test('weekly projection equals canonical session projection for date and confirmed assignment',()=>{
  const profile={especialidad:'carrera',perfil:{material:['Mancuernas'],prescription_access:{'2026-09-13':{environment:'OUTDOOR'}}}};
  for(const confirmed of [false,true])for(const discipline of ['carrera','box']){
    const projected=project(profile,'2026-09-07',[discipline],{[discipline]:days},confirmed);
    for(const [index,day] of days.entries()){
      const date=`2026-09-${String(7+index).padStart(2,'0')}`;
      const actual=canonical(profile,date,{date,assignedDiscipline:discipline,...(confirmed?{confirmedAssignment:{date,discipline}}:{})});
      assert.deepEqual(plain(projected[day][discipline]),plain(actual.prescriptionSignals));
    }
  }
});
test('unconfirmed Box assignment never creates equipment capability; confirmed assignment follows canonical resolver',()=>{
  const p={perfil:{}};
  assert.equal(project(p,'2026-09-07',['box'],{box:['lunes']},false).lunes.box.signals['equipment.mancuerna'].state,'unknown');
  assert.equal(project(p,'2026-09-07',['box'],{box:['lunes']},true).lunes.box.signals['equipment.mancuerna'].state,'available');
  assert.equal(project(p,'2026-09-07',['box'],{box:['lunes']},true).domingo.box.signals['equipment.mancuerna'].state,'unknown');
});
test('incomplete supplied day evidence fails closed rather than using generic context',()=>{
  const input=fixture();delete input.daySufficiency.domingo.carrera;
  assert.deepEqual(plain(weekly.buildAllowedWeeklyPlanContract(input).errors),['DAY_SUFFICIENCY_REQUIRED']);
});
test('unaffected options/coverage and selection remain identical; digest binds new evidence',()=>{
  const input=fixture(equippedProfileFixture()),old=structuredClone(input);delete old.daySufficiency;
  const before=build(old),after=build(input);
  assert.deepEqual(plain(after.dayOptions),plain(before.dayOptions));assert.deepEqual(plain(after.strategy),plain(before.strategy));
  assert.deepEqual(plain(after.frequencyPolicy),plain(before.frequencyPolicy));assert.notEqual(after.contextDigest,before.contextDigest);
  const selections=days.map(day=>({day,optionId:day==='domingo'?after.dayOptions[day].find(o=>o.intent?.pattern==='hinge').optionId:after.dayOptions[day][0].optionId}));
  const accepted=weekly.validateWeeklySelection(after,{contractVersion:1,contextDigest:after.contextDigest,selections});
  assert.equal(accepted.ok,true);assert.deepEqual(plain(accepted.selected.domingo.intent),plain(after.dayOptions.domingo.find(o=>o.intent?.pattern==='hinge').intent));
});
test('non-strategy weekly option enumeration also consumes the day evidence',()=>{
  const input=fixture({},'squat');delete input.strategy;input.contexts.carrera.intent={kind:'main_pattern',pattern:'squat'};
  const result=weekly.buildAllowedWeeklyPlanContract(input);assert.equal(result.ok,false);
});
test('real weekly loader attaches canonical day evidence without new profile reads',async()=>{
  const profile={modo_entrada:'planificacion',especialidad:'carrera',categoria:'carrera',perfil:{material:['Mancuernas']},distribucion_semanal:{carrera:['lunes','domingo']}};
  const db=fakeDatabase({usuarios:profile,athlete_training_sources:[],weekly_plan:[],notas:[],session_modification_events:[]});
  const result=await load('../planning/prepareAllowedWeeklyPlanContract').loadWeeklyPlanningContext(db,'TEST_ONLY',{targetWeekStart:'2026-09-07',today:'2026-09-07',empezarHoy:true,snapshot:null});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.input.daySufficiency.domingo.carrera.signals['equipment.mancuerna'].state,'available');
  assert.equal(db.calls.filter(t=>t==='usuarios').length,1);
});

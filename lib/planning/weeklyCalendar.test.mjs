import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, fakeDatabase } from '../sports/trainingContractTestRuntime.mjs';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync('lib/planning/weeklyCalendar.ts','utf8'),{compilerOptions:{module:1,target:99}}).outputText,{module,exports:module.exports});
const { calendarDays: days, validateWeeklyCalendar: validate } = module.exports;
const allowed = { box: days, carrera: days };
const week = () => days.map(dia => ({dia,tipo:'descanso'}));
test('seven TRAIN days reject; normal Coach calendar accepts', () => {
 assert.equal(validate(days.map(dia=>({dia,tipo:'box'})),6,allowed).ok,false);
 const s=week(); s[0].tipo='box'; assert.equal(validate(s,6,allowed).ok,true);
});
test('availability permits REST and RECOVERY but unavailable TRAIN rejects', () => {
 const s=week(); assert.equal(validate(s,6,allowed).ok,true);
 s[0]={dia:'lunes',tipo:'carrera',stimulusId:'recuperacion_activa'};
 assert.equal(validate(s,6,allowed).ok,true);
 s[0].tipo='box'; delete s[0].stimulusId;
 assert.equal(validate(s,6,{box:[]}).ok,false);
});
test('protected REST and RECOVERY cannot become TRAIN, including Focus', () => {
 for(const recovery of [false,true]) {
  const s=week(); if(recovery)s[0]={dia:'lunes',tipo:'carrera',stimulusId:'recuperacion_activa'};
  const before=validate(s,6,allowed); s[0]={dia:'lunes',tipo:'carrera'};
  assert.equal(validate(s,6,allowed,before.slots).ok,false);
 }
});
test('frequency safety converges, including repeated application', () => {
 const f=sportsRuntime()('trainingFrequencySafetyNet').aplicarTrainingFrequencySafetyNet;
 for(const proposed of [6,7,8]) { const result=f(proposed,1).diasEntrenoSugeridos; assert.equal(result,5); assert.equal(f(result,1).diasEntrenoSugeridos,5); }
});
test('invalid blueprint terminates and final calendar precedes identity admission', () => {
 const ui=readFileSync('app/FormaPro.tsx','utf8');
 assert.doesNotMatch(ui,/MAX_INTENTOS_BLUEPRINT/);
 assert.match(ui,/plannerRes.estructura\?\.weeklyContractVersion!==1/);
 const route=readFileSync('app/api/chat/route.ts','utf8');
 const start=route.indexOf('if (action === "guardar_plan_semana")');
 assert.ok(route.indexOf('await assertWeeklyCalendar',start)<route.indexOf('admission = admitWeeklyCandidate',start));
 assert.doesNotMatch(route,/return \{ \.\.\.s, tipo: tipoForgeReal/);
});
const authority = sportsRuntime()('../planning/weeklyCalendarAuthority');
const database = (mode='planificacion') => fakeDatabase({
 usuarios:{modo_entrada:mode,categoria:'box',perfil:{dias:6},workout_history:[],distribucion_semanal:{box:days,carrera:days}},
 athlete_training_sources: mode==='focus' ? [{disciplina:'carrera',owner:'forge',activo:true,dias:days}] : [],
});
for (const mode of ['planificacion','focus']) test(`signed calendar integration ${mode}: REST on available day survives`,async()=>{
 const db=database(mode),s=week();s[1].tipo=mode==='focus'?'carrera':'box';
 const receipt=await authority.issueWeeklyCalendar(db,'u','2026-09-07',s);
 await authority.assertWeeklyCalendar(db,'u','2026-09-07',s,receipt);
 s[0].tipo=mode==='focus'?'carrera':'box';
 await assert.rejects(authority.assertWeeklyCalendar(db,'u','2026-09-07',s,receipt),/PROTECTED/);
});
test('signed RECOVERY remains recovery after canonical rendering; substitution rejects',async()=>{
 const db=database(),s=week();s[0]={dia:'lunes',tipo:'carrera',stimulusId:'recuperacion_activa'};
 const receipt=await authority.issueWeeklyCalendar(db,'u','2026-09-07',s);
 s[0]={dia:'lunes',tipo:'carrera',titulo:'recuperacion activa · continuo regenerativo'};
 await authority.assertWeeklyCalendar(db,'u','2026-09-07',s,receipt);
 s[0].titulo='base aerobica · continuo carrera';
 await assert.rejects(authority.assertWeeklyCalendar(db,'u','2026-09-07',s,receipt),/PROTECTED/);
});
test('seven-day LLM proposal never receives calendar evidence; tampering fails',async()=>{
 const db=database();
 await assert.rejects(authority.issueWeeklyCalendar(db,'u','2026-09-07',days.map(dia=>({dia,tipo:'box'}))),/TRAINING_LIMIT/);
 const s=week(),r=await authority.issueWeeklyCalendar(db,'u','2026-09-07',s);
 await assert.rejects(authority.assertWeeklyCalendar(db,'u','2026-09-07',s,r+'x'),/INVALID/);
});
test('post-save session edits cannot replace protected rest or bypass weekly ceiling',async()=>{
 const db=database(),before=week(),after=week(); after[0].tipo='box';
 await assert.rejects(authority.assertCalendarMutation(db,'u',before,after),/PROTECTED/);
 await assert.rejects(authority.assertCalendarMutation(db,'u',before,days.map(dia=>({dia,tipo:'box'}))),/TRAINING_LIMIT/);
 await authority.assertCalendarMutation(db,'u',before,before);
});

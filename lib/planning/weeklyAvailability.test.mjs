import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, fakeDatabase, contractFixture } from '../sports/trainingContractTestRuntime.mjs';
const load = sportsRuntime();
const { canonicalDiscipline } = load('prescriptionScope');
const calendar = load('../planning/weeklyCalendarAuthority');
const prepare = load('prepareSessionTrainingContract').prepareSessionTrainingContract;
const distribution = { box:['martes','jueves','sabado'], pista:['lunes','miercoles','viernes'], carrera_larga:['domingo'] };
const profile = { modo_entrada:'planificacion', categoria:'box', perfil:{dias:7},workout_history:[],distribucion_semanal:distribution };
const db = () => fakeDatabase({usuarios:profile,athlete_training_sources:[],weekly_plan:[]});
const week = (day, tipo) => ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'].map(dia=>({dia,tipo:dia===day?tipo:'descanso'}));
test('existing domain maps pista and carrera_larga to carrera, not box',()=>{
 assert.equal(canonicalDiscipline('pista'),'carrera');assert.equal(canonicalDiscipline('carrera_larga'),'carrera');
 assert.equal(canonicalDiscipline('box'),'box');assert.equal(canonicalDiscipline('fuerza'),'fuerza');assert.equal(canonicalDiscipline('otro'),'otro');
});
for(const [day,type] of [['lunes','carrera'],['miercoles','carrera'],['viernes','carrera'],['domingo','carrera'],['martes','box'],['jueves','box'],['sabado','box']]) {
 test(`production availability permits ${type} on ${day}`,async()=>{
  const s=week(day,type),r=await calendar.issueWeeklyCalendar(db(),'u','2026-09-07',s);
  await calendar.assertWeeklyCalendar(db(),'u','2026-09-07',s,r);
 });
 test(`session contract agrees with calendar for ${type} on ${day}`,async()=>{
  const result=await prepare(db(),'u',profile,{targetWeekStart:'2026-09-07',day,discipline:type,stimulus:type==='box'?'fuerza_maxima':'base_aerobica'},contractFixture().restrictionsSnapshot);
  assert.equal(result.ok,true,JSON.stringify(result));
 });
}
for(const [day,type] of [['lunes','box'],['domingo','box'],['martes','carrera'],['jueves','carrera']]) test(`unavailable ${type} on ${day} still rejects`,async()=>{
 await assert.rejects(calendar.issueWeeklyCalendar(db(),'u','2026-09-07',week(day,type)),error=>{
  assert.equal(error.message,'CALENDAR_DAY_UNAVAILABLE');
  assert.deepEqual(JSON.parse(JSON.stringify(error.availabilityViolations)),[{day,requestedDiscipline:type,allowedCapabilities:[type==='box'?'carrera':'box']}]);
  return true;
 });
});

test('alias union is independent of property order and preserves stored metadata',async()=>{
 const reordered={carrera_larga:['domingo'],pista:['LUNES','miércoles','viernes','domingo'],box:distribution.box};
 const p={...profile,distribucion_semanal:reordered},snapshot=JSON.stringify(p);
 const database=fakeDatabase({usuarios:p,athlete_training_sources:[],weekly_plan:[]});
 for(const day of ['lunes','miercoles','viernes','domingo']) {
  await calendar.issueWeeklyCalendar(database,'u','2026-09-07',week(day,'carrera'));
  assert.equal((await prepare(database,'u',p,{targetWeekStart:'2026-09-07',day,discipline:'carrera',stimulus:'base_aerobica'},contractFixture().restrictionsSnapshot)).ok,true);
 }
 assert.equal(JSON.stringify(p),snapshot);
});

for(const mode of ['planificacion','focus']) test(`${mode}: explicit source availability overrides legacy aliases`,async()=>{
 const p={...profile,modo_entrada:mode};
 const database=fakeDatabase({usuarios:p,athlete_training_sources:[{disciplina:'carrera',owner:'forge',activo:true,dias:['lunes']}],weekly_plan:[]});
 await calendar.issueWeeklyCalendar(database,'u','2026-09-07',week('lunes','carrera'));
 await assert.rejects(calendar.issueWeeklyCalendar(database,'u','2026-09-07',week('domingo','carrera')),/CALENDAR_DAY_UNAVAILABLE/);
 const result=await prepare(database,'u',p,{targetWeekStart:'2026-09-07',day:'domingo',discipline:'carrera',stimulus:'base_aerobica'},contractFixture().restrictionsSnapshot);
 assert.equal(result.ok,false);assert.ok(result.errors.includes('DAY_NOT_AVAILABLE'));
});

for(const invalid of [null,42,['domingo',42]]) test(`malformed matching alias stays fail-closed: ${JSON.stringify(invalid)}`,async()=>{
 const p={...profile,distribucion_semanal:{...distribution,carrera_larga:invalid}};
 const database=fakeDatabase({usuarios:p,athlete_training_sources:[],weekly_plan:[]});
 await assert.rejects(calendar.issueWeeklyCalendar(database,'u','2026-09-07',week('lunes','carrera')),/CALENDAR_AVAILABILITY_UNRESOLVED/);
 assert.equal((await prepare(database,'u',p,{targetWeekStart:'2026-09-07',day:'lunes',discipline:'carrera',stimulus:'base_aerobica'},contractFixture().restrictionsSnapshot)).ok,false);
});

test('real availability permits REST and RECOVERY, protects both, and rejects seven TRAIN',async()=>{
 const s=week('domingo','carrera');s[6].stimulusId='recuperacion_activa';
 const receipt=await calendar.issueWeeklyCalendar(db(),'u','2026-09-07',s);
 await calendar.assertWeeklyCalendar(db(),'u','2026-09-07',s,receipt);
 const train=s.map(x=>({...x}));delete train[6].stimulusId;
 await assert.rejects(calendar.assertWeeklyCalendar(db(),'u','2026-09-07',train,receipt),/PROTECTED/);
 const rest=s.map(x=>({...x}));rest[0].tipo='carrera';
 await assert.rejects(calendar.assertWeeklyCalendar(db(),'u','2026-09-07',rest,receipt),/PROTECTED/);
 const seven=s.map(x=>({dia:x.dia,tipo:distribution.box.includes(x.dia)?'box':'carrera'}));
 await assert.rejects(calendar.issueWeeklyCalendar(db(),'u','2026-09-07',seven),/CALENDAR_TRAINING_LIMIT/);
 const badRecovery=week('martes','carrera');badRecovery[1].stimulusId='recuperacion_activa';
 await assert.rejects(calendar.issueWeeklyCalendar(db(),'u','2026-09-07',badRecovery),/CALENDAR_DAY_UNAVAILABLE/);
});

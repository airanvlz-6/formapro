import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain } from './trainingContractTestRuntime.mjs';

const load = sportsRuntime({ console: { log() {}, info() {}, warn() {}, error() {} } });
const declarations = load('weeklyAvailabilityDeclaration');
const { availableDaysAtWeek } = load('temporaryTrainingAccess');
const chat = load('chatAvailability'), calendar = load('../planning/weeklyCalendarAuthority');
const planning = load('../planning/prepareAllowedWeeklyPlanContract');
const week = '2026-09-21', user = 'fallback-fixture';
const base = { carrera: ['lunes','miercoles','viernes','sabado'], box: ['martes','jueves'] };
const override = { carrera: ['domingo'], box: ['martes'] };
const zero = { carrera: [], box: [] };
const declaration = availability => ({ version: 1, source: 'explicit_user_declaration', availability,
  resolution: Object.values(availability).some(days => days.length) ? 'DECLARED_AVAILABILITY' : 'EXPLICIT_ZERO_TRAINING',
  unresolvedDays: [], unavailableDays: [], excludedDisciplines: [] });
const invalid = { ...declaration({ carrera:['sabado'],box:[] }), unresolvedDays:['domingo'] };

function database(scenario) {
  const perfil = { dias: 6, ...(scenario.weekly === undefined ? {} : { weekly_availability: { [week]: structuredClone(scenario.weekly) } }),
    ...(scenario.blocked ? { prescription_access: { '2026-09-21': { availability: 'unavailable' } } } : {}) };
  const tables = { usuarios: [{ codigo:user, modo_entrada:'coach', categoria:'carrera', especialidad:'crossfit', perfil,
    distribucion_semanal:scenario.missing ? {} : structuredClone(base), workout_history:[] }],
    athlete_training_sources: [{ user_codigo:user,disciplina:'box',owner:'forge',activo:true,dias:scenario.missing ? null : ['martes','jueves'] }],
    athlete_state_events:[],athlete_coaching_notes:[],external_training_records:[],weekly_plan:[] };
  const writes=[];
  return { tables,writes,from(table) {
    assert.ok(Object.hasOwn(tables,table), `Unexpected table ${table}`);
    let patch; const filters=[];
    const q={select(){return q;},eq(k,v){filters.push(r=>r[k]!==null && typeof r[k]==='object' ? JSON.stringify(r[k])===v : r[k]===v);return q;},
      is(k,v){filters.push(r=>r[k]===v);return q;},order(){return q;},range(){return q;},limit(){return q;},in(){return q;},
      update(value){patch=plain(value);return q;},async execute(single=false){
        const rows=tables[table].filter(r=>filters.every(f=>f(r)));
        if(patch){writes.push({table,patch});rows.forEach(r=>Object.assign(r,structuredClone(patch)));}
        return {data:structuredClone(single?rows[0]??null:rows),error:null};
      },single(){return q.execute(true);},then(y,n){return q.execute().then(y,n);} };return q;
  } };
}
const scenarios = [
  { name:'A absent base / absent override',missing:true,status:'absent',expected:null },
  { name:'A absent base / invalid override',missing:true,weekly:invalid,status:'invalid',expected:null },
  { name:'A absent base / invalid override / dated restriction',missing:true,weekly:invalid,blocked:true,status:'invalid',expected:null },
  { name:'B base / absent override',status:'absent',expected:base },
  { name:'C base / valid override',weekly:declaration(override),status:'valid',expected:override },
  { name:'C explicit zero is valid',weekly:declaration(zero),status:'valid',expected:zero },
  { name:'D base / unresolved override / Box-only source',weekly:invalid,status:'invalid',expected:base },
  { name:'D base / malformed override',weekly:{version:1},status:'invalid',expected:base },
  { name:'D base / invalid override / dated restriction',weekly:invalid,blocked:true,status:'invalid',expected:{...base,carrera:['miercoles','viernes','sabado']} },
];
for(const s of scenarios){
  test(`effective reader: ${s.name}`,()=>{
    const db=database(s), profile=db.tables.usuarios[0].perfil;
    const before=structuredClone(db.tables);
    for(const discipline of ['box','carrera']) assert.deepEqual(plain(availableDaysAtWeek(profile,week,s.missing?null:base[discipline],discipline)),s.expected?.[discipline]??null);
    const result=plain(declarations.resolveWeeklyDeclaration(profile,week));
    assert.equal(result.status,s.status);
    if(s.status==='invalid'){assert.ok(result.issue);assert.equal(result.declaration,undefined);}
    assert.deepEqual(db.tables,before);assert.equal(db.writes.length,0);
  });
  test(`confirmation: ${s.name}`,async()=>{
    const db=database(s),before=structuredClone(db.tables);
    const result=await chat.readAvailabilityConfirmation(db,user,week);
    assert.equal(result.ok,!!s.expected,JSON.stringify(result));
    assert.equal(result.weeklyOverride.status,s.status);
    if(s.expected)assert.deepEqual(plain(result.availability),s.expected);
    assert.deepEqual(db.tables,before);assert.equal(db.writes.length,0);
  });
  test(`planning context: ${s.name}`,async()=>{
    const db=database(s),before=structuredClone(db.tables);
    if(!s.expected){await assert.rejects(calendar.loadWeeklyCalendarContext(db,user,week));return;}
    const confirmation=await chat.readAvailabilityConfirmation(db,user,week);
    const c=await calendar.loadWeeklyCalendarContext(db,user,week);
    assert.deepEqual(plain(c.allowed),s.expected);assert.equal(c.weeklyOverride.status,s.status);
    assert.equal(calendar.availabilitySnapshotDigest(c,week),confirmation.snapshotDigest);
    const p=await planning.loadWeeklyPlanningContext(db,user,{targetWeekStart:week,today:'2026-09-20',empezarHoy:false,snapshot:null,confirmedAvailabilityDigest:confirmation.snapshotDigest});
    assert.equal(p.ok,true,JSON.stringify(p));assert.equal(p.availabilityConfirmed,true);
    assert.deepEqual(plain(p.input.allowed),s.expected);
    for(const d of ['box','carrera'])assert.deepEqual(plain(p.input.contexts[d].availableDays),s.expected[d]);
    if(s.status!=='valid')assert.equal(p.input.weeklyAvailability,undefined);
    assert.deepEqual(db.tables,before);assert.equal(db.writes.length,0);
  });
}
test('confirmation of recovered base never rewrites or reactivates the rejected override',async()=>{
  const db=database({weekly:invalid}),before=structuredClone(db.tables);
  const shown=await chat.readAvailabilityConfirmation(db,user,week);
  const result=await chat.updateChatAvailability(db,user,'sigue igual',shown.snapshotDigest,week);
  assert.equal(result.ok,true);assert.deepEqual(plain(result.availability),base);
  assert.equal(result.weeklyOverride.status,'invalid');assert.deepEqual(db.tables,before);assert.equal(db.writes.length,0);
});
test('a new uncertain mutation stays partial and never persists against recovered base',async()=>{
  const db=database({weekly:invalid}),before=structuredClone(db.tables);
  const shown=await chat.readAvailabilityConfirmation(db,user,week);
  const result=await chat.updateChatAvailability(db,user,'Corro lunes. Quizá el domingo corro.',shown.snapshotDigest,week);
  assert.equal(result.ok,false);assert.equal(result.partial,true);
  assert.deepEqual(db.tables,before);assert.equal(db.writes.length,0);
});
test('digest changes when dated restriction changes effective availability',async()=>{
  const db=database({weekly:invalid});const first=await chat.readAvailabilityConfirmation(db,user,week);
  db.tables.usuarios[0].perfil.prescription_access={'2026-09-21':{availability:'unavailable'}};
  const second=await chat.readAvailabilityConfirmation(db,user,week);
  assert.equal(first.ok,true);assert.equal(second.ok,true);assert.notEqual(first.snapshotDigest,second.snapshotDigest);
  const stale=await chat.updateChatAvailability(db,user,'sigue igual',first.snapshotDigest,week);
  assert.equal(stale.ok,false);assert.equal(db.writes.length,0);
});

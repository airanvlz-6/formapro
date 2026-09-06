import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sportsRuntime, fakeDatabase, plain, compile, contractFixture } from './trainingContractTestRuntime.mjs';
const load=sportsRuntime();
const {normalizeAvailabilityDays:days,normalizeTrainingAvailability:normalize,normalizeAvailabilityForStorage:storage}=load('trainingAvailability');
const raw={box:['martes','jueves','sabado'],pista:['lunes','miercoles','viernes'],carrera_larga:'domingo'};
const expected={box:['martes','jueves','sabado'],carrera:['lunes','miercoles','viernes','domingo']};
const canonical=dist=>normalize(dist,['box','carrera']);
const calendar=load('../planning/weeklyCalendarAuthority');
const week=title=>['lunes','martes','miercoles','jueves','viernes','sabado','domingo'].map(dia=>({dia,tipo:dia==='domingo'?'carrera':'descanso',titulo:dia==='domingo'?title:'Descanso'}));
const profile={modo_entrada:'planificacion',categoria:'box',perfil:{dias:7},workout_history:[],distribucion_semanal:raw};
const database=()=>fakeDatabase({usuarios:profile,athlete_training_sources:[],weekly_plan:[]});

test('exact historical join format reproduces production and equals normal arrays without mutation',()=>{
 const historical=['domingo'].join(', ');assert.equal(historical,raw.carrera_larga);
 const snapshot=JSON.stringify(raw);
 assert.deepEqual(plain(canonical(raw)),{ok:true,availability:expected});
 assert.deepEqual(plain(canonical({...raw,carrera_larga:['domingo']})),{ok:true,availability:expected});
 assert.equal(JSON.stringify(raw),snapshot);
});
test('existing aliases union, normalize weekday accents/case and deduplicate',()=>{
 const dist={...raw,pista:[' LUNES ','miércoles','viernes'],running:'domingo, lunes',run:['viernes'],carrera_series:'Miércoles',carrera_larga:'domingo, domingo'};
 assert.deepEqual(plain(canonical(dist)),{ok:true,availability:expected});
 assert.deepEqual(plain(days(' LUNES, miércoles , sábado ')),['lunes','miercoles','sabado']);
});
for(const value of ['', ' ', 'lunes,', ',domingo','domingo,,lunes','domingo y lunes','solo el domingo',
 'domingo (entrenador externo)','sin días asignados aún','["domingo"]','["domingo"',null,{},['domingo',42],['domingo','unknown'],42]) {
 test(`unrecognized legacy or malformed category rejects atomically: ${JSON.stringify(value)}`,()=>{
  assert.equal(days(value),null);
  assert.equal(canonical({...raw,carrera_larga:value}).ok,false);
  assert.equal(storage({...raw,carrera_larga:value}),null);
 });
}
test('writer preserves categories and metadata while persisting only arrays for days',()=>{
 const input={...raw,observaciones:'metadata',disponibilidad:'lunes, domingo'};
 const normalized=storage(JSON.stringify(input));
 assert.deepEqual(plain(normalized),{...raw,carrera_larga:['domingo'],observaciones:'metadata',disponibilidad:['lunes','domingo']});
 assert.equal(input.carrera_larga,'domingo');assert.equal(storage('{invalid'),null);
 assert.equal(storage({descripcion:'entreno domingos'}),null);
 assert.equal(storage(null),null);assert.equal(storage([]),null);
  assert.deepEqual(plain(storage({box:[]})),{box:[]});
  assert.equal(days(new Array(1)),null);
});

for(const title of ["Fartlek 6x3'",'Series 8x400 m','Rodaje Z2',"Tempo 20'",'Intervalos VO2max','Tirada larga','Cuestas','Técnica de carrera']) {
 test(`canonical carrera availability is independent of title: ${title}`,async()=>{
  const sessions=week(title),db=database();
  const receipt=await calendar.issueWeeklyCalendar(db,'test','2026-09-07',sessions);
  await calendar.assertWeeklyCalendar(db,'test','2026-09-07',sessions,receipt);
  assert.equal(sessions[6].tipo,'carrera');
  const prepared=await load('prepareSessionTrainingContract').prepareSessionTrainingContract(db,'test',profile,
   {targetWeekStart:'2026-09-07',day:'domingo',discipline:'carrera',stimulus:'base_aerobica'},contractFixture().restrictionsSnapshot);
  assert.equal(prepared.ok,true);
 });
}
test('availability aliases do not acquire independent prescription authority or title-based inference',async()=>{
 for(const type of ['pista','carrera_larga','fartlek']) {
  const sessions=week('carrera');sessions[6].tipo=type;
  await assert.rejects(calendar.issueWeeklyCalendar(database(),'test','2026-09-07',sessions),/CALENDAR_DISCIPLINE_UNSUPPORTED/);
 }
 const sessions=week('Fartlek');sessions[6].tipo='box';
 await assert.rejects(calendar.issueWeeklyCalendar(database(),'test','2026-09-07',sessions),/CALENDAR_DAY_UNAVAILABLE/);
 const library=load('movementLibrary').MOVEMENT_LIBRARY;
 for(const id of ['fartlek','series_umbral','series_vo2max','tempo_run','rodaje_z1','rodaje_z2','rodaje_largo'])assert.ok(library[id].discipline.includes('carrera'));
});
test('target Sunday is September 13 under Canary and legacy input preserves protected days and seven-TRAIN ceiling',async()=>{
 const resolve=load('../planning/recordCompletion').resolveCompletionDate;
 assert.deepEqual(plain(resolve('2026-09-13T12:00:00Z')),{date:'2026-09-13',weekStart:'2026-09-07',day:'domingo'});
 const sessions=week('Recuperación');sessions[6].stimulusId='recuperacion_activa';const db=database();
 const receipt=await calendar.issueWeeklyCalendar(db,'test','2026-09-07',sessions);
 const training=sessions.map(x=>({...x}));delete training[6].stimulusId;
 await assert.rejects(calendar.assertWeeklyCalendar(db,'test','2026-09-07',training,receipt),/PROTECTED/);
 const changed=sessions.map(x=>({...x}));changed[0].tipo='carrera';
 await assert.rejects(calendar.assertWeeklyCalendar(db,'test','2026-09-07',changed,receipt),/PROTECTED/);
 const seven=sessions.map(x=>({dia:x.dia,tipo:raw.box.includes(x.dia)?'box':'carrera'}));
 await assert.rejects(calendar.issueWeeklyCalendar(db,'test','2026-09-07',seven),/CALENDAR_TRAINING_LIMIT/);
});

const source=ts.createSourceFile('route.ts',readFileSync('app/api/chat/route.ts','utf8'),ts.ScriptTarget.Latest,true);
function find(predicate){let found;function visit(n){if(!found&&predicate(n))found=n;ts.forEachChild(n,visit);}visit(source);return found;}
test('actual conversational writer normalizes the mixed shape and never saves partially malformed categories',()=>{
 const declaration=find(n=>ts.isVariableStatement(n)&&n.getText(source).startsWith('const distParaValidar = normalizeAvailabilityForStorage'));
 const block=declaration.parent;const text=block.getText(source);assert.ok(text.includes('updates.distribucion_semanal'));
 for(const [input,accepted] of [[raw,true],[{...raw,carrera_larga:'a veces el domingo'},false]]) {
  const updates={};vm.runInNewContext(compile(text),{extracted:{distribucion_semanal:input},updates,normalizeAvailabilityForStorage:storage,console:{error(){}}});
  assert.equal(Object.hasOwn(updates,'distribucion_semanal'),accepted);
  if(accepted)assert.deepEqual(JSON.parse(updates.distribucion_semanal),{...raw,carrera_larga:['domingo']});
 }
});
test('actual availability save delegates structured input and propagates shared writer result',async()=>{
 const branch=find(n=>ts.isIfStatement(n)&&n.expression.getText(source)==='action === "guardar_disponibilidad_actualizada"');
 for(const [descripcion,accepted] of [['solo entreno domingo',false],[JSON.stringify(raw),true]]) {
  const writes=[];const result=await vm.runInNewContext(compile('(async()=>'+branch.thenStatement.getText(source)+')()'),{
   datos:{descripcion},codigo:'test',NextResponse:{json:x=>x},supabase:{},
   updateChatAvailability:async(_db,_code,value)=>{assert.equal(value,descripcion);const normalized=storage(value);
    if(!normalized)return {ok:false,code:'AVAILABILITY_FORMAT_INVALID'};
    writes.push({value:{distribucion_semanal:JSON.stringify(normalized)}});return {ok:true};}});
  assert.equal(result.ok,accepted);assert.equal(writes.length,accepted?1:0);
  if(accepted)assert.deepEqual(JSON.parse(writes[0].value.distribucion_semanal),{...raw,carrera_larga:['domingo']});
  else assert.equal(result.code,'AVAILABILITY_FORMAT_INVALID');
 }
});

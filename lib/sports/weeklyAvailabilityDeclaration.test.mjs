import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain } from './trainingContractTestRuntime.mjs';
const events=[];
const load=sportsRuntime({console:{info:(...v)=>events.push(v),log(){},warn(){},error(){}}});
const parse=load('weeklyAvailabilityDeclaration').parseWeeklyAvailabilityDeclaration;
const api=load('chatAvailability'),calendar=load('../planning/weeklyCalendarAuthority');
const week='2026-09-14',scope=['box','carrera'];
const prior={box:['martes','jueves'],carrera:['lunes','miercoles']};
const resolve=text=>plain(parse(text,scope,prior));
for(const text of ['Esta semana no entreno.','no entreno esta semana','Esta semana no voy a entrenar.',
  'Esta semana descanso completamente.','esta semana descanso','Esta semana descanso por completo.',
  'esta semana no haré ningún entrenamiento'])test('explicit zero is a positive declaration: '+text,()=>{
  const r=resolve(text);assert.equal(r.resolution,'EXPLICIT_ZERO_TRAINING');assert.deepEqual(r.availability,{box:[],carrera:[]});
});
for(const text of ['', 'no', 'texto ininterpretable', 'quizá entreno', 'creo que quizá haga algo el sábado', 'No sé si voy a entrenar.', 'Quiero entrenar sin restricciones.', 'No tengo problemas para entrenar.'])
  test('unresolved is never explicit zero: '+text,()=>assert.equal(resolve(text),null));
test('vacation and future tense preserve only declared days',()=>{
  for(const text of ['Estoy de vacaciones. Solo correré martes y sábado.','Estoy de vacaciones y solo puedo correr martes y sábado.'])
    assert.deepEqual(resolve(text).availability,{carrera:['martes','sabado'],box:[]});
  assert.deepEqual(resolve('No hago box esta semana, solo corro miércoles y domingo.').availability,{box:[],carrera:['miercoles','domingo']});
  assert.deepEqual(resolve('Solo puedo entrenar dos días, lunes y jueves.').availability,{box:['lunes','jueves'],carrera:['lunes','jueves']});
});
for(let count=1;count<=7;count++)test(`all declared frequencies are valid: ${count}`,()=>{
  const days=['lunes','martes','miercoles','jueves','viernes','sabado','domingo'].slice(0,count);
  const r=resolve('Corro '+days.join(' y '));assert.equal(r.resolution,'DECLARED_AVAILABILITY');
  assert.deepEqual(r.availability,{carrera:days,box:[]});
});
test('contradictory total rest and training is unresolved, not explicit zero',()=>assert.equal(resolve('Esta semana no entreno. Corro martes.'),null));
test('a discipline preference without known days is unresolved, not zero',()=>{
  assert.equal(parse('Solo quiero correr esta semana.',scope,{}),null);
  assert.equal(parse('No hago box esta semana.',scope,{}),null);
  assert.equal(parse('Esta semana no entreno.',scope,{}).resolution,'EXPLICIT_ZERO_TRAINING');
});
for(const text of [
  'Esta semana solo carrera. Lunes, miércoles, viernes y domingo.',
  'Esta semana no voy al box. Corro lunes, miércoles, viernes y domingo.',
  'Esta semana únicamente carrera. Lunes miércoles viernes domingo.',
  'No hago box esta semana. Lunes y miércoles carrera, viernes y domingo corro.',
])test('A/C semantic week has zero habitual box: '+text,()=>{
  const r=resolve(text);assert.deepEqual(r.availability,{carrera:['lunes','miercoles','viernes','domingo'],box:[]});
  assert.deepEqual(r.excludedDisciplines,['box']);
});
test('B exclusion and changed running days',()=>assert.deepEqual(resolve('No voy al box esta semana. Corro martes y sábado.').availability,{box:[],carrera:['martes','sabado']}));
test('D days before final facility',()=>assert.deepEqual(plain(parse('Esta semana entreno lunes, martes, jueves y sábado en el box.',['box'])).availability,{box:['lunes','martes','jueves','sabado']}));
for(const text of ['lunes hago box','el lunes voy al box','lunes crossfit','lunes entreno en el box','lunes fuerza y metcon'])
  test('box day-first synonym: '+text,()=>assert.deepEqual(resolve(text).availability,{box:['lunes'],carrera:[]}));
for(const text of ['miércoles corro','miércoles carrera','miércoles running','miércoles salgo a correr'])
  test('running day-first synonym: '+text,()=>assert.deepEqual(resolve(text).availability,{carrera:['miercoles'],box:[]}));
test('multiple disciplines remain assigned to their respective days',()=>assert.deepEqual(resolve('box martes y jueves, carrera domingo').availability,{box:['martes','jueves'],carrera:['domingo']}));
test('rest clause does not cancel the preceding clear clause',()=>assert.deepEqual(resolve('lunes y miércoles carrera, viernes descanso').availability,{carrera:['lunes','miercoles'],box:[]}));
test('H uncertainty stays UNKNOWN while clear days remain usable',()=>{
  const r=resolve('Corro lunes y miércoles. Creo que quizá haga algo el sábado.');
  assert.deepEqual(r.availability,{carrera:['lunes','miercoles'],box:[]});assert.deepEqual(r.unresolvedDays,['sabado']);
});
test('flexible availability permits Coach discipline and rest choices',()=>assert.deepEqual(resolve('Puedo entrenar lunes y jueves.').availability,{box:['lunes','jueves'],carrera:['lunes','jueves']}));
test('G exclusion only preserves the other discipline; all-zero week valid',()=>{
  assert.deepEqual(resolve('esta semana nada de box').availability,{box:[],carrera:prior.carrera});
  assert.deepEqual(resolve('No hago box. No corro esta semana.').availability,{box:[],carrera:[]});
});
function database(){
  const tables={usuarios:[{codigo:'synthetic',modo_entrada:'coach',categoria:'carrera',especialidad:'crossfit',perfil:{dias:4},workout_history:[],distribucion_semanal:prior}],
    athlete_training_sources:scope.map(d=>({user_codigo:'synthetic',disciplina:d,owner:'forge',activo:true,dias:prior[d]})),athlete_state_events:[],athlete_coaching_notes:[],external_training_records:[],weekly_plan:[]};
  const writes=[];let race=false;
  return {tables,writes,setRace(){race=true;},from(table){let patch;const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},is(k,v){return q.eq(k,v);},order(){return q;},range(){return q;},limit(){return q;},in(){return q;},update(p){patch=p;return q;},
    async execute(single=false){if(patch&&race){tables.usuarios[0].perfil.concurrentFact=true;race=false;}
      const rows=(tables[table]??[]).filter(r=>filters.every(([k,v])=>typeof r[k]==='object'&&r[k]!==null?JSON.stringify(r[k])===v:r[k]===v));
      if(patch){writes.push(patch);rows.forEach(r=>Object.assign(r,plain(patch)));}
      return {data:single?rows[0]??null:rows,error:null};},single(){return q.execute(true);},maybeSingle(){return q.execute(true);},then(y,n){return q.execute().then(y,n);}};return q;}};
}
test('E/F/G/I week-scoped JSON reaches Weekly and Builder contexts, no habitual/source mutation, no text reparsing',async()=>{
  const db=database(),habit=JSON.stringify(db.tables.usuarios[0].distribucion_semanal),sources=JSON.stringify(db.tables.athlete_training_sources);
  const q=await api.readAvailabilityConfirmation(db,'synthetic',week);assert.equal(q.ok,true,JSON.stringify(q));
  const result=await api.updateChatAvailability(db,'synthetic','No voy al box esta semana. Corro martes y sábado.',q.snapshotDigest,week);
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(db.writes.length,1);assert.deepEqual(Object.keys(db.writes[0]),['perfil']);
  assert.equal(JSON.stringify(db.tables.usuarios[0].distribucion_semanal),habit);assert.equal(JSON.stringify(db.tables.athlete_training_sources),sources);
  const c=await calendar.loadWeeklyCalendarContext(db,'synthetic',week);assert.deepEqual(plain(c.allowed),{box:[],carrera:['martes','sabado']});
  assert.deepEqual(plain((await calendar.loadWeeklyCalendarContext(db,'synthetic','2026-09-21')).allowed),prior);
  const prepared=await load('../planning/prepareAllowedWeeklyPlanContract').loadWeeklyPlanningContext(db,'synthetic',{targetWeekStart:week,today:'2026-09-13',empezarHoy:false,snapshot:null,openCoachVersion:1,planningRunId:'synthetic-week'});
  assert.equal(prepared.ok,true,JSON.stringify(prepared));assert.deepEqual(plain(prepared.input.contexts.box.availableDays),[]);
  assert.deepEqual(plain(prepared.input.contexts.carrera.availableDays),['martes','sabado']);
  const built=load('../planning/allowedWeeklyPlanContract').buildAllowedWeeklyPlanContract(prepared.input);assert.equal(built.ok,true,JSON.stringify(built));
  const selections=load('../planning/weeklyCalendar').calendarDays.map(day=>({day,state:'REST',decision:{role:'PRIMARY',reason:'Contextual choice'}}));
  const selection={contractVersion:2,contextDigest:built.contract.contextDigest,selections};
  assert.equal(load('../planning/openWeeklyCoachContract').validateOpenWeeklySelection(built.contract,selection).ok,true);
  selections[0]={day:'lunes',state:'TRAIN',decision:{role:'PRIMARY',reason:'Contextual choice'},intent:{kind:'open_coach',version:1,discipline:'carrera',adaptationId:'base',stimulusId:'easy_running',pattern:'run',role:'PRIMARY',method:{kind:'coach_defined',label:'easy'}}};
  assert.deepEqual(plain(load('../planning/openWeeklyCoachContract').validateOpenWeeklySelection(built.contract,selection).errors),['DAY_NOT_AVAILABLE']);
  selections[0].day='martes';selections[1]={day:'lunes',state:'REST',decision:{role:'PRIMARY',reason:'Rest'}};
  assert.equal(load('../planning/openWeeklyCoachContract').validateOpenWeeklySelection(built.contract,selection).ok,true);
  selections[0].intent.discipline='box';assert.deepEqual(plain(load('../planning/openWeeklyCoachContract').validateOpenWeeklySelection(built.contract,selection).errors),['DAY_NOT_AVAILABLE']);
  const diagnostic=events.find(e=>e[0]==='WEEKLY_AVAILABILITY_RESOLVED')[1];assert.equal(diagnostic.planningRunId,'synthetic-week');assert.equal(diagnostic.source,'explicit_user_declaration');assert.doesNotMatch(JSON.stringify(diagnostic),/No voy/);
});
test('availability CAS prevents overwriting concurrent profile changes',async()=>{
  const db=database();db.setRace();const r=await api.updateChatAvailability(db,'synthetic','Corro martes y sábado.',undefined,week);
  assert.equal(r.ok,false);assert.equal(db.tables.usuarios[0].perfil.concurrentFact,true);assert.equal(db.tables.usuarios[0].perfil.weekly_availability,undefined);
});
test('confirmation digest is week-bound and changes with the declaration',async()=>{
  const db=database(),before=await api.readAvailabilityConfirmation(db,'synthetic',week);
  const r=await api.updateChatAvailability(db,'synthetic','Corro martes.',before.snapshotDigest,week);assert.equal(r.ok,true,JSON.stringify(r));assert.notEqual(r.snapshotDigest,before.snapshotDigest);
  assert.equal((await api.updateChatAvailability(db,'synthetic','sí',before.snapshotDigest,week)).code,'AVAILABILITY_CONFIRMATION_STALE');
  assert.equal((await api.updateChatAvailability(db,'synthetic','sí',r.snapshotDigest,week)).ok,true);
  assert.equal((await api.readAvailabilityConfirmation(db,'synthetic','2026-09-21')).snapshotDigest,before.snapshotDigest);
});
test('dated unavailability still overrides a week declaration',async()=>{
  const db=database();await api.updateChatAvailability(db,'synthetic','Corro martes y sábado.',undefined,week);
  db.tables.usuarios[0].perfil.prescription_access={'2026-09-15':{availability:'unavailable'}};
  assert.deepEqual(plain((await calendar.loadWeeklyCalendarContext(db,'synthetic',week)).allowed.carrera),['sabado']);
});
test('explicit zero persists, while unresolved text never writes or fabricates zero',async()=>{
  const db=database(),r=await api.updateChatAvailability(db,'synthetic','Esta semana no entreno.',undefined,week);
  assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.declaration.resolution,'EXPLICIT_ZERO_TRAINING');
  assert.deepEqual(plain((await calendar.loadWeeklyCalendarContext(db,'synthetic',week)).allowed),{box:[],carrera:[]});
  assert.deepEqual(plain((await calendar.loadWeeklyCalendarContext(db,'synthetic','2026-09-21')).allowed),prior);
  const before=JSON.stringify(db.tables),writes=db.writes.length;
  const unknown=await api.updateChatAvailability(db,'synthetic','quizá',undefined,week);
  assert.equal(unknown.ok,false);assert.equal(unknown.resolution,'UNRESOLVED_AVAILABILITY');
  assert.equal(JSON.stringify(db.tables),before);assert.equal(db.writes.length,writes);
});
test('explicit zero supersedes missing/corrupt habitual distribution, never invalid declaration fallback',async()=>{
  const db=database();db.tables.usuarios[0].distribucion_semanal='old broken text';
  const r=await api.updateChatAvailability(db,'synthetic','Esta semana descanso.',undefined,week);assert.equal(r.ok,true,JSON.stringify(r));
  assert.deepEqual(plain((await calendar.loadWeeklyCalendarContext(db,'synthetic',week)).allowed),{box:[],carrera:[]});
  db.tables.usuarios[0].perfil.weekly_availability[week]={version:1};
  await assert.rejects(calendar.loadWeeklyCalendarContext(db,'synthetic',week),/UNRESOLVED_AVAILABILITY/);
});
test('temporarily excluded external discipline does not hide a managed available today from preflight',async()=>{
  const db=database();db.tables.athlete_training_sources[0].owner='external';
  const r=await api.updateChatAvailability(db,'synthetic','No hago box esta semana. Corro martes.',undefined,week);assert.equal(r.ok,true,JSON.stringify(r));
  const result=await load('../planning/weeklyGenerationPreflight').resolveWeeklyGenerationPreflight(db,'synthetic',{targetWeekStart:week,today:'2026-09-15',snapshot:null});
  assert.equal(result.preflightRequirement?.kind,'temporal',JSON.stringify(result));
});

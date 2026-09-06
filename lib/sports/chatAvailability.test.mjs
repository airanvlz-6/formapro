import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sportsRuntime, plain, compile } from './trainingContractTestRuntime.mjs';
const load = sportsRuntime();
const api = load('chatAvailability');
const calendar = load('../planning/weeklyCalendarAuthority');
const adapter = load('../planning/prepareAllowedWeeklyPlanContract');
const input = 'No, box martes/jueves. Carrera lunes/miercoles/sabado';
export function availabilityDB(profile = {}, sources = [], failure = '') {
  const tables = { usuarios: [{ modo_entrada: 'coach', categoria: 'carrera', perfil: { dias: 4 }, workout_history: [],
    distribucion_semanal: JSON.stringify({ descripcion: 'legacy' }), ...profile }], athlete_training_sources: structuredClone(sources),
    athlete_state_events: [], athlete_coaching_notes: [], weekly_plan: [], external_training_records: [] };
  const writes = [];
  return { tables, writes, from(table) {
    const filters = []; let patch;
    const query = { select() { return this; }, eq(k,v) { filters.push([k,v]); return this; }, in(){return this;}, order(){return this;}, limit(){return this;}, range(){return this;},
      update(value) { patch = value; return this; },
      async execute(single = false) {
        const rows = (tables[table] || []).filter(row => filters.every(([k,v]) => ['codigo','user_codigo'].includes(k) || row[k] === v));
        if (patch) {
          writes.push({ table, patch: structuredClone(patch) });
          if (failure === 'write') return { data: null, error: {} };
          if (failure !== 'silent') rows.forEach(row => Object.assign(row, patch));
        }
        return { data: single ? rows[0] ?? null : rows, error: failure === 'read' && !patch ? {} : null };
      }, single(){return this.execute(true);}, maybeSingle(){return this.execute(true);}, then(y,n){return this.execute().then(y,n);} };
    return query;
  } };
}
test('explicit parser accepts separators, accents and production input without mixing disciplines', () => {
  for (const text of [input, 'box: martes y jueves; carrera: lunes miércoles sábado', 'box martes/jueves carrera lunes,miercoles,sabado'])
    assert.deepEqual(plain(api.parseChatAvailability(text)), { box: ['martes','jueves'], carrera: ['lunes','miercoles','sabado'] });
});
for (const text of ['carrera cuando pueda', 'box algunos días', 'carrera lunes/festivo', 'natacion lunes', 'carrera entre semana',
  'carrera varios días', 'carrera lunes a viernes', 'quizás carrera lunes', 'carrera lunes o martes', 'carrera lunes y', 'box', 'carrera lunes box'])
  test(`ambiguous/unknown input has no writes: ${text}`, async () => {
    const db = availabilityDB(); assert.equal((await api.updateChatAvailability(db,'test',text)).ok,false); assert.equal(db.writes.length,0);
  });
test('production: authorized carrera persists, unknown box rejected explicitly, canonical contract resolves', async () => {
  const db = availabilityDB();
  await assert.rejects(calendar.loadWeeklyCalendarContext(db,'test'), /CALENDAR_AVAILABILITY_UNRESOLVED/);
  const result = await api.updateChatAvailability(db,'test',input);
  assert.equal(result.ok,true); assert.equal(result.partial,true); assert.deepEqual(plain(result.rejectedCategories),['box']);
  const read = await calendar.loadWeeklyCalendarContext(db,'test');
  assert.deepEqual(plain(read.allowed.carrera),['lunes','miercoles','sabado']);
  assert.deepEqual(plain(read.scope.managedDisciplines),['carrera']);
  assert.equal(Object.hasOwn(JSON.parse(db.tables.usuarios[0].distribucion_semanal),'box'),false);
  assert.deepEqual(db.tables.athlete_training_sources,[]);
  const prepared = await adapter.prepareAllowedWeeklyPlanContract(db,'test',{targetWeekStart:'2026-09-07',today:'2026-09-06',empezarHoy:false,snapshot:null});
  assert.equal(prepared.ok,true,JSON.stringify(prepared));
  assert.equal((await api.updateChatAvailability(db,'test','sí')).ok,true);
});
test('authorized multidiscipline update replaces matching aliases and retains unrelated categories', async () => {
  const db = availabilityDB({ distribucion_semanal: JSON.stringify({box:['sabado'],pista:['viernes'],carrera_larga:'domingo',fuerza:['martes'],observaciones:'keep'}) });
  const r = await api.updateChatAvailability(db,'test',input); assert.equal(r.ok,true); assert.equal(r.partial,false);
  assert.deepEqual(JSON.parse(r.distribucion),{box:['martes','jueves'],carrera:['lunes','miercoles','sabado'],fuerza:['martes'],observaciones:'keep'});
});
test('explicit external box and forge carrera days update without changing ownership', async () => {
  const sources=[{disciplina:'box',owner:'external',activo:true,dias:['sabado']},{disciplina:'carrera',owner:'forge',activo:true,dias:['viernes']}];
  const db=availabilityDB({},sources); const r=await api.updateChatAvailability(db,'test',input); assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(r.partial,false); assert.deepEqual(db.tables.athlete_training_sources.map(s=>s.owner),['external','forge']);
  assert.deepEqual(plain(db.tables.athlete_training_sources[0].dias),['martes','jueves']);
  const c=await calendar.loadWeeklyCalendarContext(db,'test'); assert.deepEqual(plain(c.scope.managedDisciplines),['carrera']);
});
test('legacy structured scalar normalizes and unrelated box remains intact', async () => {
  const db=availabilityDB({distribucion_semanal:JSON.stringify({box:['martes'],carrera:['lunes']})});
  const r=await api.updateChatAvailability(db,'test',JSON.stringify({carrera_larga:'domingo'})); assert.equal(r.ok,true);
  assert.deepEqual(JSON.parse(r.distribucion),{box:['martes'],carrera_larga:['domingo']});
});
for (const failure of ['read','write','silent']) test(`persistence failure cannot confirm: ${failure}`,async()=>{
  const db=availabilityDB({},[],failure); assert.equal((await api.updateChatAvailability(db,'test','carrera lunes')).ok,false);
});
test('description alone and unchanged confirmation cannot authorize a legacy calendar',async()=>{
  const db=availabilityDB(); assert.equal((await api.updateChatAvailability(db,'test','sí')).ok,false);
  assert.equal((await api.updateChatAvailability(db,'test',{descripcion:'carrera lunes'})).ok,false);
  assert.equal(db.writes.length,0);
});

test('actual chat routes await shared writer and UI does not confirm failed or partial updates',async()=>{
  const source=ts.createSourceFile('route.ts',readFileSync('app/api/chat/route.ts','utf8'),ts.ScriptTarget.Latest,true);
  for(const action of ['guardar_disponibilidad_actualizada','verificar_correccion_disponibilidad_deterministico']){
    let branch;function find(n){if(ts.isIfStatement(n)&&n.expression.getText(source)===`action === "${action}"`)branch=n;ts.forEachChild(n,find);}find(source);
    const db=availabilityDB();const result=await vm.runInNewContext(compile('(async()=>'+branch.thenStatement.getText(source)+')()'),{
      datos:{mensajeUsuario:input},codigo:'test',supabase:db,updateChatAvailability:api.updateChatAvailability,NextResponse:{json:x=>x}});
    assert.equal(result.ok,true);assert.equal(result.partial,true);
  }
  const ui=readFileSync('app/FormaPro.tsx','utf8');
  const start=ui.indexOf('if(esperandoConfirmacionDisponibilidad && codigoUsuario)');
  const end=ui.indexOf('if(esperandoConfirmacionEmpezarHoy && codigoUsuario)',start);
  const block=ui.slice(start,end);
  assert.ok(block.includes('await apiCall'));
  assert.ok(block.indexOf('resCorreccion?.ok !== true')<block.indexOf('Perfecto.'));
  assert.ok(block.indexOf('resCorreccion.partial')<block.indexOf('setEsperandoConfirmacionDisponibilidad(false)'));
  assert.ok(block.includes('setDistribucionSemanal(resCorreccion.distribucion)'));
});

test('actual confirmation handler waits for persistence; failure and partial never advance',async()=>{
  const source=ts.createSourceFile('FormaPro.tsx',readFileSync('app/FormaPro.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let branch; function visit(n){if(ts.isIfStatement(n)&&n.expression.getText(source)==='esperandoConfirmacionDisponibilidad && codigoUsuario')branch=n;ts.forEachChild(n,visit);}visit(source);
  for(const result of [{ok:false},{ok:true,partial:true,updatedCategories:['carrera'],rejectedCategories:['box'],distribucion:'{}'},
    {ok:true,partial:false,distribucion:'{}'}]){
    let resolve;const pending=new Promise(r=>{resolve=r;});let messages=[];const advances=[];
    const execute=vm.runInNewContext(compile('async function run()'+branch.thenStatement.getText(source)+';run;'),{
      texto:input,codigoUsuario:'test',apiCall:()=>pending,
      setMensajes:f=>{messages=f(messages);},setCargando:()=>{},setDistribucionSemanal:()=>{},
      setEsperandoConfirmacionDisponibilidad:v=>advances.push(['availability',v]),setEsperandoConfirmacionEmpezarHoy:v=>advances.push(['start',v])});
    const running=execute();assert.equal(messages.length,0);assert.equal(advances.length,0);
    resolve(result);await running;
    const success=result.ok&&!result.partial;
    assert.equal(messages.some(m=>m.content.startsWith('Perfecto.')),success);
    assert.equal(advances.some(([k,v])=>k==='start'&&v===true),success);
    if(!success)assert.equal(advances.length,0);
  }
});

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
const ownership = load('coachOwnership');
const responses = load('availabilityResponse');
const existingAvailability = {box:['martes','jueves','viernes','sabado'],carrera:['lunes','miercoles','domingo']};
const canonicalDB = (mode='coach') => availabilityDB({modo_entrada:mode,distribucion_semanal:JSON.stringify(existingAvailability)},[
  {disciplina:'box',owner:mode==='focus'?'external':'forge',activo:true,dias:existingAvailability.box},
  {disciplina:'carrera',owner:'forge',activo:true,dias:existingAvailability.carrera}]);
for(const phrase of ['sí','si','sí, sigue igual','sí, sigue siendo así','correcto','es correcto','igual','igual que antes',
  'sigue igual','no ha cambiado','sin cambios','mantén lo mismo','mantén esos días','mantén esos mismos días','sí, esos mismos días','no, sigue igual','  ¡SÍ,   SIGUE SIENDO ASÍ!  '])
test(`confirm exact canonical availability without writes: ${phrase}`,async()=>{
 const db=canonicalDB(),before=JSON.stringify(db.tables);const question=await api.readAvailabilityConfirmation(db,'test');assert.equal(question.ok,true);
 const result=await api.updateChatAvailability(db,'test',phrase,question.snapshotDigest);
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.responseKind,'CONFIRM_EXISTING_AVAILABILITY');assert.equal(result.actualizado,false);
 assert.equal(result.distribucion,db.tables.usuarios[0].distribucion_semanal);assert.equal(JSON.stringify(db.tables),before);assert.equal(db.writes.length,0);
 assert.deepEqual(plain(result.availability),existingAvailability);
});
for(const phrase of ['más o menos','creo que sí','quizá','depende','casi igual','no, ha cambiado','NO. Ha cambiado','sí pero no el sábado'])
test(`uncertain or contradictory answer never confirms: ${phrase}`,async()=>{
 const db=canonicalDB();assert.equal(responses.isExistingAvailabilityConfirmation(phrase),false);
 const result=await api.updateChatAvailability(db,'test',phrase);assert.equal(result.ok,false);assert.equal(db.writes.length,0);
});
for(const [phrase,expected] of [
 ['no, ahora box solo martes y jueves',{...existingAvailability,box:['martes','jueves']}],
 ['carrera lunes y miércoles, domingo no',{...existingAvailability,carrera:['lunes','miercoles']}],
 ['box sigue igual pero carrera solo lunes',{...existingAvailability,carrera:['lunes']}],
 ['quita el sábado',{...existingAvailability,box:['martes','jueves','viernes']}],
 ['el viernes ya no puedo',{...existingAvailability,box:['martes','jueves','sabado']}],
])test(`bounded partial update preserves scope: ${phrase}`,async()=>{
 const db=canonicalDB();const before=(await calendar.loadWeeklyCalendarContext(db,'test')).scope;
 const result=await api.updateChatAvailability(db,'test',phrase);assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.responseKind,'UPDATE_AVAILABILITY');
 const after=await calendar.loadWeeklyCalendarContext(db,'test');assert.deepEqual(plain(after.scope),plain(before));assert.deepEqual(plain(after.allowed),expected);
 assert.ok(db.writes.every(w=>w.table!=='athlete_training_sources'||Object.keys(w.patch).join(',')==='dias'));
});
test('ambiguous day removal across disciplines has no writes',async()=>{
 const db=canonicalDB();db.tables.athlete_training_sources[1].dias.push('sabado');
 assert.equal((await api.updateChatAvailability(db,'test','quita el sábado')).ok,false);assert.equal(db.writes.length,0);
});
test('shown snapshot is checked again; changes require renewed confirmation',async()=>{
 const db=canonicalDB();const question=await api.readAvailabilityConfirmation(db,'test');
 db.tables.athlete_training_sources[0].dias=['jueves'];
 const result=await api.updateChatAvailability(db,'test','sí',question.snapshotDigest);
 assert.equal(result.ok,false);assert.equal(result.code,'AVAILABILITY_CONFIRMATION_STALE');assert.equal(db.writes.length,0);
 assert.match(result.question,/Box: jueves/);
});
for(const mode of ['coach','focus','supervision'])test(`confirmation preserves ${mode} authority and Planner availability`,async()=>{
 const db=canonicalDB(mode),before=JSON.stringify(db.tables);const result=await api.updateChatAvailability(db,'test','correcto');
 assert.equal(result.ok,mode!=='supervision');assert.equal(JSON.stringify(db.tables),before);assert.equal(db.writes.length,0);
 if(result.ok){const c=await calendar.loadWeeklyCalendarContext(db,'test');assert.deepEqual(plain(c.allowed),mode==='focus'?{carrera:existingAvailability.carrera}:existingAvailability);
   const prepared=await adapter.loadWeeklyPlanningContext(db,'test',{targetWeekStart:'2026-09-07',today:'2026-09-06',empezarHoy:false,snapshot:null});
   assert.equal(prepared.ok,true,JSON.stringify(prepared));assert.deepEqual(plain(prepared.input.allowed),plain(c.allowed));}
});
test('question renders canonical source precedence, not legacy prose',async()=>{
 const db=canonicalDB();db.tables.usuarios[0].distribucion_semanal=JSON.stringify({...existingAvailability,box:['lunes'],descripcion:'PRIVATE PROSE'});
 const r=await api.readAvailabilityConfirmation(db,'test');assert.equal(r.ok,true);assert.match(r.question,/Box: martes, jueves, viernes, sabado/);
 assert.ok(!r.question.includes('PRIVATE PROSE'));assert.equal(db.writes.length,0);
});
test('actual read-only question route and confirmation route reuse server snapshot without LLM or writes',async()=>{
 const source=ts.createSourceFile('route.ts',readFileSync('app/api/chat/route.ts','utf8'),ts.ScriptTarget.Latest,true);
 const db=canonicalDB();
 const run=async(action,datos)=>{
   let branch;function visit(n){if(ts.isIfStatement(n)&&n.expression.getText(source)===`action === "${action}"`)branch=n;ts.forEachChild(n,visit);}visit(source);
   return vm.runInNewContext(compile('(async()=>'+branch.thenStatement.getText(source)+')()'),{
     datos,codigo:'test',supabase:db,readAvailabilityConfirmation:api.readAvailabilityConfirmation,updateChatAvailability:api.updateChatAvailability,NextResponse:{json:x=>x},
     fetch:()=>{throw new Error('Confirmation must not call LLM');}});
 };
 const question=await run('obtener_confirmacion_disponibilidad',{});assert.equal(question.ok,true);
 const response=await run('verificar_correccion_disponibilidad_deterministico',{mensajeUsuario:'sí, sigue siendo así',snapshotDigest:question.snapshotDigest});
 assert.equal(response.responseKind,'CONFIRM_EXISTING_AVAILABILITY');assert.equal(db.writes.length,0);
 const ui=readFileSync('app/FormaPro.tsx','utf8');assert.equal((ui.match(/await availabilityQuestion\(\)/g)||[]).length,2);
});
for (const [expected, phrases] of [
  ['forge', ['Quiero que las programe Forge y las coordine con el resto de mi planificacion', 'Quiero que Forge programe box',
    'Forge', 'que lo programe Forge', 'Forge se encarga', 'sí, forge', 'si forge', 'quiero que lo programe forge',
    'quiero que forge lo programe', 'las programa forge', 'los programa forge', 'quiero que las programe forge', 'que se encargue forge', '¡SÍ, FORGE!']],
  ['external', ['me lo programa otro entrenador', 'otra persona', 'yo me encargo', 'no quiero que lo programe Forge',
    'Forge no', 'no forge', 'no quiero forge', 'no, forge no', 'lo programa otra persona', 'lo gestiona mi entrenador', 'lo hago por mi cuenta', 'yo']],
  ['ambiguous', ['depende', 'Forge o mi entrenador', 'Forge pero también mi entrenador', 'a veces', 'quizá', 'ya veremos',
    'puede ser', 'como quieras', 'no sé', 'Forge si puedo', 'quiero que Forge programe carrera', 'no quiero que Forge no lo programe', 'box martes/jueves']],
]) for (const phrase of phrases) test(`pending ownership classifier: ${phrase} => ${expected}`, () => {
  assert.equal(ownership.parseOwnershipConfirmation(phrase, 'box'), expected);
});
const input = 'No, box martes/jueves. Carrera lunes/miercoles/sabado';
export function availabilityDB(profile = {}, sources = [], failure = '') {
  const tables = { usuarios: [{ modo_entrada: 'coach', categoria: 'carrera', perfil: { dias: 4 }, workout_history: [],
    distribucion_semanal: JSON.stringify({ descripcion: 'legacy' }), ...profile }], athlete_training_sources: structuredClone(sources),
    athlete_state_events: [], athlete_coaching_notes: [], weekly_plan: [], external_training_records: [] };
  const writes = [];
  return { tables, writes, from(table) {
    const filters = []; let patch, upsertRows;
    const query = { select() { return this; }, eq(k,v) { filters.push([k,v]); return this; }, in(){return this;}, order(){return this;}, limit(){return this;}, range(){return this;},
      update(value) { patch = value; return this; },
      upsert(rows, options) { assert.equal(options.onConflict,'user_codigo,disciplina'); upsertRows=rows; return this; },
      async execute(single = false) {
        if(upsertRows){
          writes.push({table,upsert:plain(upsertRows)});
          if(failure==='write')return {data:null,error:{}};
          if(failure!=='silent')for(const row of upsertRows){
            const old=tables[table].find(s=>s.disciplina===row.disciplina);
            if(old)Object.assign(old,plain(row));else tables[table].push(plain(row));
          }
          return {data:null,error:null};
        }
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
      texto:input,codigoUsuario:'test',availabilityConfirmationRef:{current:null},apiCall:()=>pending,
      requestCoachOwnership:()=>null,
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

test('numeric prefixes are checked against explicit distinct days, never generate days',()=>{
  assert.deepEqual(plain(api.parseChatAvailability('2 dias box martes/jueves. 4 días carrera lunes/miercoles/viernes/sabado')),
    {box:['martes','jueves'],carrera:['lunes','miercoles','viernes','sabado']});
  for(const text of ['3 días carrera lunes/miercoles','2 dias box martes/martes','4 dias carrera','0 dias box martes','2 dias natacion lunes/martes'])
    assert.equal(api.parseChatAvailability(text),null,text);
});

test('Coach new box yields pending question with no automatic ownership or availability write',async()=>{
  const db=availabilityDB();const result=await api.updateChatAvailability(db,'test','BOX martes/jueves');
  assert.equal(result.ok,false);assert.equal(db.writes.length,0);
  assert.deepEqual(plain(result.ownershipPending),[{discipline:'box',days:['martes','jueves']}]);
});

for(const [confirmation,owner] of [['sí, quiero que Forge gestione box','forge'],['no, el box me lo programa otro entrenador','external']])
test(`production two-step transition: ${owner}`,async()=>{
  const db=availabilityDB();
  const initial=await api.updateChatAvailability(db,'test','Carrera lunes/miercoles/viernes/sabado. BOX martes/jueves');
  assert.equal(initial.ok,true);assert.equal(db.tables.athlete_training_sources.length,0);
  const request={...plain(initial.ownershipPending[0]),confirmation};
  const result=await ownership.confirmCoachOwnership(db,'test',request);assert.equal(result.ok,true,JSON.stringify(result));
  const context=await calendar.loadWeeklyCalendarContext(db,'test');
  assert.deepEqual(plain(context.scope.managedDisciplines),owner==='forge'?['box','carrera']:['carrera']);
  assert.deepEqual(plain(context.scope.externalDisciplines),owner==='external'?['box']:[]);
  assert.deepEqual(plain(context.allowed.carrera),['lunes','miercoles','viernes','sabado']);
  assert.deepEqual(JSON.parse(db.tables.usuarios[0].distribucion_semanal).box,['martes','jueves']);
  assert.equal(db.tables.athlete_training_sources[0].owner,owner);
  assert.equal(db.tables.athlete_training_sources.some(s=>s.disciplina==='carrera'),false,'legacy carrera is not migrated');
  const writes=db.writes.filter(w=>w.upsert);assert.equal(writes.length,1);
  assert.equal(Object.hasOwn(writes[0].upsert[0],'dias'),false,'ownership committed before availability');
  assert.equal((await ownership.confirmCoachOwnership(db,'test',request)).ok,true,'safe repeat after ambiguous transport');
  assert.equal(db.writes.filter(w=>w.upsert).length,1);
});

for(const confirmation of ['a veces','depende','solo algunos entrenos','ya veremos','box martes/jueves','sí, pero solo algunos días'])
test(`ambiguous ownership does not write: ${confirmation}`,async()=>{
  const db=availabilityDB();assert.equal((await ownership.confirmCoachOwnership(db,'test',{discipline:'box',days:['martes'],confirmation})).code,'OWNERSHIP_CONFIRMATION_REQUIRED');
  assert.equal(db.writes.length,0);
});

for(const mode of ['focus','supervision','consulta'])test(`Coach transition unavailable to ${mode}`,async()=>{
  const db=availabilityDB({modo_entrada:mode});const result=await ownership.confirmCoachOwnership(db,'test',{discipline:'box',days:['martes'],confirmation:'sí'});
  assert.equal(result.code,'OWNERSHIP_COACH_REQUIRED');assert.equal(db.writes.length,0);
});

test('explicit ownership survives missing availability and external takes precedence over legacy categories',()=>{
  const scope=load('prescriptionScope');
  for(const owner of ['forge','external']){
    const sources=[{disciplina:'box',owner,activo:true}];
    for(const distribucion_semanal of [{},{box:['martes']}]){
      const result=scope.buildPrescriptionScope({mode:'coach',sources,profileDisciplines:scope.resolveProfileDisciplines({categoria:'carrera',distribucion_semanal})});
      assert.deepEqual(plain(result.scope.managedDisciplines),owner==='forge'?['box','carrera']:['carrera']);
    }
  }
});

test('ownership failure or conflicting explicit ownership cannot report success or overwrite it',async()=>{
  for(const failure of ['write','silent','read']){
    const db=availabilityDB({},[],failure);
    assert.equal((await ownership.confirmCoachOwnership(db,'test',{discipline:'box',days:['martes'],confirmation:'sí'})).ok,false);
  }
  const db=availabilityDB({},[{disciplina:'box',owner:'external',activo:true,dias:['martes']}]);
  assert.equal((await ownership.confirmCoachOwnership(db,'test',{discipline:'box',days:['jueves'],confirmation:'sí'})).code,'OWNERSHIP_CONTEXT_CHANGED');
  assert.equal(db.writes.length,0);
});

test('actual confirmation route delegates to the guarded writer',async()=>{
  const source=ts.createSourceFile('route.ts',readFileSync('app/api/chat/route.ts','utf8'),ts.ScriptTarget.Latest,true);
  let branch;function visit(n){if(ts.isIfStatement(n)&&n.expression.getText(source)==='action === "confirmar_ownership_coach"')branch=n;ts.forEachChild(n,visit);}visit(source);
  const db=availabilityDB({distribucion_semanal:JSON.stringify({carrera:['lunes']})});
  const result=await vm.runInNewContext(compile('(async()=>'+branch.thenStatement.getText(source)+')()'),{
    datos:{discipline:'box',days:['martes','jueves'],confirmation:'sí'},codigo:'test',supabase:db,
    confirmCoachOwnership:ownership.confirmCoachOwnership,NextResponse:{json:x=>x}});
  assert.equal(result.ok,true);assert.equal(result.owner,'forge');
});

test('actual ephemeral ownership handler waits for verified result and never advances on ambiguity/failure',async()=>{
  const source=ts.createSourceFile('FormaPro.tsx',readFileSync('app/FormaPro.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let branch;function visit(n){if(ts.isIfStatement(n)&&n.expression.getText(source)==='pendingCoachOwnership')branch=n;ts.forEachChild(n,visit);}visit(source);
  for(const result of [{ok:false,code:'OWNERSHIP_CONFIRMATION_REQUIRED'},{ok:false,code:'OWNERSHIP_WRITE_FAILED'},
    {ok:true,owner:'forge',distribucion:'{}'},{ok:true,owner:'external',distribucion:'{}'}]){
    let resolve;const wait=new Promise(r=>{resolve=r;});const calls=[],advances=[];let messages=[];
    const run=vm.runInNewContext(compile('async function run()'+branch.thenStatement.getText(source)+';run;'),{
      pendingCoachOwnership:{codigo:'test',weekly:true,queue:[{discipline:'box',days:['martes','jueves']}]},codigoUsuario:'test',texto:'sí',
      apiCall:body=>{calls.push(plain(body));return wait;},setCargando:()=>{},setInput:()=>{},setDistribucionSemanal:()=>{},
      setMensajes:f=>{messages=f(messages);},setPendingCoachOwnership:v=>advances.push(['pending',v]),
      setEsperandoConfirmacionDisponibilidad:v=>advances.push(['availability',v]),setEsperandoConfirmacionEmpezarHoy:v=>advances.push(['start',v])});
    const promise=run();assert.equal(advances.length,0);assert.equal(messages.filter(m=>m.role==='assistant').length,0);
    assert.equal(calls[0].action,'confirmar_ownership_coach');assert.equal(calls[0].datos.confirmation,'sí');
    resolve(result);await promise;
    assert.equal(advances.some(([key])=>key==='start'),result.ok);
    if(!result.ok)assert.equal(advances.length,0);
    if(result.owner==='external')assert.ok(messages.some(m=>m.content.includes('entrenamiento externo')));
  }
});

test('real pending handler completes natural Forge confirmation through writer, scope and availability',async()=>{
  const source=ts.createSourceFile('FormaPro.tsx',readFileSync('app/FormaPro.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let branch;function visit(n){if(ts.isIfStatement(n)&&n.expression.getText(source)==='pendingCoachOwnership')branch=n;ts.forEachChild(n,visit);}visit(source);
  for(const state of ['valid','absent','other-user']){
    const db=availabilityDB({distribucion_semanal:JSON.stringify({carrera:['lunes']})});let messages=[];const advances=[];
    const run=vm.runInNewContext(compile('async function run(){'+branch.getText(source)+'};run;'),{
      pendingCoachOwnership:state==='absent'?null:{codigo:state==='valid'?'test':'other',weekly:true,queue:[{discipline:'box',days:['martes','jueves']}]},
      codigoUsuario:'test',texto:'Quiero que Forge programe box',
      apiCall:body=>ownership.confirmCoachOwnership(db,body.codigo,body.datos),setCargando:()=>{},setInput:()=>{},
      setMensajes:f=>{messages=f(messages);},setDistribucionSemanal:()=>{},setPendingCoachOwnership:()=>{},
      setEsperandoConfirmacionDisponibilidad:()=>{},setEsperandoConfirmacionEmpezarHoy:v=>advances.push(v)});
    await run();
    if(state!=='valid'){assert.equal(db.writes.length,0);continue;}
    const c=await calendar.loadWeeklyCalendarContext(db,'test');
    assert.deepEqual(plain(c.scope.managedDisciplines),['box','carrera']);assert.deepEqual(plain(c.allowed.box),['martes','jueves']);
    assert.ok(messages.some(m=>m.content.includes('Disponibilidad guardada y verificada')));
    assert.equal(messages.some(m=>m.content.includes('Necesito una confirmación clara')),false);
    assert.deepEqual(advances,[true]);
  }
  assert.equal(ownership.parseOwnershipConfirmation('Forge',''), 'ambiguous');
});

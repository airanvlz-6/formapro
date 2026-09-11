import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { equippedProfileFixture, sportsRuntime, contractFixture, plain, fakeDatabase, compile, completeDoseFixture } from '../sports/trainingContractTestRuntime.mjs';
const load = sportsRuntime();
const api = load('../planning/allowedWeeklyPlanContract');
const adapter = load('../planning/prepareAllowedWeeklyPlanContract');
const days = load('../planning/weeklyCalendar').calendarDays;
const allowed = { box: ['martes', 'jueves', 'sabado'], carrera: ['lunes', 'miercoles', 'viernes', 'domingo'] };
const note = { id: 'fixture', status: 'pending', constraint_level: 'reassessment', prohibits_impact: true,
  prohibits_jump: true, prohibits_deep_flexion: true, prohibits_axial_load: false };
function input(restricted = true) {
  const restrictions = load('../athlete/getCanonicalRestrictions').projectCanonicalRestrictions([], restricted ? [note] : [], '2026-09-06');
  const contexts = Object.fromEntries(['box', 'carrera'].map(discipline => {
    const context = contractFixture({ targetWeekStart: '2026-09-07', discipline, availableDays: allowed[discipline], restrictionsSnapshot: restrictions });
    context.exposureContext.report.disciplina = discipline;
    return [discipline, context];
  }));
  return { targetWeekStart: '2026-09-07', prescriptionScope: contexts.box.prescriptionScope,
    maxExecutableDays: 6, completeNewWeek: true, allowed, contexts, fixed: {} };
}
function contract(restricted = true) {
  const result = api.buildAllowedWeeklyPlanContract(input(restricted)); assert.equal(result.ok, true, JSON.stringify(result)); return result.contract;
}
function selection(c, choose = (options, day) => options.find(o => day === 'jueves' && o.stimulusId === 'fuerza_maxima') || options[0]) {
  return { contractVersion: 1, contextDigest: c.contextDigest,
    selections: days.map(day => ({ day, optionId: choose(c.dayOptions[day], day).optionId })) };
}
const request = { targetWeekStart: '2026-09-07', today: '2026-09-06', empezarHoy: false, snapshot: null };
const tables = () => ({ usuarios: { modo_entrada: 'coach', categoria: 'box', perfil: { ...equippedProfileFixture(), dias: 6 }, workout_history: [],
  distribucion_semanal: { box: allowed.box, pista: ['lunes', 'miercoles', 'viernes'], carrera_larga: ['domingo'] } },
  athlete_training_sources: [], athlete_state_events: [], athlete_coaching_notes: [note], weekly_plan: [] });
const extractContract = prompt => JSON.parse(prompt.split('WEEKLY_CONTRACT:\n')[1].split('\nPropuesta rechazada:')[0]);

test('pure preparation is deterministic, does not mutate inputs and publishes no medical context or session details', () => {
  const i = input(), before = JSON.stringify(i), a = api.buildAllowedWeeklyPlanContract(i);
  assert.equal(JSON.stringify(a), JSON.stringify(api.buildAllowedWeeklyPlanContract(i)));
  assert.equal(JSON.stringify(i), before);
  for (const text of ['restrictionsSnapshot', 'reassessments', 'movementId', 'sets', 'reps', 'fixture']) assert.equal(JSON.stringify(a.contract).includes(text), false);
  const changed = input(); changed.contexts.box.restrictionsSnapshot.asOfDate = '2026-09-07';
  assert.notEqual(a.contract.contextDigest, api.buildAllowedWeeklyPlanContract(changed).contract.contextDigest);
});

const original = [ ['lunes','recuperacion_activa'], ['martes','halterofilia_tecnica'], ['miercoles','base_aerobica'],
  ['jueves','fuerza_maxima'], ['viernes','economia_carrera'], ['sabado','halterofilia_tecnica'], ['domingo','base_aerobica'] ];
for (const [day, stimulus] of original) test(`production ${day}/${stimulus}: ${day === 'jueves' ? 'published generic' : 'not published'}`, () => {
  const c = contract(), option = c.dayOptions[day].find(o => o.stimulusId === stimulus);
  assert.equal(!!option, day === 'jueves');
  if (option) assert.deepEqual(plain(option.intent), { kind: 'stimulus_only' });
});

test('exact remaining option space uses only real feasible catalog choices, no replacement sessions', () => {
  const c = contract(), i = input();
  for (const day of days) {
    const expected = allowed.box.includes(day)
      ? ['fuerza_maxima','hipertrofia','gimnasticos','capacidad_glucolitica','cadena_posterior','fuerza_general','tecnica'] : ['fuerza_corredor'];
    assert.deepEqual(plain(c.dayOptions[day].filter(o => o.stimulusId).map(o => o.stimulusId)), expected);
    for (const o of c.dayOptions[day].filter(o => o.stimulusId)) assert.equal(load('trainingFeasibility').evaluateTrainingFeasibility({
      ...i.contexts[o.discipline], targetDay: day, stimulus: o.stimulusId, intent: o.intent }).feasible, true);
  }
  assert.equal(api.validateWeeklySelection(c, selection(c)).ok, true, 'Thursday generic plus six REST is permitted');
});

test('trusted structured squat intent is never downgraded and cannot publish Thursday generic bench press', () => {
  const i = input(); i.contexts.box.intent = { kind: 'main_pattern', pattern: 'squat' };
  const result = api.buildAllowedWeeklyPlanContract(i);
  assert.equal(result.ok, true, 'running strength remains feasible');
  assert.deepEqual(plain(result.contract.dayOptions.jueves.map(o => o.state)), ['REST']);
});

test('availability permits rest, does not impose the Analyzer recommendation or an exact training count', () => {
  const c = contract();
  assert.equal(api.validateWeeklySelection(c, selection(c)).ok, true);
  assert.equal(c.frequencyPolicy.maxExecutableDays, 6);
  assert.equal(c.frequencyPolicy.requireGenuineRest, true);
  assert.equal(api.validateWeeklySelection(c, selection(c, o => o[0])).errors[0], 'WEEKLY_NO_EXECUTABLE_SELECTION');
});

test('seven executable days reject, including feasible RECOVERY; REST is distinct', () => {
  const c = contract(false);
  const p = selection(c, options => options.find(o => o.state === 'RECOVERY') || options.find(o => o.state === 'TRAIN'));
  assert.equal(api.validateWeeklySelection(c, p).errors[0], 'WEEKLY_EXECUTABLE_LIMIT');
  p.selections[6].optionId = c.dayOptions.domingo[0].optionId;
  assert.equal(api.validateWeeklySelection(c, p).ok, true);
  const reduced = structuredClone(c); reduced.frequencyPolicy.maxExecutableDays = 5;
  assert.equal(api.validateWeeklySelection(reduced, p).errors[0], 'WEEKLY_EXECUTABLE_LIMIT');
});

for (const [name, mutate, error] of [
  ['invalid ID', p => { p.selections[0].optionId = 'invented'; }, 'WEEKLY_OPTION_NOT_ALLOWED'],
  ['cross-day ID', p => { p.selections[0].optionId = p.selections[1].optionId; }, 'WEEKLY_OPTION_NOT_ALLOWED'],
  ['stimulus tampering', p => { p.selections[0].stimulusId = 'base_aerobica'; }, 'WEEKLY_SLOT_SCHEMA_INVALID'],
  ['intent tampering', p => { p.selections[0].intent = {kind:'main_pattern',pattern:'squat'}; }, 'WEEKLY_SLOT_SCHEMA_INVALID'],
  ['state tampering', p => { p.selections[0].state = 'TRAIN'; }, 'WEEKLY_SLOT_SCHEMA_INVALID'],
  ['title promise', p => { p.selections[0].titulo_breve = 'Back squat progression'; }, 'WEEKLY_SLOT_SCHEMA_INVALID'],
  ['focus promise', p => { p.selections[0].focus = 'pierna'; }, 'WEEKLY_SLOT_SCHEMA_INVALID'],
  ['duplicate', p => { p.selections[1] = p.selections[0]; }, 'WEEKLY_DUPLICATE_DAY'],
  ['missing', p => { p.selections.pop(); }, 'WEEKLY_REQUIRES_SEVEN_DAYS'],
  ['wrong version', p => { p.contractVersion = 0; }, 'WEEKLY_SCHEMA_INVALID'],
  ['wrong digest', p => { p.contextDigest = 'other'; }, 'WEEKLY_SCHEMA_INVALID'],
]) test(`Planner ${name} rejects deterministically`, () => {
  const c = contract(), p = selection(c); mutate(p);
  assert.equal(api.validateWeeklySelection(c, p).errors[0], error);
});

test('protected states remain single options; contradictory frequency stops before composition', () => {
  const i = input(); i.fixed.lunes = {state:'REST'}; i.fixed.miercoles = {state:'UNAVAILABLE'};
  const c = api.buildAllowedWeeklyPlanContract(i).contract;
  assert.equal(c.dayOptions.lunes.length, 1); assert.equal(c.dayOptions.miercoles[0].state, 'UNAVAILABLE');
  const p = selection(c); p.selections[0].optionId = 'lunes:carrera:fuerza_corredor:generic';
  assert.equal(api.validateWeeklySelection(c, p).ok, false);
  const bad = input(false); bad.fixed = Object.fromEntries(days.map(day => [day, {state:'TRAIN', discipline: allowed.box.includes(day)?'box':'carrera'}]));
  assert.equal(api.buildAllowedWeeklyPlanContract(bad).code, 'WEEKLY_CONTRACT_UNSATISFIABLE');
});

test('two proposals maximum with identical immutable contract; invalid first selection is never patched', async () => {
  const c = contract(), prompts = [];
  const result = await api.composeBoundedWeek(c, async prompt => {
    prompts.push(prompt); const published = extractContract(prompt); c.frequencyPolicy.maxExecutableDays = 0;
    const p = selection(published); if (prompts.length === 1) p.selections[0].optionId = 'bad'; return JSON.stringify(p);
  });
  assert.equal(result.ok, true); assert.equal(result.attempts, 2);
  assert.deepEqual(extractContract(prompts[0]), extractContract(prompts[1]));
  assert.equal(Object.isFrozen(result.contract.dayOptions.jueves), true);
  let calls = 0; const failed = await api.composeBoundedWeek(contract(), async () => { calls++; return '{}'; });
  assert.equal(failed.code, 'WEEKLY_PLANNER_REJECTED'); assert.equal(calls, 2);
});

test('[object Object] root cause removed by structured serialization', () => {
  const raw = tables().usuarios.distribucion_semanal;
  assert.equal(`${raw}`, '[object Object]', 'the old interpolation coerced the availability object');
  const prompt = api.weeklyPlannerPrompt(contract());
  assert.equal(prompt.includes('[object Object]'), false);
  assert.deepEqual(extractContract(prompt), plain(contract()));
});

test('production server preparation reads bounded context and yields canonical v2-ready selection', async () => {
  const db = fakeDatabase(tables()), prompts = [];
  const result = await adapter.planBoundedWeek(db, 'test', request, async prompt => { prompts.push(prompt); return JSON.stringify(selection(extractContract(prompt))); });
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(prompts.length, 1);
  assert.equal(db.calls.filter(t => t === 'athlete_coaching_notes').length, 2, 'canonical restrictions plus bounded advisory notes');
  assert.equal(db.calls.filter(t => t === 'weekly_plan').length, 2, 'per discipline, not per option');
  const thursday = result.estructura.sessions.find(s => s.dia === 'jueves');
  assert.equal(thursday.state, 'TRAIN'); assert.equal(thursday.stimulusId, 'fuerza_maxima');
  assert.deepEqual(plain(thursday.intent), {kind:'stimulus_only'});
  assert.equal(thursday.focus, 'fuerza_maxima'); assert.equal(result.estructura.sessions.filter(s => s.tipo === 'descanso').length, 6);
});

test('no feasible managed option is rejected before any LLM call', async () => {
  const data = tables(); data.athlete_coaching_notes = Object.keys(load('movementLibrary').MOVEMENT_LIBRARY).map(movement => ({
    id: movement, movement, status:'pending', constraint_level:'hard' }));
  let calls = 0;
  const result = await adapter.planBoundedWeek(fakeDatabase(data), 'test', request, async () => { calls++; return '{}'; });
  assert.equal(result.code, 'WEEKLY_CONTRACT_UNSATISFIABLE'); assert.equal(calls, 0);
});

test('Focus external days and existing REST/completed sessions are preserved without rewriting', async () => {
  const data = tables(); data.usuarios.modo_entrada = 'focus'; data.usuarios.categoria = 'carrera';
  data.athlete_training_sources = [{disciplina:'carrera',owner:'forge',activo:true,dias:allowed.carrera},
    {disciplina:'box',owner:'external',activo:true,dias:['martes']}];
  data.external_training_records = [];
  const old = {dia:'domingo',tipo:'descanso',titulo:'Existing rest',descripcion:'preserved'};
  const p = await adapter.prepareAllowedWeeklyPlanContract(fakeDatabase(data), 'test', {...request, snapshot:{sessions:[old]}});
  assert.equal(p.ok, true, JSON.stringify(p));
  assert.equal(p.contract.dayOptions.martes[0].state, 'UNAVAILABLE');
  assert.equal(p.fixedSessions.martes.tipo, 'external_blocked'); assert.deepEqual(p.fixedSessions.domingo, old);
  const conflict = await adapter.prepareAllowedWeeklyPlanContract(fakeDatabase(data), 'test', {...request, snapshot:{sessions:[{dia:'martes',tipo:'descanso'}]}});
  assert.equal(conflict.code, 'WEEKLY_CONTRACT_UNSATISFIABLE');
});

test('infeasible protected RECOVERY stops before Planner instead of rebuilding or rewriting it', async () => {
  let calls = 0;
  const result = await adapter.planBoundedWeek(fakeDatabase(tables()), 'test', {...request,
    snapshot:{sessions:[{dia:'lunes',tipo:'carrera',stimulusId:'recuperacion_activa'}]}}, async () => {calls++;return '{}';});
  assert.equal(result.code, 'WEEKLY_CONTRACT_UNSATISFIABLE'); assert.equal(calls, 0);
});

const route = readFileSync('app/api/chat/route.ts', 'utf8');
const source = ts.createSourceFile('route.ts', route, ts.ScriptTarget.Latest, true);
function find(n) { if (ts.isIfStatement(n) && n.expression.getText(source) === 'action === "planificar_semana"') return n; return ts.forEachChild(n, find); }
const body = find(source).thenStatement.getText(source);
function strategicSelection(c) {
  const groups = c.strategy.coverage, memo = new Set();
  const bits = o => groups.reduce((mask, g, i) => mask | (o.intent?.kind === 'adaptation'
    && (!g.adaptationId || o.intent.adaptationId === g.adaptationId) && (!g.discipline || o.discipline === g.discipline) ? 1 << i : 0), 0);
  function search(index, count, mask, selections) {
    if (index === days.length) return mask === (1 << groups.length) - 1 && count > 0 ? selections : null;
    const key = `${index}:${count}:${mask}`; if (memo.has(key)) return null; memo.add(key);
    for (const option of c.dayOptions[days[index]]) {
      const nextCount = count + Number(['TRAIN', 'RECOVERY'].includes(option.state));
      if (nextCount > c.frequencyPolicy.maxExecutableDays) continue;
      const result = search(index + 1, nextCount, mask | bits(option), [...selections, { day: days[index], optionId: option.optionId }]);
      if (result) return result;
    }
    return null;
  }
  const selections = search(0, 0, 0, []); assert.ok(selections);
  return { contractVersion: 1, contextDigest: c.contextDigest, selections };
}
async function actualRoute(overrides = {}, invalid = false, goal = 'max_strength') {
  const data = tables(); data.usuarios.objetivo_principal = goal;
  let calls = 0; const db = fakeDatabase(data);
  const from = db.from.bind(db);
  db.from = table => { const query = from(table); query.lt = query.lte = () => query;
    if (['weekly_plan', 'physiology_records'].includes(table)) query.maybeSingle = async () => ({data:null,error:null}); return query; };
  const execute = vm.runInNewContext(compile(`async function execute() ${body}; execute;`), {
    datos:{weeklyContractVersion:1,generationToken:'test-token',targetWeekStart:'2026-09-07',empezarHoy:false,...overrides}, codigo:'test', supabase:db, apiKey:'test',
    resolveWeeklyGeneration:()=>({currentWeek:'2026-08-31',nextWeek:'2026-09-07',snapshots:{'2026-09-07':null}}),
    resolveCompletionDate:()=>({date:'2026-09-06'}), planBoundedWeek:adapter.planBoundedWeek,
    plannerProviderMetadata:load('../planning/weeklyPlannerDiagnostics').plannerProviderMetadata,
    issueWeeklyCalendar:load('../planning/weeklyCalendarAuthority').issueWeeklyCalendar,
    NextResponse:{json:v=>v}, fetch:async (_url, init)=>{calls++;const c=extractContract(JSON.parse(init.body).messages[0].content);
      return {ok:true,json:async()=>({content:[{text:invalid?'{}':JSON.stringify(strategicSelection(c))}]})};},
  });
  return {result:await execute(),calls,db};
}
test('actual route bounds retries server-side and issues the versioned calendar receipt', async () => {
  const good = await actualRoute(); assert.equal(good.result.ok,true,JSON.stringify(good.result)); assert.equal(good.calls,1);
  assert.equal(typeof good.result.estructura.calendarReceipt,'string');
  const failed = await actualRoute({},true); assert.equal(failed.calls,2); assert.equal(failed.result.retryable,false);
  const ui=readFileSync('app/FormaPro.tsx','utf8'); assert.equal(ui.includes('MAX_INTENTOS_BLUEPRINT'),false);
  assert.equal((body.match(/await planBoundedWeek/g)||[]).length,1);
});
test('old Planner clients fail closed before reads/LLM; no silent legacy schema downgrade', async () => {
  const legacy=await actualRoute({weeklyContractVersion:undefined});
  assert.equal(legacy.result.code,'WEEKLY_CLIENT_UPGRADE_REQUIRED'); assert.equal(legacy.calls,0); assert.equal(legacy.db.calls.length,0);
});
test('actual strategic route requires a primary goal even when Analyzer proposes one', async () => {
  const result = await actualRoute({ analisis: { goal: 'crossfit' } }, false, null);
  assert.equal(result.result.code, 'GOAL_MISSING'); assert.equal(result.calls, 0);
  assert.equal(result.result.goalRequirement.canPlanTowardDeclaredGoal, false);
});

for (const thrown of [false, true]) test(`actual client transport never retries Planner after ${thrown ? 'network ambiguity' : 'HTTP failure'}`, async () => {
  const ui = readFileSync('app/FormaPro.tsx','utf8');
  const start = ui.indexOf('const apiCall=async('), end = ui.indexOf('\n  const recuperarPorEmail', start);
  let calls = 0;
  const call = vm.runInNewContext(compile(ui.slice(start, end) + '\napiCall;'), {
    fetch: async () => { calls++; if (thrown) throw new Error('ambiguous'); return {ok:false}; },
    setTimeout: fn => fn(),
  });
  await call({action:'planificar_semana'});
  assert.equal(calls,1);
});

test('calendar safety counts executable recovery after receipt admission too', () => {
  const s = days.map(dia => ({dia,tipo:allowed.box.includes(dia)?'box':'carrera',
    ...(!allowed.box.includes(dia)?{stimulusId:'recuperacion_activa'}:{})}));
  assert.equal(load('../planning/weeklyCalendar').validateWeeklyCalendar(s,6,allowed).ok,false);
});

test('high observed frequency uses the existing five-day ceiling, never Analyzer four', async () => {
  const data=tables(); data.usuarios.perfil.dias=6;
  data.usuarios.workout_history=Array.from({length:6},()=>({fecha:new Date().toISOString()}));
  const prepared=await adapter.prepareAllowedWeeklyPlanContract(fakeDatabase(data),'test',request);
  assert.equal(prepared.ok,true); assert.equal(prepared.contract.frequencyPolicy.maxExecutableDays,5);
});

test('genuine rest is enforced independently when external days occupy the non-executable slot', () => {
  const i=input(false); i.fixed.domingo={state:'UNAVAILABLE'};
  const c=api.buildAllowedWeeklyPlanContract(i).contract;
  const p=selection(c,options=>options.find(o=>o.state==='RECOVERY')||options.find(o=>o.state==='TRAIN')||options[0]);
  assert.equal(api.validateWeeklySelection(c,p).errors[0],'WEEKLY_REST_REQUIRED');
  p.selections[0].optionId=c.dayOptions.lunes[0].optionId;
  assert.equal(api.validateWeeklySelection(c,p).ok,true);
});

test('past days and explicit skip-today are fixed without inventing training', async () => {
  const p=await adapter.prepareAllowedWeeklyPlanContract(fakeDatabase(tables()),'test',{...request,today:'2026-09-09'});
  assert.equal(p.ok,true); assert.equal(p.contract.frequencyPolicy.requireGenuineRest,false);
  for(const day of ['lunes','martes','miercoles']) assert.equal(p.fixedSessions[day].tipo,'sin_registrar');
});

test('server output preserves completed data and protected pending recovery exactly', async () => {
  const data=tables(); data.athlete_coaching_notes=[];
  const old={dia:'lunes',tipo:'carrera',stimulusId:'recuperacion_activa',titulo:'original',descripcion:'unchanged'};
  const completed={dia:'jueves',tipo:'box',completada:true,titulo:'completed',descripcion_real:'original'};
  const result=await adapter.planBoundedWeek(fakeDatabase(data),'test',{...request,today:'2026-09-10',empezarHoy:true,snapshot:{sessions:[old,completed]}},async prompt=>{
    const c=extractContract(prompt);return JSON.stringify(selection(c,(options,day)=>options.find(o=>day==='viernes'&&o.state==='TRAIN')||options[0]));
  });
  assert.equal(result.ok,true,JSON.stringify(result));
  for(const original of [old,completed]) {
    const {weeklyProtected,...actual}=result.estructura.sessions.find(s=>s.dia===original.dia);
    assert.equal(weeklyProtected,true);assert.deepEqual(plain(actual),original);
  }
});

test('Builder receives and independently checks canonical state and intent v2 without weekly cryptographic binding', async () => {
  const server=load('sessionAuthority');let calls=0;
  const bad=await server.generateTrainingSession(fakeDatabase(tables()),'test',{
    targetWeekStart:'2026-09-07',day:'jueves',discipline:'box',stimulus:'fuerza_maxima',state:'REST',intent:{kind:'stimulus_only'},
  },async()=>{calls++;return '{}';});
  assert.equal(bad.errors[0],'SESSION_STATE_MISMATCH');assert.equal(calls,0);
  const good=await server.generateTrainingSession(fakeDatabase(tables()),'test',{
    targetWeekStart:'2026-09-07',day:'jueves',discipline:'box',stimulus:'fuerza_maxima',state:'TRAIN',intent:{kind:'stimulus_only'},
  },async prompt=>JSON.stringify(completeDoseFixture(JSON.parse(prompt.split('CONTRACT:\n')[1].split('\nContexto no autoritativo:')[0]),{stimulusId:'fuerza_maxima',structureId:'strength_sets',blocks:['warmup','main','cooldown'].map(blockType=>({
    blockType,movements:[{movementId:'bench_press',prescription:{reps:5}}],
  }))})));
  assert.equal(good.ok,true,JSON.stringify(good));assert.equal(good.trainingContract.contractVersion,3);
});

test('client cannot replace a canonical selection or persist the Analyzer prose as its objective', () => {
  const ui=readFileSync('app/FormaPro.tsx','utf8');
  const root=ts.createSourceFile('FormaPro.tsx',ui,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function findOrchestrator(n) {
    if(ts.isVariableDeclaration(n)&&n.name.getText(root)==='orquestarGeneracionSemana')return n;
    return ts.forEachChild(n,findOrchestrator);
  }
  const code=findOrchestrator(root).initializer.body.getText(root);
  assert.equal(code.includes('regenerar_sesion_disciplina_forzada'),false);
  assert.equal(code.includes('week_objective:analisis.objetivo'),false);
  assert.match(code,/week_objective:estructura.strategy.adaptacion_principal/);
  assert.match(code,/if\(!resultadoIntegridad.valido && resultadoIntegridad.diasCorregir.length>0\) return null/);
});

for (const [day,tipo,completed,allowed] of [
 ['lunes','box',true,true],['miercoles','box',true,false],['miercoles','descanso',false,true],['domingo','unavailable',false,true],
]) test(`future completion invariant: ${day} ${tipo} completed=${completed}`,async()=>{
 const data=tables();data.athlete_coaching_notes=[];
 const original={dia:day,tipo,completada:completed,titulo:'preserved',descripcion:'original'};
 const snapshot={sessions:[original]},before=JSON.stringify(snapshot);
 const r=await adapter.loadWeeklyPlanningContext(fakeDatabase(data),'test',{...request,today:'2026-09-07',empezarHoy:true,snapshot});
 assert.equal(r.ok,allowed,JSON.stringify(r));assert.equal(JSON.stringify(snapshot),before);
 if(allowed && completed) assert.deepEqual(plain(r.fixedSessions[day]),original);
 else if(allowed) assert.equal(r.fixedSessions[day],undefined);
 else {assert.ok(r.errors.includes('FUTURE_COMPLETION_NOT_ALLOWED'));assert.equal(r.diagnostic.derivedCivilDate,'2026-09-09');}
});

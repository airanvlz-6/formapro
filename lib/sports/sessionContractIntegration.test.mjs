import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import { sportsRuntime, compile, contractFixture, fakeDatabase } from './trainingContractTestRuntime.mjs';
const route = readFileSync('app/api/chat/route.ts', 'utf8');
const root = ts.createSourceFile('route.ts', route, ts.ScriptTarget.Latest, true);
function find(node, pred) { if (pred(node)) return node; return ts.forEachChild(node, n => find(n, pred)); }
const body = find(root, n => ts.isIfStatement(n) && n.expression.getText(root) === 'action === "construir_sesion_dia"').thenStatement.getText(root);
const load = sportsRuntime();
async function run(overrides = {}, options = {}) {
  let calls = 0;
  const profile = { modo_entrada: options.mode || 'planificacion', categoria: 'box', athlete_development: [], ...options.profile };
  const db = fakeDatabase({ usuarios: profile, athlete_training_sources: options.sources || [], weekly_plan: [], external_training_records: [] });
  const execute = vm.runInNewContext(compile(`async function execute() ${body}; execute;`), {
    codigo: 'u', datos: { dia: 'martes', tipo: 'box', focus: 'fuerza_maxima', stimulusId: 'fuerza_maxima', titulo_breve: 'Fuerza',
      targetWeekStart: '2026-08-31', generationToken: 'server-token', ...overrides }, supabase: db, apiKey: 'test',
    console: { log() {}, error() {} }, NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) },
    getCanonicalRestrictions: async () => contractFixture().restrictionsSnapshot,
    resolveWeeklyGeneration: token => { if (token !== 'server-token') throw new Error('INVALID_WEEK_GENERATION_CONTEXT'); return { currentWeek: '2026-08-31', nextWeek: '2026-09-07' }; },
    prepareSessionTrainingContract: load('prepareSessionTrainingContract').prepareSessionTrainingContract,
    validateAllowedTrainingContract: load('allowedTrainingContract').validateAllowedTrainingContract,
    buildAthleteSnapshot: async () => ({ ultimas_5_sesiones: [] }),
    detectarSesionDuplicada: () => ({ esDuplicado: !!options.retry, similitudMaxima: 0.9 }),
    validarCoherenciaEstimulo: load('movementLibrary').validarCoherenciaEstimulo,
    getMovimientosPorEstimulo: load('movementLibrary').getMovimientosPorEstimulo,
    MOVEMENT_LIBRARY: load('movementLibrary').MOVEMENT_LIBRARY,
    evaluarSustitucion: load('substitutionEngine').evaluarSustitucion,
    fetch: async () => { calls++; return { json: async () => ({ content: [{ text: JSON.stringify({ titulo: 'Fuerza', calentamiento: 'Movilidad', bloque_principal: 'Back squat 3x5', vuelta_calma: 'Respiración' }) }] }) }; },
  });
  return { result: await execute(), calls, db };
}
for (const [name, input, options] of [
  ['unresolved stimulus', { stimulusId: 'misterio' }, {}],
  ['outside managed scope', { tipo: 'carrera', stimulusId: 'base_aerobica' }, {}],
  ['missing token', { generationToken: null }, {}],
  ['target outside attestation', { targetWeekStart: '2027-01-04' }, {}],
  ['supervision even with forged request ownership', { managedDisciplines: ['box'], mode: 'coach' }, { mode: 'supervision' }],
  ['consulta', {}, { mode: 'consulta' }],
  ['Focus external box', {}, { mode: 'focus', sources: [{ disciplina: 'running', owner: 'forge', activo: true, dias: ['martes'] }, { disciplina: 'box', owner: 'external', activo: true, dias: ['lunes'] }] }],
]) test(`actual Builder: ${name} calls no LLM`, async () => {
  const { result, calls } = await run(input, options); assert.equal(result.body.ok, false, JSON.stringify(result));
  assert.equal(result.body.code, 'TRAINING_CONTRACT_INVALID'); assert.equal(calls, 0); assert.equal(result.status, 200);
});
test('actual valid Builder retains current JSON generation and structured contract separately', async () => {
  const { result, calls } = await run(); assert.equal(result.body.ok, true, JSON.stringify(result)); assert.equal(calls, 1);
  assert.match(result.body.sesion.descripcion, /Back squat/); assert.ok(result.body.trainingContract.allowedMovementIds.length > 5);
  assert.equal(result.body.sesion.trainingContract, undefined); assert.equal(result.body.trainingContract.targetWeekStart, '2026-08-31');
});
test('retry follows preflight and carries the same structured contract', async () => {
  const { result, calls } = await run({}, { retry: true }); assert.equal(result.body.ok, true, JSON.stringify(result));
  assert.equal(calls, 2); assert.equal(result.body.sesion.regenerada_por_duplicado, true); assert.ok(result.body.trainingContract);
});
test('Orchestrator transports signed target and explicit stimulus; Planner requests canonical IDs', () => {
  const client = readFileSync('app/FormaPro.tsx', 'utf8');
  assert.match(client, /targetWeekStart:weekStartOrchestrator/); assert.match(client, /stimulusId:diaEstructura.stimulusId/);
  assert.match(route, /Añade a CADA sesión de entrenamiento un campo "stimulusId"/);
  assert.ok(body.indexOf('validateAllowedTrainingContract') < body.indexOf('await fetch'));
  assert.doesNotMatch(body, /estimulosDisciplina.find|focusNormalizado.includes/);
});
test('foundation has no writer and leaves identity/CAS infrastructure byte-identical to HEAD', () => {
  for (const name of ['planPersistence', 'planMutation', 'prescriptionIdentity', 'prepareWeeklyCandidate', 'weeklyGeneration', 'planMutationValidators', 'planValidationPipeline', 'planMutationTypes']) {
    const file = `lib/planning/${name}.ts`;
    const head = execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' });
    assert.equal(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), head.replace(/\r\n/g, '\n'), file);
  }
  for (const name of ['prescriptionScope', 'allowedTrainingContract', 'prepareSessionTrainingContract', 'movementRestrictionPolicy']) {
    const source = readFileSync(`lib/sports/${name}.ts`, 'utf8');
    assert.doesNotMatch(source, /\.(insert|update|upsert|delete|rpc)\s*\(/); assert.doesNotMatch(source, /session_id|training_executions|prescription_execution_relations/);
  }
});
for (const s of Object.values(load('movementLibrary').STIMULUS_LIBRARY)) test(`actual Builder accepts advertised ${s.id} before LLM composition`, async () => {
  const { result, calls } = await run({ tipo: s.discipline, stimulusId: s.id }, { profile: { categoria: s.discipline } });
  assert.equal(result.body.ok, true, JSON.stringify(result)); assert.equal(calls, 1);
  assert.equal(result.body.trainingContract.stimulusId, s.id);
});
test('actual UI callers settle loading and show a failure message once when the proposal rejects', async () => {
  const client = readFileSync('app/FormaPro.tsx', 'utf8');
  const ast = ts.createSourceFile('FormaPro.tsx', client, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const focusCaller = find(ast, n => ts.isArrowFunction(n) && n.body.getText(ast).includes('const planFocusInicial=await orquestarGeneracionSemana(true)')
    && !n.body.getText(ast).includes('useEffect'));
  const chatCaller = find(ast, n => ts.isVariableDeclaration(n) && n.name.getText(ast) === 'dispararGeneracion').initializer;
  // Select the innermost Focus async arrow, not the enclosing effect callback.
  const focusAsync = find(focusCaller, n => ts.isArrowFunction(n) && n.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword));
  for (const caller of [focusAsync, chatCaller]) {
    assert.ok(caller); let pending = false, messages = [], calls = 0;
    const execute = vm.runInNewContext(compile(`const run = ${caller.getText(ast)}; run;`), {
      orquestarGeneracionSemana: async () => { calls++; return null; },
      setGenerandoSemana: value => { pending = value; }, setMensajes: value => { messages = typeof value === 'function' ? value(messages) : value; },
      empezarHoyReal: true, historial: [], mensajeDisplayConfirmacion: 'si', codigoUsuario: 'u', setHistorial() {}, apiCall: async () => ({ ok: true }),
    });
    await execute(); assert.equal(pending, false); assert.equal(calls, 1);
    assert.equal(messages.filter(m => m.content.includes('Hubo un problema')).length, 1);
    assert.ok(!messages.some(m => m.content.includes('Semana generada y guardada')));
  }
});
test('actual apiCall delivers contract rejection once without retry or timer', async () => {
  const client = readFileSync('app/FormaPro.tsx', 'utf8');
  const ast = ts.createSourceFile('FormaPro.tsx', client, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = find(ast, n => ts.isVariableDeclaration(n) && n.name.getText(ast) === 'apiCall');
  let calls = 0;
  const execute = vm.runInNewContext(compile(`const apiCall = ${declaration.initializer.getText(ast)}; apiCall;`), {
    codigoUsuario: 'u', fetch: async () => { calls++; return { ok: true, json: async () => ({ ok: false, code: 'TRAINING_CONTRACT_INVALID', errors: ['MOVEMENT_POOL_EMPTY'] }) }; },
    setTimeout: () => { throw new Error('must not retry'); },
  });
  const result = await execute({ action: 'construir_sesion_dia' }); assert.equal(result.code, 'TRAINING_CONTRACT_INVALID'); assert.equal(calls, 1);
});
test('Orchestrator stops on rejected/missing sessions rather than saving an incomplete proposal', () => {
  const client = readFileSync('app/FormaPro.tsx', 'utf8');
  const ast = ts.createSourceFile('FormaPro.tsx', client, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const guard = find(ast, n => ts.isIfStatement(n) && n.expression.getText(ast).startsWith('resultadosParalelos.some'));
  assert.ok(guard);
  for (const [results, expected] of [[[{ ok: false, code: 'TRAINING_CONTRACT_INVALID' }], null], [[{ ok: true }], null], [[{ ok: true, sesion: {} }], 'continue']]) {
    const run = vm.runInNewContext(compile(`function execute(){${guard.getText(ast)}; return 'continue';} execute;`), { resultadosParalelos: results, console: { error() {} } });
    assert.equal(run(), expected);
  }
});

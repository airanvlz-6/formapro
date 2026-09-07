import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createHmac } from 'node:crypto';
import { sportsRuntime, contractFixture, fakeDatabase, compile, plain, completeDoseFixture } from './trainingContractTestRuntime.mjs';
const load = sportsRuntime();
const { generateTrainingSession, assertFreshSessionRestrictions, verifySessionReceipt, admitSessionContent, assertCurrentPrescriptionScope } = load('sessionAuthority');
const request = { targetWeekStart: '2026-08-31', day: 'martes', discipline: 'box', stimulus: 'fuerza_maxima' };
const tables = { usuarios: { modo_entrada: 'planificacion', categoria: 'box' }, weekly_plan: [], athlete_training_sources: [], external_training_records: [] };
const db = (overrides = {}, fail) => fakeDatabase({ ...tables, ...overrides }, fail);
const response = (prompt, invalid = false) => {
  const c = JSON.parse(prompt.split('CONTRACT:\n')[1].split('\nContexto no autoritativo:')[0]);
  return JSON.stringify(completeDoseFixture(c, { stimulusId: c.stimulusId, structureId: c.allowedStructureIds[0], blocks: ['warmup', 'main', 'cooldown']
    .map(blockType => ({ blockType, movements: [{ movementId: invalid ? 'invented' : c.allowedMovementIds[0], prescription: { reps: 5 } }] })) }));
};
const issue = async (database = db()) => generateTrainingSession(database, 'u', request, async prompt => response(prompt));
test('real adapter issues evidence only after validated structured generation', async () => {
  const result = await issue(); assert.equal(result.ok, true, JSON.stringify(result));
  const verified = verifySessionReceipt(result.sesion.sessionReceipt, result.sesion, 'u', request.targetWeekStart);
  assert.equal(verified.descripcion, result.sesion.descripcion); assert.equal(verified.sessionReceipt, undefined);
});
test('client modified contract/pool cannot authorize altered sports content', async () => {
  const result = plain(await issue()); result.trainingContract.allowedMovementIds.push('invented');
  result.sesion.descripcion += '\nInvented 5x5';
  assert.throws(() => verifySessionReceipt(result.sesion.sessionReceipt, result.sesion, 'u', request.targetWeekStart), /CONTENT_MISMATCH/);
});
test('new receipt rejects changed structured dose and restores absent metadata only at explicit scalar transport boundary', async () => {
  const out = await issue(), s = out.sesion;
  const changed = plain(s); changed.structuredPrescription.proposal.blocks[1].movements[0].prescription.reps = 100;
  assert.throws(() => verifySessionReceipt(changed.sessionReceipt, changed, 'u', request.targetWeekStart), /CONTENT_MISMATCH/);
  const scalar = Object.fromEntries(['dia','tipo','titulo','descripcion','por_que','debilidad_relacionada'].map(k => [k,s[k]]));
  assert.throws(() => verifySessionReceipt(s.sessionReceipt, scalar, 'u', request.targetWeekStart), /CONTENT_MISMATCH/);
  const restored = verifySessionReceipt(s.sessionReceipt, scalar, 'u', request.targetWeekStart, undefined, true);
  assert.deepEqual(plain(restored.structuredPrescription), plain(s.structuredPrescription));
});
test('changed benchmark or time budget revokes fresh session dose before save', async () => {
  for (const change of [p => p.perfil.duracion = '45 min', p => p.test_atleta = { back_squat: 150 }]) {
    const profile = { modo_entrada: 'planificacion', categoria: 'box', perfil: { duracion: '60 min' } };
    const database = db({ usuarios: profile }), out = await issue(database);
    assert.equal(out.ok, true); change(profile);
    await assert.rejects(() => assertFreshSessionRestrictions(database, 'u', request.targetWeekStart, out.sesion), /SESSION_DOSE_CONTEXT_CHANGED/);
  }
});
test('forged validation receipt, MAC, payload, user, target week, target day and expired receipt reject', async () => {
  const result = await issue(); const s = result.sesion;
  for (const receipt of [null, { valid: true }, 'valid', s.sessionReceipt + '.extra', s.sessionReceipt.slice(0, -2) + 'xx'])
    assert.throws(() => verifySessionReceipt(receipt, s, 'u', request.targetWeekStart));
  const [payload, mac] = s.sessionReceipt.split('.'); const forged = JSON.parse(Buffer.from(payload, 'base64url'));
  forged.contract.allowedMovementIds.push('invented');
  assert.throws(() => verifySessionReceipt(Buffer.from(JSON.stringify(forged)).toString('base64url') + '.' + mac, s, 'u', request.targetWeekStart), /RECEIPT_INVALID/);
  assert.throws(() => verifySessionReceipt(s.sessionReceipt, s, 'another-user', request.targetWeekStart), /CONTEXT_MISMATCH/);
  assert.throws(() => verifySessionReceipt(s.sessionReceipt, s, 'u', '2026-09-07'), /CONTEXT_MISMATCH/);
  assert.throws(() => verifySessionReceipt(s.sessionReceipt, { ...s, dia: 'miercoles' }, 'u', request.targetWeekStart), /CONTENT_MISMATCH/);
  class FutureDate extends Date { static now() { return Date.now() + 31 * 60_000; } }
  assert.throws(() => sportsRuntime({ Date: FutureDate })('sessionAuthority').verifySessionReceipt(s.sessionReceipt, s, 'u', request.targetWeekStart), /CONTEXT_MISMATCH/);
});
test('no signing secret never returns a successful generated session', async () => {
  const noSecret = sportsRuntime({ process: { env: {} } })('sessionAuthority');
  const result = await noSecret.generateTrainingSession(db(), 'u', request, async p => response(p));
  assert.equal(result.ok, false); assert.ok(result.errors.includes('SESSION_AUTHORITY_UNAVAILABLE'));
});
for (const table of ['usuarios', 'athlete_state_events', 'athlete_coaching_notes', 'athlete_training_sources', 'external_training_records', 'weekly_plan'])
  test(`${table} read failure cannot issue evidence`, async () => {
    let calls = 0; const result = await generateTrainingSession(db(table === 'external_training_records' ? { athlete_training_sources: [{ disciplina: 'carrera', owner: 'external', activo: true, dias: ['jueves'] }] } : {}, table), 'u', request, async p => { calls++; return response(p); });
    assert.equal(result.ok, false); assert.equal(result.sesion, undefined); assert.equal(calls, 0);
  });
test('scope revocation blocks a previously valid receipt without replacing original contract', async () => {
  await assertCurrentPrescriptionScope(db(), 'u', 'box');
  await assert.rejects(assertCurrentPrescriptionScope(db({ usuarios: { modo_entrada: 'supervision', categoria: 'box' } }), 'u', 'box'), /SCOPE_REVOKED/);
});
test('admission strips scientific notes, arbitrary metadata and transient evidence', async () => {
  const result = await issue(); const s = admitSessionContent({ ...result.sesion, notas_validador: ['add snatch'], calentamiento: 'run 100 km', entrenamiento: 'evil' }, 'u', request.targetWeekStart);
  assert.deepEqual(Object.keys(s).sort(), ['dia', 'tipo', 'titulo', 'por_que', 'descripcion', 'debilidad_relacionada', 'intent', 'stimulusId', 'structuredPrescription'].sort());
  assert.doesNotMatch(s.descripcion, /snatch|100 km/);
});
test('non-sports labels cannot smuggle a prescription into the week', () => {
  const malicious = { dia: 'martes', tipo: 'descanso', titulo: 'Snatch', descripcion: 'Snatch 50x50' };
  assert.doesNotMatch(admitSessionContent(malicious, 'u', request.targetWeekStart).descripcion, /Snatch/);
  assert.throws(() => admitSessionContent({ ...malicious, tipo: 'external_blocked' }, 'u', request.targetWeekStart), /EXTERNAL_SLOT_NOT_AUTHORIZED/);
  assert.throws(() => admitSessionContent({ ...malicious, tipo: 'box', titulo: 'Sin registrar' }, 'u', request.targetWeekStart), /RECEIPT_REQUIRED/);
  assert.equal(admitSessionContent({ ...malicious, tipo: 'box', titulo: 'Sin registrar' }, 'u', request.targetWeekStart, { pastDay: true }).tipo, 'sin_registrar');
  assert.doesNotMatch(admitSessionContent(malicious, 'u', request.targetWeekStart, { externalDiscipline: 'box' }).descripcion, /Snatch/);
});

// Execute actual action ASTs, with real sports adapter/validator/receipt and isolated I/O.
const source = readFileSync('app/api/chat/route.ts', 'utf8');
const root = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
function find(n, predicate) { if (predicate(n)) return n; return ts.forEachChild(n, c => find(c, predicate)); }
const body = action => find(root, n => ts.isIfStatement(n) && n.expression.getText(root) === `action === "${action}"`).thenStatement.getText(root);
function execute(action, datos, database, extras = {}) {
  return vm.runInNewContext(compile(`async function run() ${body(action)}; run;`), {
    datos, codigo: 'u', pendingId: 'p', supabase: database, apiKey: 'test', console: { log() {}, error() {} }, structuredClone, Object,
    NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) },
    generateTrainingSession, assertFreshSessionRestrictions, verifySessionReceipt, admitSessionContent, assertCurrentPrescriptionScope,
    canonicalDiscipline: load('prescriptionScope').canonicalDiscipline, STIMULUS_LIBRARY: load('movementLibrary').STIMULUS_LIBRARY,
    resolveWeeklyGeneration: () => ({ currentWeek: '2026-08-31', nextWeek: '2026-09-07', snapshots: { '2026-08-31': null } }),
    ...extras,
  })();
}
for (const mode of ['planificacion', 'focus', 'supervision']) for (const invalid of [false, true])
  test(`actual forced generator ${mode}, invalid=${invalid}`, async () => {
    let calls = 0;
    const database = db({ usuarios: { modo_entrada: mode, categoria: 'box' }, athlete_training_sources: mode === 'focus' ? [{ disciplina: 'box', owner: 'forge', activo: true, dias: ['martes'] }] : [] });
    const result = await execute('regenerar_sesion_disciplina_forzada', { dia: 'martes', disciplinaForzada: 'box', stimulusId: 'fuerza_maxima', targetWeekStart: '2026-08-31' }, database,
      { fetch: async (_url, init) => { calls++; return { ok: true, json: async () => ({ content: [{ text: response(JSON.parse(init.body).messages[0].content, invalid) }] }) }; } });
    assert.equal(result.body.ok, mode !== 'supervision' && !invalid, JSON.stringify(result));
    if (mode === 'supervision') assert.equal(calls, 0);
    if (result.body.ok) assert.ok(result.body.sesion.sessionReceipt);
  });

function routeDB({ session, pending, mode = 'planificacion' } = {}) {
  const writes = [];
  const database = { writes, from(table) {
    let method = 'select', payload;
    const read = single => {
      if (method !== 'select') { writes.push({ table, method, payload }); return { data: { id: 'p' }, error: null }; }
      if (table === 'usuarios') return { data: { modo_entrada: mode, categoria: 'box' }, error: null };
      if (table === 'weekly_plan') return { data: single ? { sessions: [session], week_start: request.targetWeekStart } : [], error: null };
      if (table === 'pending_actions') return { data: single ? pending : [], error: null };
      if (table === 'physiology_records' && single) return { data: null, error: null };
      return { data: [], error: null, count: 0 };
    };
    const q = { select() { return q; }, eq() { return q; }, in() { return q; }, lt() { return q; }, lte() { return q; }, order() { return q; }, limit() { return q; }, range() { return q; }, gte() { return q; },
      update(v) { method = 'update'; payload = v; return q; }, insert(v) { method = 'insert'; payload = v; return q; },
      single: async () => read(true), maybeSingle: async () => read(true), then: (yes, no) => Promise.resolve(read(false)).then(yes, no) };
    return q;
  } };
  return database;
}
for (const mode of ['planificacion', 'supervision']) for (const invalid of [false, true])
  test(`actual Coach modification ${mode}, invalid=${invalid}`, async () => {
    const database = routeDB({ mode, session: { dia: 'martes', tipo: 'box', titulo: 'Old', descripcion: 'Original' } });
    let calls = 0;
    const result = await execute('verificar_modificacion_sesion_deterministico', { mensajeUsuario: 'Cambia mi sesión del martes', respuestaCoach: 'Propondré otra sesión de fuerza.', weekStartActual: request.targetWeekStart }, database, {
      generarEstadoCanonico: async () => ({ dia_semana_hoy: 'martes', dia_semana_manana: 'miercoles' }),
      fetch: async (_url, init) => {
        calls++; const prompt = JSON.parse(init.body).messages[0].content;
        const text = calls === 1 ? JSON.stringify({ trigger: 'user_request', confidence: 1 }) : calls === 2
          ? JSON.stringify({ anuncia_modificacion: true, dia: 'martes', stimulusId: 'fuerza_maxima' }) : response(prompt, invalid);
        return { ok: true, json: async () => ({ content: [{ text }] }) };
      },
    });
    assert.equal(result.body.ok, mode !== 'supervision' && !invalid, JSON.stringify(result));
    if (result.body.ok) {
      const inserted = database.writes.find(w => w.method === 'insert').payload.accion;
      assert.ok(inserted.sessionReceipt); assert.equal(verifySessionReceipt(inserted.sessionReceipt, inserted, 'u', request.targetWeekStart).descripcion, inserted.descripcion);
    } else assert.equal(database.writes.length, 0);
  });
test('legacy prose proposal cannot create a successful pending action', async () => {
  const database = routeDB(); const r = await execute('detectar_propuesta_sesion', {}, database);
  assert.equal(r.body.ok, false); assert.equal(database.writes.length, 0);
});
test('client pending action cannot fabricate a receipt', async () => {
  const database = routeDB(); const r = await execute('guardar_pending_action', { tipo: 'modificar_sesion', accion: { dia: 'martes', week_start: request.targetWeekStart, descripcion: 'free exercise' } }, database);
  assert.equal(r.body.ok, false); assert.equal(database.writes.length, 0);
});
test('pending confirmation rejects unvalidated prescription before mutation gate or writes', async () => {
  const database = routeDB({ session: { dia: 'martes', tipo: 'box', titulo: 'Old', descripcion: 'Old' }, pending: {
    id: 'p', user_codigo: 'u', estado: 'pendiente', tipo: 'modificar_sesion', accion: { week_start: request.targetWeekStart, dia: 'martes', tipo: 'box', titulo: 'New', descripcion: 'Unvalidated' },
  } });
  const r = await execute('confirmar_pending_action', {}, database, { validatePlanMutation: () => { throw new Error('must not reach persistence gate'); } });
  assert.equal(r.body.ok, false); assert.equal(r.body.code, 'SESSION_RECEIPT_REQUIRED'); assert.equal(database.writes.length, 0);
});
for (const action of ['confirmar_pending_action', 'actualizar_sesion_plan']) test(`${action} restores verified structured dose into mutation candidate`, async () => {
  const out = await issue(), s = out.sesion;
  const scalar = Object.fromEntries(['tipo','titulo','descripcion','por_que','debilidad_relacionada'].map(k => [k,s[k]]));
  const database = routeDB({ session: { dia: 'martes', tipo: 'box', titulo: 'Old', descripcion: 'Old' }, pending: {
    id: 'p', user_codigo: 'u', estado: 'pendiente', tipo: 'modificar_sesion', accion: { ...scalar, dia: 'martes', week_start: request.targetWeekStart, sessionReceipt: s.sessionReceipt },
  } });
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-09-01T12:00:00Z'])); } }
  let reached = false;
  await execute(action, { dia: 'martes', cambios: scalar, sessionReceipt: s.sessionReceipt }, database, { Date: FixedDate,
    validatePlanMutation: async value => { reached = true;
      assert.deepEqual(plain(value.candidate.sessions[0].structuredPrescription), plain(s.structuredPrescription));
      return { status: 'rejected', violations: [] }; },
  });
  assert.equal(reached, true); assert.equal(database.writes.length, 0);
  const contract = load('allowedTrainingContract').buildAllowedTrainingContract(contractFixture()).contract;
  const proposal = { stimulusId: contract.stimulusId, structureId: 'strength_sets', blocks: ['warmup','main','cooldown'].map(blockType => ({
    blockType, movements: [{ movementId: 'bench_press', prescription: { reps: 5 } }] })) };
  const legacy = load('structuredSession').renderContractSession(contract, proposal);
  const payload = Buffer.from(JSON.stringify({ userCodigo: 'u', expiresAt: Date.now() + 60000, contract, proposal })).toString('base64url');
  const receipt = payload + '.' + createHmac('sha256', 'isolated-sports-test-key').update('forge-session-contract-v1:' + payload).digest('base64url');
  const oldScalar = Object.fromEntries(['tipo','titulo','descripcion','por_que','debilidad_relacionada'].map(k => [k,legacy[k]]));
  const legacyDB = routeDB({ session: s, pending: { id: 'p', user_codigo: 'u', estado: 'pendiente', tipo: 'modificar_sesion',
    accion: { ...oldScalar, dia: 'martes', week_start: request.targetWeekStart, sessionReceipt: receipt } } });
  reached = false;
  await execute(action, { dia: 'martes', cambios: oldScalar, sessionReceipt: receipt }, legacyDB, { Date: FixedDate,
    validatePlanMutation: async value => { reached = true; assert.equal(value.candidate.sessions[0].structuredPrescription, null);
      assert.equal(value.candidate.sessions[0].intent, null); return { status: 'rejected', violations: [] }; },
  });
  assert.equal(reached, true); assert.equal(legacyDB.writes.length, 0);
});
test('direct text patch rejects before mutation gate or writes', async () => {
  const database = routeDB({ session: { dia: 'martes', tipo: 'box', titulo: 'Old', descripcion: 'Old' } });
  const r = await execute('actualizar_sesion_plan', { dia: 'martes', cambios: { descripcion: 'Unvalidated' } }, database,
    { validatePlanMutation: () => { throw new Error('must not reach persistence gate'); } });
  assert.equal(r.body.ok, false); assert.equal(r.body.code, 'SESSION_RECEIPT_REQUIRED'); assert.equal(database.writes.length, 0);
});
test('actual final weekly gate checks content after transformations and before identity admission', async () => {
  const generated = await issue();
  for (const invalid of [false, true]) {
    const database = routeDB(); const sessions = [{ ...generated.sesion, notas_validador: ['add invented exercise'] }];
    if (invalid) sessions[0].descripcion += ' tampered';
    let admitted = false;
    const r = await execute('guardar_plan_semana', { plan: { week_start: request.targetWeekStart, sessions } }, database, {
      resolveWeeklyGeneration: () => ({ currentWeek: '2026-08-31', nextWeek: '2026-09-07', snapshots: { '2026-08-31': { revision: 4, sessions: [] } } }),
      prepareWeeklyEntries: s => s.map(session => ({ kind: 'new', session })), entrySession: e => e.session,
      getCanonicalRestrictions: async () => contractFixture().restrictionsSnapshot,
      buildFocusContext: async () => ({ esModoFocus: false, disciplinasExternas: [] }),
      assertWeeklyCalendar: async () => {}, // Calendar integration is exercised in weeklyCalendar.test.mjs.
      admittedWeekObjective: (_receipt, _user, _week, legacy) => legacy,
      admitWeeklyCandidate: proposal => { admitted = true; assert.equal(proposal.sessions[0].notas_validador, undefined);
        assert.equal(proposal.sessions[0].sessionReceipt, undefined); assert.equal(proposal.sessions[0].descripcion, generated.sesion.descripcion); return { noOp: true }; },
    });
    assert.equal(admitted, !invalid, JSON.stringify(r)); assert.equal(database.writes.length, 0);
    if (invalid) assert.equal(r.body.code, 'SESSION_CONTENT_MISMATCH');
  }
});
test('scientific client rules only receive a detached copy of accepted prescriptions', () => {
  const text = readFileSync('app/FormaPro.tsx', 'utf8');
  const ast = ts.createSourceFile('FormaPro.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const call = find(ast, n => ts.isCallExpression(n) && n.expression.getText(ast) === 'aplicarTodasLasReglas');
  const sessions = [{ dia: 'martes', descripcion: 'Server-rendered' }];
  vm.runInNewContext(compile(call.getText(ast)), { sesionesCompletas: sessions, structuredClone,
    analisis: {}, estructura: {}, esDeload: false, hayLesionLumbarActiva: false, estadoFisiologico: {}, estadoCanonico: {}, debilidades: [], historialFisiologico: [],
    aplicarTodasLasReglas: ctx => { ctx.sesiones[0].descripcion = 'unauthorized new movement'; },
  });
  assert.equal(sessions[0].descripcion, 'Server-rendered');
});
test('unrepresented new Coach injury cannot issue a sports session or write a pending', async () => {
  const database = routeDB(); let calls = 0;
  const r = await execute('verificar_modificacion_sesion_deterministico', { mensajeUsuario: 'Me duele la rodilla', respuestaCoach: 'Revisemos la sesión.' }, database, {
    fetch: async () => { calls++; return { json: async () => ({ content: [{ text: JSON.stringify({ trigger: 'injury', confidence: 1 }) }] }) }; },
  });
  assert.equal(r.body.ok, false); assert.equal(r.body.code, 'MODIFICATION_CONSTRAINT_UNREPRESENTED'); assert.equal(calls, 1); assert.equal(database.writes.length, 0);
});
test('throwing profile transport returns an explicit failure without generating', async () => {
  const r = await generateTrainingSession({ from() { throw new Error('transport'); } }, 'u', request, () => { throw new Error('must not generate'); });
  assert.equal(r.ok, false); assert.equal(r.code, 'SESSION_AUTHORITY_FAILED');
});
test('restriction changes after generation reject before persistence; unchanged authority passes', async () => {
  const generated = await issue();
  await assertFreshSessionRestrictions(db(), 'u', request.targetWeekStart, generated.sesion);
  const changed = db({athlete_state_events:[{id:'new',activo:true,estado:'restricted',body_area:'rodilla'}]});
  await assert.rejects(assertFreshSessionRestrictions(changed,'u',request.targetWeekStart,generated.sesion),/RESTRICTIONS_CHANGED_REGENERATE/);
  await assert.rejects(assertFreshSessionRestrictions(db({},'athlete_coaching_notes'),'u',request.targetWeekStart,generated.sesion),/RESTRICTIONS/);
});
test('actual final weekly route rejects legacy calendar evidence before identity admission', async () => {
  const generated = await issue();
  const days = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
  const calendarDB = fakeDatabase({usuarios:{modo_entrada:'planificacion',categoria:'box',perfil:{dias:6},workout_history:[],distribucion_semanal:{box:days}},athlete_training_sources:[]});
  const authority = load('../planning/weeklyCalendarAuthority');
  const sessions = days.map(dia=>({dia,tipo:'descanso',titulo:'Descanso',descripcion:'Rest'}));
  const calendarReceipt = await authority.issueWeeklyCalendar(calendarDB,'u',request.targetWeekStart,sessions);
  sessions[1]=generated.sesion;
  const database=routeDB(); let admitted=false;
  const r=await execute('guardar_plan_semana',{plan:{week_start:request.targetWeekStart,sessions},calendarReceipt},database,{
    prepareWeeklyEntries:s=>s.map(session=>({kind:'new',session})),entrySession:e=>e.session,
    getCanonicalRestrictions:async()=>contractFixture().restrictionsSnapshot,
    buildFocusContext:async()=>({esModoFocus:false,disciplinasExternas:[]}),
    assertWeeklyCalendar:(_db,...args)=>authority.assertWeeklyCalendar(calendarDB,...args),
    admitWeeklyCandidate:()=>{admitted=true;throw new Error('must not admit');},
  });
  assert.equal(r.body.ok,false);assert.match(r.body.code,/WEEKLY_RECEIPT_UPGRADE_REQUIRED/);
  assert.equal(admitted,false);assert.equal(database.writes.length,0);
});

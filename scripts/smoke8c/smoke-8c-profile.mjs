// FORGE BUILD 8C-A — SCRIPT A: Supabase smoke test of the canonical athlete profile (USER-RUN ONLY).
//
//   node --env-file=.env.local scripts/smoke8c/smoke-8c-profile.mjs
//
// Needs `npm run dev` running locally (same .env.local). Creates two throw-away users (`forge-8c-smoke-*@…`), exercises the real
// routes GET/PATCH /api/athlete/profile, inspects the real stores with the service role, then deletes everything it created.
// See docs/smoke-8c-validation.md.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  SmokeGuardError, resolveSmokeConfig, createRedactor, createCleanupLedger, createReporter, createHttp, createSupabaseClients,
  createSmokeUser, cleanupHandlers, verifyCleanup, snapshotAthlete, check, deepEqual, sortKeys,
} from './common.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let redact = text => String(text).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]');
const print = line => console.log(redact(line));

let config;
try { config = resolveSmokeConfig(process.env); }
catch (error) {
  if (error instanceof SmokeGuardError) { console.error('ABORT — smoke test guards failed:\n  - ' + error.problems.join('\n  - ')); process.exit(2); }
  throw error;
}
redact = createRedactor(config.secrets);

const OBJECTIVE = 'Preparar las pruebas físicas de Policía Nacional';
const OBJECTIVE_B = 'Objetivo usuario B (smoke 8C)';
const FORBIDDEN_GET_KEYS = ['admin', 'premium', 'auth_user_id', 'id', 'codigo', 'legacyCodigo', 'email', 'stripe', 'stripe_customer_id', 'historial', 'token', 'notes'];
const SELECT_STAR = /\.select\(\s*(['"`])\*\1/;
const SOURCE_FILES = ['lib/athlete/profileHandler.ts', 'lib/athlete/canonicalProfileService.ts', 'lib/athlete/canonicalProfile.ts',
  'lib/athlete/restrictionEditor.ts', 'lib/athlete/getCanonicalRestrictions.ts'];
// perfil keys the profile editor is ALLOWED to change; everything else in perfil must be byte-identical.
const EDITOR_PERFIL_KEYS = new Set(['edad', 'nivel', 'duracion', 'objetivo_general', 'objetivo_principal', 'prescription_signals']);

const ledger = createCleanupLedger();
const reporter = createReporter(print);
const http = createHttp(config.baseUrl, redact);
const clients = await createSupabaseClients(config);
const admin = clients.admin;
const state = { notes: [] };

const route = (user, method, body) => http.request('/api/athlete/profile', { method, token: user?.token, body });
const patch = (user, body) => route(user, 'PATCH', body);
const read = user => snapshotAthlete(admin, user.codigo);
const stripPerfil = perfil => Object.fromEntries(Object.entries(perfil ?? {}).filter(([k]) => !EDITOR_PERFIL_KEYS.has(k)));
const nonEquipmentSignals = perfil => Object.fromEntries(Object.entries(perfil?.prescription_signals ?? {}).filter(([k]) => !k.startsWith('equipment.')));
const expectStatus = (res, status, label) => check(res.status === status, `${label}: expected HTTP ${status}, got ${res.status} (${res.json?.code ?? res.json?.error ?? ''})`);
const sameRows = (a, b) => deepEqual(a, b);

try {
  print(`FORGE 8C-A smoke — app ${config.baseUrl} — Supabase host ${config.host}\n`);
  let A, B, before, bBefore;

  await reporter.stage('S0 create isolated test users A and B (real identity route)', async () => {
    A = await createSmokeUser({ config, clients, http, ledger, label: 'a' });
    B = await createSmokeUser({ config, clients, http, ledger, label: 'b' });
    check(A.codigo !== B.codigo && A.authUserId !== B.authUserId, 'users are not distinct');
    const row = await read(A);
    check(row.row.modo_entrada === 'free' && row.row.admin === false, `new athlete should be Free and non-admin (mode=${row.row.modo_entrada})`);
    return `A=${A.codigo} B=${B.codigo}`;
  });
  if (!A || !B) throw new Error('cannot continue without users');

  await reporter.stage('S0b seed sentinel values (marks / HR refs / history / premium / unrelated perfil) via service role', async () => {
    const seeded = [], skipped = [];
    const attempt = async (name, values) => { const r = await admin.from('usuarios').update(values).eq('codigo', A.codigo).eq('auth_user_id', A.authUserId);
      (r.error ? skipped : seeded).push(name); };
    await attempt('premium', { premium: true });
    await attempt('datos_entrenamiento', { datos_entrenamiento: { fc_max: '190', fc_reposo: '48', sentinel: '8c-smoke' } });
    await attempt('marcas', { marcas: [{ sentinel: '8c-smoke', ejercicio: 'back_squat', valor: 100 }] });
    await attempt('historial', { historial: [{ sentinel: '8c-smoke' }] });
    await attempt('marcas_especificas', { marcas_especificas: { sentinel: '8c-smoke', back_squat_1rm: '100' } });
    await attempt('historial_marcas', { historial_marcas: [{ sentinel: '8c-smoke' }] });
    await attempt('perfil', { perfil: { sentinel_unrelated: { keep: true, n: 7 }, prescription_signals: { 'capability.canMeasureHeartRate': { state: 'available', updatedAt: '2026-01-01T00:00:00.000Z' } } } });
    check(seeded.includes('perfil'), 'could not seed perfil sentinel');
    return `seeded=${seeded.join(',')}${skipped.length ? ` skipped(type/column)=${skipped.join(',')}` : ''}`;
  });

  await reporter.stage('S0c snapshot BEFORE (A and B)', async () => {
    before = await read(A); bBefore = await read(B);
    return `A perfil keys=${Object.keys(before.row.perfil ?? {}).join(',')}`;
  });

  // ------------------------------------------------------------------ 1. GET
  await reporter.stage('S1 GET /api/athlete/profile (Free): whitelist shape, no private keys', async () => {
    const res = await route(A, 'GET'); expectStatus(res, 200, 'GET');
    const p = res.json?.profile; check(res.json?.ok === true && p, 'GET did not return { ok, profile }');
    check(p.mode === 'free', `mode should be free, got ${p.mode}`);
    check(p.planningProfileStatus?.ready === false && Array.isArray(p.planningProfileStatus?.missingFields), 'planningProfileStatus shape');
    for (const k of ['planStructure', 'prescriptionParameters', 'context', 'editableFields', 'unsupported']) check(k in p, `profile.${k} missing`);
    const text = JSON.stringify(res.json);
    const leaked = FORBIDDEN_GET_KEYS.filter(k => new RegExp(`"${k}"\\s*:`).test(text));
    check(!leaked.length, `GET leaks private keys: ${leaked.join(',')}`);
    check(!text.includes(A.codigo) && !text.includes(A.authUserId) && !text.includes(A.email), 'GET leaks identity values');
    check(Array.isArray(p.planStructure.equipment) && p.planStructure.equipment.length === 0, 'Free user should read equipment []');
    check(p.planStructure.restrictionsStatus === 'KNOWN' && p.planStructure.restrictions.length === 0, 'Free user should read restrictions [] (KNOWN)');
    return `keys=${Object.keys(p).join(',')}`;
  });

  // ------------------------------------------------------------------ activation NOT_READY first
  await reporter.stage('S2 activation of an incomplete Free profile is NOT_READY and changes nothing', async () => {
    const res = await patch(A, { activate: { mode: 'coach' } });
    check(res.json?.activation?.status === 'NOT_READY', `expected activation.status NOT_READY, got ${res.status} ${JSON.stringify(res.json?.activation ?? res.json?.code)}`);
    check(Array.isArray(res.json.activation.missingFields) && res.json.activation.missingFields.length > 0, 'NOT_READY must list missingFields');
    const now = await read(A); check(now.row.modo_entrada === 'free', `mode must stay free, got ${now.row.modo_entrada}`);
    return `missing=${res.json.activation.missingFields.join(',')}`;
  });

  // ------------------------------------------------------------------ 2. category / specialty
  await reporter.stage('S3 category alone is rejected (needs a specialty of that category) with zero writes', async () => {
    const pre = await read(A); const res = await patch(A, { profile: { category: 'funcional' } });
    expectStatus(res, 400, 'category without specialty');
    const post = await read(A); check(sameRows(pre, post), 'rejected payload wrote data');
    return res.json?.errors?.map(e => e.code).join(',');
  });
  await reporter.stage('S4 PATCH category + specialty persist in usuarios.categoria / usuarios.especialidad', async () => {
    const res = await patch(A, { profile: { category: 'funcional', specialty: 'funcional_fitness' } }); expectStatus(res, 200, 'category+specialty');
    const row = (await read(A)).row;
    check(row.categoria === 'funcional' && row.especialidad === 'funcional_fitness', `stored ${row.categoria}/${row.especialidad}`);
    check(res.json.profile.planStructure.category === 'funcional' && res.json.profile.planStructure.specialty === 'funcional_fitness', 'response not re-read from DB');
    const only = await patch(A, { profile: { specialty: 'funcional_crossfit' } }); expectStatus(only, 200, 'specialty alone');
    check((await read(A)).row.especialidad === 'funcional_crossfit', 'specialty-only PATCH not persisted');
    const back = await patch(A, { profile: { specialty: 'funcional_fitness' } }); expectStatus(back, 200, 'specialty back');
    return 'funcional / funcional_fitness';
  });

  // ------------------------------------------------------------------ 3. objective
  await reporter.stage('S5 PATCH objective persists in usuarios.objetivo_principal (no duplicated perfil copies)', async () => {
    const res = await patch(A, { profile: { objective: OBJECTIVE } }); expectStatus(res, 200, 'objective');
    const row = (await read(A)).row;
    check(row.objetivo_principal?.descripcion === OBJECTIVE, `objetivo_principal.descripcion = ${JSON.stringify(row.objetivo_principal)}`);
    check(!('objetivo_general' in (row.perfil ?? {})) && !('objetivo_principal' in (row.perfil ?? {})), 'duplicated perfil.objetivo_* still present');
    check(res.json.profile.planStructure.objective === OBJECTIVE && res.json.profile.planStructure.objectiveCanonical === true, 'objective not read back as canonical');
    return 'usuarios.objetivo_principal.descripcion';
  });

  await reporter.stage('S5b objective-only PATCH on a LARGE perfil (~24KB) is 200, not a false 409; unrelated perfil preserved; profileChange returned', async () => {
    const before = (await read(A)).row;
    const big = { ...(before.perfil ?? {}), sentinel_large: Array.from({ length: 60 }, (_, i) => ({ i, text: 'ñ"\\'.repeat(100) })) };
    const seeded = await admin.from('usuarios').update({ perfil: big }).eq('codigo', A.codigo).eq('auth_user_id', A.authUserId);
    check(!seeded.error, 'could not seed large perfil');
    const next = `${OBJECTIVE} (large)`;
    const res = await patch(A, { profile: { objective: next } }); expectStatus(res, 200, 'objective on large perfil (a 409 here = whole-row CAS regression or RPC missing)');
    const row = (await read(A)).row;
    check(row.objetivo_principal?.descripcion === next, 'objective not persisted');
    check(JSON.stringify(row.perfil.sentinel_large) === JSON.stringify(big.sentinel_large), 'large unrelated perfil changed');
    check(res.json.profileChange?.changedFields?.[0]?.field === 'objective' && res.json.profileChange.requiresCoachReview === true, 'profileChange missing');
    const restore = await patch(A, { profile: { objective: OBJECTIVE } }); expectStatus(restore, 200, 'restore objective');
    return 'forge_profile_apply scoped CAS';
  });

  // ------------------------------------------------------------------ 4. structure
  await reporter.stage('S6 PATCH age / level / sessionDuration / weeklyAvailability / trainingSources', async () => {
    const days = ['lunes', 'martes', 'miercoles', 'viernes', 'sabado'];
    const res = await patch(A, { profile: { age: '31-40', level: 'Intermedio', sessionDuration: 'Hasta 1h 30min', weeklyAvailability: { days },
      trainingSources: [{ owner: 'forge', discipline: 'box', days: ['lunes', 'miercoles', 'viernes'] }, { owner: 'forge', discipline: 'carrera', days: ['martes', 'sabado'] }] } });
    expectStatus(res, 200, 'structure');
    const snap = await read(A);
    check(snap.row.perfil.edad === '31-40' && snap.row.perfil.nivel === 'Intermedio' && snap.row.perfil.duracion === 'Hasta 1h 30min', `perfil edad/nivel/duracion = ${snap.row.perfil.edad}/${snap.row.perfil.nivel}/${snap.row.perfil.duracion}`);
    check(snap.row.distribucion_semanal != null, 'distribucion_semanal not written');
    const active = snap.sources.filter(s => s.activo !== false).map(s => s.disciplina).sort();
    check(deepEqual(active, ['box', 'carrera']), `athlete_training_sources = ${active.join(',')}`);
    return `sources=${active.join('+')} distribucion_semanal=${JSON.stringify(snap.row.distribucion_semanal)}`;
  });

  // ------------------------------------------------------------------ 5. restrictions
  await reporter.stage('S7 restrictions write → athlete_coaching_notes + athlete_state_events → read-back', async () => {
    const res = await patch(A, { profile: { restrictions: [{ area: 'rodilla', description: 'Smoke 8C restriction (test)' }] } }); expectStatus(res, 200, 'restrictions write');
    const ps = res.json.profile.planStructure;
    check(ps.restrictionsStatus === 'KNOWN' && ps.restrictions.length === 1, `API read-back restrictions=${JSON.stringify(ps.restrictions)}`);
    const snap = await read(A);
    const notes = snap.notes.filter(n => n.status !== 'resuelta'), events = snap.events.filter(e => e.activo === true);
    check(notes.length >= 1 && notes.every(n => n.constraint_level === 'hard'), `athlete_coaching_notes active=${notes.length} (hard expected)`);
    check(events.length === 1, `athlete_state_events active=${events.length} (exactly 1 expected)`);
    state.notes = notes.map(n => n.id);
    const again = await patch(A, { profile: { restrictions: [{ area: 'rodilla', description: 'Smoke 8C restriction (test)' }] } }); expectStatus(again, 200, 'idempotent restriction');
    const afterNotes = (await read(A)).notes.filter(n => n.status !== 'resuelta');
    check(afterNotes.length === notes.length, `identical restriction not idempotent (${notes.length} → ${afterNotes.length})`);
    return `notes(active)=${notes.length} events(active)=${events.length} area=${ps.restrictions[0].area}`;
  });
  await reporter.stage('S8 restrictions=[] is accepted, closes the active set (history kept), reads back as []', async () => {
    const res = await patch(A, { profile: { restrictions: [] } }); expectStatus(res, 200, 'restrictions []');
    const ps = res.json.profile.planStructure; check(ps.restrictionsStatus === 'KNOWN' && ps.restrictions.length === 0, 'restrictions not [] after clear');
    const snap = await read(A);
    check(snap.events.filter(e => e.activo === true).length === 0, 'athlete_state_events still active');
    check(snap.notes.every(n => n.status === 'resuelta'), 'athlete_coaching_notes not closed');
    check(snap.notes.length >= 1, 'history was deleted instead of kept');
    const noop = await patch(A, { profile: { restrictions: [] } }); expectStatus(noop, 200, 'restrictions [] when none');
    return 'closed (status resuelta), history kept';
  });

  // ------------------------------------------------------------------ 6. equipment
  await reporter.stage('S9 equipment write → perfil.prescription_signals["equipment.<id>"]; other signals untouched', async () => {
    const res = await patch(A, { profile: { equipment: [{ id: 'barra', state: 'unavailable' }, { id: 'rack', state: 'available' }] } }); expectStatus(res, 200, 'equipment write');
    const perfil = (await read(A)).row.perfil, s = perfil.prescription_signals ?? {};
    check(s['equipment.barra']?.state === 'unavailable' && s['equipment.rack']?.state === 'available', `signals = ${JSON.stringify(s)}`);
    check(s['capability.canMeasureHeartRate']?.state === 'available', 'unrelated capability signal was modified');
    const got = res.json.profile.planStructure.equipment.map(e => `${e.id}:${e.state}`).sort();
    check(deepEqual(got, ['barra:unavailable', 'rack:available']), `API equipment = ${got.join(',')}`);
    return 'equipment.barra=unavailable, equipment.rack=available';
  });
  await reporter.stage('S10 equipment=[] clears only explicit declarations, never writes "no equipment"', async () => {
    const res = await patch(A, { profile: { equipment: [] } }); expectStatus(res, 200, 'equipment []');
    const perfil = (await read(A)).row.perfil, s = perfil.prescription_signals ?? {};
    const declared = Object.entries(s).filter(([k, v]) => k.startsWith('equipment.') && ['available', 'unavailable'].includes(v?.state));
    check(declared.length === 0, `explicit equipment declarations remain: ${declared.map(([k]) => k).join(',')}`);
    check(s['capability.canMeasureHeartRate']?.state === 'available', 'capability signal changed by equipment []');
    check(res.json.profile.planStructure.equipment.length === 0, 'API equipment not []');
    return 'no equipment.* declarations';
  });

  // ------------------------------------------------------------------ 7. invalid payloads
  await reporter.stage('S11 invalid payloads → 4xx and ZERO writes (full-row compare after each)', async () => {
    const bad = [
      ['unknown category', { profile: { category: 'natacion' } }],
      ['specialty of another category', { profile: { specialty: 'carrera' } }],
      ['objective too short', { profile: { objective: 'x' } }],
      ['null field', { profile: { objective: null } }],
      ['bad weekday', { profile: { weeklyAvailability: { days: ['funday'] } } }],
      ['unknown equipment id', { profile: { equipment: [{ id: 'jetpack', state: 'available' }] } }],
      ['bad restriction area', { profile: { restrictions: [{ area: 'cerebro', description: 'x' }] } }],
      ['forbidden key: marks', { profile: { marks: { back_squat: 200 } } }],
      ['forbidden key: hrMax', { profile: { hrMax: 200 } }],
      ['forbidden key: modo_entrada', { profile: { modo_entrada: 'coach' } }],
      ['forbidden top-level codigo', { codigo: B.codigo, profile: { objective: 'Hacked objective' } }],
      ['forbidden top-level email', { email: B.email, profile: { objective: 'Hacked objective' } }],
      ['empty body', {}],
      ['invalid activation mode', { activate: { mode: 'admin' } }],
    ];
    const pre = await read(A);
    for (const [name, body] of bad) {
      const res = await patch(A, body);
      check(res.status >= 400 && res.status < 500, `${name}: expected 4xx, got ${res.status}`);
      const post = await read(A); check(sameRows(pre, post), `${name}: a rejected payload changed stored data`);
    }
    return `${bad.length} payloads rejected, row identical after each`;
  });

  // ------------------------------------------------------------------ 8. activation
  await reporter.stage('S12 Free → planning activation with equipment=[] and restrictions=[] → ACTIVATED, planningProfileStatus ready', async () => {
    const res = await patch(A, { profile: { equipment: [], restrictions: [] }, activate: { mode: 'coach' } });
    expectStatus(res, 200, 'activation');
    check(res.json.activation?.status === 'ACTIVATED', `activation = ${JSON.stringify(res.json.activation)}`);
    const row = (await read(A)).row; check(row.modo_entrada === 'coach', `modo_entrada=${row.modo_entrada}`);
    const got = await route(A, 'GET'); const st = got.json.profile.planningProfileStatus;
    check(st.ready === true && st.mode === 'coach' && st.missingFields.length === 0, `planningProfileStatus = ${JSON.stringify(st)}`);
    check(!st.missingFields.some(f => /equip|restric|lesion/i.test(f)), 'equipment/restrictions must never be required');
    const twice = await patch(A, { activate: { mode: 'coach' } });
    check(twice.json?.activation?.status === 'ALREADY_ACTIVE', `second activation = ${twice.json?.activation?.status}`);
    return 'modo_entrada free → coach; second call ALREADY_ACTIVE';
  });

  // ------------------------------------------------------------------ 9. isolation
  await reporter.stage('S13 auth isolation: no/garbage token, body cannot select the athlete, A never mutates B', async () => {
    const noAuth = await route(null, 'GET'); expectStatus(noAuth, 401, 'no token');
    const garbage = await route({ token: 'not-a-token' }, 'GET'); check([401, 403].includes(garbage.status), `garbage token → ${garbage.status}`);
    const bSet = await patch(B, { profile: { objective: OBJECTIVE_B } }); expectStatus(bSet, 200, 'B own objective');
    const bMid = await read(B);
    const rogue = [{ codigo: B.codigo, profile: { objective: 'A writes B' } }, { profile: { codigo: B.codigo, objective: 'A writes B' } },
      { email: B.email, profile: { objective: 'A writes B' } }, { athleteId: B.athleteId, profile: { objective: 'A writes B' } }];
    for (const body of rogue) { const res = await patch(A, body); check(res.status >= 400 && res.status < 500, `rogue body accepted (${res.status})`); }
    const bAfter = await read(B); check(sameRows(bMid, bAfter), 'user B row changed after A\'s requests');
    const aGet = await route(A, 'GET'); check(aGet.json.profile.planStructure.objective === OBJECTIVE, 'A GET did not return A\'s own objective');
    const bGet = await route(B, 'GET'); check(bGet.json.profile.planStructure.objective === OBJECTIVE_B, 'B GET did not return B\'s own objective');
    check(!JSON.stringify(aGet.json).includes(OBJECTIVE_B), 'A response contains B data');
    const aRow = (await read(A)).row; check(aRow.objetivo_principal?.descripcion === OBJECTIVE, 'A objective was overwritten by B\'s write');
    return 'B row identical after A\'s attempts; each token only sees its own athlete';
  });

  // ------------------------------------------------------------------ 10. preservation
  await reporter.stage('S14 preservation: marks, HR refs, history, premium/admin, identity and unrelated perfil unchanged', async () => {
    const after = await read(A);
    for (const column of ['codigo', 'auth_user_id', 'email', 'admin', 'premium', 'marcas', 'historial', 'marcas_especificas', 'datos_entrenamiento', 'historial_marcas', 'test_atleta'])
      check(deepEqual(before.row[column], after.row[column]), `usuarios.${column} changed`);
    check(deepEqual(stripPerfil(before.row.perfil), stripPerfil(after.row.perfil)), `unrelated perfil data changed: before=${JSON.stringify(stripPerfil(before.row.perfil))} after=${JSON.stringify(stripPerfil(after.row.perfil))}`);
    check(deepEqual(nonEquipmentSignals(before.row.perfil), nonEquipmentSignals(after.row.perfil)), 'non-equipment prescription_signals changed');
    const get = (await route(A, 'GET')).json.profile.prescriptionParameters;
    check(get.hrMax && 'marks' in get, 'prescriptionParameters not readable');
    return 'identical (hrMax read-back: ' + JSON.stringify(get.hrMax.value) + ')';
  });

  // ------------------------------------------------------------------ 11. static
  await reporter.stage('S15 no select("*") in the profile read/write path (static source check)', async () => {
    const offenders = SOURCE_FILES.filter(file => SELECT_STAR.test(readFileSync(join(root, file), 'utf8')));
    check(!offenders.length, `select("*") found in: ${offenders.join(', ')}`);
    return `${SOURCE_FILES.length} files clean`;
  });

  await reporter.stage('S16 storage confirmation (read from the real stores)', async () => {
    const snap = await read(A), s = snap.row.perfil.prescription_signals ?? {};
    return [`objetivo_principal.descripcion="${snap.row.objetivo_principal?.descripcion}"`, `categoria/especialidad=${snap.row.categoria}/${snap.row.especialidad}`,
      `prescription_signals keys=${Object.keys(s).join(',')}`, `coaching_notes=${snap.notes.length}(all closed)`, `state_events=${snap.events.length}(none active)`,
      `training_sources=${snap.sources.map(x => x.disciplina).join('+')}`].join(' | ');
  });
} finally {
  print('\n--- cleanup ---');
  const report = await ledger.run(cleanupHandlers(admin));
  for (const r of report) print(`${r.ok ? 'OK  ' : 'FAIL'} cleanup ${r.kind} ${r.ref} — ${r.detail}`);
  let leftovers = [];
  try { leftovers = await verifyCleanup(admin, ledger); } catch (error) { leftovers = [`verification error: ${error?.message}`]; }
  if (leftovers.length) { print(`CLEANUP INCOMPLETE — remove manually: ${leftovers.join(', ')}`); reporter.stages.push({ name: 'cleanup verification', ok: false }); }
  else print('Cleanup verified: no rows or auth users created by this run remain.');
  const { total, passed, failed } = reporter.summary();
  print(`\nSUMMARY: ${passed}/${total} stages passed${failed.length ? ` — FAILED: ${failed.map(f => f.name.split(' ')[0]).join(', ')}` : ''}`);
  print(`Created and removed: ${ledger.entries().map(e => `${e.kind}:${e.ref}`).join(', ') || '(nothing)'}`);
  process.exitCode = failed.length || leftovers.length ? 1 : 0;
}

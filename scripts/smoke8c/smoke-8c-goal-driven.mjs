// FORGE BUILD 8C-A — SCRIPT B: real-LLM goal-driven weekly planning smoke (USER-RUN ONLY, spends LLM tokens).
//
//   node --env-file=.env.local scripts/smoke8c/smoke-8c-goal-driven.mjs
//
// Drives the SAME server pipeline the web client uses, through the real /api/chat actions (no manual prompt, no parallel API):
//   preparar_generacion_semana → preflight_generacion_semana → analizar_bloque_semana (Block Analyzer, LLM)
//   → planificar_semana (Weekly Coach, LLM + deterministic admission).
// It stops after the Weekly Coach step (no session Builder calls, nothing is saved to weekly_plan by the script).
// The athlete is a throw-away user created through the real routes and deleted at the end.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import {
  SmokeGuardError, resolveSmokeConfig, createRedactor, createCleanupLedger, createReporter, createHttp, createSupabaseClients,
  createSmokeUser, cleanupHandlers, verifyCleanup, snapshotAthlete, check, deepEqual,
} from './common.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let redact = text => String(text).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]');
const print = line => console.log(redact(line));

let config;
try { config = resolveSmokeConfig(process.env, { llm: true }); }
catch (error) {
  if (error instanceof SmokeGuardError) { console.error('ABORT — smoke test guards failed:\n  - ' + error.problems.join('\n  - ')); process.exit(2); }
  throw error;
}
redact = createRedactor(config.secrets);

// ---- scenario (all overridable, defaults = the Policía Nacional case) ---------------------------------------------------
const OBJECTIVE = process.env.FORGE_SMOKE_OBJECTIVE || 'Preparar las pruebas físicas de Policía Nacional';
const SPECIALTY = process.env.FORGE_SMOKE_SPECIALTY || 'funcional_fitness';
const CATEGORY = SPECIALTY.startsWith('hibrido') ? 'hibrido' : SPECIALTY.startsWith('fuerza') ? 'fuerza' : SPECIALTY === 'carrera' ? 'carrera' : 'funcional';
// Real contract options: 'Hasta 30 min' | 'Hasta 45 min' | 'Hasta 1 hora' | 'Hasta 1h 30min' | 'Más de 1h 30min' (no 60–75 option).
const SESSION_DURATION = process.env.FORGE_SMOKE_SESSION_DURATION || 'Hasta 1 hora';
const DURATION_MAX_MIN = { 'Hasta 30 min': 30, 'Hasta 45 min': 45, 'Hasta 1 hora': 60, 'Hasta 1h 30min': 90 }[SESSION_DURATION] ?? null;
const BOX_DAYS = ['lunes', 'miercoles', 'viernes'], RUN_DAYS = ['martes', 'sabado'], ALL_DAYS = [...BOX_DAYS, ...RUN_DAYS];
const ENVIRONMENT = process.env.FORGE_SMOKE_ENVIRONMENT || 'box'; // perfil.lugar_entreno is single-valued in the real storage

const ledger = createCleanupLedger();
const reporter = createReporter(print);
const http = createHttp(config.baseUrl, redact);
const clients = await createSupabaseClients(config);
const admin = clients.admin;
const norm = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const compact = (v, n = 600) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n) + '…' : s; };
const profileRoute = (user, method, body) => http.request('/api/athlete/profile', { method, token: user.token, body });
const chat = (user, action, datos) => http.request('/api/chat', { method: 'POST', token: user.token, body: { action, codigo: user.codigo, ...(datos ? { datos } : {}) } });

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name), st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}
const DIAGNOSTICS = [];                    // every response, for the "no STRATEGY_UNSUPPORTED / no equipment question" scans
const calls = {};                          // step → response
const nonWorkout = s => ['descanso', 'external_blocked', 'sin_registrar', 'unavailable'].includes(s?.tipo) || ['REST', 'UNAVAILABLE'].includes(s?.state);
const dayKey = d => norm(d);
let user, profileBefore, snapBefore, gr, sessions = [], estructura, allowed = {}, humanBlock = [];

try {
  print(`FORGE 8C-A goal-driven smoke — app ${config.baseUrl} — Supabase host ${config.host}`);
  print(`Scenario: "${OBJECTIVE}" | specialty=${SPECIALTY} (category=${CATEGORY}) | sources=box+carrera | environment=${ENVIRONMENT} | 5 days | ${SESSION_DURATION} | equipment=[] | restrictions=[]\n`);

  await reporter.stage('B0 app reachable and auth enforced (GET /api/athlete/profile without token → 401)', async () => {
    const res = await http.request('/api/athlete/profile'); check(res.status === 401, `expected 401, got ${res.status}`);
  });

  await reporter.stage('B1 create isolated Free test athlete (real identity route)', async () => {
    user = await createSmokeUser({ config, clients, http, ledger, label: 'gd' }); return user.codigo;
  });
  if (!user) throw new Error('cannot continue without the test athlete');

  await reporter.stage('B2 set the athlete through the REAL canonical profile route and activate planning', async () => {
    const res = await profileRoute(user, 'PATCH', { profile: { category: CATEGORY, specialty: SPECIALTY, objective: OBJECTIVE, age: '31-40', level: 'Intermedio',
      sessionDuration: SESSION_DURATION, weeklyAvailability: { days: ALL_DAYS },
      trainingSources: [{ owner: 'forge', discipline: 'box', days: BOX_DAYS }, { owner: 'forge', discipline: 'carrera', days: RUN_DAYS }],
      equipment: [], restrictions: [] }, activate: { mode: 'coach' } });
    check(res.status === 200 && res.json?.ok, `profile PATCH failed (${res.status} ${res.json?.code ?? ''} ${compact(res.json?.errors ?? '')})`);
    check(res.json.activation?.status === 'ACTIVATED', `activation = ${compact(res.json.activation)}`);
    check(res.json.profile.planStructure.equipment.length === 0 && res.json.profile.planStructure.restrictions.length === 0, 'equipment/restrictions should read []');
    return `mode=${res.json.profile.mode}`;
  });

  await reporter.stage('B3 declare the training environment (perfil.lugar_entreno via service role: not editable through the 8C-A route)', async () => {
    const row = await admin.from('usuarios').select('perfil').eq('codigo', user.codigo).eq('auth_user_id', user.authUserId).single();
    check(!row.error, `read perfil failed: ${row.error?.message}`);
    const write = await admin.from('usuarios').update({ perfil: { ...(row.data.perfil ?? {}), lugar_entreno: ENVIRONMENT } }).eq('codigo', user.codigo).eq('auth_user_id', user.authUserId);
    check(!write.error, `write failed: ${write.error?.message}`); return `lugar_entreno=${ENVIRONMENT}`;
  });

  await reporter.stage('B4 snapshot BEFORE the pipeline (profile + raw stores)', async () => {
    const got = await profileRoute(user, 'GET'); check(got.status === 200, `GET ${got.status}`);
    profileBefore = got.json.profile; snapBefore = await snapshotAthlete(admin, user.codigo);
    check(profileBefore.planningProfileStatus.ready === true, `planningProfileStatus not ready: ${compact(profileBefore.planningProfileStatus)}`);
    return `ready=${profileBefore.planningProfileStatus.ready}`;
  });

  // ------------------------------------------------------------------ the real pipeline
  let generation, target;
  await reporter.stage('B5 preparar_generacion_semana (real route)', async () => {
    const res = await chat(user, 'preparar_generacion_semana'); DIAGNOSTICS.push(res.json);
    check(res.status === 200 && res.json?.ok && res.json.generation?.token, `failed (${res.status} ${compact(res.json)})`);
    generation = res.json.generation; target = generation.nextWeek; return `target week (next) ${target}`;
  });
  let preflight;
  await reporter.stage('B6 preflight_generacion_semana (availability / temporal / event gates)', async () => {
    const call = digest => chat(user, 'preflight_generacion_semana', { generationToken: generation.token, targetWeekStart: target, temporalIntent: false, confirmedAvailabilityDigest: digest });
    let res = await call(undefined); DIAGNOSTICS.push(res.json);
    // Same behaviour as the client: an availability confirmation question is answered with the digest the server returned.
    if (res.json?.preflightRequirement?.kind === 'availability' && res.json.snapshotDigest) { res = await call(res.json.snapshotDigest); DIAGNOSTICS.push(res.json); }
    preflight = res.json; calls.preflight = res.json;
    check(res.status === 200 && res.json?.canContinue === true, `preflight blocked: ${compact(res.json)}`);
    allowed = res.json.availability ?? {};
    return `availability=${compact(allowed)}`;
  });
  let analyzer;
  await reporter.stage('B7 analizar_bloque_semana (Block Analyzer, real LLM)', async () => {
    const res = await chat(user, 'analizar_bloque_semana'); DIAGNOSTICS.push(res.json); analyzer = res.json;
    check(res.status === 200 && res.json?.ok && res.json.analisis, `Block Analyzer failed: ${compact(res.json)}`);
    return `ok (strategyProposal=${compact(res.json.analisis?.strategyProposal ?? null, 120)})`;
  });
  let planner;
  await reporter.stage('B8 planificar_semana (Weekly Coach, real LLM + deterministic admission)', async () => {
    const res = await chat(user, 'planificar_semana', { weeklyContractVersion: 2, analisis: analyzer.analisis, generationToken: generation.token, targetWeekStart: target, empezarHoy: false });
    DIAGNOSTICS.push(res.json); planner = res.json;
    check(res.status === 200 && res.json?.ok === true, `Weekly planner not admitted: code=${res.json?.code} ${compact(res.json?.error ?? res.json?.errors ?? res.json)}`);
    estructura = res.json.estructura; sessions = estructura?.sessions ?? [];
    check(estructura?.weeklyContractVersion === 2 && sessions.length === 7, `unexpected structure (version=${estructura?.weeklyContractVersion}, sessions=${sessions.length})`);
    gr = estructura.strategy?.canonical?.goalRequirements;
    return `${sessions.filter(s => !nonWorkout(s)).length} training days of 7`;
  });
  if (!estructura) throw new Error('no weekly structure: assertions skipped');

  // ------------------------------------------------------------------ assertions
  await reporter.stage('A1 objective remains exactly the declared objective (goalRequirements + stored profile)', async () => {
    check(gr, 'WEEKLY_CONTRACT.strategy.goalRequirements missing');
    check(norm(gr.objective.text) === norm(OBJECTIVE), `goalRequirements.objective.text = "${gr.objective.text}"`);
    check(gr.objective.authority === 'EXPLICIT_OBJECTIVE', 'objective authority is not EXPLICIT_OBJECTIVE');
    const after = (await profileRoute(user, 'GET')).json.profile;
    check(after.planStructure.objective === OBJECTIVE, 'stored objective changed');
    return `"${gr.objective.text}"`;
  });
  await reporter.stage('A2 no STRATEGY_UNSUPPORTED (or GOAL_*) in any response of the pipeline', async () => {
    const text = JSON.stringify(DIAGNOSTICS);
    for (const code of ['STRATEGY_UNSUPPORTED', 'GOAL_UNSUPPORTED', 'GOAL_MISSING', 'GOAL_CONFLICT']) check(!text.includes(code), `${code} present in a response`);
  });
  await reporter.stage('A3 goalRequirements.mode = GOAL_DRIVEN (no exact strategy for this objective)', async () => {
    check(gr.mode === 'GOAL_DRIVEN', `mode = ${gr.mode} (strategySupport=${gr.strategySupport})`);
    check(['SPECIALTY_FALLBACK', 'GENERAL_FALLBACK', 'GENERAL_GOAL_DRIVEN'].includes(gr.strategySupport), `strategySupport = ${gr.strategySupport}`);
    const goal = estructura.strategy.canonical.goal;
    if (gr.universalPath) check(goal.id === 'general_goal_driven', `universalPath but spine goal.id = ${goal.id}`);
    else check(gr.programmingBase && gr.programmingBase.strategyId === goal.id, `programmingBase ${compact(gr.programmingBase)} vs spine ${goal.id}`);
    return `strategySupport=${gr.strategySupport} universalPath=${gr.universalPath} spine=${goal.id}`;
  });
  await reporter.stage('A4 training means: CrossFit (box) and running (carrera) are available as means and both appear in the week', async () => {
    check(gr.trainingMeans.declaredSpecialty === SPECIALTY, `declaredSpecialty = ${gr.trainingMeans.declaredSpecialty}`);
    const managed = gr.trainingMeans.managedDisciplines; check(managed.includes('box') && managed.includes('carrera'), `managedDisciplines = ${managed}`);
    const used = new Set(sessions.filter(s => !nonWorkout(s)).map(s => s.tipo ?? s.discipline));
    check(used.has('box') && used.has('carrera'), `week uses only: ${[...used].join(',') || '(none)'}`);
    return `managed=${managed.join('+')} used=${[...used].join('+')}`;
  });
  await reporter.stage('A5 equipment=[] does not trigger inventory questions; standard box capabilities come from the declared environment', async () => {
    const env = gr.trainingContext.environment;
    check(env && env.type === 'BOX' && env.capabilityProfile === 'STANDARD_BOX', `environment = ${compact(env)}`);
    check(gr.trainingContext.equipment.explicitUnavailable.length === 0, `explicitUnavailable = ${gr.trainingContext.equipment.explicitUnavailable}`);
    const text = JSON.stringify(DIAGNOSTICS);
    check(!/"questionToken"|"prescriptionQuestion"|"kind":"equipment"/.test(text), 'a material/equipment question was raised');
    check(!/(tienes|dispones de|cuentas con)[^"]{0,60}(barra|rack|mancuerna|kettlebell|comba|caj[oó]n|anillas)/i.test(text), 'free-text equipment question detected');
    return `environment=${env.type}/${env.capabilityProfile} (${env.reason}); no questions`;
  });
  await reporter.stage('A6 no mandatory inventory invented (no equipment declarations were created by the pipeline)', async () => {
    const snap = await snapshotAthlete(admin, user.codigo);
    const declared = Object.keys(snap.row.perfil?.prescription_signals ?? {}).filter(k => k.startsWith('equipment.'));
    check(!declared.length, `pipeline wrote equipment declarations: ${declared.join(',')}`);
  });
  await reporter.stage('A7 availability respected: every training day is within the declared days of its discipline', async () => {
    check(Object.keys(allowed).length > 0, 'preflight did not return the allowed days');
    const violations = [];
    for (const s of sessions.filter(x => !nonWorkout(x))) {
      const discipline = s.tipo ?? s.discipline, days = (allowed[discipline] ?? []).map(dayKey);
      if (!days.includes(dayKey(s.dia))) violations.push(`${s.dia}:${discipline}`);
    }
    check(!violations.length, `sessions outside declared availability: ${violations.join(', ')}`);
    const trainDays = sessions.filter(s => !nonWorkout(s)).length;
    check(trainDays <= ALL_DAYS.length, `${trainDays} training days > ${ALL_DAYS.length} declared`);
    return `${trainDays} training days, all inside ${compact(allowed, 200)}`;
  });
  await reporter.stage('A8 session duration: declared budget preserved; any per-session minutes in the weekly structure are within it', async () => {
    const got = (await profileRoute(user, 'GET')).json.profile.planStructure;
    check(got.sessionDuration === SESSION_DURATION, `stored sessionDuration = ${got.sessionDuration}`);
    if (DURATION_MAX_MIN) {
      const over = [];
      const scan = (value, path) => { if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) {
        if (typeof v === 'number' && /(^|_)(duracion|duration|minutos|minutes)(_|$)/i.test(k) && v > DURATION_MAX_MIN) over.push(`${path}.${k}=${v}`);
        else scan(v, `${path}.${k}`); } };
      sessions.forEach((s, i) => scan(s, `sessions[${i}]`));
      check(!over.length, `minutes above ${DURATION_MAX_MIN}: ${over.join(', ')}`);
    }
    return `declared "${SESSION_DURATION}" (≤${DURATION_MAX_MIN ?? '?'} min)`;
  });
  reporter.warn('A8 note', 'the Weekly Coach step carries no session minutes; the duration is enforced by the session Builder (not run here). Review the Builder separately.');
  await reporter.stage('A9 restrictions respected: profile restrictions unchanged ([]) and carried as immutable context', async () => {
    check(gr.interpretation.immutable.includes('restrictions'), 'restrictions not in the immutable list');
    const after = (await profileRoute(user, 'GET')).json.profile.planStructure;
    check(after.restrictionsStatus === 'KNOWN' && after.restrictions.length === 0, 'restrictions changed');
    return 'restrictions=[] (nothing to violate); see WARNINGS';
  });
  await reporter.stage('A10 profile truths not modified by the LLM pipeline (API profile + raw stores identical)', async () => {
    const after = (await profileRoute(user, 'GET')).json.profile;
    for (const key of ['category', 'specialty', 'objective', 'age', 'level', 'sessionDuration', 'weeklyAvailability', 'trainingSources', 'restrictions', 'equipment'])
      check(deepEqual(profileBefore.planStructure[key], after.planStructure[key]), `planStructure.${key} changed`);
    check(deepEqual(profileBefore.prescriptionParameters, after.prescriptionParameters), 'prescriptionParameters changed');
    check(after.mode === profileBefore.mode, 'mode changed');
    const snap = await snapshotAthlete(admin, user.codigo);
    for (const col of ['categoria', 'especialidad', 'objetivo_principal', 'distribucion_semanal', 'modo_entrada', 'marcas', 'historial', 'datos_entrenamiento', 'admin', 'premium'])
      check(deepEqual(snapBefore.row[col], snap.row[col]), `usuarios.${col} changed`);
    for (const key of ['edad', 'nivel', 'duracion', 'lugar_entreno', 'prescription_signals'])
      check(deepEqual(snapBefore.row.perfil?.[key], snap.row.perfil?.[key]), `perfil.${key} changed`);
    check(deepEqual(snapBefore.sources, snap.sources) && deepEqual(snapBefore.notes, snap.notes) && deepEqual(snapBefore.events, snap.events), 'sources/restrictions stores changed');
    return 'identical';
  });
  await reporter.stage('A11 the week is not merely generic CrossFit programming', async () => {
    const headline = String(estructura.strategy.adaptacion_principal ?? '');
    check(!/^\s*preparaci[oó]n de crossfit\s*$/i.test(headline), `headline presents the specialty as the goal: "${headline}"`);
    check(norm(gr.objective.text) !== norm(gr.trainingMeans.declaredSpecialty) && !/^crossfit$/i.test(gr.objective.text), 'objective degraded to the specialty');
    const disciplines = new Set(sessions.filter(s => !nonWorkout(s)).map(s => s.tipo ?? s.discipline));
    check(disciplines.size >= 2, 'week uses a single discipline');
    return `headline="${headline}" | disciplines=${[...disciplines].join('+')} | fallback=${compact(estructura.strategy.canonical.goal.fallback ?? null, 160)}`;
  });
  await reporter.stage('A12 no hard-coded "Policía Nacional" logic in production source (static scan of app/ lib/ components/)', async () => {
    const hits = [];
    for (const dir of ['app', 'lib', 'components']) for (const file of walk(join(root, dir))) {
      const text = readFileSync(file, 'utf8');
      if (/pol[ií]cia\s+nacional|policia_nacional|\bpolic[ií]a\b/i.test(text)) hits.push(relative(root, file));
    }
    check(!hits.length, `objective-specific wording found in: ${hits.join(', ')}`);
    return 'none';
  });
  await reporter.stage('A13 profile fields are never written by the Coach: only the server pipeline tables changed (informational diff)', async () => {
    const snap = await snapshotAthlete(admin, user.codigo);
    // perfil is covered key by key in A10 (the server may legitimately maintain unrelated perfil bookkeeping).
    const changedColumns = Object.keys(snap.row).filter(k => k !== 'perfil' && !deepEqual(snapBefore.row[k], snap.row[k]));
    check(!changedColumns.length, `usuarios columns changed during planning: ${changedColumns.join(',')}`);
    return 'usuarios columns (except perfil, see A10) identical';
  });

  // ------------------------------------------------------------------ human inspection block
  const b = [];
  b.push('\n================ MANUAL INSPECTION ================');
  b.push(`GOAL\n  ${gr?.objective?.text ?? '(none)'}  [authority=${gr?.objective?.authority} recognizedGoalId=${gr?.objective?.recognizedGoalId}]`);
  b.push(`STRATEGY RESOLUTION\n  mode=${gr?.mode} strategySupport=${gr?.strategySupport} universalPath=${gr?.universalPath} spine goal.id=${estructura.strategy?.canonical?.goal?.id}`);
  b.push(`GOAL REQUIREMENTS DERIVED\n  Server projection handed to the Coach: ${compact(gr, 900)}\n  (The requirement derivation itself is the Coach's reasoning; see the per-session guidance below and, with FORGE_WEEKLY_COACHING_DIAGNOSTICS=1 on the dev server, WEEKLY_COACH_RATIONALE in its log.)`);
  b.push(`TRAINING MEANS\n  declaredSpecialty=${gr?.trainingMeans?.declaredSpecialty} managed=${gr?.trainingMeans?.managedDisciplines?.join('+')} external=${gr?.trainingMeans?.externalDisciplines?.join('+') || '-'}`);
  b.push(`PROGRAMMING BASE\n  ${compact(gr?.programmingBase ?? null)}`);
  b.push(`DAYS\n  declared=${compact(allowed, 300)}`);
  b.push('SESSION SUMMARIES');
  for (const s of sessions) b.push(`  ${String(s.dia).padEnd(10)} ${nonWorkout(s) ? `[${s.state ?? s.tipo}]` : `${s.tipo ?? s.discipline} | stimulus=${s.stimulusId ?? '-'} | intent=${compact(s.intent ? { kind: s.intent.kind, methodId: s.intent.methodId, adaptationId: s.intent.adaptationId } : null, 160)}`}${s.coachingGuidance ? `\n             guidance: ${compact(s.coachingGuidance, 400)}` : ''}`);
  b.push(`EQUIPMENT ASSUMPTIONS\n  environment=${compact(gr?.trainingContext?.environment)} explicit=${compact(gr?.trainingContext?.equipment)} (no inventory questions raised: see A5)`);
  b.push(`WARNINGS\n  ${(estructura.warnings ?? planner?.warnings ?? []).length ? compact(estructura.warnings ?? planner.warnings, 500) : '(none reported by the planner)'}\n  Not exercised here: session Builder (duration/minutes, movement selection), weekly_plan save.\n  Manually verify: does the week address a physical-test objective (capacities, test format) rather than generic CrossFit?`);
  humanBlock = b;
} finally {
  for (const line of humanBlock) print(line);
  print('\n--- cleanup ---');
  const report = await ledger.run(cleanupHandlers(admin));
  for (const r of report) print(`${r.ok ? 'OK  ' : 'FAIL'} cleanup ${r.kind} ${r.ref} — ${r.detail}`);
  let leftovers = [];
  try { leftovers = await verifyCleanup(admin, ledger); } catch (error) { leftovers = [`verification error: ${error?.message}`]; }
  if (leftovers.length) { print(`CLEANUP INCOMPLETE — remove manually: ${leftovers.join(', ')}`); reporter.stages.push({ name: 'cleanup verification', ok: false }); }
  else print('Cleanup verified: no rows or auth users created by this run remain.');
  const { total, passed, failed } = reporter.summary();
  print(`\nSUMMARY: ${passed}/${total} stages passed, ${reporter.warnings.length} warning(s)${failed.length ? ` — FAILED: ${failed.map(f => f.name.split(' ')[0]).join(', ')}` : ''}`);
  process.exitCode = failed.length || leftovers.length ? 1 : 0;
}

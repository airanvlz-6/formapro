import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFileSync(resolve(root, file), 'utf8');
const source = (file, text = read(file)) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
function find(rootNode, predicate) {
  let value;
  function visit(node) { if (!value && predicate(node)) value = node; ts.forEachChild(node, visit); }
  visit(rootNode); assert.ok(value); return value;
}
const route = source('app/api/chat/route.ts');
const branch = action => find(route, n => ts.isIfStatement(n) && n.expression.getText(route) === `action === "${action}"`).thenStatement;
const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function runBlock(block, bindings) {
  return new Function(...Object.keys(bindings), compile(`async function execute() ${block.getText(route)}`) + '; return execute;')(...Object.values(bindings))();
}
const available = value => ({ status: 'available', value, source: 'device_measurement', ingestedAt: '2026-09-04T10:00:00Z' });
const missing = () => ({ status: 'missing', value: null, source: null, ingestedAt: null });
const snapshot = (date, values = [60, 50, 420, 80]) => ({
  effectiveDate: date, asOfDate: '2026-09-04', ageDays: 0, isToday: date === '2026-09-04', rowPresent: true,
  hrv: values[0] === null ? missing() : available(values[0]), restingHr: values[1] === null ? missing() : available(values[1]),
  sleepDuration: values[2] === null ? missing() : available(values[2]), sleepScore: values[3] === null ? missing() : available(values[3]),
  completeness: { total: 4, available: values.filter(v => v !== null).length, missing: values.filter(v => v === null).length, invalid: 0, percentAvailable: 100 },
});

test('recent physiology endpoint returns canonical snapshots, explicit date and DESC contract', async () => {
  let options;
  const records = [snapshot('2026-09-04'), snapshot('2026-09-01')];
  const response = await runBlock(branch('obtener_physiology_records_recientes'), {
    codigo: 'TEST', supabase: {}, physiologyToday: () => '2026-09-04',
    getCanonicalPhysiologyHistory: async (_db, user, opts) => { assert.equal(user, 'TEST'); options = opts; return { ok: true, snapshots: records }; },
    NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) },
  });
  assert.deepEqual(options, { asOfDate: '2026-09-04', toDate: '2026-09-04', limit: 7 });
  assert.equal(response.body.order, 'desc'); assert.strictEqual(response.body.records, records);
  assert.doesNotMatch(branch('obtener_physiology_records_recientes').getText(route), /from\("physiology_records"\)|fecha,hrv|\bsueno\b/);
});
test('recent physiology endpoint preserves empty and identifies DB/invalid responses', async () => {
  for (const result of [{ ok: true, snapshots: [] }, { ok: false, error: 'db_error', reason: 'offline' }, { ok: false, error: 'invalid_response', reason: 'bad' }]) {
    const r = await runBlock(branch('obtener_physiology_records_recientes'), { codigo: 'TEST', supabase: {}, physiologyToday: () => '2026-09-04',
      getCanonicalPhysiologyHistory: async () => result, NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } });
    assert.equal(r.status, result.ok ? 200 : 503); if (result.ok) assert.deepEqual(r.body.records, []);
  }
});
test('recuperar_usuario exposes canonical current/history without overwriting compatibility fields', async () => {
  const legacy = [{ fecha: 'old', hrv: 999 }];
  const db = { from(table) { assert.equal(table, 'usuarios'); return { select() { return this; }, eq() { return this; },
    single: async () => ({ data: { codigo: 'TEST', estado_fisiologico: { hrv: 999 }, historial_fisiologico: legacy }, error: null }) }; } };
  const recovery = { objective: snapshot('2026-09-04', [55, null, null, 75]), subjective: { acuteFatigue: 4 }, trends: {} };
  const records = [snapshot('2026-09-04'), snapshot('2026-08-30')];
  const r = await runBlock(branch('recuperar_usuario'), { codigo: 'TEST', supabase: db, physiologyToday: () => '2026-09-04',
    prepareRecoveryContext: async () => recovery, getCanonicalPhysiologyHistory: async () => ({ ok: true, snapshots: records }),
    RecoveryReadError: Error, NextResponse: { json: body => body } });
  assert.strictEqual(r.data.canonical_physiology.current, recovery.objective);
  assert.strictEqual(r.data.canonical_physiology.history, records);
  assert.strictEqual(r.data.historial_fisiologico, legacy); // retained only for excluded consumers
  const text = branch('recuperar_usuario').getText(route);
  assert.doesNotMatch(text, /from\("physiology_records"\)|\.select\("fecha,hrv|data\.historial_fisiologico\s*=/);
});

function prompt(file) {
  const ast = source(file); const node = find(ast, n => (ts.isVariableDeclaration(n) && n.name.getText(ast) === 'buildPrompt'));
  return new Function(compile(`const buildPrompt = ${node.initializer.getText(ast)};`) + '; return buildPrompt;')();
}
function promptArgs(context, legacyState = {}, legacyHistory = []) {
  return [{ id: 'x', titulo: 'X' }, {}, [], '', undefined, undefined, undefined, false, {}, {}, legacyState, legacyHistory,
    '', {}, null, [], [], context];
}
for (const file of ['app/FormaPro.tsx', 'lib/mobile/buildPrompt.ts']) {
  test(`${file} prompt uses identical canonical current mapping and ignores legacy objective values`, () => {
    const build = prompt(file);
    const context = { fecha_hoy: '2026-09-04', dia_semana_hoy: 'viernes', dia_semana_manana: 'sábado', fecha_manana: '2026-09-05',
      recovery: { objective: snapshot('2026-09-04', [55, null, 435, 82]), trends: { hrv: { status: 'available', direction: 'descendente', observations: [{ effectiveDate: '2026-09-01', value: 70 }, { effectiveDate: '2026-09-04', value: 55 }] } } }, athlete_state: { estado: 'normal' } };
    const a = build(...promptArgs(context, { hrv: 999, rhr: 999, sueno: 1, fatiga_aguda: 3 }, [{ fecha: 'x', hrv: 888, sueno: 2 }]));
    const b = build(...promptArgs(context, { hrv: 1, rhr: 1, sueno: 100, fatiga_aguda: 3 }, []));
    assert.equal(a, b); assert.match(a, /HRV: 55 ms/); assert.match(a, /FC reposo: no disponible/);
    assert.match(a, /Duración de sueño: 435 min/); assert.match(a, /Score de sueño: 82\/100/);
    assert.doesNotMatch(a, /888|999/); assert.match(a, /Fatiga aguda percibida: 3\/100/);
  });
}

const ruleModules = new Map();
function loadRule() {
  const code = compile(read('lib/validators/scientificRules.ts')); const module = { exports: {} };
  new Function('module', 'exports', code)(module, module.exports); return module.exports.aplicarTodasLasReglas;
}
const applyRules = loadRule();
const rules = objectivePhysiology => applyRules({ sesiones: [{ descripcion: 'VO2max Z5' }], analisis: {}, estructura: {}, esDeload: false,
  hayLesionLumbarActiva: false, objectivePhysiology, estadoFisio: { hrv: 1, sueno: 1 } });
test('scientific rule 006 uses canonical HRV and sleep_score with unchanged threshold/copy', () => {
  assert.match(rules({ hrv: available(59), sleepScore: available(90) })[0].notas_validador[0], /006-Recuperacion/);
  assert.match(rules({ hrv: available(80), sleepScore: available(59), sleepDuration: available(600) })[0].notas_validador[0], /006-Recuperacion/);
  assert.equal(rules({ hrv: available(80), sleepScore: available(80), sleepDuration: available(30) })[0].notas_validador, undefined);
  assert.equal(rules({ hrv: missing(), sleepScore: missing() })[0].notas_validador, undefined);
});
test('scientific rule and its actual caller do not consume legacy objective fields', () => {
  const rule = read('lib/validators/scientificRules.ts');
  assert.doesNotMatch(rule.slice(rule.indexOf('function regla006'), rule.indexOf('// 007')), /estadoFisio\?\.(hrv|rhr|sueno)/);
  assert.match(read('app/FormaPro.tsx'), /objectivePhysiology:estadoCanonico\?\.recovery\?\.objective/);
});
test('Progress derives exact current, ordered history and subjective fatigue from canonical distributor fields', () => {
  const text = read('app/progreso/page.tsx');
  assert.match(text, /const currentPhysiology = canonicalPhysiology\?\.current/);
  assert.match(text, /\[\.\.\.\(canonicalPhysiology\?\.history \|\| \[\]\)\]\.reverse\(\)/);
  assert.match(text, /fatiga_aguda: subjectivePhysiology\?\.acuteFatigue/);
  assert.doesNotMatch(text, /datos\??\.estado_fisiologico\?\.(hrv|rhr|sueno)|datos\.historial_fisiologico/);
});
test('web/mobile context distribution leaves legacy objective fields out of migrated prompt inputs', () => {
  const web = read('app/FormaPro.tsx'), mobile = read('lib/mobile/getAthleteContext.ts');
  const webPrompt = find(source('app/FormaPro.tsx', web), n => ts.isVariableDeclaration(n) && n.name.getText(source('app/FormaPro.tsx', web)) === 'buildPrompt');
  assert.doesNotMatch(webPrompt.initializer.getText(), /estadoFisio\.(hrv|rhr|sueno)|histFisio\.(slice|filter|map)/);
  assert.doesNotMatch(mobile, /u\.(estado_fisiologico|historial_fisiologico)|select\([^\n]*(estado_fisiologico|historial_fisiologico)/);
  assert.match(mobile, /estadoCanonico\?\.recovery\?\.subjective/);
});

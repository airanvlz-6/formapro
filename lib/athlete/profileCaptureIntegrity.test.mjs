import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';
const load = sportsRuntime(), project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const dose = load('sessionDoseContext').buildSessionDoseContext;
const source = readFileSync('app/FormaPro.tsx', 'utf8');
const ast = ts.createSourceFile('FormaPro.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(node, predicate) { if (predicate(node)) return node; return ts.forEachChild(node, n => find(n, predicate)); }
function initializer(name) { return find(ast, n => ts.isVariableDeclaration(n) && n.name.getText(ast) === name).initializer.getText(ast); }
const forms = new Function(`return (${initializer('FORMULARIOS')})`)();
const marks = new Function(`return (${initializer('CAMPOS_MARCAS')})`)();
const fields = new Function(`return (${initializer('TEST_ATLETA')})`)();
// Capture integration manifest: every real UI key must be reviewed, including deliberate deferrals.
// These groups describe projection coverage, not a promise that every value is executable.
const integrationManifest = {
  running: ['5k', '10k', 'tiempo_5k', 'tiempo_10k', 'ritmo_suave', 'fc_suave'],
  strengthIdentityOnlyUnlessExplicitRm: ['bench', 'back_squat', 'front_squat', 'deadlift', 'snatch', 'clean_jerk', 'push_press', 'peso_muerto', 'log_press'],
  explicitRm: ['squat_1rm', 'bench_1rm', 'deadlift_1rm', 'snatch_1rm', 'clean_jerk_1rm'],
  requiresSeparatePolicyOrUnambiguousIdentity: ['21k', '42k', 'trail_corto', 'trail_medio', 'desnivel', 'clean', 'squat', 'total', 'farmer', 'farmer_carry',
    'pullups', 'muscle_up_bar', 'muscle_up_rings', 'hspu', 'double_unders', 'fran', 'grace', 'helen', 'muscle_up', 'front_lever', 'handstand',
    'peso', 'grasa', 'hyrox_tiempo', 'ski_erg', 'row', 'natacion', 'ciclismo', 'carrera_tri', 'spartan_tiempo', 'km_semana', 'test_cooper',
    'pullups_max', 'skills_gym', 'row_2k', 'dominadas_max', 'fondos_max', 'skills_actuales', 'tiempo_hyrox', 'objetivo_tiempo', 'estacion_debil',
    'tiempo_natacion', 'tiempo_ciclismo', 'tiempo_carrera', 'distancia_objetivo', 'peso_corporal', 'eslabon_debil', 'prioridad', 'obstaculos', 'tiempo_ocr'],
};
test('CI inventory: every CAMPOS_MARCAS / TEST_ATLETA key has a connection or explicit deferral', () => {
  const actual = [...new Set([...Object.values(marks), ...Object.values(fields)].flat().map(f => f.id))].sort();
  assert.deepEqual(actual, [...new Set(Object.values(integrationManifest).flat())].sort());
});

for (const [editor, legacy, metric] of [['5k', 'tiempo_5k', '5k'], ['10k', 'tiempo_10k', '10k']]) {
  test(`T1–T6 ${editor}: real editor key, legacy compatibility, actual provenance and conflict`, () => {
    assert.ok(marks.carrera.some(f => f.id === editor)); assert.ok(fields.carrera.some(f => f.id === legacy));
    const p = project({ marcas_especificas: { [editor]: '24:30' }, test_atleta: { [legacy]: '24:30' } });
    assert.equal(p.running.byMetric[metric].reason, 'resolved');
    assert.deepEqual(plain(p.running.byMetric[metric].candidates.map(c => c.source)), [`usuarios.test_atleta.${legacy}`, `usuarios.marcas_especificas.${editor}`]);
    assert.equal(dose(p).references.find(r => r.metric === metric).value, 1470 / (metric === '5k' ? 5 : 10));
    const conflict = project({ marcas_especificas: { [editor]: '24:30' }, test_atleta: { [legacy]: '25:30' } });
    assert.equal(conflict.running.byMetric[metric].reason, 'conflict');
    assert.equal(dose(conflict).references.some(r => r.metric === metric), false);
    assert.equal(project({ datos_entrenamiento: { [legacy]: '24:30' } }).running.byMetric[metric].reason, 'resolved');
  });
}
test('T7/T8 unsupported distances stay absent, malformed times never become references', () => {
  for (const id of ['21k', '42k']) { assert.ok(marks.carrera.some(f => f.id === id)); assert.equal(project({ marcas_especificas: { [id]: '1:40:00' } }).running.references.length, 0); }
  for (const value of ['24:99', 1470, 'fast']) assert.equal(project({ marcas_especificas: { '5k': value } }).running.references.length, 0);
});
test('bench identity is normalized without granting RM; explicit RM and conflicts keep existing rules', () => {
  assert.ok(marks.funcional_crossfit.some(f => f.id === 'bench' && f.label === 'Press banca'));
  const p = project({ marcas_especificas: { bench: '100kg' } });
  assert.equal(p.strength.byMovement.bench_press.resolved.value.referenceType, 'unknown_rm');
  assert.equal(p.strength.byMovement.bench_press.resolved.source, 'usuarios.marcas_especificas.bench');
  assert.equal(dose(p).references.length, 0);
  assert.equal(dose(project({ marcas_especificas: { bench: '1RM 100kg' } })).references[0].movementId, 'bench_press');
  assert.equal(project({ marcas_especificas: { bench: '100kg' }, test_atleta: { bench_1rm: '110kg' } }).strength.byMovement.bench_press.reason, 'conflict');
  for (const id of ['back_squat', 'front_squat', 'deadlift', 'snatch', 'clean_jerk', 'push_press'])
    assert.equal(dose(project({ marcas_especificas: { [id]: '100kg' } })).references.length, 0);
  assert.equal(project({ marcas_especificas: { clean: '100kg' } }).strength.references[0].value.movementId, null);
});
test('T9/T10 Carrera level is specialty-scoped, conflicts fail closed and explicit answers win', () => {
  const options = forms.carrera.find(f => f.id === 'nivel').opciones;
  for (const [i, nivel] of options.entries()) {
    const p = project({ especialidad: 'carrera', perfil: { nivel } });
    assert.equal(p.prescriptionSignals.signals['skill.carrera.advanced'].state, i === 3 ? 'available' : 'unavailable');
    assert.equal(p.prescriptionSignals.signals['skill.carrera.advanced'].source, 'usuarios.perfil.nivel');
    assert.equal(project({ especialidad: 'funcional_crossfit', perfil: { nivel } }).prescriptionSignals.signals['skill.carrera.advanced'].state, 'unknown');
  }
  const profile = { nivel: options[3], nivel_carrera: 'Principiante (nunca corro)' };
  assert.equal(project({ especialidad: 'carrera', perfil: profile }).prescriptionSignals.signals['skill.carrera.advanced'].state, 'ambiguous');
  profile.prescription_signals = { 'skill.carrera.advanced': { state: 'unavailable' } };
  assert.equal(project({ especialidad: 'carrera', perfil: profile }).prescriptionSignals.signals['skill.carrera.advanced'].state, 'unavailable');
  assert.equal(project({ perfil: { nivel_cf: 'Competidor' } }).prescriptionSignals.signals['skill.box.advanced'].state, 'available');
  assert.equal(project({ perfil: { nivel_carrera: 'Avanzado (corro con frecuencia)' } }).prescriptionSignals.signals['skill.carrera.advanced'].state, 'available');
});
for (const [value, min, max] of [['Hasta 30 min', null, 1800], ['Hasta 1 hora', null, 3600], ['Hasta 1h 30min', null, 5400], ['60–90 min', 3600, 5400], ['Más de 1h 30min', 5400, null]]) {
  test(`T13–T16 UI → create projection → canonical budget: ${value}`, () => {
    if (value !== '60–90 min') assert.ok(forms.carrera.find(f => f.id === 'duracion').opciones.includes(value));
    const stored = load('../auth/legacyContainment').projectLegacyCreate({ especialidad: 'carrera', perfil: { duracion: value } });
    const budget = dose(project(stored)).timeBudget;
    assert.equal(budget.minimumSeconds, min); assert.equal(budget.maximumSeconds, max); assert.equal(budget.source, 'usuarios.perfil.duracion');
    for (const alias of ['duracion_sesion', 'tiempo_sesion', 'duracion_clase']) assert.equal(dose(project({ perfil: { [alias]: value } })).timeBudget.maximumSeconds, max);
  });
}
test('duration aliases with incompatible values still reject; no fallback to 90 minutes', () => {
  assert.throws(() => dose(project({ perfil: { duracion: 'Hasta 1 hora', duracion_clase: '90 min' } })), /SESSION_TIME_BUDGET_CONFLICT/);
  assert.equal(dose(project({ perfil: {} })).timeBudget.maximumSeconds, null);
});
test('T11 dormant HR gap has no entry transition; normal HR capture retains actual profile source', () => {
  assert.equal(/setPantalla\(["']onboarding_gaps["']\)/.test(source), false);
  assert.ok(forms.carrera.some(f => f.id === 'fc_reposo'));
  const p = project(load('../auth/legacyContainment').projectLegacyCreate({ perfil: { fc_reposo: '55' } }));
  assert.equal(p.running.byMetric.restingHr.resolved.source, 'usuarios.perfil.fc_reposo');
  assert.equal(dose(p).references.some(r => r.metric === 'restingHr'), false);
});
const captureAthleteTestFacts = load('../athlete/testCapture').captureAthleteTestFacts;
test('capture validation rejects foreign fields/invalid options without inventing values', () => {
  for (const input of [{ informe: {} }, { tiempo_5k: '' }, { km_semana: 'invented' }, {}]) assert.throws(() => captureAthleteTestFacts(input, fields.carrera, new Date().toISOString()));
});
for (const failure of ['network', 'invalid_json', 'analysis_save', 'none', 'facts_save']) test(`T12 actual test handler preserves facts on ${failure}`, async () => {
  const code = ts.transpileModule(`const run=${initializer('generarInformeTest')}; return run();`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const calls = []; let persisted;
  const apiCall = async body => {
    calls.push(body.action || 'llm');
    if (body.action === 'actualizar_usuario') {
      if (failure === 'facts_save' || failure === 'analysis_save' && body.datos.test_atleta.informe) return { ok: false };
      persisted = plain(load('../auth/legacyContainment').projectLegacyUpdate(body.datos).test_atleta); return { ok: true };
    }
    if (!body.action) {
      assert.ok(persisted.tiempo_5k); if (failure === 'network') throw Error('network');
      return { content: [{ text: failure === 'invalid_json' ? 'invalid json' : '{"resumen":"analysis"}' }] };
    }
    return {};
  };
  const noop = () => {}, context = { captureAthleteTestFacts, apiCall, setPantalla: noop, setGenerando: noop, setResultadoTest: noop,
    setBetaFounderInfo: noop, setEsPremium: noop, CATEGORIAS: [{ id: 'carrera' }], categoria: 'carrera', espKey: 'carrera',
    TEST_ATLETA: fields, testAtleta: { tiempo_5k: '24:30' }, respuestas: {}, codigoUsuario: 'fixture' };
  await new Function(...Object.keys(context), code)(...Object.values(context));
  assert.equal(calls[0], 'actualizar_usuario');
  if (failure === 'facts_save') { assert.equal(persisted, undefined); assert.equal(calls.length, 1); }
  else { assert.equal(persisted.tiempo_5k, '24:30'); assert.equal(project({ test_atleta: persisted }).running.byMetric['5k'].reason, 'resolved');
    assert.equal(!!persisted.informe, failure === 'none'); }
});

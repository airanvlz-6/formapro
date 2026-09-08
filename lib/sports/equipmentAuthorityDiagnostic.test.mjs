import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, fakeDatabase } from './trainingContractTestRuntime.mjs';
const load = sportsRuntime();
const project = load('../athlete/prescriptionSignals').projectPrescriptionSignals;
const { emitEquipmentAuthorityDiagnostic: emit, EQUIPMENT_DIAGNOSTIC_LIMIT: cap } = load('equipmentAuthorityDiagnostic');
const run = '55b43994-e0b2-4d6a-b0fb-526d53b607ff';
function capture(profile, movements = ['db_deadlift', 'ski_erg']) {
  const lines = []; emit(project(profile, '2026-09-10'), movements, run, 'jueves', line => lines.push(JSON.parse(line))); return lines;
}
test('flat production detail distinguishes missing, unrecognized and recognized environment', () => {
  for (const [profile, present, resolved, state] of [[{}, false, 'UNKNOWN', 'unknown'], [{ lugar_entreno: 'PRIVATE_SENTINEL' }, true, 'UNKNOWN', 'unknown'], [{ lugar_entreno: 'Box CrossFit (equipamiento completo)' }, true, 'BOX', 'available']]) {
    const lines = capture(profile), detail = lines.find(l => l.equipmentId === 'mancuerna');
    assert.equal(detail.rawEnvironmentPresent, present); assert.equal(detail.resolvedEnvironment, resolved);
    assert.equal(detail.finalEquipmentState, state); assert.equal(detail.environmentCompatibility, 'BOTH');
    assert.equal(detail.availableByEnvironment, resolved === 'BOX'); assert.equal(detail.planningRunId, run);
    assert.ok(!JSON.stringify(lines).includes('PRIVATE_SENTINEL'));
    assert.ok(Object.values(detail).every(value => value === null || typeof value !== 'object'));
  }
});
test('diagnostic preserves date override provenance despite environment compatibility', () => {
  const lines = capture({ lugar_entreno: 'BOX', prescription_access: { '2026-09-10': { 'equipment.ski_erg': { state: 'unavailable' } } } });
  const detail = lines.find(l => l.equipmentId === 'ski_erg');
  assert.equal(detail.finalEquipmentState, 'unavailable'); assert.equal(detail.availableByEnvironment, true); assert.equal(detail.provenance, 'date_override');
});
test('safe serialization excludes raw profile, arbitrary source, unknown IDs and invalid identity', () => {
  const signals = project({ lugar_entreno: 'HOME' }); signals.signals['equipment.mancuerna'].source = 'PRIVATE_SENTINEL';
  const lines = []; emit(signals, ['db_deadlift', 'PRIVATE_SENTINEL'], 'PRIVATE_SENTINEL', 'PRIVATE_SENTINEL', line => lines.push(JSON.parse(line)));
  assert.ok(!JSON.stringify(lines).includes('PRIVATE_SENTINEL'));
  assert.equal(lines[0].planningRunId, null); assert.equal(lines[1].provenance, 'unknown');
  assert.deepEqual(Object.keys(lines[1]).sort(), ['event','planningRunId','day','rawEnvironmentPresent','rawRoomTypePresent','rawMaterialPresent','resolvedEnvironment','resolutionReason','totalCount','truncated','equipmentId','environmentCompatibility','availableByEnvironment','finalEquipmentState','provenance'].sort());
});
test('logger or malformed serialization inputs never mutate evidence or throw', () => {
  const signals = project({ lugar_entreno: 'BOX' }), before = JSON.stringify(signals);
  assert.doesNotThrow(() => emit(signals, ['db_deadlift'], run, 'jueves', () => { throw Error('logger failed'); }));
  assert.equal(JSON.stringify(signals), before);
  const bad = { get environment() { throw Error('serialization failed'); } };
  assert.doesNotThrow(() => emit(bad, ['db_deadlift']));
});
test('diagnostic is capped with visible total, using a future catalog fixture', () => {
  const local = sportsRuntime(), catalog = local('equipmentCatalog'), library = local('movementLibrary').MOVEMENT_LIBRARY;
  const ids = Array.from({ length: cap + 5 }, (_, i) => `fixture_equipment_${i}`);
  for (const id of ids) catalog.EQUIPMENT_CATALOG[id] = { compatibility: 'EXPLICIT_ONLY', family: 'specialized' };
  library.fixture = { equipment: ids };
  const lines = []; local('equipmentAuthorityDiagnostic').emitEquipmentAuthorityDiagnostic({ signals: {} }, ['fixture'], run, 'jueves', line => lines.push(JSON.parse(line)));
  assert.equal(lines.length, cap + 1); assert.equal(lines[0].totalCount, cap + 5); assert.equal(lines[0].truncated, true);
});

test('real session boundary: enabled/failed logging adds zero DB reads or feasibility evaluations', async () => {
  for (const perfil of [{}, { lugar_entreno: 'BOX' }]) {
    const results = [];
    for (const mode of ['disabled', 'enabled', 'throwing']) {
      let evaluations = 0, builderCalls = 0; const lines = [];
      const runtime = sportsRuntime({ console: { info(line) {
        if (mode === 'throwing') throw Error('logger failed');
        lines.push(line);
      } } }, (path, exports) => {
        if (path.endsWith('trainingFeasibility.ts')) return { ...exports, evaluateTrainingFeasibility(...args) { evaluations++; return exports.evaluateTrainingFeasibility(...args); } };
        if (path.endsWith('equipmentAuthorityDiagnostic.ts') && mode === 'disabled') return { ...exports, emitEquipmentAuthorityDiagnostic() {} };
        return exports;
      });
      const db = fakeDatabase({ usuarios: { codigo: 'fixture', modo_entrada: 'coach', categoria: 'box', perfil }, weekly_plan: [], athlete_training_sources: [], external_training_records: [] });
      const r = await runtime('sessionAuthority').generateTrainingSession(db, 'fixture', { targetWeekStart: '2026-09-07', day: 'jueves', discipline: 'box', stimulus: 'fuerza_maxima', intent: { kind: 'main_pattern', pattern: 'squat' } }, async () => { builderCalls++; return '{}'; }, '', run);
      results.push({ code: r.code, question: r.question?.text, evaluations, reads: db.calls, builderCalls });
      if (mode === 'enabled') assert.ok(lines.some(line => typeof line === 'string' && line.includes('EQUIPMENT_AUTHORITY_DETAIL')));
    }
    assert.deepEqual(results[1], results[0]); assert.deepEqual(results[2], results[0]);
    assert.equal(results[0].builderCalls, perfil.lugar_entreno ? 1 : 0);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain } from './trainingContractTestRuntime.mjs';
const load = sportsRuntime();
const catalog = load('equipmentCatalog');
const project = load('../athlete/prescriptionSignals').projectPrescriptionSignals;
const library = load('movementLibrary').MOVEMENT_LIBRARY;
const sufficiency = load('prescriptionDataSufficiency').resolvePrescriptionDataSufficiency;
const core = load('../prescription/dataSufficiency').resolveDataSufficiency;

test('all movement equipment AND ANY requirements have explicit catalog classification', () => {
  const ids = new Set(Object.values(library).flatMap(m => [...m.equipment, ...(m.equipmentRequirements || []).flat()]));
  for (const id of ids) assert.ok(Object.hasOwn(catalog.EQUIPMENT_CATALOG, id), `unclassified equipment: ${id}`);
  assert.deepEqual(plain(catalog.equipmentIds.filter(id => !ids.has(id))), ['leg_press']);
});
for (const [id, entry] of Object.entries(catalog.EQUIPMENT_CATALOG)) {
  test(`catalog policy and core sufficiency: ${id} / ${entry.compatibility}`, () => {
    assert.ok(['BOX_COMPATIBLE', 'GYM_COMPATIBLE', 'BOTH', 'EXPLICIT_ONLY'].includes(entry.compatibility));
    for (const env of ['BOX', 'GYM', 'HOME', 'OUTDOOR', 'UNKNOWN']) {
      const expected = env === 'BOX' ? ['BOX_COMPATIBLE', 'BOTH'].includes(entry.compatibility)
        : env === 'GYM' ? ['GYM_COMPATIBLE', 'BOTH'].includes(entry.compatibility) : false;
      assert.equal(catalog.isEquipmentAvailableByEnvironment(id, env), expected);
      const signalId = `equipment.${id}`;
      const signals = project({ lugar_entreno: env });
      assert.equal(signals.signals[signalId].state, expected ? 'available' : 'unknown');
      const result = core({ checks: [{ requirement: { signal: signalId, requiredFor: 'catalog_requirement', reason: 'movement_equipment', criticality: 'required', acceptableFallbacks: [] },
        evidence: [{ signal: signalId, ...signals.signals[signalId], answerType: 'availability' }] }] });
      if (expected) { assert.equal(result.status, 'sufficient'); assert.equal(result.questionRequirements.length, 0); }
      const persistent = project({ lugar_entreno: env, prescription_signals: { [signalId]: { state: 'unavailable' } } });
      assert.equal(persistent.signals[signalId].state, 'unavailable');
      const temporal = project({ lugar_entreno: env, prescription_signals: { [signalId]: { state: 'unavailable' } }, prescription_access: { '2026-09-10': { [signalId]: { state: 'available' } } } }, '2026-09-10');
      assert.equal(temporal.signals[signalId].state, 'available');
    }
  });
}
test('unknown equipment never gains access and object-prototype names are not catalog entries', () => {
  for (const id of ['future_machine', 'toString', '__proto__']) assert.equal(catalog.isEquipmentAvailableByEnvironment(id, 'BOX'), false);
});
test('all conventional equipment-only movement requirements are covered without questions', () => {
  for (const environment of ['BOX', 'GYM']) {
    const signals = project({ lugar_entreno: environment });
    for (const movement of Object.values(library)) {
      if (movement.technical_demand === 'alta') continue; // Skill authority is independent.
      const groups = movement.equipmentRequirements || movement.equipment.map(id => [id]);
      if (!groups.every(group => group.some(id => catalog.isEquipmentAvailableByEnvironment(id, environment)))) continue;
      const r = sufficiency(signals, [], { movementId: movement.id, discipline: movement.discipline[0] });
      assert.equal(r.status, 'sufficient', `${environment}/${movement.id}`);
      assert.equal(r.questions.length, 0);
    }
  }
});
test('Box SkiErg denial is explicit, not a renewed inventory question; authorized rower alternative works', () => {
  const signals = project({ lugar_entreno: 'BOX', prescription_signals: { 'equipment.ski_erg': { state: 'unavailable' } } });
  const r = sufficiency(signals, [], { movementId: 'ski_erg', discipline: 'box' });
  assert.equal(r.status, 'missing_required_data'); assert.equal(r.questions.length, 0);
  const alternative = sufficiency(signals, [], { movementId: 'ski_erg', discipline: 'box', authorizedAlternatives: ['row_erg'] });
  assert.equal(alternative.status, 'fallback_available'); assert.equal(alternative.fallbacks[0].movementId, 'row_erg');
});
test('material is below environment; persistent answers and date exceptions keep distinct provenance', () => {
  const base = { lugar_entreno: 'BOX', material: ['SkiErg'] };
  assert.match(project(base).signals['equipment.ski_erg'].source, /^derived:/);
  const persistent = { ...base, prescription_signals: { 'equipment.ski_erg': { state: 'available' } } };
  assert.equal(project(persistent).signals['equipment.ski_erg'].source, 'usuarios.perfil.prescription_signals.equipment.ski_erg');
  assert.equal(project({ lugar_entreno: 'HOME', material: ['SkiErg'] }).signals['equipment.ski_erg'].source, 'usuarios.perfil.material');
  const before = structuredClone(base); project(base); assert.deepEqual(plain(base), before);
});

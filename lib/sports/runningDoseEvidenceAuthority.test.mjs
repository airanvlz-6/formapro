import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain, fakeDatabase } from './trainingContractTestRuntime.mjs';
const load = sportsRuntime();
const { resolveRunningDoseBaseline: resolve } = load('../athlete/runningDoseBaseline');
const { projectRunningDoseBaseline: adapt } = load('../athlete/runningDoseEvidence');
const { projectAthletePrescriptionProfile: project } = load('../athlete/athletePrescriptionContext');
const { admitRunningDoseEvidence: admit } = load('runningDoseEvidenceAuthority');
const today = '2026-09-09';
const fromFacts = facts => plain(admit(resolve(today, facts)));
const fromProfile = (profile = {}, sessions = []) => plain(admit(adapt(profile,
  [{ week_start: '2026-09-07', sessions }], project(profile).running.references, today)));
const actual = (metric = 'durationSeconds', value = 1800, identity = 'verified:a', date = today) => ({
  source: 'verified_execution', reliability: 'verified_actual', kind: 'EXECUTED', date, identity, metric, value });
const occurrence = (methodId = 'running_threshold', dia = 'miercoles') => ({ tipo: 'carrera', dia, completada: true,
  structuredPrescription: { objective: { intent: { kind: 'adaptation', methodId,
    adaptationId: methodId === 'running_threshold' ? 'umbral' : 'base_aerobica' } },
    proposal: { blocks: [{ blockType: 'main', movements: [{ prescription: { durationSeconds: 3600 } }] }] } } });
const declaration = { source: 'profile_declaration', sourcePath: 'usuarios.perfil.km_semana', reliability: 'direct_declaration',
  kind: 'DECLARED', metric: 'declaredWeeklyDistanceMeters', value: 30000, date: null, identity: null };

test('A no evidence UNKNOWN', () => assert.equal(fromFacts([]).status, 'UNKNOWN'));
test('B availability is not evidence', () => assert.equal(fromProfile({ perfil: { duracion: '90 min' } }).status, 'UNKNOWN'));
test('C level is not evidence', () => assert.equal(fromProfile({ perfil: { nivel: 'Intermedio' } }).status, 'UNKNOWN'));
test('D direct declaration retains authority, source, units and no observed quantity', () => {
  const a = fromProfile({ perfil: { km_semana: 30 } }); assert.equal(a.status, 'DECLARED');
  assert.equal(a.basis.declaredWeeklyDistance[0].minimumMeters, 30000);
  assert.equal(a.admissibleEvidence[0].fact.sourcePath, 'usuarios.perfil.km_semana');
  assert.equal(a.basis.windows['7'].observedDistance.status, 'UNKNOWN');
});
test('E declared range endpoints preserved', () => {
  const d = fromProfile({ perfil: { km_semana: '30–35 km' } }).basis.declaredWeeklyDistance[0];
  assert.equal(d.minimumMeters, 30000); assert.equal(d.maximumMeters, 35000);
});
test('F completion alone EXPOSURE_ONLY', () => assert.equal(fromProfile({}, [occurrence()]).status, 'EXPOSURE_ONLY'));
test('G both method associations retained with dates, no quantity claims', () => {
  const a = fromProfile({}, [occurrence(), occurrence('running_base', 'martes')]);
  assert.deepEqual(a.basis.methodExposure.map(m => m.methodId), ['running_base', 'running_threshold']);
  assert.ok(a.basis.methodExposure.every(m => m.quantityKnown === false && m.occurrenceCount === 1));
  assert.equal(a.basis.methodExposure[0].startDate, '2026-09-08');
});
test('H uncompleted planned dose excluded with reason', () => {
  const a = fromProfile({}, [{ ...occurrence(), completada: false }]); assert.equal(a.status, 'UNKNOWN');
  assert.equal(a.excludedEvidence[0].reason, 'PLANNED_ONLY'); assert.equal(a.admissibleEvidence.length, 0);
});
test('I completed planned 60min does not become observed 60min', () => {
  const a = fromProfile({}, [occurrence()]); assert.equal(a.basis.windows['7'].observedDuration.value, null);
  assert.equal(a.status, 'EXPOSURE_ONLY');
});
test('J actual duration only: observed, distance explicitly unknown', () => {
  const a = fromFacts([actual()]); assert.equal(a.status, 'OBSERVED');
  assert.equal(a.basis.windows['7'].observedDuration.status, 'AVAILABLE');
  assert.equal(a.basis.windows['7'].observedDistance.status, 'UNKNOWN');
  assert.equal(a.coverage.captureCompleteness, 'UNKNOWN');
});
test('K actual distance only: duration unknown', () => {
  const a = fromFacts([actual('distanceMeters', 5000)]); assert.equal(a.status, 'OBSERVED');
  assert.equal(a.basis.windows['7'].observedDistance.value, 5000); assert.equal(a.basis.windows['7'].observedDuration.status, 'UNKNOWN');
});
test('L duration and distance observed without claiming full capture', () => {
  const a = fromFacts([actual(), actual('distanceMeters', 5000)]); assert.equal(a.status, 'OBSERVED');
  assert.equal(a.basis.windows['7'].identifiedOccurrenceCount.value, 1);
  assert.equal(a.basis.windows['7'].identifiedOccurrenceCount.status, 'PARTIAL');
});
test('M observed and declared coexist without averaging or conflict', () => {
  const a = fromFacts([actual('distanceMeters', 20000), declaration]); assert.equal(a.status, 'OBSERVED');
  assert.equal(a.basis.declaredWeeklyDistance[0].minimumMeters, 30000);
  assert.equal(a.basis.windows['7'].observedDistance.value, 20000); assert.deepEqual(a.conflicts, []);
});
test('N declaration precedence preserves exposures', () => {
  const a = fromProfile({ perfil: { km_semana: 30 } }, [occurrence(), occurrence('running_base', 'martes')]);
  assert.equal(a.status, 'DECLARED'); assert.equal(a.basis.windows['7'].identifiedOccurrenceCount.value, 2);
  assert.equal(a.basis.windows['7'].observedDistance.value, null);
});
test('O true actual conflict cannot be hidden by a declaration', () => {
  const a = fromFacts([actual(), actual('durationSeconds', 3600), declaration]);
  assert.equal(a.status, 'CONFLICT'); assert.equal(a.conflicts.length, 1);
  assert.equal(a.basis.declaredWeeklyDistance.length, 1);
  assert.ok(a.excludedEvidence.every(e => e.reason === 'EXECUTION_CONFLICT'));
  assert.equal(a.basis.windows['7'].observedDuration.value, null);
});
test('P ambiguous identity excluded, not exposure authority', () => {
  const a = fromFacts([actual('occurrence', 1, null)]); assert.equal(a.status, 'UNKNOWN');
  assert.equal(a.excludedEvidence[0].reason, 'IDENTITY_AMBIGUOUS');
});
for (const [name, left, right] of [
  ['Q availability', { perfil: { duracion: '60 min' } }, { perfil: { duracion: '120 min' } }],
  ['R level', { perfil: { nivel: 'Principiante' } }, { perfil: { nivel: 'Avanzado' } }],
  ['S readiness', { readiness: 'high' }, { readiness: 'low' }],
  ['T restrictions', { restrictions: ['restricted'] }, { restrictions: [] }],
]) test(`${name} does not change admission`, () => assert.deepEqual(fromProfile(left, [occurrence()]), fromProfile(right, [occurrence()])));
test('U narrative/LLM stores cannot create quantitative authority', () => {
  const a = fromProfile({ datos_entrenamiento: { km_semana: 30 }, serverProfile: { durationSeconds: 3600 },
    workout_history: [{ tipo: 'carrera', fecha: today, duracion: 60, source: 'safety_net_deterministico', notas: 'ran 10km' }] });
  assert.equal(a.status, 'UNKNOWN'); assert.equal(a.admissibleEvidence.length, 0);
  // An invalid provenance does not gain authority from aggregate numbers or baseline status.
  const b = plain(resolve(today, [actual()])); b.evidence[0].source = 'llm_summary';
  const rejected = plain(admit(b)); assert.equal(rejected.status, 'UNKNOWN');
  assert.equal(rejected.basis.windows['7'].observedDuration.value, null);
  assert.equal(rejected.excludedEvidence[0].reason, 'UNAUTHORIZED_PROVENANCE');
});
test('V context integration leaves SessionDoseContext serialization and digest unchanged', async () => {
  const db = fakeDatabase({ usuarios: { perfil: { km_semana: 30, duracion: '90 min' } },
    weekly_plan: [{ week_start: '2026-09-07', sessions: [occurrence()] }] });
  const c = await load('../athlete/loadAthletePrescriptionContext').loadAthletePrescriptionContext(db, 'fixture', { asOfDate: today });
  assert.equal(c.runningDoseEvidenceAdmission.status, 'DECLARED');
  const build = load('sessionDoseContext').buildSessionDoseContext;
  const before = plain(build(c)); delete c.runningDoseEvidenceAdmission;
  assert.deepEqual(before, plain(build(c))); assert.ok(!JSON.stringify(before).includes('EvidenceAdmission'));
  assert.equal(db.calls.filter(t => t === 'weekly_plan').length, 1);
});
test('partial aggregate stays partial, stable windows/serialization, no prescription output or raw PII', () => {
  const facts = [actual(), actual('occurrence', 1, 'verified:b'), declaration];
  const a = fromFacts(facts); assert.equal(a.basis.windows['7'].observedDuration.status, 'PARTIAL');
  assert.equal(a.basis.windows['7'].startDate, '2026-09-03');
  assert.deepEqual(a, fromFacts([...facts].reverse())); assert.deepEqual(a, JSON.parse(JSON.stringify(a)));
  const forbidden = /targetDuration|targetDistance|maxSessionDuration|weeklyTarget|progressionPercent|sessionDose|methodDose|longRunTarget|thresholdMinutes|prompt|userCodigo|descripcion/;
  assert.doesNotMatch(JSON.stringify(a), forbidden);
});
test('conflict quarantines entire activity but retains unrelated observed evidence', () => {
  const a = fromFacts([actual(), actual('durationSeconds', 3600), actual('distanceMeters', 5000), actual('distanceMeters', 3000, 'verified:b')]);
  assert.equal(a.status, 'CONFLICT'); assert.equal(a.basis.windows['7'].observedDistance.value, 3000);
  assert.equal(a.admissibleEvidence.length, 1);
});

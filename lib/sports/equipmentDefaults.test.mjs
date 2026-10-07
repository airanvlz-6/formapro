import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain } from './trainingContractTestRuntime.mjs';

// FORGE BUILD 8C-A (final) — equipment = OVERRIDES/CONSTRAINTS, no inventario obligatorio.
// Reglas: ausencia != no disponible; equipment=[] => sin excepciones (se usan los defaults razonables de la disciplina/entorno);
// explicit unavailable > default de disciplina disponible > desconocido. Restrictions=[] SI significa "sin restricciones activas".
const load = sportsRuntime(), project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const { buildSessionDoseContext } = load('sessionDoseContext');
const { resolvePrescriptionDataSufficiency: resolve } = load('prescriptionDataSufficiency');
const { resolveTrainingEnvironment, DISCIPLINE_ENVIRONMENT_DEFAULTS } = load('trainingEnvironment');
const { resolvePlanningProfileStatus } = load('../athlete/planningProfileStatus');
const signals = states => ({ prescription_signals: Object.fromEntries(Object.entries(states).map(([id, state]) => [id, { state, updatedAt: '2026-09-07' }])) });
const decide = (user, request) => { const c = buildSessionDoseContext(project(user), undefined, null, [], true); return resolve(c.sufficiency, c.references, request); };
const CF = { especialidad: 'funcional_crossfit' };
const BOX_MOVEMENTS = ['box_jump', 'row_erg', 'goblet_squat', 'farmers_carry', 'ski_erg', 'sled_push', 'db_thruster'];
const equipmentOf = user => project(user).prescriptionSignals.signals;

test('E1 CrossFit + equipment=[] => la admision no falla por material estandar del box y no pregunta inventario', () => {
  for (const movementId of BOX_MOVEMENTS) {
    const r = decide({ ...CF, perfil: {} }, { movementId, discipline: 'box' });
    assert.equal(r.status, 'sufficient', movementId); assert.equal(r.questions.length, 0, movementId);
  }
  const squat = decide({ ...CF, perfil: {}, test_atleta: { back_squat: 150 } }, { movementId: 'back_squat', discipline: 'box', intensity: '1rm', allowRpe: true });
  assert.equal(squat.status, 'sufficient'); assert.equal(squat.questions.length, 0);
  // control: sin la disciplina declarada el mismo atleta SI queda sin informacion (el default es la causa, no el fixture)
  assert.equal(decide({ perfil: {} }, { movementId: 'box_jump', discipline: 'box' }).status, 'missing_required_data');
});
test('E2 Gym declarado + equipment=[] => no exige inventario completo', () => {
  for (const lugar of ['gimnasio', 'Gimnasio convencional adaptado']) {
    const user = { especialidad: 'fuerza_powerlifting', perfil: { lugar_entreno: lugar }, test_atleta: { back_squat: 150 } };
    const r = decide(user, { movementId: 'back_squat', discipline: 'box', intensity: '1rm', allowRpe: true });
    assert.equal(r.status, 'sufficient'); assert.equal(r.questions.length, 0);
    assert.equal(project(user).prescriptionSignals.environment.capabilityProfile, 'STANDARD_GYM');
  }
});
test('E3 Running + equipment=[] => la planificacion funciona (running no exige inventario)', () => {
  const r = decide({ especialidad: 'carrera', perfil: {} }, { movementId: 'rodaje_z2', discipline: 'carrera', allowRpe: true });
  assert.equal(r.status, 'sufficient'); assert.equal(r.questions.length, 0);
  assert.equal(project({ especialidad: 'carrera', perfil: {} }).prescriptionSignals.environment.environment, 'UNKNOWN', 'carrera no recibe entorno de gimnasio/box inventado');
});
test('E4 CrossFit + remo unavailable => el remo queda prohibido aunque sea default, y no se pregunta por el', () => {
  const user = { ...CF, perfil: signals({ 'equipment.remo': 'unavailable' }) };
  assert.equal(equipmentOf(user)['equipment.remo'].state, 'unavailable');
  const r = decide(user, { movementId: 'row_erg', discipline: 'box' });
  assert.equal(r.status, 'missing_required_data'); assert.equal(r.questions.length, 0);
  assert.equal(decide(user, { movementId: 'ski_erg', discipline: 'box' }).status, 'sufficient', 'el resto del default sigue vigente');
});
test('E5 CrossFit + equipo explicito available => se respeta (material extra a los defaults)', () => {
  const user = { ...CF, perfil: signals({ 'equipment.yoke': 'available' }) };
  assert.equal(equipmentOf(user)['equipment.yoke'].state, 'available');
  assert.equal(decide(user, { movementId: 'yoke_carry', discipline: 'box' }).status, 'sufficient');
  assert.notEqual(decide({ ...CF, perfil: {} }, { movementId: 'yoke_carry', discipline: 'box' }).status, 'sufficient', 'sin declaracion explicita el yoke no se asume');
});
test('E6 equipo desconocido no bloquea si existe alternativa estandar', () => {
  // default de CrossFit + mancuerna no disponible => kettlebell (grupo "o") cubre goblet_squat
  assert.equal(decide({ ...CF, perfil: signals({ 'equipment.mancuerna': 'unavailable' }) }, { movementId: 'goblet_squat', discipline: 'box' }).status, 'sufficient');
  // sin entorno: mancuerna desconocida + kettlebell declarada => suficiente
  assert.equal(decide({ perfil: signals({ 'equipment.kettlebell': 'available' }) }, { movementId: 'goblet_squat', discipline: 'box' }).status, 'sufficient');
});
test('E7 equipment no es campo requerido: CrossFit/Gym/Running con equipment=[] pueden estar ready y nunca "missingFields: equipment"', () => {
  const base = { categoria: 'funcional', especialidad: 'funcional_crossfit', objetivo_principal: { descripcion: 'Preparar una prueba fisica' },
    perfil: { edad: '31-40', nivel: 'Intermedio', duracion: 'Hasta 1 hora' }, distribucion_semanal: JSON.stringify({ disponibilidad: ['lunes', 'jueves'] }) };
  for (const mode of ['supervision', 'coach', 'planificacion']) {
    const status = resolvePlanningProfileStatus({ ...base, modo_entrada: mode, trainingSources: [] });
    assert.equal(status.ready, true, mode); assert.ok(!JSON.stringify(plain(status)).includes('equipment'));
  }
  const gym = resolvePlanningProfileStatus({ ...base, modo_entrada: 'coach', categoria: 'fuerza', especialidad: 'fuerza_powerlifting', perfil: { ...base.perfil, lugar_entreno: 'gimnasio' }, trainingSources: [] });
  assert.equal(gym.ready, true);
  const running = resolvePlanningProfileStatus({ ...base, modo_entrada: 'coach', categoria: 'carrera', especialidad: 'carrera', trainingSources: [] });
  assert.equal(running.ready, true); assert.ok(!running.missingFields.includes('equipment'));
});
test('E8 no se infiere material extraordinario ni entorno ajeno', () => {
  const s = equipmentOf({ ...CF, perfil: {} });
  assert.equal(s['equipment.yoke'].state, 'unknown'); assert.equal(s['equipment.leg_press'].state, 'unknown');
  assert.ok(!Object.keys(s).some(id => /piscina|pool|pista|track|assault_runner/.test(id)));
  const env = project({ ...CF, perfil: {} }).prescriptionSignals.environment;
  assert.deepEqual([env.environment, env.capabilityProfile, env.reason, env.source], ['BOX', 'STANDARD_BOX', 'discipline_default', 'default:discipline:usuarios.especialidad']);
  assert.ok(!env.implicitEquipmentIds.includes('yoke') && !env.implicitEquipmentIds.includes('leg_press'));
  // tabla extensible, minima: solo disciplinas con entorno estandar inequivoco
  assert.deepEqual(plain(DISCIPLINE_ENVIRONMENT_DEFAULTS), { funcional_crossfit: 'BOX', crossfit: 'BOX' });
  for (const especialidad of ['carrera', 'hibrido_hyrox', 'hibrido_general', 'fuerza_strongman', 'funcional_calistenia'])
    assert.equal(project({ especialidad, perfil: {} }).prescriptionSignals.environment.environment, 'UNKNOWN', especialidad);
  // un entorno declarado (aunque distinto) o conflictivo SIEMPRE gana al default de disciplina
  for (const lugar of ['casa', 'gimnasio', 'outdoor', 'algo raro']) {
    const e = project({ ...CF, perfil: { lugar_entreno: lugar } }).prescriptionSignals.environment;
    assert.notEqual(e.reason, 'discipline_default', lugar);
  }
  assert.equal(project({ ...CF, perfil: { lugar_entreno: 'casa' } }).prescriptionSignals.environment.implicitEquipmentIds.length, 0);
  assert.equal(resolveTrainingEnvironment({}, { specialty: 'funcional_crossfit' }).environment, 'BOX'); assert.equal(resolveTrainingEnvironment({}).environment, 'UNKNOWN');
});
test('E9 explicit unavailable gana al default de disciplina (y available explicito gana a unknown)', () => {
  const s = equipmentOf({ ...CF, perfil: signals({ 'equipment.barra': 'unavailable', 'equipment.rack': 'available' }) });
  assert.equal(s['equipment.barra'].state, 'unavailable'); assert.match(s['equipment.barra'].source, /prescription_signals\.equipment\.barra/);
  assert.equal(s['equipment.rack'].state, 'available'); assert.equal(s['equipment.kettlebell'].state, 'available', 'default intacto para lo no declarado');
  assert.equal(decide({ ...CF, perfil: signals({ 'equipment.barra': 'unavailable' }), test_atleta: { back_squat: 150 } },
    { movementId: 'back_squat', discipline: 'box', intensity: '1rm', allowRpe: true }).status, 'missing_required_data');
});

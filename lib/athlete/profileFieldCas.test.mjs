import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Build 8C-A.2 — the REAL SQL (docs/sql/profile-field-cas.sql) in an isolated PostgreSQL (PGlite).
const sql = readFileSync('docs/sql/profile-field-cas.sql', 'utf8');
const objectiveA = { descripcion: 'Open CrossFit Games 2027 – estándares Masters', updated_at: '2026-10-01T00:00:00.000Z' };

async function fresh() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.usuarios(id uuid default gen_random_uuid() primary key, codigo text unique not null, modo_entrada text,
      categoria text, especialidad text, objetivo_principal jsonb, distribucion_semanal text, perfil jsonb, avatar_url text, historial jsonb);`);
  await db.exec(sql);
  return db;
}
const seed = (db, over = {}) => db.query(`insert into public.usuarios(codigo,modo_entrada,categoria,especialidad,objetivo_principal,distribucion_semanal,perfil,avatar_url)
  values ('FP-1','coach','funcional','funcional_crossfit',$1,$2,$3,'a.png')`, [JSON.stringify(over.objetivo ?? objectiveA), over.dist ?? '{"disponibilidad":["lunes"]}',
  JSON.stringify(over.perfil ?? { edad: '31-40', nivel: 'Intermedio', coach_first_turns: { t1: { digest: 'x' } }, prescription_signals: { 'capability.canMeasureHeartRate': { state: 'available' } } })]);
const apply = async (db, expected, set, user = 'FP-1') => (await db.query('select public.forge_profile_apply($1,$2::jsonb,$3::jsonb) as r', [user, JSON.stringify(expected), JSON.stringify(set)])).rows[0].r;
const row = async db => (await db.query('select * from public.usuarios where codigo=$1', ['FP-1'])).rows[0];
const newObjective = (text) => ({ descripcion: text, updated_at: '2026-10-08T00:00:00.000Z' });
const objectiveEdit = (text, before = objectiveA) => ({ expected: { columns: { objetivo_principal: before } }, set: { columns: { objetivo_principal: newObjective(text) } } });

test('CAS1 objective-only save with a large, complex perfil succeeds and persists the new objective (the reported false 409)', async () => {
  const db = await fresh();
  const big = { edad: '31-40', nivel: 'Intermedio', blob: 'ñ–é'.repeat(20000), coach_first_turns: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`t${i}`, { digest: 'd'.repeat(64) }])) };
  await seed(db, { perfil: big });
  const { expected, set } = objectiveEdit('Preparar las pruebas físicas de Policía Nacional');
  assert.deepEqual(await apply(db, expected, set), { result: 'SUCCESS' });
  const r = await row(db);
  assert.equal(r.objetivo_principal.descripcion, 'Preparar las pruebas físicas de Policía Nacional');
  assert.deepEqual(r.perfil, big, 'perfil untouched byte for byte');
});
test('CAS2 real conflict: objective A read, another writer sets B, we try C => CONFLICT and nothing is written', async () => {
  const db = await fresh(); await seed(db);
  await db.query(`update public.usuarios set objetivo_principal=$1 where codigo='FP-1'`, [JSON.stringify(newObjective('Objetivo B'))]);
  const { expected, set } = objectiveEdit('Objetivo C');
  const result = await apply(db, expected, set);
  assert.equal(result.result, 'CONFLICT'); assert.deepEqual(result.fields, ['column:objetivo_principal']);
  assert.equal((await row(db)).objetivo_principal.descripcion, 'Objetivo B');
});
test('CAS3 unrelated perfil / column writes between read and write do NOT conflict and are preserved', async () => {
  const db = await fresh(); await seed(db);
  await db.query(`update public.usuarios set perfil = perfil || '{"ultima_visita_sintetica":"2026-10-08","coach_first_turns":{"t9":{"digest":"zz"}}}'::jsonb, avatar_url='b.png', modo_entrada='focus' where codigo='FP-1'`);
  const { expected, set } = objectiveEdit('Objetivo C');
  assert.deepEqual(await apply(db, expected, set), { result: 'SUCCESS' });
  const r = await row(db);
  assert.equal(r.objetivo_principal.descripcion, 'Objetivo C');
  assert.equal(r.perfil.ultima_visita_sintetica, '2026-10-08'); assert.deepEqual(r.perfil.coach_first_turns, { t9: { digest: 'zz' } });
  assert.equal(r.avatar_url, 'b.png'); assert.equal(r.modo_entrada, 'focus');
});
test('CAS4 related perfil field conflicts (level), an unrelated key does not', async () => {
  const db = await fresh(); await seed(db);
  await db.query(`update public.usuarios set perfil = jsonb_set(perfil,'{nivel}','"Avanzado"') where codigo='FP-1'`);
  const levelEdit = { expected: { perfil: [{ path: ['nivel'], value: 'Intermedio' }] }, set: { perfil: [{ path: ['nivel'], value: 'Principiante' }] } };
  const conflict = await apply(db, levelEdit.expected, levelEdit.set);
  assert.equal(conflict.result, 'CONFLICT'); assert.deepEqual(conflict.fields, ['perfil:nivel']);
  assert.equal((await row(db)).perfil.nivel, 'Avanzado');
  const ageEdit = await apply(db, { perfil: [{ path: ['edad'], value: '31-40' }] }, { perfil: [{ path: ['edad'], value: '41-50' }] });
  assert.equal(ageEdit.result, 'SUCCESS'); const r = await row(db); assert.equal(r.perfil.edad, '41-50'); assert.equal(r.perfil.nivel, 'Avanzado');
});
test('CAS5 no lost updates: concurrent equipment (prescription_signals sub-key) and capability signals both survive; same sub-key conflicts', async () => {
  const db = await fresh(); await seed(db);
  await db.query(`update public.usuarios set perfil = jsonb_set(perfil,'{prescription_signals,capability.canMeasurePace}','{"state":"available"}') where codigo='FP-1'`);
  const ok = await apply(db, { perfil: [{ path: ['prescription_signals', 'equipment.barra'], absent: true }] },
    { perfil: [{ path: ['prescription_signals', 'equipment.barra'], value: { state: 'unavailable', updatedAt: 'now' } }] });
  assert.equal(ok.result, 'SUCCESS');
  const signals = (await row(db)).perfil.prescription_signals;
  assert.deepEqual(Object.keys(signals).sort(), ['capability.canMeasureHeartRate', 'capability.canMeasurePace', 'equipment.barra']);
  const second = await apply(db, { perfil: [{ path: ['prescription_signals', 'equipment.barra'], absent: true }] },
    { perfil: [{ path: ['prescription_signals', 'equipment.barra'], value: { state: 'available' } }] });
  assert.equal(second.result, 'CONFLICT'); assert.equal((await row(db)).perfil.prescription_signals['equipment.barra'].state, 'unavailable');
});
test('CAS6 creates the parent object when absent, removes keys, and removes a sub-key', async () => {
  const db = await fresh(); await seed(db, { perfil: { objetivo_general: 'legacy', edad: '31-40' } });
  const created = await apply(db, { perfil: [{ path: ['prescription_signals', 'equipment.rack'], absent: true }, { path: ['objetivo_general'], value: 'legacy' }] },
    { perfil: [{ path: ['prescription_signals', 'equipment.rack'], value: { state: 'available' } }, { path: ['objetivo_general'], remove: true }] });
  assert.equal(created.result, 'SUCCESS');
  let r = await row(db); assert.deepEqual(r.perfil, { edad: '31-40', prescription_signals: { 'equipment.rack': { state: 'available' } } });
  const removed = await apply(db, { perfil: [{ path: ['prescription_signals', 'equipment.rack'], value: { state: 'available' } }] }, { perfil: [{ path: ['prescription_signals', 'equipment.rack'], remove: true }] });
  assert.equal(removed.result, 'SUCCESS'); r = await row(db); assert.deepEqual(r.perfil, { edad: '31-40', prescription_signals: {} });
});
test('CAS7 text column distribucion_semanal compares as read (string) and a null perfil is treated as empty', async () => {
  const db = await fresh(); await seed(db);
  const edit = await apply(db, { columns: { distribucion_semanal: '{"disponibilidad":["lunes"]}' } }, { columns: { distribucion_semanal: '{"disponibilidad":["lunes","martes"]}' } });
  assert.equal(edit.result, 'SUCCESS'); assert.equal((await row(db)).distribucion_semanal, '{"disponibilidad":["lunes","martes"]}');
  const stale = await apply(db, { columns: { distribucion_semanal: '{"disponibilidad":["lunes"]}' } }, { columns: { distribucion_semanal: 'x' } });
  assert.equal(stale.result, 'CONFLICT');
  await db.query(`update public.usuarios set perfil=null where codigo='FP-1'`);
  assert.equal((await apply(db, { perfil: [{ path: ['edad'], absent: true }] }, { perfil: [{ path: ['edad'], value: '20-30' }] })).result, 'SUCCESS');
  assert.deepEqual((await row(db)).perfil, { edad: '20-30' });
});
test('CAS8 fail-closed: unknown user, disallowed column, malformed arguments and wrong grants', async () => {
  const db = await fresh(); await seed(db);
  assert.equal((await apply(db, {}, {}, 'NOBODY')).result, 'NOT_FOUND');
  assert.deepEqual(await apply(db, { columns: { modo_entrada: 'x' } }, { columns: { modo_entrada: 'coach' } }), { result: 'ERROR', code: 'COLUMN_NOT_ALLOWED' });
  assert.deepEqual(await apply(db, { columns: { premium: true } }, {}), { result: 'ERROR', code: 'COLUMN_NOT_ALLOWED' });
  assert.deepEqual(await apply(db, { perfil: [{ path: ['a', 'b', 'c'], absent: true }] }, {}), { result: 'ERROR', code: 'INVALID_PATH' });
  assert.deepEqual(await apply(db, { perfil: [{ path: [1], absent: true }] }, {}), { result: 'ERROR', code: 'INVALID_PATH' });
  assert.deepEqual((await db.query(`select public.forge_profile_apply(null,'{}'::jsonb,'{}'::jsonb) as r`)).rows[0].r, { result: 'ERROR', code: 'INVALID_ARGUMENT' });
  const grants = (await db.query(`select has_function_privilege('service_role','public.forge_profile_apply(text,jsonb,jsonb)','execute') s,
    has_function_privilege('anon','public.forge_profile_apply(text,jsonb,jsonb)','execute') a, has_function_privilege('authenticated','public.forge_profile_apply(text,jsonb,jsonb)','execute') u`)).rows[0];
  assert.deepEqual(grants, { s: true, a: false, u: false });
  const r = await row(db); assert.equal(r.objetivo_principal.descripcion, objectiveA.descripcion);
});
test('CAS9 columns and perfil are applied atomically: a conflict on perfil leaves the column untouched', async () => {
  const db = await fresh(); await seed(db);
  const result = await apply(db, { columns: { objetivo_principal: objectiveA }, perfil: [{ path: ['nivel'], value: 'WRONG' }] },
    { columns: { objetivo_principal: newObjective('Nope') }, perfil: [{ path: ['nivel'], value: 'X' }] });
  assert.equal(result.result, 'CONFLICT'); assert.equal((await row(db)).objetivo_principal.descripcion, objectiveA.descripcion);
});

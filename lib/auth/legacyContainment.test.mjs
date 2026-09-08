import { sportsRuntime } from '../sports/trainingContractTestRuntime.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const containmentSource = readFileSync(new URL('./legacyContainment.ts', import.meta.url), 'utf8');
const routeSource = readFileSync(new URL('../../app/api/chat/route.ts', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

// Invoke the complete production POST, not a duplicate guard or extracted branch.
// All unexpected dependencies fail, including any database/auth/network access.
function runtime(db, apiKey = 'test') {
  const module = { exports: {} };
  vm.runInNewContext(compile(containmentSource), { module, exports: module.exports, require: () => sportsRuntime()('canonicalSpecialty') });
  const containment = module.exports;
  const route = { exports: {} };
  const unexpected = () => { throw Error('Unexpected privileged dependency'); };
  class RecoveryReadError extends Error {}
  vm.runInNewContext(compile(routeSource), {
    module: route, exports: route.exports, console, Date,
    process: { env: { ANTHROPIC_API_KEY: apiKey } },
    fetch: unexpected,
    require(name) {
      if (name === '@/lib/auth/legacyContainment') return containment;
      if (name === '@/lib/sports/canonicalSpecialty') return sportsRuntime()('canonicalSpecialty');
      if (name === 'next/server') return { NextResponse: {
        json: (body, init) => ({ body: plain(body), status: init?.status ?? 200 }),
      } };
      if (name === '@supabase/supabase-js') return { createClient: () => db };
      if (name === '@/lib/physiology/authority') return { stripGenericPhysiology: () => ({}) };
      if (name === '@/lib/physiology/recoveryContext') return {
        RecoveryReadError, prepareRecoveryContext: async () => ({ objective: { effectiveDate: '2026-09-05' } }),
      };
      if (name === '@/lib/physiology/getCanonicalPhysiology') return {
        getCanonicalPhysiologyHistory: async () => ({ ok: true, snapshots: [] }),
      };
      if (name === '@/lib/physiology/adapters') return { physiologyToday: () => '2026-09-05' };
      return new Proxy({}, { get: () => unexpected });
    },
  });
  return body => route.exports.POST({ json: async () => body });
}

for (const action of ['establecer_password_auth_admin', 'crear_usuario_desde_registro_movil',
  'obtener_codigo_por_auth_user_id', 'completar_onboarding', 'cambiar_codigo_usuario',
  'eliminar_cuenta', 'recuperar_por_email', 'admin_stats', 'obtener_event_log']) {
  test(`${action}: public request cannot reach any privileged operation`, async () => {
    let calls = 0;
    const forbidden = () => { calls++; throw Error('Privileged access'); };
    const post = runtime({ from: forbidden, auth: { admin: { updateUserById: forbidden } } }, undefined);
    for (const email of ['exists@example.invalid', 'missing@example.invalid']) {
      const res = await post({ action, codigo: 'OTHER', email, datos: {
        authUserId: 'other-auth-id', nuevaPassword: 'arbitrary-password', nuevoCodigo: 'STOLEN',
      } });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, false);
      assert.equal(res.body.retryable, false);
      assert.ok(res.body.code);
      assert.equal(res.body.data, undefined);
    }
    assert.equal(calls, 0);
  });
}

function profileDb(initial = { codigo: 'LEGACY', perfil: {} }) {
  const writes = []; let row = initial;
  return { writes, db: { from(table) {
    assert.equal(table, 'usuarios');
    const q = {
      insert(payload) { writes.push(plain(payload[0])); row = { id: 'server-id', ...plain(payload[0]) }; return q; },
      update(payload) { writes.push(plain(payload)); row = { ...row, ...plain(payload) }; return q; },
      select() { return q; }, eq(field, value) { assert.equal(field, 'codigo'); assert.equal(value, 'LEGACY'); return q; },
      async single() { return { data: row, error: null }; },
      then(resolve, reject) { return Promise.resolve({ data: row, error: null }).then(resolve, reject); },
    }; return q;
  } } };
}
const attack = { id: 'attacker-id', auth_user_id: 'attacker-auth', admin: true, premium: true,
  stripe_customer_id: 'attacker-stripe', is_beta_founder: true, premium_until: '2099-01-01',
  role: 'admin', created_at: 'spoofed', updated_at: 'spoofed', unknown_column: true };

test('web onboarding projects emitted insert and profile remains recoverable', async () => {
  const { db, writes } = profileDb(); const post = runtime(db);
  const legitimate = { codigo: 'LEGACY', categoria: 'fuerza', especialidad: 'fuerza',
    perfil: { objetivo: 'progress' }, rutina: 'welcome', historial: [], marcas: [],
    email: 'legacy@example.invalid', modo_entrada: 'supervision', distribucion_semanal: 'lunes' };
  const created = await post({ action: 'guardar_usuario', datos: { ...legitimate, ...attack } });
  assert.deepEqual(writes, [legitimate]);
  assert.equal(created.body.data.id, 'server-id');
  const loaded = await post({ action: 'recuperar_usuario', codigo: 'LEGACY' });
  assert.equal(loaded.body.data.codigo, 'LEGACY');
  assert.deepEqual(loaded.body.data.perfil, legitimate.perfil);
});

test('planning creation repairs missing Carrera specialty before insert', async () => {
  const { db, writes } = profileDb();
  const result = await runtime(db)({ action: 'guardar_usuario', datos: { categoria: 'carrera', modo_entrada: 'planificacion' } });
  assert.equal(result.status, 200);
  assert.equal(writes[0].especialidad, 'carrera');
});

test('planning creation without an unambiguous specialty cannot insert', async () => {
  const result = await runtime({ from() { throw Error('Unexpected insert'); } })({ action: 'guardar_usuario', datos: { categoria: 'funcional', modo_entrada: 'planificacion' } });
  assert.equal(result.status, 422);
  assert.equal(result.body.code, 'CANONICAL_SPECIALTY_REQUIRED');
});

for (const especialidad of [null, undefined, '', '  ']) test(`real generic update ignores empty specialty: ${String(especialidad)}`, async () => {
  const result = await runtime({ from() { throw Error('Unexpected mutation'); } })({ action: 'actualizar_usuario', codigo: 'LEGACY', datos: { especialidad } });
  assert.deepEqual(result.body, { ok: true, changed: false });
});

test('profile update cannot relink, rename, grant privileges or inject columns', async () => {
  const { db, writes } = profileDb(); const post = runtime(db);
  const res = await post({ action: 'actualizar_usuario', codigo: 'LEGACY',
    datos: { ...attack, codigo: 'STOLEN', email: 'new@example.invalid', perfil: { objetivo: 'new' } } });
  assert.equal(res.body.ok, true);
  const { updated_at, ...payload } = writes[0];
  assert.notEqual(updated_at, 'spoofed');
  assert.deepEqual(payload, { email: 'new@example.invalid', perfil: { objetivo: 'new' } });
});

test('forbidden-only update is a no-op without database access', async () => {
  const post = runtime({ from() { throw Error('Must not query'); } });
  const result = await post({ action: 'actualizar_usuario', codigo: 'LEGACY', datos: attack });
  assert.deepEqual(result.body, { ok: true, changed: false });
});

test('generic profile update preserves progressive answers and cannot inject availability authority', async () => {
  const stored = { 'equipment.rack': { state: 'unavailable', updatedAt: '2026-09-07' } };
  const { db, writes } = profileDb({ codigo: 'LEGACY', perfil: { prescription_signals: stored } });
  const result = await runtime(db)({ action: 'actualizar_usuario', codigo: 'LEGACY', datos: {
    perfil: { objetivo: 'new', prescription_signals: { 'equipment.rack': { state: 'available' } } },
  } });
  assert.equal(result.body.ok, true);assert.deepEqual(writes[0].perfil.prescription_signals, stored);
});

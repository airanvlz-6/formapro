import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime } from '../sports/trainingContractTestRuntime.mjs';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const api = sportsRuntime()('../planning/sessionEnvironmentConfirmation');
const binding = { user: 'fixture', weekStart: '2026-09-07', generationToken: 'generation' }, now = 1000, digest = 'a'.repeat(64);
const token = api.issueEnvironmentConfirmation(binding, digest, now), header = `${api.ENVIRONMENT_CONFIRMATION_COOKIE}=${token}`;
test('cookie requires HMAC, user, week, generation, and exact short TTL', () => {
  assert.equal(api.readEnvironmentConfirmation(header, binding, now), digest);
  for (const patch of [{ user: 'other' }, { weekStart: '2026-09-14' }, { generationToken: 'other' }]) assert.equal(api.readEnvironmentConfirmation(header, { ...binding, ...patch }, now), null);
  assert.equal(api.readEnvironmentConfirmation(header, binding, now + 600000), null);
  assert.equal(api.readEnvironmentConfirmation(header, binding, now - 1), null);
  assert.equal(api.readEnvironmentConfirmation(header + 'x', binding, now), null);
  assert.equal(api.readEnvironmentConfirmation(`${header}; ${header}`, binding, now), null);
  assert.equal(api.readEnvironmentConfirmation(null, binding, now), null);
  assert.equal(api.issueEnvironmentConfirmation(binding, null), null);
});

const source = readFileSync('app/api/chat/route.ts', 'utf8');
const ast = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
function find(node, predicate) { if (predicate(node)) return node; return ts.forEachChild(node, n => find(n, predicate)); }
function branch(action) { return find(ast, n => ts.isIfStatement(n) && n.expression.getText(ast) === `action === "${action}"`).thenStatement.getText(ast); }
const normalize = find(ast, n => ts.isIfStatement(n) && n.expression.getText(ast).startsWith("action === 'planificar_semana' &&")).getText(ast);
function execute(code, extra) {
  const context = { ...api, ...extra };
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(context), compiled)(...Object.values(context));
}
test('actual HTTP preflight sets short HttpOnly signed cookie only on confirmed success', async () => {
  for (const [canContinue, confirmedAvailabilityDigest, expectedCookies] of [[true, digest, 1], [false, digest, 0], [true, null, 0]]) {
    const cookies = [], response = { cookies: { set: (...args) => cookies.push(args) } };
    const result = await execute(`return (async () => ${branch('preflight_generacion_semana')})();`, {
      codigo: binding.user, datos: { generationToken: binding.generationToken, targetWeekStart: binding.weekStart, confirmedAvailabilityDigest },
      resolveWeeklyGeneration: () => ({ currentWeek: binding.weekStart, nextWeek: '2026-09-14', snapshots: {} }),
      resolveWeeklyGenerationPreflight: async () => ({ canContinue }), supabase: {},
      NextResponse: { json: () => response }, process: { env: { NODE_ENV: 'production' } },
    });
    assert.equal(result, response); assert.equal(cookies.length, expectedCookies);
    if (cookies.length) {
      assert.deepEqual(cookies[0][2], { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/chat', maxAge: 600 });
      assert.equal(api.readEnvironmentConfirmation(`${cookies[0][0]}=${cookies[0][1]}`, binding), digest);
    }
  }
});
test('actual Planner HTTP normalization ignores submitted raw digest and forwards only valid cookie evidence', async () => {
  const freshToken = api.issueEnvironmentConfirmation(binding, digest);
  for (const cookie of [null, `${api.ENVIRONMENT_CONFIRMATION_COOKIE}=${freshToken}`]) {
    const datos = { targetWeekStart: binding.weekStart, generationToken: binding.generationToken, confirmedAvailabilityDigest: digest, weeklyContractVersion: 1, empezarHoy: false };
    let received;
    await execute(`${normalize}\nreturn (async () => ${branch('planificar_semana')})();`, {
      action: 'planificar_semana', req: { headers: { get: () => cookie } }, datos, codigo: binding.user, supabase: {},
      resolveWeeklyGeneration: () => ({ currentWeek: binding.weekStart, nextWeek: '2026-09-14', snapshots: {} }),
      resolveCompletionDate: () => ({ date: '2026-09-08' }), planBoundedWeek: async (_db, _user, request) => { received = request; return { ok: true }; },
      NextResponse: { json: value => value },
    });
    assert.equal(received.confirmedAvailabilityDigest, cookie ? digest : null);
  }
});

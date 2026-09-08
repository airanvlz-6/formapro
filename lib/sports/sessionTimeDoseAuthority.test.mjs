import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime } from './trainingContractTestRuntime.mjs';
const { resolveSessionTimeDoseAuthority: resolve, validateSessionTimeDose: validate } = sportsRuntime()('sessionTimeDoseAuthority');
const available = maximumSeconds => ({ minimumSeconds: null, maximumSeconds, status: 'resolved', source: 'usuarios.perfil.duracion' });
// Synthetic policy exercises mechanics only: these numbers are NOT a production sports policy.
const policy = { id: 'fixture-only', provenance: 'test', targetMinSeconds: 3000, targetMaxSeconds: 3600, minimumUsefulSeconds: 1200, overTargetToleranceSeconds: 60 };
for (const max of [1800, 3600, 5400]) test(`availability retains hard maximum ${max}`, () => assert.equal(resolve(available(max)).hardMaximumSeconds, max));
test('explicit policy separates target from availability and clamps deterministically', () => {
  assert.equal(resolve(available(5400), policy).targetDuration.maximumSeconds, 3600);
  assert.equal(resolve(available(3300), policy).resolution, 'FEASIBLE_CLAMPED');
  assert.equal(resolve(available(2400), policy).resolution, 'UNDER_TARGET_ALLOWED');
  assert.equal(resolve(available(1000), policy).resolution, 'INFEASIBLE');
  assert.equal(resolve(available(null), policy).hardMaximumSeconds, null);
});
test('use expected for policy, keep conservative hard maximum, never invent unbounded expected duration', () => {
  const authority = resolve(available(5400), policy);
  const check = n => validate(authority, { minimumSeconds: n, expectedSeconds: n, maximumSeconds: n });
  assert.ok(check(100).includes('SESSION_DOSE_UNDERDOSED'));
  assert.ok(check(2000).includes('SESSION_DOSE_UNDER_TARGET'));
  assert.equal(check(3200).length, 0); assert.equal(check(3650).length, 0);
  assert.ok(check(4000).includes('SESSION_DOSE_OVER_TARGET'));
  assert.ok(check(5500).includes('SESSION_BUDGET_EXCEEDED'));
  assert.ok(validate(authority, { minimumSeconds: 0, expectedSeconds: null, maximumSeconds: null }).includes('SESSION_DOSE_DURATION_UNRESOLVED'));
});
test('missing policy retains maximum-only behavior; invalid policy is rejected', () => {
  assert.equal(validate(resolve(available(5400)), { minimumSeconds: 60, expectedSeconds: 60, maximumSeconds: 60 }).length, 0);
  assert.throws(() => resolve(available(5400), { ...policy, minimumUsefulSeconds: 4000 }), /POLICY_INVALID/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime } from '../sports/trainingContractTestRuntime.mjs';
const id = '75702230-6e02-4022-a059-7fec84a6e72a';
function runtime(enabled = true, sink) {
  const events = [];
  const load = sportsRuntime({ process: { env: { FORGE_CHAT_COACH_DIAGNOSTICS: enabled ? '1' : '0' } },
    console: { info: sink ?? ((event, text) => events.push({ event, ...JSON.parse(text) })) } });
  return { ...load('../diagnostics/groundingTrace'), events };
}
test('traces preserve returned values, rejected identities, and resolved database errors', async () => {
  const r = runtime(), trace = r.createGroundingTrace(id, 'initial'), value = { private: 'DO_NOT_LOG' };
  assert.equal(trace.sync('buildFacts', () => value), value);
  const error = { code: '42703', message: 'DO_NOT_LOG', details: value };
  const result = { data: null, error };
  assert.equal(await trace.async('profile.read', () => result, true), result);
  await assert.rejects(trace.async('loadEventContext', () => Promise.reject(error)), e => e === error);
  assert.throws(() => trace.sync('projectPlans', () => { throw error; }), e => e === error);
  assert.equal(r.events.filter(e => e.phase === 'failure').length, 3);
  assert.ok(r.events.filter(e => e.phase === 'failure').every(e => e.errorCode === '42703'));
  assert.ok(!JSON.stringify(r.events).includes('DO_NOT_LOG'));
  for (const start of r.events.filter(e => e.phase === 'start')) {
    assert.equal(r.events.filter(e => e.operationId === start.operationId && e.phase !== 'start').length, 1);
  }
});
test('disabled diagnostics and broken log sinks cannot change operations', async () => {
  for (const r of [runtime(false), runtime(true, () => { throw new Error('sink failed'); })]) {
    const t = r.createGroundingTrace(id, 'initial'), error = new Error('private');
    assert.equal(await t.async('profile.read', () => 42), 42);
    assert.throws(() => t.sync('buildFacts', () => { throw error; }), e => e === error);
    assert.equal(r.events.length, 0);
  }
});
test('sanitizer emits only fixed fields and allowlisted error labels, never arbitrary strings', async () => {
  const r = runtime(), t = r.createGroundingTrace('PRIVATE_RUN_ID', 'PRIVATE_PASS');
  const hostile = { get name() { throw new Error('PRIVATE_GETTER'); } };
  for (const error of [new TypeError('PRIVATE_MESSAGE'), { name: 'PRIVATE_NAME', code: 'PRIVATE_CODE', message: 'CHAT_CONTEXT_READ_FAILED PRIVATE' },
    'PRIVATE_THROW', hostile, { failure: { error: 'db_error', reason: 'snapshot_query_failed' } },
    { failure: { error: 'db_error', reason: 'PRIVATE_REASON' } }]) {
    await assert.rejects(t.async('PRIVATE_STAGE', () => Promise.reject(error)), e => e === error);
  }
  assert.ok(!JSON.stringify(r.events).includes('PRIVATE'));
  assert.ok(r.events.some(e => e.errorClass === 'TypeError'));
  assert.ok(r.events.some(e => e.errorCode === 'CANONICAL_RECOVERY_db_error:snapshot_query_failed'));
  const allowed = new Set(['event', 'runId', 'pass', 'operationId', 'operation', 'phase', 'durationMs', 'errorClass', 'errorCode']);
  for (const e of r.events) { assert.ok(Object.keys(e).every(k => allowed.has(k))); assert.ok(e.durationMs >= 0); }
});

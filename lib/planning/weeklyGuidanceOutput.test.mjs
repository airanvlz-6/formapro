import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';

const load = sportsRuntime();
const { buildOpenWeeklyContract, validateOpenWeeklySelection } = load('../planning/openWeeklyCoachContract');
const { weeklyGuidanceTool, WEEKLY_GUIDANCE_TOOL } = load('../planning/weeklyGuidanceOutput');
const days = plain(load('../planning/weeklyCalendar').calendarDays);
const guidance = { kind: 'weekly_guidance', version: 2, adaptation: 'Fuerza', stimulus: 'Técnica',
  patterns: ['squat', 'hinge'], method: 'Práctica', role: 'Apoyo', reason: 'Control' };
function contract(fixed = { lunes: { state: 'REST', protectionReason: 'EXPLICIT_SCOPE_PRESERVE' } }) {
  const result = buildOpenWeeklyContract({ openCoachVersion: 2, targetWeekStart: '2026-09-14',
    prescriptionScope: { prescriptionAllowed: true, managedDisciplines: ['box'], externalDisciplines: [] },
    allowed: { box: days }, contexts: { box: {} }, fixed });
  assert.equal(result.ok, true);
  return result.contract;
}
function response(c, overrides = {}) {
  return { contractVersion: 3, contextDigest: c.contextDigest, selections: days.map(day => {
    const fixed = c.dayOptions[day].find(o => o.protected);
    return overrides[day] ?? (fixed ? { day, optionId: fixed.optionId } : { day, state: 'REST' });
  }) };
}
const schemaFor = c => new Ajv().compile(plain(weeklyGuidanceTool(c).input_schema));

test('protected exact references pass schema and validator for every fixed calendar state', () => {
  const c = contract(Object.fromEntries(days.map((day, i) => [day, {
    state: ['TRAIN', 'RECOVERY', 'REST', 'UNAVAILABLE'][i % 4], discipline: 'box', protectionReason: 'PAST',
  }])));
  assert.equal(schemaFor(c)(response(c)), true);
  assert.equal(validateOpenWeeklySelection(c, response(c)).ok, true);
});

for (const [name, slot] of [
  ['state', { day: 'lunes', optionId: 'lunes:fixed', state: 'REST' }],
  ['discipline', { day: 'lunes', optionId: 'lunes:fixed', discipline: 'box' }],
  ['missing optionId', { day: 'lunes' }],
  ['incorrect optionId', { day: 'lunes', optionId: 'lunes:rest' }],
  ['guidance', { day: 'lunes', optionId: 'lunes:fixed', guidance }],
  ['other field', { day: 'lunes', optionId: 'lunes:fixed', protected: true }],
]) test(`protected selection rejects ${name} in schema without relaxing admission`, () => {
  const c = contract(), p = response(c, { lunes: slot });
  assert.equal(schemaFor(c)(p), false);
  assert.deepEqual(plain(validateOpenWeeklySelection(c, p).errors), ['OPEN_WEEKLY_FIXED_CHANGED']);
});

test('free REST, TRAIN and RECOVERY selections retain the existing schema and admission behavior', () => {
  const original = new Ajv().compile(plain(WEEKLY_GUIDANCE_TOOL.input_schema));
  for (const c of [contract(), contract({})]) {
    const validate = schemaFor(c);
    for (const slot of [{ day: 'martes', state: 'REST' }, { day: 'martes', state: 'REST', guidance },
      ...['TRAIN', 'RECOVERY'].map(state => ({ day: 'martes', state, discipline: 'box', guidance }))]) {
      const p = response(c, { martes: slot });
      assert.equal(original(p), true);
      assert.equal(validate(p), true);
      assert.equal(validateOpenWeeklySelection(c, p).ok, true);
    }
  }
});

test('weekly completion receives the same protected contract on the first attempt and retry', async () => {
  const c = contract(), calls = [];
  const result = await load('../planning/allowedWeeklyPlanContract').composeBoundedWeek(c, async (prompt, supplied) => {
    calls.push(supplied);
    assert.deepEqual(plain(supplied), plain(c));
    const bad = response(supplied, { lunes: { day: 'lunes', optionId: 'lunes:fixed', state: 'REST' } });
    assert.equal(schemaFor(supplied)(bad), false);
    return { text: '', weeklySelection: calls.length === 1 ? bad : response(supplied) };
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0], calls[1]);
});

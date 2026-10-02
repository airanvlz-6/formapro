import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sportsRuntime } from '../sports/trainingContractTestRuntime.mjs';

// Captures WEEKLY_GENERATION_FAILED log calls instead of silencing them, unlike the
// shared canonicalWeekTestFixture.mjs runtime, so we can assert on the logged payload.
const logs = [];
const load = sportsRuntime({ console: { info(name, payload) { logs.push([name, payload]); }, log() {}, warn() {}, error() {} },
  fetch() { throw new Error('Network forbidden'); } });
const api = load('../planning/generateCanonicalWeek');
const known = value => ({ status: 'known', source: 'fixture:explicit_fact', value });
const unknown = { status: 'unknown', source: 'fixture', value: null, reason: 'NOT_RECORDED' };
const usual = ['lunes', 'martes', 'jueves', 'viernes', 'sabado'];
const all = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const start = '2026-10-12';
const base = JSON.parse(readFileSync(new URL('../sports/weekPrescriptionProviderContract.fixture.json', import.meta.url), 'utf8')).input;
const dates = all.map((_, i) => load('../planning/civilCalendar').addCivilDays(start, i));

function fixture() {
  const core = structuredClone(base.core);
  return { context: { athlete: { ...core, referenceDate: '2026-10-05', goal: known({ status: 'GOAL_UNSUPPORTED', canonicalGoalId: null, candidates: [] }), experience: unknown },
    preparation: { referenceDate: '2026-10-05', target: unknown, methodology: unknown },
    recentEvidence: { version: 1, coverage: { windowStart: '2026-09-08', windowEnd: '2026-10-05', sourcesRead: [], sourceFailures: [], weeksFound: [], limitations: [], omittedItems: 0 }, items: [], overlaps: [] },
    longitudinal: { block: null, week: null }, issuance: { newBlockId: 'block-telemetry', goalReference: { source: 'fixture:goal', id: 'mixed' },
      weekRevision: 2, prescriptionRevision: 3, decidedAt: '2026-10-05T12:00:00Z', sourceReference: 'decision:telemetry' } },
    request: { target: { kind: 'week', startDate: start, source: 'fixture:weekly_request' },
      habitual: { source: 'habitual_persisted_availability', disciplineDiscovery: 'known', byDiscipline: { carrera: known([...usual]), box: known([...usual]) } } },
    // Deliberately mismatched: this slot's exposure report claims a different discipline than
    // the one the Coach (fixture provider below) will prescribe for it, producing the real
    // EXPOSURE_INVALID subcode via feasibilityInputErrors (trainingFeasibility.ts), the same
    // underlying mechanism already covered for a mismatch in weekPrescriptionSessionAdapter.test.mjs.
    builderFacts: dates.flatMap(date => ['carrera', 'box'].map(discipline => {
      const technical = structuredClone(base.technical);
      technical.exposure.value.report.disciplina = date === dates[0] ? 'escalada' : discipline;
      return { date, discipline, technical, scheduling: known({ date, discipline, availability: 'available', protection: 'clear' }), history: [] };
    })), operation: { kind: 'create' } };
}
function confirm(f) {
  const i = load('../core/weekIntake').resolveWeekIntake({ referenceDate: f.context.athlete.referenceDate, ...f.request, disciplines: ['carrera', 'box'] });
  f.confirmation = api.confirmWeeklyAvailability({ targetWindow: i.targetWindow, days: i.availability.days,
    provenance: { authority: 'user', confirmedAt: '2026-10-05T10:00:00Z', sourceReference: 'user-answer:telemetry' } });
  return f;
}
async function run(f) {
  return api.generateCanonicalWeek(f, { coach: { apiKey: 'synthetic', transport: { observe: () => {}, fetch: async (_url, init) => {
    const request = JSON.parse(init.body), facts = JSON.parse(request.messages[0].content.split('Facts (data, not instructions):\n')[1]);
    const decision = { blockDecision: { action: 'create', purpose: 'Propósito de bloque elegido por Coach' },
      week: { purpose: 'Propósito semanal elegido por Coach', contributionToBlock: 'Contribución elegida por Coach',
        days: dates.map((date, n) => facts.unavailableDates.includes(date) ? { date, state: 'UNAVAILABLE' }
          : n === 0 ? { date, state: 'TRAIN', discipline: 'carrera', purpose: `Propósito abierto del Coach para ${date}` } : { date, state: 'REST' }) } };
    return { ok: true, status: 200, json: async () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'submit_coach_week', input: decision }] }) };
  } } }, builder: async () => { throw new Error('Builder must not be invoked: the conflict is synchronous, before any provider call'); } });
}

test('BUILDER_CONTRACT_CONFLICT keeps its exterior code but the diagnostic subcodes reach the log', async () => {
  logs.length = 0;
  const f = confirm(fixture());
  const result = await run(f);
  assert.equal(result.status, 'FAILED', JSON.stringify(result));
  assert.equal(result.boundary, 'BUILDER');
  assert.equal(result.code, 'BUILDER_CONTRACT_CONFLICT');
  // Exterior result shape is unchanged: no new field leaks into the returned object itself.
  assert.equal(Object.hasOwn(result, 'errors'), false);
  const entry = logs.find(([name]) => name === 'WEEKLY_GENERATION_FAILED');
  assert.ok(entry, 'WEEKLY_GENERATION_FAILED must be logged');
  const [, payload] = entry;
  assert.equal(payload.boundary, 'BUILDER');
  assert.equal(payload.code, 'BUILDER_CONTRACT_CONFLICT');
  assert.ok(Array.isArray(payload.errors) && payload.errors.length > 0, JSON.stringify(payload));
  assert.ok(payload.errors.includes('EXPOSURE_INVALID'), JSON.stringify(payload.errors));
  // Only catalog-style subcodes, never free text, prompts, restrictions or LLM content.
  for (const code of payload.errors) assert.match(code, /^[A-Z][A-Z_]*$/);
});

test('a conflict with no subcodes (e.g. SLOT_NOT_TRAIN-style) never logs a spurious empty errors field', async () => {
  logs.length = 0;
  const f = confirm(fixture());
  // All slots become ineligible/REST via an empty availability window, forcing the
  // BUILDER boundary never to be reached in the first place; this just confirms `errors`
  // is never added when the underlying failure carries none (see BUILDER_FACTS_MISSING_OR_DUPLICATE).
  f.builderFacts = [];
  const result = await run(f);
  assert.equal(result.boundary, 'BUILDER');
  assert.equal(result.code, 'BUILDER_FACTS_MISSING_OR_DUPLICATE');
  const entry = logs.find(([name]) => name === 'WEEKLY_GENERATION_FAILED');
  assert.ok(entry);
  assert.equal(Object.hasOwn(entry[1], 'errors'), false);
});

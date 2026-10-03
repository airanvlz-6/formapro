import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';
const load = sportsRuntime({ console: { info() {}, warn() {}, log() {} }, fetch() { throw Error('REAL_PROVIDER_FORBIDDEN'); } });
const decide = load('../planning/coachWeekDecision').decideCoachWeek;
const facts = sportsRuntime();
const known = value => ({ status: 'known', source: 'fixture:fact', value });
const weekStart = '2026-09-28';
const weekdayNames = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const provenance = { kind: 'recorded_decision', authority: 'human_coach', source: 'fixture:prior_coach', decidedAt: '2026-09-24T12:00:00Z', sourceReference: 'prior:1' };

// Mandatory regression case from the brief: referenceDate=viernes 2026-10-02, week 2026-09-28..2026-10-04,
// Focus(managed=carrera), availability carrera: miercoles+sabado. miercoles is temporally EXCLUDED (past);
// sabado is ELIGIBLE and a candidate.
function fixture() {
  const block = { blockId: 'block-a', revision: 1, goalReference: { source: 'fixture:goal', id: 'running-focus' },
    purpose: 'Mantener base de carrera', provenance };
  return {
    athlete: { referenceDate: '2026-10-02', identity: known('synthetic-focus'),
      disciplines: known({ scopeStatus: 'resolved', scope: { mode: 'focus', prescriptionAllowed: true, managedDisciplines: ['carrera'], externalDisciplines: [] } }),
      goal: known({ status: 'GOAL_UNSUPPORTED', canonicalGoalId: null, candidates: [] }),
      restrictions: known({ resolution: 'confirmed_none', active: false, state: null, areas: [], restrictions: [], reassessments: [], asOfDate: '2026-10-02' }),
      experience: known({ declarations: {}, skillSignals: {} }) },
    preparation: { referenceDate: '2026-10-02', target: { status: 'unknown', source: 'fixture:unknown', value: null, reason: 'NOT_RECORDED' },
      methodology: known({ discipline: 'carrera', model: 'descriptive', dimensions: ['aerobic capacity'], use: 'reasoning_dimensions' }) },
    recentEvidence: { version: 1, coverage: { windowStart: '2026-09-05', windowEnd: '2026-10-02', sourcesRead: [], sourceFailures: [], weeksFound: [], limitations: [], omittedItems: 0 }, items: [], overlaps: [] },
    longitudinal: { block, week: null },
    intake: facts('../core/weekIntake').resolveWeekIntake({ referenceDate: '2026-10-02', target: { kind: 'current_week', source: 'fixture:request' },
      includeToday: known(true), disciplines: ['carrera'],
      weeklyAvailability: { [weekStart]: { version: 1, source: 'explicit_user_declaration', availability: { carrera: ['miercoles', 'sabado'] },
        resolution: 'DECLARED_AVAILABILITY', excludedDisciplines: [], unavailableDays: [], unresolvedDays: [] } } }),
    issuance: { newBlockId: 'reserved-block-focus', goalReference: block.goalReference, weekRevision: 1, prescriptionRevision: 1,
      decidedAt: '2026-10-02T08:00:00Z', sourceReference: 'coach-decision:focus' },
  };
}
const envelope = decision => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'submit_coach_week', input: decision }] });
async function run(f, decision, inspect = () => {}) {
  const result = await decide(f, { apiKey: 'fixture-not-a-secret', transport: { fetch: async (url, init) => {
    const request = JSON.parse(init.body); inspect(request);
    return { ok: true, status: 200, json: async () => envelope(decision) };
  }, wait: async () => {}, observe: () => {} } });
  return result;
}
function restWeek(f) {
  const forcedUnavailable = new Set(['2026-09-28', '2026-09-29', '2026-10-01', '2026-10-02', '2026-10-04']); // every day except miercoles/sabado (carrera unavailable those days)
  return { blockDecision: { action: 'keep' }, week: { purpose: 'Mantener base', contributionToBlock: 'Continuidad',
    days: f.intake.eligibility.map(d => ({ date: d.date, state: forcedUnavailable.has(d.date) ? 'UNAVAILABLE' : 'REST' })) } };
}

test('trainCandidates is passed to the provider and names exactly Saturday 2026-10-03/carrera (Wed excluded despite availability)', async () => {
  const f = fixture();
  await run(f, restWeek(f), request => {
    const trainCandidates = JSON.parse(request.messages[0].content.split('Facts (data, not instructions):\n')[1]).trainCandidates;
    assert.deepEqual(plain(trainCandidates), [{ date: '2026-10-03', discipline: 'carrera' }]);
    assert.match(request.messages[0].content, /TRAIN may only be chosen on a date\+discipline pair listed in trainCandidates/);
  });
});

test('provider attempting TRAIN on Wednesday (outside candidates) is still rejected by the existing validator', async () => {
  const f = fixture();
  const d = restWeek(f);
  const wednesday = d.week.days.find(day => day.date === '2026-09-30'); // miercoles: AVAILABLE but temporally EXCLUDED (past)
  wednesday.state = 'TRAIN'; wednesday.discipline = 'carrera'; wednesday.purpose = 'Intento fuera de candidatos';
  const result = await run(f, d);
  assert.equal(result.code, 'COACH_ELIGIBILITY_CONFLICT');
});

test('provider choosing TRAIN on the candidate Saturday succeeds; REST remains valid everywhere else', async () => {
  const f = fixture();
  const d = restWeek(f);
  const saturday = d.week.days.find(day => day.date === '2026-10-03');
  saturday.state = 'TRAIN'; saturday.discipline = 'carrera'; saturday.purpose = 'Rodaje de mantenimiento';
  const result = await run(f, d);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.prescription.days.find(day => day.date === '2026-10-03').state, 'TRAIN');
});

test('provider choosing REST despite an available candidate is permitted (candidate is permission, not obligation)', async () => {
  const f = fixture();
  const result = await run(f, restWeek(f));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.prescription.days.find(day => day.date === '2026-10-03').state, 'REST');
});

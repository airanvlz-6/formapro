import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';
const load = sportsRuntime();
const derive = load('../planning/weekTrainCandidates').deriveWeekTrainCandidates;
const resolveWeekIntake = load('../core/weekIntake').resolveWeekIntake;
const weekdayNames = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const known = value => ({ status: 'known', source: 'fixture:user_answer', value });

function intake({ referenceDate, target, includeToday, disciplines, availability, weekStartForAvailability }) {
  return resolveWeekIntake({ referenceDate, target, includeToday: includeToday === null ? undefined : known(includeToday),
    disciplines, weeklyAvailability: { [weekStartForAvailability]: { version: 1, source: 'explicit_user_declaration',
      availability, resolution: 'DECLARED_AVAILABILITY', excludedDisciplines: [], unavailableDays: [], unresolvedDays: [] } } });
}

test('mandatory regression case: Friday reference, Wednesday excluded, Saturday candidate (carrera-only Focus)', () => {
  // referenceDate = viernes 2026-10-02; week 2026-09-28..2026-10-04; managed=carrera only (Focus).
  // miercoles 2026-09-30 is temporally EXCLUDED (past) though AVAILABLE -> never a candidate.
  // sabado 2026-10-03 is temporally ELIGIBLE and AVAILABLE and managed -> candidate.
  const i = intake({ referenceDate: '2026-10-02', target: { kind: 'current_week', source: 'fixture' }, includeToday: true,
    disciplines: ['carrera'], weekStartForAvailability: '2026-09-28', availability: { carrera: ['miercoles', 'sabado'] } });
  const candidates = derive(i, ['carrera']);
  assert.deepEqual(plain(candidates), [{ date: '2026-10-03', discipline: 'carrera' }]);
  assert.ok(!candidates.some(c => c.date === '2026-09-30'), 'past Wednesday must never be a TRAIN candidate');
});

test('future week: every available managed day is a candidate', () => {
  const i = intake({ referenceDate: '2026-09-30', target: { kind: 'week', startDate: '2026-10-05', source: 'fixture:date' }, includeToday: null,
    disciplines: ['carrera'], weekStartForAvailability: '2026-10-05', availability: { carrera: weekdayNames } });
  assert.equal(derive(i, ['carrera']).length, 7);
});

test('includeToday=true includes today as a candidate when otherwise eligible', () => {
  const i = intake({ referenceDate: '2026-09-28', target: { kind: 'current_week', source: 'fixture' }, includeToday: true,
    disciplines: ['carrera'], weekStartForAvailability: '2026-09-28', availability: { carrera: weekdayNames } });
  assert.ok(derive(i, ['carrera']).some(c => c.date === '2026-09-28'));
});

test('includeToday=false excludes today even though available', () => {
  const i = intake({ referenceDate: '2026-09-28', target: { kind: 'current_week', source: 'fixture' }, includeToday: false,
    disciplines: ['carrera'], weekStartForAvailability: '2026-09-28', availability: { carrera: weekdayNames } });
  assert.ok(!derive(i, ['carrera']).some(c => c.date === '2026-09-28'));
});

test('Focus with one managed discipline never yields candidates for the external one', () => {
  const i = intake({ referenceDate: '2026-09-30', target: { kind: 'current_week', source: 'fixture' }, includeToday: true,
    disciplines: ['carrera', 'box'], weekStartForAvailability: '2026-09-28', availability: { carrera: weekdayNames, box: weekdayNames } });
  const candidates = derive(i, ['carrera']); // managed scope passed in is Focus-restricted to carrera only
  assert.ok(candidates.every(c => c.discipline === 'carrera'));
});

test('multidiscipline Coach: a single eligible/available date can carry more than one candidate', () => {
  const i = intake({ referenceDate: '2026-09-30', target: { kind: 'current_week', source: 'fixture' }, includeToday: true,
    disciplines: ['carrera', 'box'], weekStartForAvailability: '2026-09-28', availability: { carrera: weekdayNames, box: weekdayNames } });
  const candidates = derive(i, ['carrera', 'box']);
  const onThursday = candidates.filter(c => c.date === '2026-10-01');
  assert.deepEqual(plain(onThursday.map(c => c.discipline).sort()), ['box', 'carrera']);
});

test('availability UNKNOWN for a discipline yields no candidate for it (current block already prevents this upstream)', () => {
  const i = intake({ referenceDate: '2026-09-30', target: { kind: 'current_week', source: 'fixture' }, includeToday: true,
    disciplines: ['carrera', 'swimming'], weekStartForAvailability: '2026-09-28', availability: { carrera: weekdayNames } });
  const candidates = derive(i, ['carrera', 'swimming']);
  assert.ok(!candidates.some(c => c.discipline === 'swimming'));
});

test('forcedUnavailable dates (every managed discipline unavailable) never produce a candidate', () => {
  const i = intake({ referenceDate: '2026-09-30', target: { kind: 'current_week', source: 'fixture' }, includeToday: true,
    disciplines: ['carrera'], weekStartForAvailability: '2026-09-28', availability: { carrera: ['jueves', 'sabado'] } });
  const candidates = derive(i, ['carrera']);
  assert.ok(!candidates.some(c => c.date === '2026-09-30')); // miercoles: unavailable for carrera -> forced unavailable, not a candidate
  assert.ok(candidates.some(c => c.date === '2026-10-01')); // jueves: available and eligible
});

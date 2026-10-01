import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';

const load = sportsRuntime();
const real = load('../planning/resolveCurrentWeekState').resolveCurrentWeekState;
// Cross-realm (vm.runInNewContext) objects aren't deepStrictEqual-comparable against
// plain-realm literals even when structurally identical — plain() normalizes via JSON,
// same convention already used by this codebase's other VM-backed tests.
const resolveCurrentWeekState = async (...args) => plain(await real(...args));

// 2026-10-01 is a Thursday -> civil week start (Monday) is 2026-09-28.
const REFERENCE_DATE = '2026-10-01';
const CURRENT_WEEK_START = '2026-09-28';
const HISTORICAL_WEEK_START = '2026-09-14';

/** Records every `.eq()` filter applied, so tests can assert the EXACT week
 * queried — not just the final result — guarding against a regression back
 * to "ORDER BY week_start DESC LIMIT 1" (any such regression would ignore
 * the week_start filter entirely, which this fake would make visible). */
function fakeWeeklyPlanDb({ row = null, throwOnQuery = false, errorOnQuery = null } = {}) {
  const filters = {};
  return {
    filters,
    from(table) {
      assert.equal(table, 'weekly_plan');
      return {
        select(columns) {
          assert.equal(columns, 'sessions,week_start');
          return {
            eq(col, val) {
              filters[col] = val;
              return {
                eq(col2, val2) {
                  filters[col2] = val2;
                  return {
                    async maybeSingle() {
                      if (throwOnQuery) throw new Error('simulated transport failure');
                      if (errorOnQuery) return { data: null, error: errorOnQuery };
                      if (row && row.week_start === filters.week_start && filters.user_codigo === 'laura')
                        return { data: row, error: null };
                      return { data: null, error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

test('NO_PLAN_FOUND: no row for the current week -> PREPARE_WEEK for a planning-capable athlete (Laura, Focus)', async () => {
  const db = fakeWeeklyPlanDb({ row: null });
  const result = await resolveCurrentWeekState(db, 'laura', REFERENCE_DATE, 'focus');
  assert.equal(result.weekStart, CURRENT_WEEK_START);
  assert.equal(result.weekState, 'NO_PLAN_FOUND');
  assert.deepEqual(result.nextAction, { type: 'PREPARE_WEEK', reason: 'no_plan_found' });
  assert.equal(result.sessions, null);
  assert.equal(db.filters.week_start, CURRENT_WEEK_START, 'must query the CURRENT week, never the latest row');
});

test('NO_PLAN_FOUND + modo_entrada=coach -> PREPARE_WEEK', async () => {
  const db = fakeWeeklyPlanDb({ row: null });
  const result = await resolveCurrentWeekState(db, 'laura', REFERENCE_DATE, 'coach');
  assert.deepEqual(result.nextAction, { type: 'PREPARE_WEEK', reason: 'no_plan_found' });
});

test('NO_PLAN_FOUND + modo_entrada=supervision -> NONE, never PREPARE_WEEK (caso 5)', async () => {
  const db = fakeWeeklyPlanDb({ row: null });
  const result = await resolveCurrentWeekState(db, 'laura', REFERENCE_DATE, 'supervision');
  assert.equal(result.weekState, 'NO_PLAN_FOUND');
  assert.deepEqual(result.nextAction, { type: 'NONE' });
});

test('NO_PLAN_FOUND + modo_entrada=consulta -> NONE, never PREPARE_WEEK (caso 5)', async () => {
  const db = fakeWeeklyPlanDb({ row: null });
  const result = await resolveCurrentWeekState(db, 'laura', REFERENCE_DATE, 'consulta');
  assert.deepEqual(result.nextAction, { type: 'NONE' });
});

test('PLAN_ACTIVE: row exists with sessions -> NONE, sessions returned (caso 2)', async () => {
  const sessions = [{ dia: 'lunes', titulo: 'Rodaje', tipo: 'carrera' }];
  const db = fakeWeeklyPlanDb({ row: { week_start: CURRENT_WEEK_START, sessions } });
  const result = await resolveCurrentWeekState(db, 'laura', REFERENCE_DATE, 'focus');
  assert.equal(result.weekState, 'PLAN_ACTIVE');
  assert.deepEqual(result.nextAction, { type: 'NONE' });
  assert.deepEqual(result.sessions, sessions);
});

test('PLAN_EMPTY: row exists but sessions=[] -> NONE, never treated as "no plan" or "rest" (caso 4)', async () => {
  const db = fakeWeeklyPlanDb({ row: { week_start: CURRENT_WEEK_START, sessions: [] } });
  const result = await resolveCurrentWeekState(db, 'laura', REFERENCE_DATE, 'focus');
  assert.equal(result.weekState, 'PLAN_EMPTY');
  assert.deepEqual(result.nextAction, { type: 'NONE' });
  assert.deepEqual(result.sessions, []);
});

test('LOAD_ERROR: Supabase returns an error -> NONE, never PREPARE_WEEK (caso 7/8)', async () => {
  const db = fakeWeeklyPlanDb({ errorOnQuery: { message: 'connection reset' } });
  const result = await resolveCurrentWeekState(db, 'laura', REFERENCE_DATE, 'focus');
  assert.equal(result.weekState, 'LOAD_ERROR');
  assert.deepEqual(result.nextAction, { type: 'NONE' });
  assert.equal(result.sessions, null);
});

test('LOAD_ERROR: query throws -> NONE, never PREPARE_WEEK', async () => {
  const db = fakeWeeklyPlanDb({ throwOnQuery: true });
  const result = await resolveCurrentWeekState(db, 'laura', REFERENCE_DATE, 'focus');
  assert.equal(result.weekState, 'LOAD_ERROR');
  assert.deepEqual(result.nextAction, { type: 'NONE' });
});

test('historical week exists but current week does not -> NO_PLAN_FOUND, NEVER the historical row (caso 6/7, regression guard)', async () => {
  const db = fakeWeeklyPlanDb({ row: { week_start: HISTORICAL_WEEK_START, sessions: [{ dia: 'lunes', titulo: 'old' }] } });
  const result = await resolveCurrentWeekState(db, 'laura', REFERENCE_DATE, 'focus');
  assert.equal(result.weekState, 'NO_PLAN_FOUND');
  assert.equal(result.sessions, null, 'the historical row must never be surfaced as if it were current');
  assert.deepEqual(result.nextAction, { type: 'PREPARE_WEEK', reason: 'no_plan_found' });
});

test('civil week start is computed, not the raw reference date (Thursday -> preceding Monday)', async () => {
  const db = fakeWeeklyPlanDb({ row: null });
  const result = await resolveCurrentWeekState(db, 'laura', REFERENCE_DATE, 'focus');
  assert.equal(result.weekStart, CURRENT_WEEK_START);
  assert.notEqual(result.weekStart, REFERENCE_DATE);
});

test('invalid referenceDate -> LOAD_ERROR, never crashes or guesses a week', async () => {
  const db = fakeWeeklyPlanDb({ row: null });
  const result = await resolveCurrentWeekState(db, 'laura', 'not-a-date', 'focus');
  assert.equal(result.weekState, 'LOAD_ERROR');
  assert.deepEqual(result.nextAction, { type: 'NONE' });
});

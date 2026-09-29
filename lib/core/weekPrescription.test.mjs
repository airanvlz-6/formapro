import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { compile, plain } from '../sports/trainingContractTestRuntime.mjs';

const source = readFileSync(new URL('./weekPrescription.ts', import.meta.url), 'utf8');
const compiled = compile(source), module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports, structuredClone,
  require: name => { throw new Error(`Forbidden runtime dependency: ${name}`); } });
const validate = (p, intent) => plain(module.exports.validateWeekPrescription(p, intent));
function fixture(training = 3, weekStart = '2026-09-28') {
  const provenance = { kind: 'recorded_decision', authority: 'human_coach', source: 'coaching_review',
    decidedAt: '2026-09-27T15:30:00+01:00', sourceReference: 'decision:week-prescription-4' };
  const weekIntent = { weekStart, revision: 2, blockIntentReference: { blockId: 'block-12', revision: 3 },
    positionInBlock: 2, purpose: 'Consolidar la tolerancia al esfuerzo',
    contributionToBlock: 'Dar continuidad a la durabilidad', provenance: { ...provenance } };
  const prescription = { version: 1, weekStart, revision: 4,
    weekIntentReference: { weekStart, revision: 2, blockIntentReference: { ...weekIntent.blockIntentReference } },
    provenance, days: Array.from({ length: 7 }, (_, i) => {
      const date = new Date(`${weekStart}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + i);
      return { date: date.toISOString().slice(0, 10), ...(i < training
        ? { state: 'TRAIN', discipline: 'carrera', purpose: 'Desarrollo aeróbico fácil' } : { state: 'REST' }) };
    }) };
  return { prescription, weekIntent };
}
function rejects(change, code) {
  const f = fixture(); change(f.prescription, f.weekIntent);
  const result = validate(f.prescription, f.weekIntent);
  assert.equal(result.ok, false);
  if (code) assert.ok(result.errors.includes(code), JSON.stringify(result));
}

for (const count of [0, 1, 2, 3, 7]) {
  test(`${count} TRAIN and ${7 - count} REST are valid without availability input or frequency policy`, () => {
    const f = fixture(count), result = validate(f.prescription, f.weekIntent);
    assert.equal(result.ok, true);
    assert.deepEqual(result.prescription, f.prescription);
    assert.equal(result.prescription.days.filter(d => d.state === 'TRAIN').length, count);
    assert.equal(Object.hasOwn(result.prescription, 'frequency'), false);
  });
}

test('REST needs neither purpose nor reason and no missing content is filled', () => {
  const f = fixture();
  assert.deepEqual(validate(f.prescription, f.weekIntent).prescription.days[6], { date: '2026-10-04', state: 'REST' });
  rejects(p => { p.days[6] = { date: p.days[6].date }; }, 'DAY_INVALID:6');
  rejects(p => { p.days[6].purpose = 'Invented rest purpose'; }, 'DAY_INVALID:6');
  rejects(p => { p.days[6].discipline = 'carrera'; }, 'DAY_INVALID:6');
});

test('TRAIN requires an explicit nonblank discipline and purpose', () => {
  for (const key of ['discipline', 'purpose']) {
    rejects(p => { delete p.days[0][key]; }, 'DAY_INVALID:0');
    for (const value of ['', ' \n ', null, 7]) rejects(p => { p.days[0][key] = value; }, 'DAY_INVALID:0');
  }
});

test('open purpose, generic disciplines, repeated purposes and active recovery need no catalogs', () => {
  const f = fixture();
  f.prescription.days[0].discipline = 'escalada';
  f.prescription.days[0].purpose = '  Explorar el equilibrio en movimientos de escalada nuevos  ';
  f.prescription.days[1].purpose = 'Recuperación activa suave';
  assert.deepEqual(validate(f.prescription, f.weekIntent).prescription, f.prescription);
  assert.deepEqual(Object.keys(f.prescription.days[0]).sort(), ['date', 'discipline', 'purpose', 'state']);
  rejects(p => { p.days[0].state = 'RECOVERY'; }, 'DAY_INVALID:0');
});

test('exactly seven ordered civil dates: rejects duplicates, omissions, extras and out-of-week dates', () => {
  rejects(p => { p.days[1].date = p.days[0].date; }, 'DAY_DATE_OR_ORDER_INVALID:1');
  rejects(p => { p.days.pop(); }, 'SEVEN_CIVIL_DAYS_REQUIRED');
  rejects(p => { p.days.push({ date: '2026-10-05', state: 'REST' }); }, 'SEVEN_CIVIL_DAYS_REQUIRED');
  rejects(p => { p.days[6].date = '2026-10-05'; }, 'DAY_DATE_OR_ORDER_INVALID:6');
  rejects(p => { [p.days[0], p.days[1]] = [p.days[1], p.days[0]]; }, 'DAY_DATE_OR_ORDER_INVALID:0');
  rejects(p => { delete p.days[3]; }, 'DAY_INVALID:3');
  rejects(p => { p.days = null; }, 'SEVEN_CIVIL_DAYS_REQUIRED');
  rejects(p => { p.days[0].date = '2026-02-30'; }, 'DAY_INVALID:0');
});

test('civil dates survive leap day, year change and daylight-saving weeks without timezone shifts', () => {
  for (const start of ['2024-02-26', '2026-12-28', '2026-03-23', '2026-10-19']) {
    const f = fixture(3, start);
    assert.equal(validate(f.prescription, f.weekIntent).ok, true, start);
  }
  for (const start of ['2026-02-30', '2026-09-29', '2026-9-28', '2026-09-28T00:00:00Z']) {
    rejects(p => { p.weekStart = start; }, 'WEEK_START_INVALID');
  }
});

test('prescription binds exact week, WeekIntent revision and block identity/revision', () => {
  rejects(p => { p.weekIntentReference.weekStart = '2026-10-05'; }, 'WEEK_INTENT_REFERENCE_MISMATCH');
  rejects(p => { p.weekIntentReference.revision++; }, 'WEEK_INTENT_REFERENCE_MISMATCH');
  rejects(p => { p.weekIntentReference.blockIntentReference.blockId = 'other'; }, 'WEEK_INTENT_REFERENCE_MISMATCH');
  rejects(p => { p.weekIntentReference.blockIntentReference.revision++; }, 'WEEK_INTENT_REFERENCE_MISMATCH');
  rejects(p => { p.weekStart = '2026-10-05'; }, 'WEEK_INTENT_REFERENCE_MISMATCH');
  rejects(p => { delete p.weekIntentReference.blockIntentReference; }, 'WEEK_INTENT_REFERENCE_INVALID');
  rejects(p => { p.weekIntentReference.revision = 0; }, 'WEEK_INTENT_REFERENCE_INVALID');
  const f = fixture();
  assert.equal(validate(f.prescription, undefined).ok, false);
  rejects((_p, i) => { i.provenance.kind = 'legacy_unverified'; }, 'WEEK_INTENT_INVALID');
});

test('UNAVAILABLE requires a factual pointer; resolution is explicitly deferred', () => {
  const f = fixture();
  f.prescription.days[4] = { date: '2026-10-02', state: 'UNAVAILABLE',
    factualReference: { source: 'athlete_scheduling_declaration', reference: 'declaration:42/2026-10-02' } };
  assert.deepEqual(validate(f.prescription, f.weekIntent).prescription.days[4], f.prescription.days[4]);
  for (const reference of [undefined, null, {}, { source: 'unknown', reference: '' }]) {
    f.prescription.days[4].factualReference = reference;
    assert.equal(validate(f.prescription, f.weekIntent).ok, false);
  }
  rejects(p => { p.days[4] = { date: p.days[4].date, state: 'UNAVAILABLE' }; }, 'DAY_INVALID:4');
});

test('unknown availability never supplies a state; no availability parameter is needed', () => {
  const f = fixture(), before = plain(f.prescription);
  // External facts belong to the future adapter, not this decision contract.
  for (const availability of [{ status: 'unknown' }, { days: Array.from({ length: 7 }, (_, i) => i) }]) {
    const result = module.exports.validateWeekPrescription(f.prescription, f.weekIntent, availability);
    assert.equal(result.ok, true);
    assert.deepEqual(plain(result.prescription), before);
    assert.equal(result.prescription.days.some(d => d.state === 'UNAVAILABLE'), false);
  }
});

test('rejects malformed envelope, version, revision and provenance', () => {
  const f = fixture();
  for (const value of [undefined, null, [], {}, 'legacy week']) assert.equal(validate(value, f.weekIntent).ok, false);
  for (const value of [0, 2, '1']) rejects(p => { p.version = value; });
  for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) rejects(p => { p.revision = value; });
  for (const [key, value] of [['kind', 'legacy_unverified'], ['authority', ' '], ['source', ''],
    ['sourceReference', ''], ['decidedAt', '2026-02-30T00:00:00Z'], ['decidedAt', '2026-09-28T24:00:00Z'],
    ['decidedAt', '2026-09-28T00:00:00'], ['decidedAt', 'yesterday']]) {
    rejects(p => { p.provenance[key] = value; }, 'PROVENANCE_INVALID');
  }
});

test('no independent frequency, prescription detail, result or pending fields enter the contract', () => {
  for (const key of ['frequency', 'methodId', 'stimulusId', 'exercises', 'sets', 'reps', 'dose',
    'intensity', 'progression', 'execution', 'result', 'pending', 'achievement', 'adherence', 'nextWeekRecommendation']) {
    rejects(p => { p[key] = 3; }, 'WEEK_PRESCRIPTION_SHAPE_INVALID');
    rejects(p => { p.days[0][key] = 3; }, 'DAY_INVALID:0');
  }
});

test('provenance, exact purpose and decision identity survive serialization without aliasing', () => {
  const f = fixture();
  f.prescription.provenance.authority = 'coach_service';
  f.prescription.provenance.sourceReference = null;
  const before = plain(f), result = module.exports.validateWeekPrescription(f.prescription, f.weekIntent);
  assert.equal(result.ok, true);
  assert.deepEqual(plain(result.prescription), before.prescription);
  assert.deepEqual(validate(plain(result.prescription), plain(f.weekIntent)), plain(result));
  result.prescription.days[0].purpose = 'Different purpose';
  result.prescription.provenance.authority = 'changed';
  result.prescription.weekIntentReference.blockIntentReference.revision++;
  assert.deepEqual(f, before);
});

test('architecture has only a longitudinal Core type import and no runtime dependencies', () => {
  assert.deepEqual(source.match(/^import .*$/gm), ["import type { BlockIntentReference, IntentProvenance, WeekIntent } from './longitudinalIntent';"]);
  assert.doesNotMatch(compiled, /\brequire\s*\(|\bimport\s*\(/);
  assert.doesNotMatch(source, /\b(?:fetch|process|window|document|supabase)\b/);
  const f = fixture();
  assert.equal(validate(f.prescription, f.weekIntent).ok, true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';
const paths = new Set();
const load = sportsRuntime({ fetch() { throw Error('NO_NETWORK'); } }, (path, exports) => { paths.add(path.replaceAll('\\', '/')); return exports; });
const resolve = load('../core/weekIntake').resolveWeekIntake;
const names = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const known = value => ({ status: 'known', source: 'fixture:user_answer', value });
function fixture(includeToday = true, available = names) {
  return { referenceDate: '2026-09-30', target: { kind: 'current_week', source: 'fixture:current_week_request' },
    includeToday: includeToday === null ? undefined : known(includeToday), disciplines: ['carrera'],
    weeklyAvailability: { '2026-09-28': { version: 1, source: 'explicit_user_declaration', availability: { carrera: available },
      resolution: available.length ? 'DECLARED_AVAILABILITY' : 'EXPLICIT_ZERO_TRAINING',
      excludedDisciplines: [], unavailableDays: [], unresolvedDays: [] } } };
}
const today = r => r.eligibility.find(d => d.date === r.referenceDate);
test('true preserves today; current week identity stays Monday to Sunday', () => {
  const r = resolve(fixture()); assert.equal(today(r).status, 'ELIGIBLE');
  assert.equal(r.targetWindow.startDate, '2026-09-28'); assert.equal(r.targetWindow.endDate, '2026-10-04');
  assert.equal(r.eligibility[0].status, 'EXCLUDED'); assert.equal(r.temporalDecision.includeToday, true);
  assert.equal(r.temporalDecision.source, 'fixture:user_answer');
});
test('false excludes today, without selecting next available date or any session', () => {
  const r = resolve(fixture(false)); assert.equal(today(r).status, 'EXCLUDED');
  assert.equal(r.temporalDecision.includeToday, false); assert.equal(r.eligibility[3].status, 'ELIGIBLE');
  assert.doesNotMatch(JSON.stringify(r), /TRAIN|REST|frequency|purpose|methodId|session/);
});
test('omitted, unknown and read-failed decisions never default to false', () => {
  for (const choice of [undefined, { status:'unknown', value:null, source:'fixture', reason:'missing' },
    { status:'read_failed', value:null, source:'fixture', reason:'failure' }]) {
    const f=fixture(); f.includeToday=choice; const r=resolve(f);
    assert.equal(r.temporalDecision.includeToday,null); assert.equal(today(r).status,'UNKNOWN');
    assert.deepEqual(plain(r.unresolved),['INCLUDE_TODAY']);
  }
});
test('future week needs no today question, and explicit Monday is retained', () => {
  const f=fixture(null); f.target={kind:'week',startDate:'2026-10-05',source:'fixture:date'};
  f.weeklyAvailability['2026-10-05']=f.weeklyAvailability['2026-09-28'];
  const r=resolve(f); assert.equal(r.temporalDecision.status,'not_applicable');
  assert.equal(r.temporalDecision.includeToday,null); assert.deepEqual(plain(r.unresolved),[]);
  assert.equal(r.targetWindow.startDate,'2026-10-05');
  f.target={kind:'next_week',source:'fixture:date'}; assert.deepEqual(plain(resolve(f)),plain(r));
});
test('civil dates ignore host time of day/time zone and cross year/leap/DST boundaries', () => {
  const calendar=load('../planning/civilCalendar');
  for (const [d,next] of [['2026-12-31','2027-01-01'],['2028-02-28','2028-02-29'],['2026-03-29','2026-03-30']])
    assert.equal(calendar.addCivilDays(d,1),next);
  const prior=process.env.TZ;
  try { const f=fixture(), a=plain(resolve(f)); process.env.TZ='Pacific/Honolulu'; assert.deepEqual(plain(resolve(f)),a);
    process.env.TZ='Europe/Madrid'; assert.deepEqual(plain(resolve(f)),a);
  } finally { if(prior===undefined) delete process.env.TZ; else process.env.TZ=prior; }
  for(const date of ['2026-09-30T00:01:00Z','2026-09-30T23:59:00Z','2026-02-30'])
    assert.throws(()=>resolve({...fixture(),referenceDate:date}),/INVALID_INPUT/);
});
test('unsupported midweek starts and past windows reject instead of shifting the request',()=>{
  for(const startDate of ['2026-10-01','2026-09-21'])
    assert.throws(()=>resolve({...fixture(),target:{kind:'week',startDate,source:'fixture'}}),/TARGET/);
});
test('seven available days are facts only, with no prescribed sports decision',()=>{
  const f=fixture(), before=plain(f), r=resolve(f);
  assert.equal(r.availability.days.length,7); assert.ok(r.availability.days.every(d=>d.status==='AVAILABLE'));
  assert.doesNotMatch(JSON.stringify(r),/TRAIN|REST|frequency|purpose|methodId|session/);
  assert.deepEqual(plain(f),before); assert.deepEqual(plain(resolve(f)),plain(r));
});
test('mixed availability and known unavailable today survive includeToday=true',()=>{
  const r=resolve(fixture(true,['martes','jueves']));
  assert.deepEqual(plain(r.availability.days.map(d=>d.status)),['UNAVAILABLE','AVAILABLE','UNAVAILABLE','AVAILABLE','UNAVAILABLE','UNAVAILABLE','UNAVAILABLE']);
  assert.equal(today(r).status,'ELIGIBLE'); // Temporal eligibility is not availability.
});
test('unknown availability remains unknown and missing discipline is not inferred',()=>{
  const f=fixture(); f.disciplines.push('swimming'); const r=resolve(f);
  assert.ok(r.availability.days.filter(d=>d.discipline==='swimming').every(d=>d.status==='UNKNOWN'));
  assert.deepEqual(plain(r.unresolved),['WEEK_AVAILABILITY']);
});
test('habitual Core facts retain provenance and still need explicit week confirmation',()=>{
  const f=fixture(); delete f.weeklyAvailability;
  f.habitual={source:'habitual_persisted_availability',disciplineDiscovery:'known',byDiscipline:{carrera:known(['lunes','martes'])}};
  const r=resolve(f); assert.equal(r.availability.days[0].basis,'habitual');
  assert.equal(r.availability.days[0].source,'fixture:user_answer');
  assert.deepEqual(plain(r.unresolved),['WEEK_AVAILABILITY']);
  f.weeklyAvailability=fixture().weeklyAvailability;
  assert.ok(resolve(f).availability.days.every(d=>d.basis==='explicit_week'&&d.status==='AVAILABLE'));
});
test('explicit zero and explicit exclusions never grant availability',()=>{
  const zero=resolve(fixture(null,[])); assert.deepEqual(plain(zero.unresolved),[]);
  assert.equal(zero.temporalDecision.status,'not_applicable'); assert.equal(today(zero).status,'EXCLUDED');
  const f=fixture(); f.weeklyAvailability['2026-09-28'].unavailableDays=['jueves'];
  assert.equal(resolve(f).availability.days[3].status,'UNAVAILABLE');
});
for(const [temporal,weekly,expected] of [[true,true,[]],[null,true,['INCLUDE_TODAY']],
  [true,false,['WEEK_AVAILABILITY']],[null,false,['INCLUDE_TODAY','WEEK_AVAILABILITY']]])
  test(`minimal unresolved questions temporal=${temporal} weekly=${weekly}`,()=>{
    const f=fixture(temporal); if(!weekly) delete f.weeklyAvailability;
    assert.deepEqual(plain(resolve(f).unresolved),expected);
  });
test('wrong week or malformed weekly declaration is never confirmed',()=>{
  const f=fixture(); f.weeklyAvailability['2026-09-28'].unresolvedDays=['jueves'];
  assert.ok(resolve(f).availability.days.every(d=>d.status==='UNKNOWN'));
  f.weeklyAvailability={'2026-10-05':fixture().weeklyAvailability['2026-09-28']};
  assert.deepEqual(plain(resolve(f).unresolved),['WEEK_AVAILABILITY']);
});
test('runtime is factual only: no calendar prescription policy, Builder, provider or persistence',()=>{
  assert.doesNotMatch([...paths].join('\n'),/\/(?:chat|providers)\/|\/(?:weeklyCalendar|strategyResolution|canonicalWeekStrategy|weeklyCalendarAuthority|trainingFrequencySafetyNet|planPersistence|sessionGeneration|weekPrescription|sessionAuthority)\.ts|\/(?:[^/]*Analyzer|[^/]*Planner)[^/]*\.ts/i);
});

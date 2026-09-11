import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sportsRuntime, plain, fakeDatabase, equippedProfileFixture } from '../sports/trainingContractTestRuntime.mjs';
const load = sportsRuntime({ console: { info(){}, log(){}, warn(){} } });
const a = load('../athlete/eventAuthority'), actions = load('../athlete/eventActions');
const project = load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
const strategy = load('../planning/canonicalWeekStrategy');
const today = '2026-09-10', now = Date.parse(today + 'T12:00:00Z');
const coach = {mode:'coach',prescriptionAllowed:true,managedDisciplines:['carrera','box'],externalDisciplines:[]};
const event = (date='2026-11-15', previous, goal='half_marathon') => a.declareTargetEvent('u',goal,date,today,previous,new Date(now).toISOString());
const resolve = (stored, scope=coach, goal='half_marathon', date=today, legacy=[]) => a.resolveEventAuthority({stored,legacy},goal,scope,date,'u');
test('A/O goal stays valid without event: general development',()=>{
  assert.equal(resolve().planningMode,'GENERAL_DEVELOPMENT');
  const context=project({objetivo_principal:'half_marathon'});
  assert.equal(load('../athlete/goalResolution').resolveGoalAuthority(context).canonicalGoalId,'half_marathon');
});
test('B/C confirmed future event supplies exact civil horizon, no phase authority',()=>{
  const r=resolve(event()); assert.equal(r.planningMode,'EVENT_PREPARATION');
  assert.equal(r.daysRemaining,66); assert.equal(r.weeksRemaining,66/7); assert.equal(r.periodizationAuthority,false);
  assert.equal(r.targetEvent.provenance.source,'structured_event_form');
});
for(const date of ['2026-02-30','2026-13-01','2026-11-15T00:00:00Z','15 de noviembre','2026-2-03',''])
 test(`E/F rejects invalid or ambiguous date ${date}`,()=>assert.throws(()=>event(date),/EVENT_DATE_INVALID/));
for(const date of ['2026-09-09',today]) test(`D rejects nonfuture active event ${date}`,()=>assert.throws(()=>event(date),/EVENT_DATE_NOT_FUTURE/));
test('C civil leap dates and DST boundaries use one day arithmetic',()=>{
  assert.equal(a.civilDay('2028-03-01')-a.civilDay('2028-02-28'),2);
  assert.equal(a.civilDay('2026-03-30')-a.civilDay('2026-03-28'),2);
});
test('C past/same-day existing event explicitly diagnosed without negative horizon',()=>{
  assert.equal(resolve(event(),coach,'half_marathon','2026-11-15').validity,'EVENT_TODAY');
  const r=resolve(event(),coach,'half_marathon','2026-11-16');
  assert.equal(r.validity,'EVENT_PAST');assert.equal(r.daysRemaining,null);assert.equal(r.weeksRemaining,null);assert.equal(r.planningMode,'GENERAL_DEVELOPMENT');
});
test('F forged/unsigned/tampered/cross-athlete confirmation cannot grant authority',()=>{
  const e=event(); const changed=plain(e);changed.event.eventDate='2026-12-01';
  for(const invalid of [e.event,changed,{event:e.event,signature:'fake'}]) assert.equal(resolve(invalid).validity,'INVALID_CONFIRMATION');
  assert.equal(a.resolveEventAuthority({stored:e},'half_marathon',coach,today,'other').validity,'INVALID_CONFIRMATION');
});
test('JSONB key reordering preserves signatures, event digests and form fingerprints',()=>{
  const reorder=v=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reorder(x)])):v;
  const original=event(),stored=reorder(original);
  assert.equal(resolve(stored).planningMode,'EVENT_PREPARATION');assert.equal(resolve(stored).digest,resolve(original).digest);
  assert.equal(a.eventDigest(original),a.eventDigest(stored));
});
test('G changed event produces revision/digest and invalidates canonical strategy context',()=>{
  const first=event(),next=event('2026-12-01',first);
  assert.equal(next.event.eventId,first.event.eventId);assert.equal(next.event.revision,2);
  assert.notEqual(resolve(first).digest,resolve(next).digest);
  const build=e=>strategy.buildCanonicalWeekStrategy({...project({objetivo_principal:'half_marathon',perfil:{targetEvent:e}}),asOfDate:today,userCodigo:'u'},coach,3);
  const before=build(first), after=build(next);
  assert.notEqual(a.eventDigest(before),a.eventDigest(after));
  assert.deepEqual(plain(before.adaptations),plain(after.adaptations));assert.deepEqual(plain(before.block),plain(after.block));
  assert.equal(before.volumeIntent,after.volumeIntent);
});
test('G goal change/cancellation cannot reuse old preparation authority',()=>{
  assert.equal(resolve(event(),coach,'10k').validity,'GOAL_CHANGED');
  assert.equal(resolve(a.cancelTargetEvent(event(),'u')).validity,'INACTIVE');
});
test('H supervision stores context but cannot plan',()=>{
  const r=resolve(event(),{mode:'supervision',prescriptionAllowed:false,managedDisciplines:[],externalDisciplines:['carrera']});
  assert.equal(r.validity,'CONTEXT_ONLY');assert.equal(r.planningMode,'GENERAL_DEVELOPMENT');assert.ok(r.targetEvent);
});
test('I/J Focus only manages its owned discipline',()=>{
  const managed={mode:'focus',prescriptionAllowed:true,managedDisciplines:['carrera'],externalDisciplines:['box'],focusDiscipline:'carrera'};
  assert.equal(resolve(event(),managed).planningMode,'EVENT_PREPARATION');
  const external={...managed,managedDisciplines:['box'],externalDisciplines:['carrera'],focusDiscipline:'box'};
  assert.equal(resolve(event(),external).validity,'CONTEXT_ONLY');
});
test('K Coach never expands scope from event',()=>{
  const saved=JSON.stringify(coach);resolve(event(),coach);assert.equal(JSON.stringify(coach),saved);
  assert.equal(resolve(event(),{...coach,managedDisciplines:['box']}).validity,'CONTEXT_ONLY');
});
test('L/M legacy exact candidates preserved, never silently attest mixed-writer dates',()=>{
  const user={objetivo_principal:{descripcion:'half_marathon',fecha:'2026-11-15'},perfil:{proxima_carrera:'2026-12-01',objetivo_detalle:'15 de noviembre'}};
  const saved=JSON.stringify(user), legacy=a.legacyEventCandidates(user);
  assert.equal(resolve(undefined,coach,'half_marathon',today,legacy).validity,'LEGACY_CONFLICT');
  assert.equal(resolve(undefined,coach,'half_marathon',today,legacy.slice(0,1)).validity,'CONFIRMATION_REQUIRED');
  assert.equal(legacy.find(c=>c.source.endsWith('objetivo_detalle')).date,null);
  assert.equal(JSON.stringify(user),saved);
  const confirmed=a.declareTargetEvent('u','half_marathon',legacy[0].date,today,null,new Date(now).toISOString(),[legacy[0].source]);
  assert.equal(resolve(confirmed).planningMode,'EVENT_PREPARATION');assert.equal(confirmed.event.provenance.legacySources[0],legacy[0].source);
});
test('N Analyzer proposal cannot supply date/mode/horizon/phase',()=>{
  const canonical=resolve(event());
  const bounded=a.boundEventAnalysis({eventDate:'2099-01-01',planningMode:'invented',weeksRemaining:999,objetivo:'taper now',eventAuthority:{eventDate:'fake'},strategyProposal:{version:1,preferredAdaptations:[]}},canonical);
  assert.equal(bounded.eventDate,undefined);assert.equal(bounded.planningMode,undefined);
  assert.deepEqual(plain(bounded.eventAuthority),plain(canonical));assert.equal(bounded.objetivo,a.eventAuthorityText(canonical));
  for(const key of ['eventDate','eventId','planningMode','weeksRemaining','phase']) assert.throws(()=>strategy.normalizeStrategyProposal({version:1,preferredAdaptations:[],[key]:'invented'},[]),/STRATEGY_PROPOSAL_INVALID/);
  const code=readFileSync('app/api/chat/route.ts','utf8');
  assert.match(code,/strategyVersion: 1, strategyProposal: datos\.analisis\?\.strategyProposal/);
  assert.match(code,/EVENT_AUTHORITY \(solo lectura\)/);
});
test('G real weekly contract digest changes on event update without changing adaptation or dose intent',async()=>{
  const first=event('2026-11-15',undefined,'crossfit');
  const tables={usuarios:{codigo:'u',modo_entrada:'coach',categoria:'box',especialidad:'funcional_crossfit',objetivo_principal:'crossfit',
    perfil:{...equippedProfileFixture(),dias:3,targetEvent:first},distribucion_semanal:{box:['lunes','miercoles','viernes']},workout_history:[]},
    athlete_training_sources:[],athlete_state_events:[],athlete_coaching_notes:[],weekly_plan:[],session_modification_events:[],physiology_records:[],running_execution_records:[]};
  const db=fakeDatabase(tables), request={targetWeekStart:'2026-09-14',today,empezarHoy:false,snapshot:null,strategyVersion:1};
  const prepare=load('../planning/prepareAllowedWeeklyPlanContract').prepareAllowedWeeklyPlanContract;
  const before=await prepare(db,'u',request);assert.equal(before.ok,true,JSON.stringify(before));
  assert.equal(before.contract.strategy.eventAuthority.planningMode,'EVENT_PREPARATION');
  tables.usuarios.perfil.targetEvent=event('2026-12-01',first,'crossfit');
  const after=await prepare(db,'u',request);assert.equal(after.ok,true,JSON.stringify(after));
  assert.notEqual(before.contract.contextDigest,after.contract.contextDigest);
  assert.deepEqual(plain(before.contract.strategy.adaptations),plain(after.contract.strategy.adaptations));
  const freshness=readFileSync('lib/planning/weeklyCalendarAuthority.ts','utf8');
  assert.match(freshness,/rebuilt\.contract\.contextDigest !== evidence\.contextDigest/);
});
function database(overrides={}) {
  let user={codigo:'u',objetivo_principal:'half_marathon',modo_entrada:'coach',categoria:'carrera',especialidad:'carrera',perfil:{},...overrides};
  const writes=[];
  return {writes,get user(){return user;},from(table){let update;const filters=[];
    const result=()=>{if(update){if(filters.some(([k,v])=>JSON.stringify(user[k]??null)!==JSON.stringify(v)))return {data:[],error:null};user={...user,...update};writes.push(update);return {data:[{codigo:'u'}],error:null};}return {data:table==='usuarios'?user:[],error:null};};
    return {select(){return this;},eq(k,v){if(update)filters.push([k,typeof v==='string'&&['perfil','objetivo_principal','distribucion_semanal'].includes(k)&&/^[{[]/.test(v)?JSON.parse(v):v]);return this;},is(k,v){filters.push([k,v]);return this;},single:async()=>result(),update(v){update=v;return this;},then(yes,no){return Promise.resolve(result()).then(yes,no);}};
  }};
}
test('P form can explicitly continue without date; goal preserved',async()=>{
  const db=database(),r=await actions.eventAction(db,'u','read',{},today,now);
  const saved=await actions.eventAction(db,'u','without_date',{token:r.token},today,now);
  assert.equal(saved.authority.planningMode,'GENERAL_DEVELOPMENT');assert.equal(db.user.objetivo_principal,'half_marathon');
  assert.match(saved.message,/desarrollo general/);
});
test('structured exact declaration persists signed event; changed date rejects old form replay',async()=>{
  const db=database(),r=await actions.eventAction(db,'u','read',{},today,now);
  const saved=await actions.eventAction(db,'u','declare',{token:r.token,eventDate:'2026-11-15'},today,now);
  assert.equal(saved.authority.daysRemaining,66);assert.equal(db.user.perfil.targetEvent.event.confirmation,'CONFIRMED');
  await assert.rejects(()=>actions.eventAction(db,'u','declare',{token:r.token,eventDate:'2026-12-01'},today,now),/STALE/);
  const next=await actions.eventAction(db,'u','read',{},today,now);
  await actions.eventAction(db,'u','declare',{token:next.token,eventDate:'2026-12-01'},today,now);
  assert.equal(db.user.perfil.targetEvent.event.revision,2);
});
test('structured legacy review retains original data and source',async()=>{
  const legacy={descripcion:'half_marathon',fecha:'2026-11-15'},db=database({objetivo_principal:legacy});
  const r=await actions.eventAction(db,'u','read',{},today,now);
  assert.equal(r.authority.confirmationRequired,true);
  await actions.eventAction(db,'u','declare',{token:r.token,eventDate:legacy.fecha},today,now);
  assert.deepEqual(db.user.objetivo_principal,legacy);assert.equal(db.user.perfil.targetEvent.event.provenance.legacySources.length,1);
});
test('weekly event gate is deterministic, canonical, and request-local',async()=>{
  const db=database(), before=JSON.stringify(db.user);
  const required=await actions.resolveWeeklyEventRequirement(db,'u',today,'none',now);
  assert.equal(required.kind,'target_event'); assert.equal(required.authority.validity,'NO_EVENT');
  assert.ok(required.token); assert.equal(JSON.stringify(db.user),before); assert.equal(db.writes.length,0);
  const saved=await actions.eventAction(db,'u','declare',{token:required.token,eventDate:'2026-11-15'},today,now);
  assert.equal(saved.authority.planningMode,'EVENT_PREPARATION');
  assert.equal(await actions.resolveWeeklyEventRequirement(db,'u',today,'none',now),null);
  assert.equal(await actions.resolveWeeklyEventRequirement(db,'u',today,'without_date',now),null);
});
test('unsupported goal does not force weekly event resolution',async()=>{
  const db=database({objetivo_principal:'objetivo personal no catalogado'});
  assert.equal(await actions.resolveWeeklyEventRequirement(db,'u',today,'none',now),null);
});
test('challenge rejects expiry, another athlete and changed snapshot',()=>{
  const token=a.issueEventForm('u','snapshot',now);
  for(const [u,s,t] of [['v','snapshot',now],['u','changed',now],['u','snapshot',now+31*60000]]) assert.throws(()=>a.verifyEventForm(token,u,s,t),/STALE/);
});
test('UI offers optional date and confirms via dedicated form; generic creation drops event authority',()=>{
  const ui=readFileSync('components/TargetEventForm.tsx','utf8');
  assert.match(ui,/request\(\{ operation: 'read' \}\)/);assert.match(ui,/Sí, añadir fecha/);assert.match(ui,/Todavía no/);
  assert.match(ui,/type="date"/);assert.match(ui,/operation, eventDate: date, token: context.token/);
  assert.match(ui,/save\('declare'\)/);assert.match(ui,/save\('without_date'\)/);assert.match(ui,/aria-label="Cerrar"/);
  assert.match(ui,/borderRadius: 20/);assert.match(ui,/background: '#F8FBF9'/);assert.match(ui,/minHeight: 48/);
  assert.doesNotMatch(ui,/Cerrar y continuar|eventAuthorityText/);
  const created=load('../auth/legacyContainment').projectLegacyCreate({perfil:{targetEvent:event(),objetivo_detalle:'keep'}});
  assert.equal(created.perfil.targetEvent,undefined);assert.equal(created.perfil.objetivo_detalle,'keep');
  const route=readFileSync('app/api/chat/route.ts','utf8');assert.match(route,/delete profilePatch\.perfil\.targetEvent/);
  for(const name of ['app/FormaPro.tsx','lib/mobile/buildPrompt.ts']) assert.doesNotMatch(readFileSync(name,'utf8'),/Si la fecha se acerca, ajusta la periodización|Semanas restantes:.*Math/);
});

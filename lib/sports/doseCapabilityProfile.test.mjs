import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { numericPolicyFixture } from './runningDoseV2TestFixture.mjs';
import { sportsRuntime, plain, fakeDatabase, contractFixture, equippedProfileFixture } from './trainingContractTestRuntime.mjs';
const load = sportsRuntime({ console: { log() {}, info() {}, warn() {} } });
const capture = load('../athlete/runningHabitualDeclarations');
const today = '2026-09-09', date = today + 'T12:00:00.000Z';
const durationField = 'habitualEasyRunningDurationMinutes', frequencyField = 'habitualRunningSessionsPerWeek';
const declarations = (duration = 45, frequency = 4) => [capture.habitualRunningFact(durationField, duration, date), capture.habitualRunningFact(frequencyField, frequency, date)];
const profile = (facts = declarations(), extra = {}) => ({ ...extra, runningHabitualDeclarations: Object.fromEntries(facts.map(f => [f.field, f])) });
const baseline = (p = profile()) => load('../athlete/runningDoseEvidence').projectRunningDoseBaseline({ perfil: p }, [], load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile({perfil:p}).running.references, today);
const admit = b => load('runningDoseEvidenceAuthority').admitRunningDoseEvidence(b);
const scope = { mode: 'coach', prescriptionAllowed: true, managedDisciplines: ['carrera'], externalDisciplines: [] };
const context = { goalId: 'half_marathon', blockPhase: 'intensification', blockWeek: 1 };
const cap = (b = baseline(), s = scope) => load('doseCapabilityProfile').buildDoseCapabilityProfile(admit(b), s, context);
const aerobic = c => c.entries.find(e => e.methodId === 'running_base');
const intent = methodId => ({ kind: 'adaptation', methodId, adaptationId: load('goalTransferModel').transferMethod(methodId).adaptationId,
  pattern: 'run', role: 'PRIMARY', weaknessId: null, ...context });
const compatible = (method, b = baseline()) => load('runningDoseCompatibility').resolveCompatibleRunningDoseEvidence(admit(b), intent(method));

test('A B: exact independent DECLARED facts survive canonical baseline and admission', () => {
  const a = admit(baseline()); assert.equal(a.status, 'DECLARED');
  assert.deepEqual(plain(a.basis.habitualDeclarations.facts), plain(capture.normalizeHabitualRunningFacts(declarations()).facts));
  for (const f of a.basis.habitualDeclarations.facts) {
    assert.equal(f.authority, 'DECLARED'); assert.equal(f.confirmedAt, date); assert.equal(f.freshness, 'UNKNOWN');
    assert.match(f.source, /^usuarios\.perfil\.runningHabitualDeclarations\./);
  }
  assert.equal(a.admissibleEvidence.length, 0); assert.equal(a.coverage.completedRunningSessions, 0);
});
test('C: explicit no habitual run is not numeric zero or a target', () => {
  const c = cap(baseline(profile(declarations('NO_HABITUAL_EASY_RUN', 0))));
  assert.equal(aerobic(c).doseCapability, 'MISSING_EVIDENCE');
  assert.ok(aerobic(c).missingRequirements.includes('FIRST_EXPOSURE_POLICY_REQUIRED'));
  assert.equal(c.requirement, null);
  assert.equal(admit(baseline(profile(declarations('NO_HABITUAL_EASY_RUN', 0)))).basis.habitualDeclarations.facts.find(f => f.field === durationField).value, null);
});
for (const [name, p] of [['D', { duracion: 'Hasta 1h 30min' }], ['E', { dias: 4, distribucion_semanal: { carrera: ['lunes','martes','jueves','sabado'] } }], ['F', { nivel: 'Intermedio (1-3 años)' }]]) {
  test(`${name}: unrelated profile context cannot manufacture declarations`, () => {
    assert.equal(baseline(p).habitualDeclarations, undefined); assert.equal(aerobic(cap(baseline(p))).doseCapability, 'MISSING_EVIDENCE');
  });
}
test('G H I J K: 30 km, 45 minutes and 4 sessions coexist without conversions, products or targets', () => {
  const b = baseline(profile(declarations(), { km_semana: 30 })), a = admit(b);
  assert.equal(a.basis.declaredWeeklyDistance[0].minimumMeters, 30000);
  assert.deepEqual(plain(a.basis.habitualDeclarations.facts.map(f => f.value).sort((x,y) => x-y)), [4,45]);
  for (const window of Object.values(b.windows)) assert.equal(window.executedDurationSeconds.value, null);
  const serialized = JSON.stringify([b,a,cap(b)]);
  assert.ok(!/:180(?:[},\]])/.test(serialized));
  for (const key of ['weeklyTarget','selectedTarget','targetDuration','targetDistance','maximumAuthorized']) assert.ok(!serialized.includes(key));
  for (const p of load('runningMethodDosePolicies').RUNNING_METHOD_DOSE_POLICIES) {
    const i = intent(p.methodId), r = load('runningMethodDoseAuthority').resolveRunningMethodDose(compatible(p.methodId,b), i);
    if(['running_specific','running_economy'].includes(p.methodId)) assert.equal(p.selectDose, null); assert.equal(r.status, 'UNRESOLVED'); assert.equal(r.dose, null);
  }
});
test('L: only aerobic sees the provenance-preserving declarations', () => {
  assert.deepEqual(plain(compatible('running_base').habitualDeclarations), plain(admit(baseline()).basis.habitualDeclarations));
});
for (const [letter, method] of [['M','running_threshold'],['N','running_vo2'],['O','running_specific'],['P','running_recovery'],['Q','running_economy']]) {
  test(`${letter}: ${method} cannot consume easy declarations as quantitative authority`, () => {
    const e = compatible(method); assert.equal(e.habitualDeclarations, undefined);
    assert.equal(cap().entries.find(e => e.methodId === method).doseCapability, 'MISSING_EVIDENCE');
  });
}
test('R S: readiness of declarations never claims a quantifiable dose', () => {
  assert.equal(aerobic(cap()).doseCapability, 'RECONFIRMATION_REQUIRED');
  assert.equal(aerobic(cap()).policyStatus, 'ESTABLISHED');
  assert.equal(aerobic(cap(baseline({}))).doseCapability, 'MISSING_EVIDENCE');
  assert.equal(cap(baseline({})).requirement.field, durationField);
});
test('T: contradictory declarations conflict only in compatible aerobic evidence', () => {
  const b = load('../athlete/runningDoseBaseline').resolveRunningDoseBaseline(today, [], [], [...declarations(), capture.habitualRunningFact(durationField, 60, date)]);
  assert.equal(aerobic(cap(b)).doseCapability, 'CONFLICT');
  assert.equal(cap(b).entries.find(e => e.methodId === 'running_threshold').doseCapability, 'MISSING_EVIDENCE');
  assert.equal(aerobic(cap(baseline(profile(declarations(45,0))))).doseCapability, 'CONFLICT');
});
function weeklyInput(s = scope, b = baseline(), runtime = load) {
  const allowed = { carrera: ['lunes','miercoles','viernes'], box: ['martes','jueves'] };
  const contexts = Object.fromEntries(s.managedDisciplines.map(d => [d, contractFixture({ discipline: d, prescriptionScope: s, availableDays: allowed[d], exposureContext: {source:'legacy_completed_weekly_rows',report:{disciplina:d,exposiciones:[],estimulosSubexpuestos:[],estimulosSobreexpuestos:[]},limitations:[]} })]));
  const athlete = runtime('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile({ especialidad:'carrera', objetivo_principal:'half_marathon', ciclo_actual:{bloque:'intensification'} });
  return { targetWeekStart:'2026-09-14', prescriptionScope:s, contexts, allowed, fixed:{}, maxExecutableDays:5, completeNewWeek:true,
    doseCapabilities:cap(b,s), strategy:runtime('../planning/canonicalWeekStrategy').buildCanonicalWeekStrategy(athlete,s,5) };
}
test('U V W Z: unresolved methods filtered before feasibility/Planner; no threshold to base substitution', () => {
  let feasibility = 0;
  const runtime = sportsRuntime({}, (path, exports) => path.replaceAll('\\','/').endsWith('/trainingFeasibility.ts')
    ? {...exports, evaluateTrainingFeasibility() { feasibility++; throw Error('MUST_NOT_REACH'); }} : exports);
  const input = weeklyInput(scope,baseline(),runtime);
  input.strategy.methods=input.strategy.methods.filter(m=>input.doseCapabilities.entries.some(e=>e.methodId===m));
  const r = runtime('../planning/authorizedMethodCandidates').resolveAuthorizedMethodCandidates(input,'lunes');
  assert.equal(r.ok,true); assert.equal(r.options.length,0); assert.equal(feasibility,0);
  assert.ok(r.doseUnavailable.some(e=>e.methodId==='running_threshold'));
  const result = runtime('../planning/allowedWeeklyPlanContract').buildAllowedWeeklyPlanContract(input);
  assert.equal(result.code,'RUNNING_DOSE_CAPABILITY_INSUFFICIENT'); assert.equal(result.contract,undefined);
  assert.equal(result.runningHabitualRequirement,null); assert.equal(feasibility,0);
});
test('X Y: capture and evidence cannot grant Supervision or external Focus prescription authority', () => {
  for (const s of [{mode:'supervision',prescriptionAllowed:false,managedDisciplines:[],externalDisciplines:['carrera']},
    {mode:'focus',prescriptionAllowed:true,managedDisciplines:['box'],externalDisciplines:['carrera'],focusDiscipline:'box'}]) {
    const before=JSON.stringify(s), c=cap(baseline(),s);
    assert.equal(aerobic(c).doseCapability,'RECONFIRMATION_REQUIRED'); assert.ok(c.entries.every(e=>!e.prescriptionAllowed));
    assert.equal(c.requirement,null); assert.equal(JSON.stringify(s),before);
  }
});
test('AA AB: SessionDoseContext bytes and digest unchanged; canonical declarations never enter Builder context', () => {
  const project=load('../athlete/athletePrescriptionContext').projectAthletePrescriptionProfile;
  const before=project({especialidad:'carrera',objetivo_principal:'half_marathon',perfil:{...equippedProfileFixture(),duracion:'90 min'}});
  const after=project({especialidad:'carrera',objetivo_principal:'half_marathon',perfil:profile(declarations(),{...equippedProfileFixture(),duracion:'90 min'})});
  const build=p=>load('sessionDoseContext').buildSessionDoseContext(p,intent('running_base'),null,[],true);
  assert.deepEqual(plain(build(before)),plain(build(after)));
  assert.ok(!JSON.stringify(build(after)).includes('habitualEasyRunningDuration'));
});
test('AC: stable deduplication and recency UNKNOWN even for an old declaration', () => {
  const old=capture.habitualRunningFact(durationField,45,'2020-01-01T00:00:00Z');
  const b=load('../athlete/runningDoseBaseline').resolveRunningDoseBaseline(today,[],[],[old,old,declarations()[1]]);
  const c=load('../athlete/runningDoseBaseline').resolveRunningDoseBaseline(today,[],[],[declarations()[1],old]);
  assert.deepEqual(plain(cap(b)),plain(cap(c))); assert.equal(b.habitualDeclarations.facts.length,2);
  assert.equal(aerobic(cap(b)).doseCapability,'RECONFIRMATION_REQUIRED');
});
test('provenance rejects spoofed execution, units, sources and arbitrary extra fields', () => {
  for(const patch of [{authority:'OBSERVED'},{unit:'seconds'},{source:'LLM'},{value:-1},{confirmedAt:'invalid'}]) {
    const b=baseline(); b.habitualDeclarations.facts=[{...declarations()[0],...patch}];
    assert.equal(admit(b).basis.habitualDeclarations,undefined);
  }
  const b=baseline(); b.habitualDeclarations.facts[0].prompt='PRIVATE';
  assert.ok(!JSON.stringify(admit(b)).includes('PRIVATE'));
});
test('capture validation is exact, idempotent, updates current facts and preserves unrelated profile fields', async () => {
  let stored={perfil:{km_semana:30,dias:5}};
  const db={from(){return {select(){return this;},eq(){return this;},single:async()=>({data:stored,error:null}),
    update(value){stored=plain(value);return this;},then(yes){return Promise.resolve({error:null}).then(yes);}};}};
  for(const value of [0,-1,1.5,'45 minutos',true,null]) assert.throws(()=>capture.parseHabitualRunningAnswer(durationField,value));
  assert.equal(capture.parseHabitualRunningAnswer(frequencyField,0),0);
  assert.equal(capture.parseHabitualRunningAnswer(durationField,'No tengo un rodaje fácil habitual'),'NO_HABITUAL_EASY_RUN');
  assert.equal((await capture.saveHabitualRunningAnswer(db,'fixture',durationField,'45',date)).requirement.field,frequencyField);
  const before=JSON.stringify(stored);
  await capture.saveHabitualRunningAnswer(db,'fixture',durationField,45,'2026-09-10T00:00:00Z'); assert.equal(JSON.stringify(stored),before);
  assert.equal((await capture.saveHabitualRunningAnswer(db,'fixture',frequencyField,4,date)).requirement,null);
  await capture.saveHabitualRunningAnswer(db,'fixture',durationField,50,date);
  assert.equal(stored.perfil.runningHabitualDeclarations[durationField].value,50); assert.equal(stored.perfil.km_semana,30); assert.equal(stored.perfil.dias,5);
});
test('AD: dedicated JSON writer; generic profile update preserves the declarations', () => {
  const route=readFileSync('app/api/chat/route.ts','utf8'), ui=readFileSync('app/FormaPro.tsx','utf8');
  assert.match(route,/\['prescription_signals', 'prescription_access', 'runningHabitualDeclarations', 'runningHabitualConfirmation'\]/);
  assert.match(route,/action === "responder_habito_carrera"/);
  assert.ok(ui.indexOf('if(pendingRunningHabitualQuestion)')<ui.indexOf('if(pendingPrescriptionQuestion)'));
});
test('coach dose capability and feasible strength can continue in deload without writes', async () => {
  const tables={usuarios:{modo_entrada:'coach',especialidad:'carrera',categoria:'carrera',objetivo_principal:'half_marathon',
    ciclo_actual:{bloque:'deload'},perfil:{...equippedProfileFixture(),dias:4},distribucion_semanal:{carrera:['lunes','miercoles','viernes','sabado']}},
    athlete_training_sources:[],weekly_plan:[],physiology_records:[],session_modification_events:[],athlete_coaching_notes:[],athlete_state_events:[]};
  const db=fakeDatabase(tables);
  const request={targetWeekStart:'2026-09-14',today,snapshot:null};
  const run=()=>load('../planning/weeklyGenerationPreflight').resolveWeeklyGenerationPreflight(db,'fixture',request);
  const first=await run(); assert.equal(first.canContinue,true);
  tables.usuarios.perfil=profile(declarations(),tables.usuarios.perfil);
  const second=await run(); assert.equal(second.canContinue,true);
  const prep=load('../planning/prepareAllowedWeeklyPlanContract');
  const context=await prep.loadWeeklyPlanningContext(db,'fixture',{...request,empezarHoy:false,strategyVersion:1});
  assert.equal(aerobic(context.input.doseCapabilities).doseCapability,'QUANTIFIABLE');
  const prepared=await prep.prepareAllowedWeeklyPlanContract(db,'fixture',{...request,empezarHoy:false,strategyVersion:1});
  assert.equal(prepared.ok,true);
  const methods=Object.values(prepared.contract.dayOptions).flat().flatMap(o=>o.intent?[o.intent.methodId]:[]);
  assert.ok(methods.includes('runner_support_strength'));assert.ok(methods.includes('running_base'));
});

test('observed execution coexists with declarations; method digest binds aerobic facts only', () => {
  const execution={source:'verified_execution',identity:'activity:fixture',date:today,kind:'EXECUTED',metric:'durationSeconds',value:3600,reliability:'verified_actual'};
  const b=load('../athlete/runningDoseBaseline').resolveRunningDoseBaseline(today,[execution],[],declarations());
  const a=admit(b); assert.equal(a.status,'OBSERVED'); assert.equal(a.basis.habitualDeclarations.facts.length,2);
  assert.equal(a.basis.windows['7'].observedDuration.value,3600);
  const digest=method=>load('runningDoseCompatibility').runningDoseDigest(compatible(method,b));
  const beforeBase=digest('running_base'), beforeThreshold=digest('running_threshold');
  b.habitualDeclarations.facts.find(f=>f.field===durationField).value=50;
  assert.notEqual(digest('running_base'),beforeBase); assert.equal(digest('running_threshold'),beforeThreshold);
});
test('accepted TEST policy alone can make capability QUANTIFIABLE; production stays unresolved', () => {
  const runtime=sportsRuntime({},numericPolicyFixture);
  const c=runtime('doseCapabilityProfile').buildDoseCapabilityProfile(admit(baseline()),scope,context);
  assert.equal(aerobic(c).doseCapability,'QUANTIFIABLE');
  assert.equal(aerobic(cap()).doseCapability,'RECONFIRMATION_REQUIRED');
});
test('mixed managed disciplines keep valid methods and explicitly defer dose-unavailable demands', () => {
  const s={...scope,managedDisciplines:['carrera','box']}, input=weeklyInput(s);
  const before=JSON.stringify(input.strategy.adaptations);
  const r=load('../planning/allowedWeeklyPlanContract').buildAllowedWeeklyPlanContract(input);
  assert.equal(r.ok,true,JSON.stringify(r)); assert.equal(JSON.stringify(input.strategy.adaptations),before);
  const options=Object.values(r.contract.dayOptions).flat();
  assert.ok(options.some(o=>o.discipline==='box'));
  assert.ok(!options.some(o=>o.intent?.methodId==='running_base'||o.intent?.methodId==='running_threshold'));
  assert.ok(r.contract.strategy.deferred.some(d=>d.reference.endsWith(':running_threshold')&&d.reason.startsWith('dose_')));
  assert.ok(!load('../planning/allowedWeeklyPlanContract').weeklyPlannerPrompt(r.contract).includes('habitualEasyRunningDurationMinutes'));
});
test('contextual UI answers only through the structured capture action, then clears the pending question', async () => {
  const ui=readFileSync('app/FormaPro.tsx','utf8'), start=ui.indexOf('    if(pendingRunningHabitualQuestion){');
  const code=ui.slice(start,ui.indexOf('    if(pendingPrescriptionQuestion){',start));
  const calls=[], messages=[], pending=[];
  const run=vm.runInNewContext('(async()=>{'+code+'})',{
    pendingRunningHabitualQuestion:{codigo:'fixture',field:durationField},codigoUsuario:'fixture',texto:'45',
    setCargando(){},setGenerandoSemana(){},setInput(){},setMensajes(fn){messages.push(...fn([]));},setPendingRunningHabitualQuestion(v){pending.push(v);},
    apiCall:async body=>{calls.push(body);return {ok:true,requirement:null,message:'DECLARATION_SAVED'};},
  });
  await run(); assert.equal(calls.length,1); assert.equal(calls[0].action,'responder_habito_carrera');
  assert.equal(calls[0].datos.answer,'45'); assert.deepEqual(pending,[null]); assert.equal(messages.at(-1).content,'DECLARATION_SAVED');
});

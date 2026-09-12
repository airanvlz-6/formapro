import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {plain} from '../sports/trainingContractTestRuntime.mjs';
import {load, fixture, context, contract, proposal} from '../sports/runningExecutionReuseFixture.mjs';
const week='2026-09-07', days=load('../planning/weeklyCalendar').calendarDays;
const weekly=load('../planning/allowedWeeklyPlanContract'), adapter=load('../planning/wholeWeekAdapter');
const structured=load('structuredSession'), enforce=load('../planning/enforceWholeWeek').enforceWholeWeek;
const sign=(v,domain)=>{const p=Buffer.from(JSON.stringify(v)).toString('base64url');return p+'.'+createHmac('sha256','isolated-sports-test-key').update(domain+p).digest('base64url');};

// User-confirmed temporal facts. No quantities or actual method invented for Mon/Tue.
// Thursday's discipline/content were not supplied; only its unexecuted state is used.
function snapshot() { return {sessions:[
  {dia:'lunes',tipo:'carrera',completada:true,actual:{disciplina:'carrera'}},
  {dia:'martes',tipo:'box',completada:true,actual:{disciplina:'box'}},
  {dia:'miercoles',tipo:'carrera',completada:false,actual:null,duracion_min:87,
    structuredPrescription:{schemaVersion:2,objective:{intent:{kind:'adaptation',goalId:'half_marathon',adaptationId:'resistencia_especifica',methodId:'running_specific',role:'PRIMARY',pattern:'run'}}}},
  {dia:'jueves',tipo:'pending_unknown',completada:false,actual:null},
  {dia:'viernes',tipo:'descanso',completada:false},
  {dia:'sabado',tipo:'descanso',completada:false},
  {dia:'domingo',tipo:'descanso',completada:false},
]}; }
async function setup() {
  // Quantitative hypothesis: confirmed easy 50 min, no modern method execution.
  // Shared synthetic legacy history establishes experience, never numeric dose.
  const f=fixture({date:'2026-09-11',week,include:[]});
  const user=f.tables.usuarios;
  user.perfil.dias=6;
  user.distribucion_semanal={carrera:['lunes','miercoles','viernes','sabado'],box:['martes','jueves']};
  // Remove the helper's synthetic Tuesday running occurrence from this corrected week.
  user.workout_history=user.workout_history.filter(r=>r.fecha<week);
  user.workout_history.push({fecha:'2026-09-07',tipo:'carrera',workout_id:'fixture-mon'}, {fecha:'2026-09-08',tipo:'box',workout_id:'fixture-tue'});
  const duration=load('../athlete/runningHabitualDeclarations').habitualRunningFact('habitualEasyRunningDurationMinutes',50,'2026-09-11T12:00:00Z');
  user.perfil.runningHabitualDeclarations={habitualEasyRunningDurationMinutes:duration};
  user.perfil.runningHabitualConfirmation=load('../athlete/runningHabitualConfirmation').issueRunningHabitualConfirmation('u',f.request,duration);
  f.request.empezarHoy=true;f.request.snapshot=snapshot();
  f.request.strategyProposal={version:1,preferredAdaptations:['resistencia_especifica','umbral','economia_carrera','base_aerobica','potencia','cadena_posterior','fuerza_general']};
  f.tables.weekly_plan=[{week_start:week,sessions:f.request.snapshot.sessions}];
  const ctx=await context(f);assert.equal(ctx.ok,true,JSON.stringify(ctx));
  const prepared=weekly.buildAllowedWeeklyPlanContract(ctx.input);assert.equal(prepared.ok,true,JSON.stringify(prepared));
  return {f,ctx,w:prepared.contract};
}
function selection(w,both=true) { return {contractVersion:1,contextDigest:w.contextDigest,selections:days.map(day=>{
  const options=w.dayOptions[day],o=(day==='viernes'||both&&day==='sabado')?options.find(o=>o.intent?.methodId==='running_base'):options.find(o=>o.protected||o.state==='REST');
  assert.ok(o,day);return {day,optionId:o.optionId,decision:{role:o.state==='REST'?'RECOVERY':'PRIMARY',reason:'Fixture: continuidad con el pasado protegido.'}};
})}; }
async function admitted() {
  const s=await setup(),selected=selection(s.w),options=selected.selections.map(v=>s.w.dayOptions[v.day].find(o=>o.optionId===v.optionId));
  const cs=await Promise.all(['viernes','sabado'].map(day=>contract(s.f,'running_base',day,options[days.indexOf(day)].intent)));
  const ps=cs.map(proposal), fresh=cs.map((c,i)=>structured.renderContractSession(c,ps[i]));
  const rows=days.map(day=>s.ctx.fixedSessions[day]??fresh.find(r=>r.dia===day)??{dia:day,tipo:'descanso'});
  const evidence={codigo:'u',week,expires:Date.now()+60000,protocolVersion:2,contractDigest:'fixture-pre-fix',contextDigest:s.w.contextDigest,
    prescriptionScope:s.w.prescriptionScope,strategy:s.w.strategy,
    admittedSlots:options.map((o,i)=>({...o,day:days[i],targetDate:'2026-09-'+String(7+i).padStart(2,'0')}))};
  // Signed pre-fix admission to exercise the existing repair pipeline after prevention is installed.
  const receipt=sign(evidence,'forge-week-calendar-v1:');
  const sources=fresh.map((r,i)=>({...r,sessionReceipt:sign({userCodigo:'u',expiresAt:Date.now()+60000,contract:cs[i],proposal:ps[i],weekly:{calendarReceipt:receipt,optionId:options[i+4].optionId}},'forge-session-contract-v1:')}));
  return {...s,cs,ps,rows,evidence,receipt,sources,authority:{evidence,contexts:s.ctx.input.contexts}};
}

test('FORGE12 coach dose capability does not require exact reuse and carries no fixed targets',async(t)=>{
  const {ctx,w}=await setup();
  assert.equal(ctx.input.strategy.eventAuthority.planningMode,'EVENT_PREPARATION');
  assert.equal(ctx.input.strategy.eventAuthority.daysRemaining,65);
  assert.equal(ctx.runningEventPreparation.longitudinalState,'ESTABLISHED_CURRENT');
  const entries=ctx.input.doseCapabilities.entries;
  assert.deepEqual(plain(entries.filter(e=>e.prescriptionAllowed).map(e=>e.methodId)),['running_base','running_recovery','running_long_run','running_threshold']);
  assert.ok(entries.every(e=>e.longitudinalDose.selectedDose===null));
  for(const e of entries.filter(e=>e.methodId!=='running_base'))assert.equal(e.longitudinalDose.selectedDose,null);
  t.diagnostic(JSON.stringify({capabilities:entries.map(e=>({method:e.methodId,dose:e.doseCapability,allowed:e.prescriptionAllowed,reason:e.prescriptionBlockReason}))}));
  const base=entries.find(e=>e.methodId==='running_base');
  assert.equal(base.longitudinalDose.numericProgressionAuthorized,true);
  assert.equal(base.fixedPrescription,undefined);
  for(const day of ['viernes','sabado'])assert.ok(w.dayOptions[day].some(o=>o.intent?.methodId==='running_threshold'));
  assert.ok(w.strategy.deferred.some(d=>d.reference==='adaptation:resistencia_especifica'));
});

test('FORGE12 individual Builders pass, real whole-week adapter requires repair for the exact pair',async(t)=>{
  const f=await admitted();
  for(let i=0;i<2;i++)assert.equal((await load('sessionGeneration').generateContractSession(f.cs[i],[],async()=>JSON.stringify(f.ps[i]))).ok,true);
  const initial=adapter.validateAdmittedWholeWeek(week,f.rows,f.evidence,f.ctx.input.contexts);
  assert.equal(initial.status,'repair_required');
  const errors=initial.diagnostics.filter(d=>d.severity==='ERROR');
  assert.deepEqual(plain(errors.map(d=>({code:d.code,ids:d.sessionIds,dimension:d.dimension,repairability:d.repairability}))),[
    {code:'WEEK_EXACT_DUPLICATE',ids:['viernes:4','sabado:5'],dimension:'dose',repairability:'same_contract'}]);
  assert.ok(Object.values(errors[0].evidence).every(v=>v===true||v===1));
  const before=plain(f.rows),prompts=[];
  const result=await enforce('u',week,f.rows,f.sources,f.receipt,f.authority,async prompt=>{prompts.push(prompt);return JSON.stringify(f.ps[1]);});
  assert.equal(result.ok,false);assert.equal(result.code,'WEEK_REPAIR_FAILED');assert.equal(result.repairCount,2);
  assert.equal(result.orchestration.finalStatus,'repair_required');
  assert.deepEqual(plain(result.orchestration.affectedSessionIds),['sabado:5']);
  assert.deepEqual(plain(result.orchestration.stages),['local','targeted'].map(stage=>({stage,targetIds:['sabado:5'],failedIds:[],failedReasons:[],limitExceeded:false,nonRepairableCodes:[]})));
  assert.match(prompts[0],/STAGE:local/);assert.match(prompts[1],/STAGE:targeted/);
  assert.deepEqual(plain(f.rows),before);assert.equal(result.sessions,undefined);
  t.diagnostic(JSON.stringify({initialStatus:initial.status,diagnostics:initial.diagnostics,
    affectedObjectives:f.cs.map(c=>({day:c.targetDay,intent:c.intent})),orchestration:result.orchestration}));
  // Preserve the supplied planned-only Wednesday in a second input: same blocking invariant.
  // Incomplete legacy prescription and unknown Thursday content remain explicit warnings.
  const originalRows=plain(f.rows);originalRows[2]=f.f.request.snapshot.sessions[2];originalRows[3]=f.f.request.snapshot.sessions[3];
  assert.deepEqual(plain(adapter.validateAdmittedWholeWeek(week,originalRows,f.evidence).diagnostics.filter(d=>d.severity==='ERROR').map(d=>d.code)),['WEEK_EXACT_DUPLICATE']);
});

for(const [name,mutate] of [
  ['dose',p=>p.blocks[0].movements[0].prescription.durationSeconds=3060],
  ['method',p=>{p.stimulusId='umbral';p.blocks[0].movements[0].movementId='series_umbral';}],
  ['intensity',p=>p.blocks[0].movements[0].prescription.intensity={kind:'rpe',value:4}],
]) test('FORGE12 both signed repair stages reject changed '+name,async()=>{
  const f=await admitted(),p=plain(f.ps[1]);mutate(p);
  const r=await enforce('u',week,f.rows,f.sources,f.receipt,f.authority,async()=>JSON.stringify(p));
  assert.equal(r.code,'WEEK_REPAIR_FAILED');
  for(const stage of r.orchestration.stages)assert.deepEqual(plain(stage.failedReasons),[{id:'sabado:5',reason:'WEEK_REPAIR_CONTRACT_INVALID'}]);
});

test('FORGE12 coach options have no fixed pair; historical fixed keys still reject duplicates and retry REST',async()=>{
  const f=await admitted(),pair=selection(f.w),single=selection(f.w,false);
  assert.equal(weekly.validateWeeklySelection(f.w,pair).ok,true);
  for(const options of Object.values(f.w.dayOptions))for(const o of options)if(o.intent?.methodId==='running_base')o.fixedPrescriptionKey='historical-identical-prescription';
  // The previous contract had no projection; all its existing checks admit this pair.
  const prior=plain(f.w);for(const options of Object.values(prior.dayOptions))for(const o of options)delete o.fixedPrescriptionKey;
  assert.equal(weekly.validateWeeklySelection(prior,pair).ok,true);
  assert.deepEqual(plain(weekly.validateWeeklySelection(f.w,pair).errors),['WEEKLY_FIXED_PRESCRIPTION_DUPLICATE']);
  assert.equal(weekly.validateWeeklySelection(f.w,single).ok,true);
  const before=plain(f.w);let calls=0;
  const composed=await weekly.composeBoundedWeek(f.w,async prompt=>{calls++;if(calls===2)assert.match(prompt,/WEEKLY_FIXED_PRESCRIPTION_DUPLICATE/);return JSON.stringify(calls===1?pair:single);});
  assert.equal(composed.ok,true);assert.equal(calls,2);assert.deepEqual(plain(f.w),before);
  const rows=plain(f.rows);rows[5]={dia:'sabado',tipo:'descanso'};
  const evidence=plain(f.evidence);evidence.admittedSlots[5]={...composed.selected.sabado,day:'sabado'};
  let repairCalls=0;
  const r=await enforce('u',week,rows,[f.sources[0]],f.receipt,{evidence,contexts:f.ctx.input.contexts},async()=>{repairCalls++;return '{}';});
  assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.result.status,'pass');assert.equal(repairCalls,0);
  assert.deepEqual(plain(r.sessions.slice(0,4)),plain(f.rows.slice(0,4)));
  const failed=await weekly.composeBoundedWeek(f.w,async()=>JSON.stringify(pair));
  assert.equal(failed.code,'WEEKLY_PLANNER_REJECTED');assert.deepEqual(plain(failed.errors),['WEEKLY_FIXED_PRESCRIPTION_DUPLICATE']);
});

test('FORGE12 Wednesday and Thursday remain unexecuted; planned coverage is not executed evidence',async()=>{
  const {f,ctx}=await setup(),before=plain(f.request.snapshot);
  assert.equal(before.sessions[2].completada,false);assert.equal(before.sessions[2].actual,null);
  assert.equal(before.sessions[3].completada,false);assert.equal(before.sessions[3].actual,null);
  // Known past prescription survives without becoming execution; empty past content does not.
  assert.equal(ctx.input.fixed.miercoles.state,'TRAIN');assert.equal(ctx.input.fixed.jueves.state,'UNAVAILABLE');
  assert.deepEqual(plain(ctx.fixedSessions.miercoles),before.sessions[2]);
  const baseline=load('../athlete/runningDoseEvidence').projectRunningDoseBaseline({},f.tables.weekly_plan,[],f.request.today);
  assert.equal(baseline.coverage.completedRunningSessions,1);
  assert.equal(baseline.evidence.find(e=>e.date==='2026-09-09').kind,'PLANNED_ONLY');
  assert.ok(!baseline.metrics.recentMethodExposure.some(e=>e.methodId==='running_specific'));
  assert.equal(baseline.metrics.longestRecentRunDurationSeconds.value,null);
  // Controlled fully structured planned variant: coverage is intrinsic prescription coverage,
  // invariant under completion flags; it never asserts physiological execution.
  const raw=plain(before.sessions[2]);raw.structuredPrescription.proposal={schemaVersion:2,stimulusId:'resistencia_especifica',structureId:'continuo_carrera',blocks:[{blockType:'main',movements:[{movementId:'rodaje_largo',prescription:{durationSeconds:5220,intensity:{kind:'rpe',value:3}}}]}]};
  const evidence={admittedSlots:[{day:'miercoles',protected:true}],strategy:{goal:{id:'half_marathon'},methods:['running_specific'],adaptations:[{id:'resistencia_especifica',role:'PRIMARY',weaknessIds:[]}],coverage:[{id:'adaptation:resistencia_especifica',adaptationId:'resistencia_especifica'}],deferred:[]}};
  const planned=adapter.validateAdmittedWholeWeek(week,[raw],evidence);
  assert.deepEqual(plain(planned.coverage[0].sessionIds),['miercoles:0']);
  const completed=adapter.validateAdmittedWholeWeek(week,[{...raw,completada:true}],evidence);
  assert.deepEqual(plain(completed.coverage),plain(planned.coverage));
  assert.deepEqual(plain(f.request.snapshot),before);
});

test('variable B3 envelopes, alternative structures and unresolved intensity do not acquire a fixed key',async()=>{
  const f=await admitted(),project=load('fixedRunningPrescription').fixedRunningPrescription;
  assert.ok(project(f.cs[0]));
  for(const mutate of [c=>c.runningMethodDose.dose.selectedTarget.maximum++,c=>c.runningMethodDose.dose.structures.push('intervalos'),c=>c.intensityAuthority.status='UNRESOLVED',c=>c.runningMethodDose.allowedSelections=[c.runningMethodDose.dose,c.runningMethodDose.dose]]) {
    const c=plain(f.cs[0]);mutate(c);assert.equal(project(c),null);
  }
});

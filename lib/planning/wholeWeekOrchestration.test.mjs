import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {sportsRuntime,compile,plain} from '../sports/trainingContractTestRuntime.mjs';
const load=sportsRuntime(),resolver=load('../planning/wholeWeekRepairPlan'),validator=load('../planning/wholeWeekValidation');
const target=(id,index,role='SUPPORTING',adaptationId='umbral')=>({id,index,role,protected:false,authorized:true,discipline:'fixture',intent:{kind:'adaptation',goalId:'goal',adaptationId}});
const diagnostic=(sessionIds,code='WEEK_EXACT_DUPLICATE',extra={})=>({code,severity:'ERROR',sessionIds,dates:[],dimension:null,evidence:null,reason:'fixture',repairability:'same_contract',...extra});
test('minimal set covers overlapping duplicate pairs and preserves primary when possible',()=>{
  const r=resolver.resolveWeekRepairPlan([diagnostic(['a','b']),diagnostic(['a','c'])],[target('a',0),target('b',1),target('c',2)]);
  assert.deepEqual(plain(r.affectedSessionIds),['a']);
  const roles=resolver.resolveWeekRepairPlan([diagnostic(['a','b'])],[target('a',1,'PRIMARY'),target('b',0,'MAINTENANCE')]);assert.deepEqual(plain(roles.affectedSessionIds),['b']);
});
test('primary missing resolves only against a compatible authenticated intent',()=>{
  const d=diagnostic([],'WEEK_PRIMARY_ADAPTATION_MISSING',{repairability:'none',dimension:'umbral',evidence:{adaptationId:'umbral'}});
  assert.deepEqual(plain(resolver.resolveWeekRepairPlan([d],[target('threshold',1)]).affectedSessionIds),['threshold']);
  for(const c of [{...target('x',0),protected:true},{...target('x',0),authorized:false},target('x',0,'PRIMARY','base_aerobica')])
    assert.equal(resolver.resolveWeekRepairPlan([d],[c]).nonRepairableDiagnostics.length,1);
});
test('warning-only and purposeful repetition never create a repair plan',()=>{
  const r=resolver.resolveWeekRepairPlan([diagnostic(['a'],'WEEK_NEAR_DUPLICATE',{severity:'WARNING'})],[target('a',0)]);assert.deepEqual(plain(r.affectedSessionIds),[]);
});
test('four independent targets exceed shared limit without partial repair',()=>{
  const candidates=Array.from({length:4},(_,i)=>target(String(i),i));const r=resolver.resolveWeekRepairPlan(candidates.map(c=>diagnostic([c.id])),candidates);
  assert.equal(r.limit,3);assert.equal(r.limitExceeded,true);assert.equal(r.affectedSessionIds.length,0);
});

// Isolated orchestration seam: the REAL 3D validator consumes normalized facts. Receipt and
// individual proposal authority are tested with real HMACs in wholeWeekRepair/weeklyAuthorityBinding.
function orchestrationFixture(){
  const days=['lunes','miercoles','viernes'];
  const rows=days.map((dia,i)=>({dia,adaptationId:i===2?'umbral':'fuerza_maxima',materialized:i!==2,dose:{sets:4,reps:5}}));
  const calls=[];
  const authority={evidence:{admittedSlots:days.map(day=>({day}))},contexts:{}};
  const validate=(_week,current)=>validator.validateWholeWeek({strategy:{goal:'goal',adaptations:['fuerza_maxima','umbral'].map(id=>({id,role:'PRIMARY',weaknessIds:[]})),
    required:['fuerza_maxima','umbral'].map(adaptationId=>({id:adaptationId,adaptationId})),deferred:[]},exposure:{byPattern:{}},
    sessions:current.map((r,i)=>({id:`${r.dia}:${i}`,date:`2026-09-${String(7+i*2).padStart(2,'0')}`,discipline:'fixture',state:'TRAIN',protected:false,structured:true,
      adaptationId:r.adaptationId,methodId:r.adaptationId,role:'PRIMARY',weaknessId:null,movements:['movement'],patterns:[],structure:r.adaptationId,stimulus:r.adaptationId,
      dose:r.dose,intensity:{rpe:7},impact:'unknown',demanding:[],contributionValid:r.materialized,recoveryContradiction:false,load:null}))});
  const module={exports:{}};
  vm.runInNewContext(compile(readFileSync('lib/planning/enforceWholeWeek.ts','utf8')),{module,exports:module.exports,structuredClone,require:name=>{
    if(name==='./wholeWeekAdapter')return {validateAdmittedWholeWeek:validate};
    if(name==='./wholeWeekRepairPlan')return resolver;
    if(name==='./weeklyCalendar')return {calendarKey:v=>v};
    if(name==='../sports/sessionAuthority')return {
      verifiedRepairContract:r=>({intent:{kind:'adaptation',adaptationId:r.adaptationId,goalId:'goal',role:'PRIMARY'},discipline:'fixture'}),
      repairSessionWithinReceipt:async(source,_u,_w,_receipt,diagnostics,siblings,complete,stage)=>{
        calls.push({day:source.dia,stage,diagnostics});return {...source,...JSON.parse(await complete(JSON.stringify({source,stage,siblings}))),sessionReceipt:'test-seam'};
      }};
    throw new Error(name);
  }});
  return {rows,calls,run:complete=>module.exports.enforceWholeWeek('u','2026-09-07',rows,rows,'test-seam',authority,complete)};
}
test('critical multi-error: duplicate plus primary missing repairs TWO targets and preserves the good anchor',async()=>{
  const f=orchestrationFixture(),before=plain(f.rows);
  const r=await f.run(async prompt=>{const {source}=JSON.parse(prompt);return JSON.stringify({materialized:true,dose:{sets:source.dia==='viernes'?6:5,reps:6}});});
  assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.orchestration.localRepairCount,2);assert.equal(r.orchestration.targetedRegenerationCount,0);
  assert.deepEqual(f.calls.map(c=>c.day),['miercoles','viernes']);assert.deepEqual(plain(r.sessions[0]),before[0]);assert.deepEqual(plain(f.rows),before);
});
test('targeted stage selects only residual ERROR sessions, never the successfully repaired session',async()=>{
  const f=orchestrationFixture();const r=await f.run(async prompt=>{
    const {source,stage}=JSON.parse(prompt);return JSON.stringify(source.dia==='viernes'&&stage==='local'?{}:{materialized:true,dose:{sets:5,reps:6}});
  });
  assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.orchestration.targetedRegenerationCount,1);
  assert.deepEqual(f.calls.filter(c=>c.stage==='targeted').map(c=>c.day),['viernes']);assert.equal(f.calls.length,3);
});
test('exhausted targeted stage does not leak a partial candidate or start a third phase',async()=>{
  const f=orchestrationFixture();const r=await f.run(async prompt=>{const {source}=JSON.parse(prompt);return JSON.stringify(source.dia==='viernes'?{}:{dose:{sets:5,reps:6}});});
  assert.equal(r.ok,false);assert.equal(r.code,'WEEK_REPAIR_FAILED');assert.equal(r.sessions,undefined);assert.equal(r.orchestration.targetedRegenerationCount,1);
  assert.equal(f.calls.length,3);assert.equal(r.orchestration.stages.length,2);
});
test('repair plan and trace are JSON portable and do not contain sport branches',async()=>{
  const f=orchestrationFixture(),r=await f.run(async()=> '{}');assert.deepEqual(JSON.parse(JSON.stringify(r.orchestration)),plain(r.orchestration));
  assert.doesNotMatch(readFileSync('lib/planning/wholeWeekRepairPlan.ts','utf8'),/\b(cycling|running|crossfit|React|window|document)\b/);
});

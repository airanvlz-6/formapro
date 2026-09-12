import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sportsRuntime,plain} from '../sports/trainingContractTestRuntime.mjs';
const load=sportsRuntime(),core=load('../planning/wholeWeekValidation'),loads=load('../trainingLoad/trainingLoad');
const library=load('movementLibrary').MOVEMENT_LIBRARY,exposure=load('exposureEngine').buildStructuredExposureReport;
const week='2026-09-07';
function session(id,date,movement='back_squat',overrides={}){
  const pattern=library[movement].movement_pattern;
  const dose=overrides.dose || {sets:4,reps:5},intensity=overrides.intensity || {kind:'rpe',value:8};
  return {id,date,discipline:'fixture',state:'TRAIN',protected:false,structured:true,adaptationId:'fuerza_maxima',role:'PRIMARY',methodId:'box_max_strength',weaknessId:null,
    structure:'strength_sets',stimulus:'fuerza_maxima',movements:[movement],patterns:[pattern],dose,intensity,impact:'not_high',demanding:['high_prescribed_rpe'],
    contributionValid:true,recoveryContradiction:false,load:loads.resolveSessionLoad({id,date,kind:'planned',source:'fixture',discipline:null,executionStatus:'unknown',
      segments:[{id:'main',movementId:movement,pattern,source:'fixture',sets:dose.sets??1,reps:dose.reps,durationSeconds:dose.durationSeconds,
        kg:movement==='back_squat'?{minimum:100,maximum:100}:undefined,externalLoadApplicable:movement==='back_squat',multiplier:1}]}),...overrides};
}
const strategy=(ids=['fuerza_maxima'])=>({goal:'max_strength',adaptations:ids.map(id=>({id,role:'PRIMARY',weaknessIds:[]})),required:ids.map(id=>({id:`adaptation:${id}`,adaptationId:id})),deferred:[]});
function input(sessions,overrides={}){return {sessions,strategy:strategy(),exposure:exposure(sessions.flatMap(s=>s.movements.map(movementId=>({sessionId:s.id,movementId,repetitions:null})))),...overrides};}
const validate=(sessions,overrides)=>core.validateWholeWeek(input(sessions,overrides));
const codes=r=>r.diagnostics.map(d=>d.code);

test('Coach coverage warnings do not trigger repairs while structural and dose violations still block',()=>{
  const row=session('a','2026-09-08');
  const coach={...strategy(['base_aerobica']),weeklyDecisionAuthority:'coach'};
  const result=validate([row],{strategy:coach});
  assert.equal(result.status,'pass');
  assert.ok(result.diagnostics.some(d=>d.code==='WEEK_PRIMARY_ADAPTATION_MISSING'&&d.severity==='WARNING'));
  assert.equal(result.repairHints.length,0);
  for(const violation of [{structured:false},{adaptationDoseSatisfied:false},{contributionValid:false},{recoveryContradiction:true}]) {
    assert.notEqual(validate([{...row,...violation}],{strategy:coach}).status,'pass');
  }
  assert.notEqual(validate([row,session('b','2026-09-09')],{strategy:coach}).status,'pass');
});

test('explicit underdose cannot cover PRIMARY despite adaptation presence; unresolved preserves coverage',()=>{
  const row=session('a','2026-09-08');
  const under=validate([{...row,adaptationDoseSatisfied:false}]);
  assert.ok(codes(under).includes('WEEK_ADAPTATION_DOSE_UNSATISFIED'));
  assert.ok(codes(under).includes('WEEK_PRIMARY_ADAPTATION_MISSING'));
  assert.equal(under.coverage[0].sessionIds.length,0);
  assert.equal(validate([row]).coverage[0].sessionIds.length,1);
  assert.equal(validate([{...row,adaptationDoseSatisfied:true}]).coverage[0].sessionIds.length,1);
});
test('structurally identical sessions reject regardless of title or object-key order',()=>{
  const a=session('a','2026-09-08'),b=session('b','2026-09-10','back_squat',{dose:{reps:5,sets:4},title:'new name'});
  const r=validate([a,b]);assert.equal(r.status,'repair_required');assert.ok(codes(r).includes('WEEK_EXACT_DUPLICATE'));
});
test('near duplicate has separate interpretable similarity dimensions and warning',()=>{
  const r=validate([session('a','2026-09-08'),session('b','2026-09-10','back_squat',{dose:{sets:5,reps:5}})]);
  assert.equal(r.status,'pass');assert.ok(codes(r).includes('WEEK_NEAR_DUPLICATE'));assert.equal(r.duplication[0].similarity.dose,false);
});
test('powerlifting-like heavy and volume squat can pass with different roles and intensity',()=>{
  const r=validate([session('heavy','2026-09-08'),session('volume','2026-09-11','back_squat',{dose:{sets:5,reps:8},intensity:{kind:'rpe',value:7},role:'SUPPORTING',adaptationId:'fuerza_general',methodId:'box_support_strength',demanding:[]})]);
  assert.equal(r.status,'pass');assert.ok(codes(r).includes('WEEK_PURPOSEFUL_REPETITION'));assert.ok(!codes(r).includes('WEEK_NEAR_DUPLICATE'));
});
function endurance(movement){return [session('easy','2026-09-07',movement,{adaptationId:'base_aerobica',stimulus:'base_aerobica',structure:'continuous',dose:{durationSeconds:2400},intensity:{kind:'rpe',value:4},demanding:[]}),
  session('threshold','2026-09-09',movement,{adaptationId:'umbral',stimulus:'umbral',structure:'intervals',dose:{sets:6,durationSeconds:180},intensity:{kind:'rpe',value:8}}),
  session('long','2026-09-12',movement,{adaptationId:'resistencia_especifica',stimulus:'resistencia_especifica',structure:'continuous',dose:{durationSeconds:4800},intensity:{kind:'rpe',value:5},demanding:[]})];}
for(const [name,movement] of [['running','rodaje_z2'],['cycling','bike_erg']])test(`${name}-like easy/threshold/long endurance is not penalized for repeated domain`,()=>{
  const r=validate(endurance(movement),{strategy:strategy(['base_aerobica','umbral','resistencia_especifica'])});assert.equal(r.status,'pass');assert.ok(!codes(r).includes('WEEK_EXACT_DUPLICATE'));
});
test('identical threshold intervals without structured repetition justification reject',()=>{
  const a=endurance('rodaje_z2')[1],b={...a,id:'second',date:'2026-09-11',load:{...a.load,id:'second',date:'2026-09-11'}};
  assert.ok(codes(validate([a,b],{strategy:strategy(['umbral'])})).includes('WEEK_EXACT_DUPLICATE'));
});
test('hybrid goal week retains support strength, recovery and primary endurance',()=>{
  const rows=endurance('rodaje_z2');rows.push(session('support','2026-09-10','back_squat',{role:'SUPPORTING',adaptationId:'fuerza_general',stimulus:'fuerza_general',demanding:[]}),
    session('recovery','2026-09-11','bike_erg',{state:'RECOVERY',role:'RECOVERY',adaptationId:'recuperacion_activa',stimulus:'recuperacion_activa',dose:{durationSeconds:600},intensity:{kind:'rpe',value:3},demanding:[]}));
  assert.equal(validate(rows,{strategy:strategy(['base_aerobica','umbral','resistencia_especifica'])}).status,'pass');
});
test('unjustified demanding support before primary diagnoses objective and interference',()=>{
  const r=validate([session('support','2026-09-08','back_squat',{role:'SUPPORTING',contributionValid:false,adaptationId:'capacidad_glucolitica'}),session('primary','2026-09-09')]);
  assert.ok(codes(r).includes('WEEK_SESSION_OBJECTIVE_UNJUSTIFIED'));assert.ok(codes(r).includes('WEEK_INTERFERENCE'));assert.equal(r.interference[0].primaryProtection,true);
});
test('explicit cross-pattern review protects primary locomotion from demanding support without sport pairs',()=>{
  const rows=[session('support','2026-09-08','back_squat',{role:'SUPPORTING',adaptationId:'fuerza_general'}),
    session('threshold','2026-09-09','rodaje_z2',{adaptationId:'umbral',stimulus:'umbral'})];
  const r=validate(rows,{strategy:strategy(['umbral']),interferenceRules:[{id:'demanding-support-before-primary-locomotion-v1',sourcePatterns:['squat','hinge'],targetPatterns:['run']}]});
  assert.equal(r.status,'pass');assert.ok(codes(r).includes('WEEK_INTERFERENCE'));assert.equal(r.interference[0].primaryProtection,true);
  assert.deepEqual(plain(r.interference[0].sharedPatterns),[]);
});
for(const [name,movements,pattern] of [['hinge',['deadlift','rdl','deadlift'],'hinge'],['calisthenics',['pull_up','chest_to_bar','pull_up'],'vertical_pull']])test(`${name} concentration reuses existing Exposure Engine patterns`,()=>{
  const rows=movements.map((m,i)=>session(String(i),`2026-09-0${7+i}`,m,{dose:{sets:3,reps:5+i}}));
  const r=validate(rows);assert.ok(r.diagnostics.some(d=>d.code==='WEEK_PATTERN_CONCENTRATION'&&d.dimension===pattern));
  assert.equal(r.concentration.exposure.byPattern[pattern].sessions,3);
});
test('three consecutive high-impact dates trigger review, unknown does not become low',()=>{
  const rows=[7,8,9].map((d,i)=>session(String(d),`2026-09-0${d}`,'box_jump',{impact:'high',dose:{sets:3,reps:5+i}}));
  assert.ok(codes(validate(rows)).includes('WEEK_IMPACT_CONCENTRATION'));
  const r=validate([session('unknown',week,'back_squat',{impact:'unknown'})]);assert.ok(codes(r).includes('WEEK_IMPACT_UNKNOWN'));assert.equal(r.concentration.impact[0].impact,'unknown');
});
test('primary objective missing is an error even when every session is individually usable',()=>{
  const r=validate([endurance('rodaje_z2')[0]],{strategy:strategy(['umbral'])});assert.equal(r.status,'invalid');assert.ok(codes(r).includes('WEEK_PRIMARY_ADAPTATION_MISSING'));
});
test('supporting adaptations are not an automatic weekly checklist',()=>{
  const s=strategy();s.adaptations.push({id:'base_aerobica',role:'SUPPORTING',weaknessIds:[]});assert.equal(validate([session('a',week)],{strategy:s}).status,'pass');
});
test('maintenance session can contribute without being primary',()=>{
  const rows=[session('a',week),session('maintenance','2026-09-11','bench_press',{adaptationId:'base_aerobica',role:'MAINTENANCE',dose:{sets:2,reps:6},demanding:[]})];
  assert.equal(validate(rows).status,'pass');
});
test('recovery with high intervals is an error; REST never acquires exercises',()=>{
  assert.ok(codes(validate([session('r',week,'rodaje_z2',{role:'RECOVERY',state:'RECOVERY',recoveryContradiction:true})])).includes('WEEK_SESSION_ROLE_CONTRADICTION'));
  assert.ok(codes(validate([session('rest',week,'back_squat',{state:'REST'})])).includes('WEEK_REST_CONTENT'));
});
test('explicit deferral is visible, not claimed as achieved coverage',()=>{
  const s=strategy();s.adaptations.push({id:'umbral',role:'PRIMARY',weaknessIds:[]});s.deferred.push({reference:'adaptation:umbral',reason:'no_feasible_managed_method'});
  const r=validate([session('a',week)],{strategy:s});assert.ok(codes(r).includes('WEEK_PRIMARY_DEFERRED'));assert.equal(r.status,'pass');
});
test('weakness attribution is checked without overriding primary objective',()=>{
  const s=strategy();s.adaptations[0].weaknessIds=['w'];assert.ok(codes(validate([session('a',week)],{strategy:s})).includes('WEEK_WEAKNESS_UNCOVERED'));
  const rows=[7,8,10,12].map((d,i)=>session(String(i),`2026-09-${String(d).padStart(2,'0')}`,'back_squat',{weaknessId:'w',dose:{sets:i+2,reps:5}}));
  assert.ok(codes(validate(rows,{strategy:s})).includes('WEEK_WEAKNESS_CONCENTRATION'));
});
test('same-day sessions remain distinct and missing ordering authority is explicit',()=>{
  const r=validate([session('a',week),session('b',week,'rdl',{dose:{sets:3,reps:8}})]);assert.ok(codes(r).includes('WEEK_SAME_DAY_ORDER_UNKNOWN'));
  assert.equal(r.distribution.load.planned.sessionCount,2);
});
test('external known duration remains separate, unknown structure cannot create pattern exposure',()=>{
  const actual=loads.resolveSessionLoad({id:'ext',date:week,kind:'actual',discipline:null,source:'external',segments:[],duration:loads.quantity(3600,'s','reported'),executionStatus:'reported'});
  const r=validate([session('a',week)],{external:[{sessions:[actual],combinedStatus:'unknown_cross_source_overlap',combined:null}]});
  assert.ok(codes(r).includes('WEEK_EXTERNAL_PROXIMITY'));assert.equal(r.distribution.load.actual.sessionCount,0);assert.equal(r.external[0].combined,null);
});
test('protected legacy text remains unknown; no historical rewrite',()=>{
  const r=validate([session('old',week,'back_squat',{protected:true,structured:false,load:null})],{strategy:null});assert.equal(r.status,'pass');assert.ok(codes(r).includes('WEEK_STRUCTURE_UNKNOWN'));
});
test('core is serializable, deterministic and has no discipline branches or UI runtime',()=>{
  const value=input(endurance('bike_erg'),{strategy:strategy(['base_aerobica','umbral','resistencia_especifica'])});
  assert.deepEqual(plain(core.validateWholeWeek(value)),plain(core.validateWholeWeek(structuredClone(value))));
  assert.doesNotMatch(readFileSync('lib/planning/wholeWeekValidation.ts','utf8'),/\b(carrera|box|cycling|powerlifting|React|window|document)\b/);
  assert.deepEqual(JSON.parse(JSON.stringify(core.validateWholeWeek(value))),plain(core.validateWholeWeek(value)));
});

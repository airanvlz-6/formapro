import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, contractFixture, plain } from '../sports/trainingContractTestRuntime.mjs';
const load=sportsRuntime();
const project=load('../athlete/getCanonicalRestrictions').projectCanonicalRestrictions;
const feasibility=load('trainingFeasibility').evaluateTrainingFeasibility;
const policy=load('movementRestrictionPolicy');
const library=load('movementLibrary');
const flags={prohibits_impact:true,prohibits_jump:true,prohibits_deep_flexion:true,prohibits_axial_load:false,prohibits_overhead_load:false};
// Observed flags only. Production source IDs, areas and explicit movement exclusions are not supplied.
function fixture(discipline){
  const stimulus=discipline==='box'?'tecnica':'recuperacion_activa';
  const restrictions=project([],[1,2].map(i=>({id:String(i),movement:'',status:'pending',constraint_level:'hard',...flags})),'2026-09-08');
  return contractFixture({discipline,stimulus,restrictionsSnapshot:restrictions,
    exposureContext:{source:'legacy_completed_weekly_rows',report:{disciplina:discipline,exposiciones:[]}},
    intent:{kind:'adaptation',goalId:'crossfit',adaptationId:stimulus,methodId:discipline==='box'?'box_technique':'running_recovery',
      pattern:discipline==='box'?'squat':'run',role:'MAINTENANCE',blockPhase:'deload',blockWeek:null,weaknessId:null}});
}
const result=input=>{const r=feasibility(input);assert.equal(r.resolved,true);return plain({feasible:r.feasible,errors:r.errors,movements:r.allowedMovementIds,intents:r.intentMovementIds});};
test('normalization sorts but does not deduplicate identical identities; flag union is idempotent',()=>{
  const n={id:'same',movement:'',status:'pending',constraint_level:'hard',...flags};
  const r=project([],[n,n],'2026-09-08');assert.equal(r.restrictions.length,2);
  assert.deepEqual(plain(policy.activeRestrictionFlags(r.restrictions)),plain(policy.activeRestrictionFlags([n])));
  const differing=project([],[n,{...n,id:'different'}],'2026-09-08');assert.equal(differing.restrictions.length,2);
  // Structured fields not read by the canonical projection cannot represent original scope/status downstream.
  assert.deepEqual(plain(project([],[{...n,domain:'box',scopeKind:'DISCIPLINE'}],'2026-09-08')),plain(project([],[n],'2026-09-08')));
});
test('running pool: impact is incompatible, deep flexion unknown, jump compatible for both candidates',()=>{
  const candidates=library.rankearCandidatos('recuperacion_activa','carrera',[],[]);
  assert.deepEqual(plain(candidates.map(m=>m.id)).sort(),['regenerativo','rodaje_z1']);
  for(const m of candidates){
    assert.equal(m.movement_pattern,'run');
    const e=policy.evaluateMovementRestrictions(m,policy.activeRestrictionFlags([flags]));
    assert.deepEqual(plain(e.incompatible),['prohibits_impact']);assert.deepEqual(plain(e.unknown),['prohibits_deep_flexion']);
    assert.equal(policy.evaluateMovementRestrictions(m,['prohibits_impact']).allowed,false);
    assert.equal(policy.evaluateMovementRestrictions(m,['prohibits_jump']).allowed,true);
  }
});
test('Box has four squat candidates; all lack compatibility evidence for each of the three active flags',()=>{
  const candidates=library.rankearCandidatos('tecnica','box',[],[]);assert.equal(candidates.length,7);
  const squat=candidates.filter(m=>m.movement_pattern==='squat');
  assert.deepEqual(plain(squat.map(m=>m.id)).sort(),['back_squat_pausa','goblet_squat','kb_goblet_squat','tempo_squat']);
  for(const m of squat){
    const e=policy.evaluateMovementRestrictions(m,policy.activeRestrictionFlags([flags]));
    assert.deepEqual(plain(e.incompatible),[]);assert.deepEqual(plain(e.unknown),['prohibits_impact','prohibits_jump','prohibits_deep_flexion']);
  }
  const r=result(fixture('box'));assert.deepEqual(r.movements,['plank','ring_row']);assert.deepEqual(r.intents,[]);
});
test('D1 D2 D4 D5 D6 D7 controlled causal ablations change only requested flags or note multiplicity',()=>{
  for(const discipline of ['box','carrera']){
    const input=fixture(discipline),before=JSON.stringify(input),baseline=result(input);
    assert.deepEqual(baseline.errors,[discipline==='box'?'INTENT_POOL_EMPTY':'MOVEMENT_POOL_EMPTY']);
    for(const name of ['D2','D4','D5','D6','D7']){
      const c=structuredClone(input);
      if(name==='D2')c.restrictionsSnapshot.restrictions.splice(1);
      if(name==='D7'&&discipline==='box')c.restrictionsSnapshot.restrictions=[];
      for(const note of c.restrictionsSnapshot.restrictions){
        if(name==='D4'&&discipline==='carrera')note.prohibits_impact=false;
        if(name==='D5'&&discipline==='box')note.prohibits_deep_flexion=false;
        if(name==='D6'&&discipline==='box'){note.prohibits_impact=false;note.prohibits_jump=false;}
      }
      const r=result(c);
      if(name==='D7'&&discipline==='box'){assert.equal(r.feasible,true);assert.equal(r.movements.length,7);assert.equal(r.intents.length,4);}
      else assert.deepEqual(r,baseline);
    }
    assert.equal(JSON.stringify(input),before);
  }
});
test('additional running ablation: disabling impact and deep flexion restores the pool while jump stays active',()=>{
  const input=fixture('carrera');
  for(const n of input.restrictionsSnapshot.restrictions){n.prohibits_impact=false;n.prohibits_deep_flexion=false;}
  const r=result(input);assert.equal(r.feasible,true);assert.equal(r.movements.length,2);assert.equal(r.intents.length,2);
});

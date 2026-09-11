import test from 'node:test';
import assert from 'node:assert/strict';
import { sportsRuntime, plain } from './trainingContractTestRuntime.mjs';

const load = sportsRuntime();
const policy = load('runningEvidencePolicy');
const declarations = load('../athlete/runningMethodDeclarations');

test('HM policy is selected by goal and reusable by a future goal descriptor', () => {
  assert.equal(policy.selectRunningEvidencePolicy('half_marathon')?.id, 'hm_evidence_policy');
  assert.equal(policy.selectRunningEvidencePolicy('10k'), null);
  const future = { ...policy.HM_EVIDENCE_POLICY_V1, id: 'future_10k_policy', goals: ['10k'] };
  assert.equal(policy.selectRunningEvidencePolicy('10k', undefined, [future])?.id, 'future_10k_policy');
});

test('method declarations are signed factual baselines, never executions', () => {
  const fact = declarations.methodBaselineFact({ methodId:'running_long_run', confirmedCurrentComfortable:true,
    variants:[{mode:'continuous',workSeconds:3600,efforts:1,boutSeconds:3600,recoverySeconds:0}] }, '2026-09-10T12:00:00Z');
  assert.equal(fact.authority, 'ATHLETE_DECLARATION');
  assert.deepEqual(plain(declarations.baselineSelections(fact)[0].selectedTarget), {minimum:3600,maximum:3600});
  assert.equal(declarations.methodBaselineRequirement('running_long_run').kind, 'CURRENT_METHOD_BASELINE_REQUIRED');
});

test('threshold declaration permits continuous and interval variants without universal structure', () => {
  const fact = declarations.methodBaselineFact({ methodId:'running_threshold', confirmedCurrentComfortable:true,
    variants:[
      {mode:'continuous',workSeconds:1500,efforts:1,boutSeconds:1500,recoverySeconds:0},
      {mode:'intervals',workSeconds:1200,efforts:3,boutSeconds:400,recoverySeconds:180},
    ] }, '2026-09-10T12:00:00Z');
  assert.deepEqual(declarations.baselineSelections(fact).map(x=>x.composition), ['SINGLE_CONTINUOUS_TOTAL','SINGLE_INTERVAL_MAIN']);
});

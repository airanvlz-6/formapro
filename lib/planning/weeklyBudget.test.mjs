import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv from 'ajv';
import { weeklyBudgetFixture } from './weeklyBudgetFixture.mjs';
import { sportsRuntime, compile, plain } from '../sports/trainingContractTestRuntime.mjs';

// Official count_tokens, claude-sonnet-4-5, 2026-09-28; assistant text holding
// expanded JSON. This is a measured sizing fixture, NOT a live generation claim.
const measuredTokens=2092,fixtureHash='fb399b36e6ec5339c0528056362f553f58ad28fd1c9f0b327cf7167321a2193c';
const ast=ts.createSourceFile('route.ts',readFileSync('app/api/chat/route.ts','utf8'),99,true);
function find(n){if(ts.isArrowFunction(n)&&n.parameters[0]?.name.getText(ast)==='prompt'&&n.body.getText(ast).includes('const output = await requestWeeklyProvider'))return n;return ts.forEachChild(n,find);}
const callback=find(ast);
test('full seven-day guidance fits configured budget with margin; measured fixture exceeds 1800',async()=>{
  const fixture=weeklyBudgetFixture(),encoded=JSON.stringify(fixture,null,2);
  assert.equal(createHash('sha256').update(encoded).digest('hex'),fixtureHash);
  assert.equal(encoded.length,7510);assert.ok(measuredTokens>1800);
  const load=sportsRuntime({console:{info(){},warn(){},log(){}}}),guidance=load('../planning/weeklyGuidanceOutput');
  const built=load('../planning/openWeeklyCoachContract').buildOpenWeeklyContract({openCoachVersion:2,targetWeekStart:'2026-09-28',
    prescriptionScope:{prescriptionAllowed:true,managedDisciplines:['box','carrera'],externalDisciplines:[]},
    allowed:{box:['martes','jueves','viernes','sabado'],carrera:['lunes','miercoles','domingo']},contexts:{box:{},carrera:{}},fixed:{}});
  assert.equal(built.ok,true);fixture.contextDigest=built.contract.contextDigest;
  assert.equal(new Ajv().compile(plain(guidance.weeklyGuidanceTool(built.contract).input_schema))(fixture),true);
  assert.ok(guidance.WEEKLY_GUIDANCE_MAX_TOKENS>=measuredTokens*1.5);
  for(const budget of [1800,guidance.WEEKLY_GUIDANCE_MAX_TOKENS]){
    let calls=0;
    const run=vm.runInNewContext(compile(`(${callback.getText(ast)})`),{...guidance,WEEKLY_GUIDANCE_MAX_TOKENS:budget,
      apiKey:'synthetic',LONGITUDINAL_DECISION_MARKER:'LONGITUDINAL:',requestWeeklyProvider:load('../planning/weeklyProviderRequest').requestWeeklyProvider,
      fetch:async(_url,init)=>{calls++;const body=JSON.parse(init.body);assert.equal(body.max_tokens,budget);
        // Deterministic replay based on official measured size, not a made-up tokenizer.
        return new Response(JSON.stringify({stop_reason:budget<measuredTokens?'max_tokens':'tool_use',usage:{output_tokens:Math.min(budget,measuredTokens)},
          content:[{type:'tool_use',id:'weekly',name:'submit_weekly_guidance',input:fixture}]}),{status:200});
      }});
    const result=await load('../planning/allowedWeeklyPlanContract').composeBoundedWeek(built.contract,run);
    assert.equal(calls,1);assert.equal(result.ok,budget>=measuredTokens);
    if(budget===1800)assert.deepEqual(plain(result.errors),['WEEKLY_PROVIDER_RESPONSE_INVALID']);
  }
});

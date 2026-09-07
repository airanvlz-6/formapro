import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {sportsRuntime,compile,plain} from '../sports/trainingContractTestRuntime.mjs';
const failure=sportsRuntime()('../planning/wholeWeekFailure').wholeWeekFailure;
for(const code of ['WEEK_COHERENCE_INVALID','WEEK_REPAIR_FAILED','WEEK_FINAL_VALIDATION_FAILED'])test(`${code} is a controlled terminal response without internal evidence`,()=>{
  const r=failure(code);assert.equal(r.ok,false);assert.equal(r.code,code);assert.equal(r.retryable,false);
  assert.deepEqual(Object.keys(r).sort(),['code','message','ok','planningStatus','retryable']);assert.match(r.message,/no se pudo/i);
});
test('unexpected errors cannot leak details through the failure envelope',()=>{
  assert.equal(JSON.stringify(failure('HMAC secret stack raw response')).includes('HMAC'),false);
});
const source=ts.createSourceFile('FormaPro.tsx',readFileSync('app/FormaPro.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function find(n){if(ts.isVariableDeclaration(n)&&n.name.getText(source)==='apiCall')return n;return ts.forEachChild(n,find);}
for(const mode of ['terminal','network','non-2xx'])test(`actual web save transport makes one request for ${mode}`,async()=>{
  let calls=0;const terminal=plain(failure('WEEK_REPAIR_FAILED'));
  const api=vm.runInNewContext(compile(`const apiCall=${find(source).initializer.getText(source)};apiCall;`),{
    codigoUsuario:'fixture',setTimeout:cb=>cb(),fetch:async()=>{calls++;if(mode==='network')throw new Error('network');
      return {ok:mode==='terminal',json:async()=>terminal};},
  });
  const result=await api({action:'guardar_plan_semana'});assert.equal(calls,1);
  if(mode==='terminal')assert.deepEqual(plain(result),terminal);else assert.ok(result.error);
});

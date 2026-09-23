import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
test('browser transport carries SDK Bearer and preserves request headers; no session sends nothing',async()=>{
  let session={access_token:'fixture-token'},calls=[];const m={exports:{}};
  vm.runInNewContext(compile(readFileSync('lib/auth/authenticatedFetch.ts','utf8')),{
    module:m,exports:m.exports,Response,Headers,
    fetch:async(input,init)=>{calls.push(init);return Response.json({ok:true});},
    require:()=>({getBrowserAuth:()=>({getSession:async()=>({data:{session},error:null})})})
  });
  const run=m.exports.authenticatedFetch;
  await run('/api/chat',{headers:{'x-forge-action-id':'test'},body:'{}',method:'POST'});
  assert.equal(calls[0].headers.get('authorization'),'Bearer fixture-token');
  assert.equal(calls[0].headers.get('x-forge-action-id'),'test');
  session=null;assert.equal((await run('/api/chat')).status,401);assert.equal(calls.length,1);
  assert.doesNotMatch(readFileSync('lib/auth/supabaseBrowser.ts','utf8'),/SERVICE_ROLE/);
});

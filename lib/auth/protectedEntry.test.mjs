import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
function entry(file,result,search='') {
  const slots=[],effects=[],calls=[];let index=0;
  const hooks={...React,useState(initial){const i=index++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>slots[i]=v];},useEffect(fn){effects.push(fn);}};
  const m={exports:{}};
  vm.runInNewContext(compile(readFileSync(file,'utf8')),{
    module:m,exports:m.exports,URLSearchParams,console,
    window:{location:{search,replace:p=>calls.push(['navigate',p])}},
    require(n){
      if(n==='react')return hooks;
      if(n==='react/jsx-runtime')return jsx;
      if(n.endsWith('/FormaPro'))return {default:props=>React.createElement('div',{'data-athlete':props.authenticatedCodigo})};
      if(n.endsWith('/Logout'))return {Logout:()=>null};
      if(n.endsWith('/supabaseBrowser'))return {getBrowserAuth:()=>({})};
      if(n.endsWith('/webAuthFlow'))return {authenticatedIdentityRequest:async()=>result};
      if(n.endsWith('/authenticatedFetch'))return {authenticatedFetch:async(url,init)=>{calls.push(['data',JSON.parse(init.body)]);return Response.json({data:{perfil:{}},briefing:null,readinessScore:null});}};
      throw Error(n);
    }
  });
  const render=()=>{index=0;effects.length=0;return m.exports.default();};
  return {calls,render,async start(){render();effects[0]();await new Promise(r=>setImmediate(r));}};
}
for(const file of ['app/hoy/page.tsx','app/auth/AuthenticatedApp.tsx']) {
  test(`${file}: session without athlete or absent returns to entry`,async()=>{
    for(const code of ['AUTH_REQUIRED','ATHLETE_NOT_LINKED']){
      const f=entry(file,{ok:false,code});await f.start();
      assert.deepEqual(f.calls,[['navigate','/']]);
    }
  });
  test(`${file}: URL cannot override verified athlete`,async()=>{
    const f=entry(file,{ok:true,athlete:{legacyCodigo:'A'}},'?codigo=B');await f.start();
    assert.equal(f.calls.length,0);assert.match(renderToStaticMarkup(f.render()),/no corresponde a tu cuenta/);
  });
  test(`${file}: resolved athlete used without codigo URL`,async()=>{
    const f=entry(file,{ok:true,athlete:{legacyCodigo:'A'}});await f.start();
    if(file.includes('/hoy/')){
      assert.equal(f.calls.length,3);assert.ok(f.calls.every(c=>c[1].codigo==='A'));
    } else assert.match(renderToStaticMarkup(f.render()),/data-athlete="A"/);
  });
}
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

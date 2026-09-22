import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

function fixture({ linked = true, session = true, initFailure = false, loginError = false, callbackError = false } = {}) {
  const calls = [], logs = [], slots = [], effects = [];
  let index = 0;
  const hooks = { ...React,
    useState(initial) { const i=index++; if (!(i in slots)) slots[i]=initial; return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}]; },
    useRef(initial) { const i=index++; return slots[i]??=( {current:initial} ); },
    useEffect(fn) { effects.push(fn); },
  };
  const auth = {
    async getSession(){calls.push('session');return {data:{session:session?{access_token:'fixture-token'}:null},error:null};},
    async signInWithPassword(input){calls.push(['login',input]);session=!loginError;return {error:loginError?{}:null};},
    async signUp(input){calls.push(['signup',input]);return {data:{session:null},error:null};},
    async resetPasswordForEmail(email,options){calls.push(['recovery',email,options]);return {error:null};},
    async exchangeCodeForSession(code){calls.push(['exchange',code]);return {data:{session:callbackError?null:{access_token:'fixture-token'}},error:callbackError?{}:null};},
    async updateUser(input){calls.push(['update',input]);return {error:null};},
  };
  const transport = async (url,options)=>{
    calls.push(['identity',url,options]); assert.equal(options.method,'GET');
    assert.equal(options.headers.Authorization,'Bearer fixture-token');
    return Response.json(linked?{ok:true,athlete:{legacyCodigo:'FIXTURE-LINKED'}}:{ok:false,code:'ATHLETE_NOT_LINKED'});
  };
  const load=(file,react=hooks)=>{
    const m={exports:{}};
    vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{
      exports:m.exports,module:m,URL,fetch:transport,
      window:{location:{origin:'https://fixture.invalid',href:'https://fixture.invalid/auth/reset?code=fixture-code'},history:{replaceState(){}}},
      console:{info:(...args)=>logs.push(args),error:(...args)=>logs.push(args)},
      require(n){if(n==='react')return react;if(n==='react/jsx-runtime')return jsx;
        if(n==='./AuthPanel.module.css')return {default:{panel:'auth-panel'}};
        if(n.endsWith('/webAuthFlow'))return flow;
        if(n.endsWith('/supabaseBrowser'))return {getBrowserAuth(){if(initFailure)throw Error('secret must not be logged');return auth;}};
        throw Error('Unexpected import '+n);},
    });return m.exports;
  };
  const flow=load('lib/auth/webAuthFlow.ts');
  const Panel=load('app/auth/AuthPanel.tsx').default;
  function render(props={}){index=0;effects.length=0;return Panel(props);}
  return {auth,flow,calls,logs,render,load,effects};
}
function nodes(tree,type){const result=[];function walk(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(walk);return;}if(n.type===type)result.push(n);walk(n.props?.children);}walk(tree);return result;}
const text=n=>renderToStaticMarkup(n);
const click=(tree,label)=>nodes(tree,'button').find(n=>text(n).includes(label)).props.onClick();
const input=(tree,label,value)=>nodes(tree,'label').find(n=>text(n).includes(label)).props.children[1].props.onChange({target:{value}});
const submit=tree=>nodes(tree,'form')[0].props.onSubmit({preventDefault(){}});

test('AuthPanel server render includes visible form and diagnostic marker without initializing Auth',()=>{
  const f=fixture({initFailure:true});const Panel=f.load('app/auth/AuthPanel.tsx',React).default;
  const html=renderToStaticMarkup(React.createElement(Panel));
  assert.match(html,/data-auth-panel="true"/);assert.match(html,/Entrar/);assert.match(html,/Olvidé mi contraseña/);
  assert.match(html,/class="auth-panel"/);
  assert.match(html,/Todavía accedo con código/);assert.equal(f.calls.length,0);
});
test('initialization failure keeps form and message; diagnostic never contains exception content',async()=>{
  const f=fixture({initFailure:true});f.render();f.effects[0]();await new Promise(r=>setImmediate(r));
  const html=text(f.render());assert.match(html,/Entrar/);assert.match(html,/no está disponible/);
  assert.ok(f.logs.some(l=>l[1].stage==='auth_client'));assert.ok(!JSON.stringify(f.logs).includes('secret'));
});
test('login resolves linked athlete through Bearer GET and never bootstraps',async()=>{
  const f=fixture({session:false});let tree=f.render();input(tree,'Email','linked@example.invalid');input(tree,'Contraseña','fixture-password');
  await submit(f.render());tree=f.render();assert.match(text(tree),/\/app\?codigo=FIXTURE-LINKED/);
  assert.equal(f.calls.filter(c=>c[0]==='login').length,1);assert.equal(f.calls.filter(c=>c[0]==='identity').length,1);
  assert.equal(nodes(tree,'input').find(n=>n.props.type==='password').props.value,'');
});
test('failed login does not resolve identity; unlinked login does not create profile',async()=>{
  const failed=fixture({loginError:true});await submit(failed.render());assert.equal(failed.calls.filter(c=>c[0]==='identity').length,0);
  const f=fixture({linked:false});await submit(f.render());assert.match(text(f.render()),/no tiene un perfil Forge vinculado/);
  assert.equal(f.calls.filter(c=>c[0]==='identity').length,1);
});
test('signup mismatch blocks SDK; matching signup requests native confirmation and clears passwords',async()=>{
  const f=fixture();click(f.render(),'Registrar cuenta nueva');let tree=f.render();
  input(tree,'Email','new@example.invalid');input(tree,'Contraseña','fixture-password');input(tree,'Repetir contraseña','different');
  await submit(f.render());assert.match(text(f.render()),/no coinciden/);assert.equal(f.calls.length,0);
  tree=f.render();input(tree,'Contraseña','fixture-password');input(tree,'Repetir contraseña','fixture-password');
  await submit(f.render());assert.equal(f.calls.filter(c=>c[0]==='signup').length,1);assert.match(text(f.render()),/recibirás un email/);
});
test('forgot password delegates only to native resetPasswordForEmail with fixed callback',async()=>{
  const f=fixture();click(f.render(),'Olvidé mi contraseña');input(f.render(),'Email','account@example.invalid');
  await submit(f.render());const call=f.calls.find(c=>c[0]==='recovery');assert.equal(call[2].redirectTo,'https://fixture.invalid/auth/reset');
  assert.match(text(f.render()),/Si existe una cuenta/);assert.equal(f.calls.length,1);
});
test('recovery callback unlocks update form; mismatch and missing session cannot update password',async()=>{
  const f=fixture();f.render({recovery:true});f.effects[0]();await new Promise(r=>setImmediate(r));
  let tree=f.render({recovery:true});assert.match(text(tree),/Guardar contraseña/);
  input(tree,'Nueva contraseña','fixture-new-password');input(tree,'Repetir contraseña','different');await submit(f.render({recovery:true}));
  assert.equal(f.calls.filter(c=>c[0]==='update').length,0);
  tree=f.render({recovery:true});input(tree,'Nueva contraseña','fixture-new-password');input(tree,'Repetir contraseña','fixture-new-password');
  await submit(f.render({recovery:true}));assert.equal(f.calls.filter(c=>c[0]==='update').length,1);
  assert.match(text(f.render({recovery:true})),/Continuar en Forge/);
  const absent=fixture({session:false});assert.equal((await absent.flow.saveRecoveredPassword(absent.auth,'same','same')).code,'AUTH_REQUIRED');
  assert.equal(absent.calls.filter(c=>c[0]==='update').length,0);
});
test('invalid recovery callback never presents password form or updates account',async()=>{
  const f=fixture({callbackError:true});f.render({recovery:true});f.effects[0]();await new Promise(r=>setImmediate(r));
  assert.doesNotMatch(text(f.render({recovery:true})),/Guardar contraseña/);assert.equal(f.calls.filter(c=>c[0]==='update').length,0);
});

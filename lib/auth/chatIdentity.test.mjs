import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const uid='11111111-1111-4111-8111-111111111111', aid='22222222-2222-4222-8222-222222222222';
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture({linked=true,invalid=false}={}) {
  const writes=[];
  const auth={async getUser(token){return {data:{user:invalid?null:{id:uid,email_confirmed_at:'2026-09-01'}},error:null};}};
  const db={from(table){assert.equal(table,'usuarios');return {select(){return this;},eq(k,v){assert.equal(k,'auth_user_id');assert.equal(v,uid);return this;},async limit(){return {data:linked?[{id:aid,codigo:'A',auth_user_id:uid}]:[],error:null};}};}};
  const load=p=>{const m={exports:{}};vm.runInNewContext(compile(readFileSync(p,'utf8')),{exports:m.exports,module:m,Request,Response,console,
    require(n){if(n==='server-only')return {};if(n==='node:crypto')return {};if(n==='./athleteIdentity')return identity;throw Error(n);}});return m.exports;};
  const identity=load('lib/auth/athleteIdentity.ts');
  const {authorizeChatRequest}=load('lib/auth/chatIdentity.ts');
  const request=(body,token='valid')=>new Request('https://www.forgeapp.es/api/chat',{method:'POST',headers:token?{Authorization:`Bearer ${token}`}:{},body:JSON.stringify(body)});
  return {identity,authorizeChatRequest,request,deps:()=>({auth,db}),writes};
}
test('verified A resolves A server-side, rejects B and code-only calls',async()=>{
  const f=fixture();
  assert.equal((await f.authorizeChatRequest(f.request({action:'recuperar_usuario'}),f.deps)).codigo,'A');
  assert.equal((await f.authorizeChatRequest(f.request({codigo:'A'}),f.deps)).codigo,'A');
  await assert.rejects(f.authorizeChatRequest(f.request({codigo:'B'}),f.deps),{code:'ATHLETE_MISMATCH'});
  await assert.rejects(f.authorizeChatRequest(f.request({codigo:'A'},null),f.deps),{code:'AUTH_REQUIRED'});
  await assert.rejects(f.authorizeChatRequest(f.request({action:'guardar_usuario'}),f.deps),{code:'AUTH_REGISTRATION_REQUIRED'});
});
test('unlinked and invalid sessions cannot dispatch chat',async()=>{
  for(const [options,code] of [[{linked:false},'ATHLETE_NOT_LINKED'],[{invalid:true},'AUTH_INVALID']]){
    const f=fixture(options);await assert.rejects(f.authorizeChatRequest(f.request({codigo:'A'}),f.deps),{code});
  }
});
test('real public POST rejects code-only/admin password calls before domain dispatch',async()=>{
  const f=fixture(),m={exports:{}};
  vm.runInNewContext(compile(readFileSync('app/api/chat/route.ts','utf8')),{
    module:m,exports:m.exports,console,process:{env:{}},
    require(n){
      if(n==='@/lib/auth/chatIdentity')return {authorizeChatRequest:f.authorizeChatRequest};
      if(n==='@/lib/auth/athleteIdentity')return f.identity;
      if(n==='@/lib/auth/supabaseServer')return {identityDependencies:f.deps};
      if(n==='next/server')return {NextResponse:{json:Response.json}};
      if(n==='@supabase/supabase-js')return {createClient:()=>({})};
      return new Proxy({},{get:()=>()=>{throw Error('Domain must not run');}});
    }
  });
  for(const action of ['recuperar_usuario','obtener_daily_briefing','establecer_password_auth_admin']) {
    const r=await m.exports.POST(f.request({action,codigo:'A',datos:{password:'not-stored'}},null));
    assert.equal(r.status,401);assert.equal((await r.json()).code,'AUTH_REQUIRED');
  }
});

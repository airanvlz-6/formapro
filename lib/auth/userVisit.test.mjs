import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import { compile } from '../sports/trainingContractTestRuntime.mjs';

const authId='11111111-1111-4111-8111-111111111111',athleteId='22222222-2222-4222-8222-222222222222';
function fixture(count=5){
  const row={id:athleteId,auth_user_id:authId,codigo:'OWN',total_visitas:count,ultima_visita:null,perfil:{keep:true}},writes=[];
  const db={row,writes,uncertain:false,conflicts:false,from(table){
    assert.equal(table,'usuarios');const filters=[];let patch,single=false;
    const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},is(k,v){filters.push(r=>r[k]==v);return q;},limit(){return q;},
      single(){single=true;return q;},update(p){patch=p;return q;},
      then(yes,no){return Promise.resolve().then(()=>{
        let rows=filters.every(f=>f(row))?[row]:[];
        if(patch){if(db.conflicts)rows=[];if(rows.length){writes.push(structuredClone(patch));Object.assign(row,patch);if(db.uncertain)throw Error('transport');}}
        return {data:structuredClone(single?rows[0]??null:rows),error:null};
      }).then(yes,no);}};return q;
  }};
  const identity={exports:{}};
  vm.runInNewContext(compile(readFileSync('lib/auth/athleteIdentity.ts','utf8')),{
    module:identity,exports:identity.exports,require:n=>n==='node:crypto'?crypto:{},Error,
  });
  const route={exports:{}};
  vm.runInNewContext(compile(readFileSync('app/api/user/visit/route.ts','utf8')),{
    module:route,exports:route.exports,Response,Date,Error,
    require(n){if(n.endsWith('/athleteIdentity'))return identity.exports;
      if(n.endsWith('/supabaseServer'))return{identityDependencies:()=>({db,auth:{getUser:async token=>{
        assert.equal(token,'session-token');return{data:{user:{id:authId,email_confirmed_at:'2026-09-22'}},error:null};
      }}})};throw Error('unexpected dependency');},
  });
  const post=(body,authenticated=true)=>route.exports.POST(new Request('http://localhost/api/user/visit',{
    method:'POST',headers:authenticated?{Authorization:'Bearer session-token'}:{},...(body===undefined?{}:{body:JSON.stringify(body)}),
  }));
  return{db,post};
}

test('visit authenticates, sets server timestamp and increments only the two visit fields',async()=>{
  const {db,post}=fixture(),before=structuredClone(db.row),start=Date.now();
  const r=await post();assert.equal(r.status,200);const body=await r.json();assert.equal(body.ok,true);assert.equal(body.total_visitas,6);
  assert.ok(Date.parse(body.ultima_visita)>=start);assert.deepEqual(Object.keys(db.writes[0]).sort(),['total_visitas','ultima_visita']);
  assert.deepEqual({...db.row,total_visitas:before.total_visitas,ultima_visita:before.ultima_visita},before);
});

test('visit rejects missing authentication and client identity/counter/arbitrary patches without writes',async()=>{
  const {db,post}=fixture();assert.equal((await post(undefined,false)).status,401);
  for(const body of [{codigo:'OTHER'},{authUserId:'other'},{total_visitas:500},{ultima_visita:'2099-01-01'},{perfil:{admin:true}},null,[]]){
    assert.equal((await post(body)).status,400);
  }
  assert.equal(db.writes.length,0);
});

test('concurrent visits retain both increments using server CAS',async()=>{
  const {db,post}=fixture();const results=await Promise.all([post(),post()]);
  assert.ok(results.every(r=>r.status===200));assert.equal(db.row.total_visitas,7);assert.equal(db.writes.length,2);
});

test('visit preserves legacy null/zero baseline and fails closed on invalid counters',async()=>{
  for(const count of [null,0]){const {db,post}=fixture(count);assert.equal((await post()).status,200);assert.equal(db.row.total_visitas,2);}
  for(const count of [-1,'5',Number.MAX_SAFE_INTEGER]){const{db,post}=fixture(count);assert.equal((await post()).status,409);assert.equal(db.writes.length,0);}
});

test('uncertain visit write is terminal; exhausted CAS conflicts never overwrite',async()=>{
  const {db,post}=fixture();db.uncertain=true;
  const r=await(await post()).json();assert.equal(r.code,'VISIT_WRITE_UNKNOWN');assert.equal(r.retryable,false);assert.equal(db.writes.length,1);
  const conflict=fixture();conflict.db.conflicts=true;
  const c=await conflict.post();assert.equal(c.status,409);assert.equal((await c.json()).retryable,false);assert.equal(conflict.db.writes.length,0);
});

const web=readFileSync('app/FormaPro.tsx','utf8'),ast=ts.createSourceFile('FormaPro.tsx',web,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function find(n,p){if(p(n))return n;return ts.forEachChild(n,c=>find(c,p));}
const initializer=name=>find(ast,n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name).initializer.getText(ast);
function frontend(name,globals){const m={exports:{}};vm.runInNewContext(compile('exports.run = '+initializer(name)),{exports:m.exports,Date,...globals});return m.exports.run;}

test('both entry paths use authenticated visit endpoint independently of Coach-first flags',async()=>{
  assert.equal((web.match(/await registrarVisita\(\)/g)||[]).length,2);
  assert.ok(web.slice(web.indexOf('const codigoUrl='),web.indexOf('const [marcas,')).includes('await registrarVisita();'));
  assert.ok(web.slice(web.indexOf('const recuperarUsuario='),web.indexOf('const reanudarSesion=')).includes('await registrarVisita();'));
  const visit=initializer('registrarVisita');assert.ok(!visit.includes('coachFirst'));assert.ok(!visit.includes('apiCall'));
  let calls=0;
  const run=frontend('registrarVisita',{getBrowserAuth:()=>({getSession:async()=>({data:{session:{access_token:'session-token'}}})}),
    fetch:async(url,options)=>{calls++;assert.equal(url,'/api/user/visit');assert.equal(options.headers.Authorization,'Bearer session-token');assert.equal(options.body,undefined);return Response.json({ok:true});}});
  assert.equal((await run()).ok,true);assert.equal(calls,1);
  const oldCalls=[];function walk(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='apiCall'&&n.arguments[0]?.getText(ast).includes('ultima_visita'))oldCalls.push(n);ts.forEachChild(n,walk);}walk(ast);
  assert.equal(oldCalls.length,0);
});

function retryClient(responses){let requests=0,waits=0;const run=frontend('apiCall',{
  codigoUsuario:'',crypto:{randomUUID:()=> 'request-id'},
  setTimeout:fn=>{waits++;fn();},fetch:async()=>{const r=responses[Math.min(requests++,responses.length-1)];return new Response(r.body,{status:r.status});},
  abortControllerRef:{current:null},
});return{run,counts:()=>({requests,waits})};}

test('409 retryable:false returns server result after exactly one POST and no delay',async()=>{
  const c=retryClient([{status:409,body:JSON.stringify({ok:false,code:'COACH_FIRST_ROUTE_REQUIRED',retryable:false})}]);
  assert.equal((await c.run({action:'actualizar_usuario'})).code,'COACH_FIRST_ROUTE_REQUIRED');assert.deepEqual(c.counts(),{requests:1,waits:0});
});

test('retryable and non-JSON transient failures preserve existing retries',async()=>{
  for(const body of [JSON.stringify({retryable:true}),'not json']){
    const c=retryClient([{status:503,body},{status:503,body},{status:200,body:'{"ok":true}'}]);
    assert.equal((await c.run({action:'obtener_plan_semana'})).ok,true);assert.deepEqual(c.counts(),{requests:3,waits:2});
  }
});

test('weekly save keeps its terminal error normalization',async()=>{
  const c=retryClient([{status:409,body:JSON.stringify({code:'PLAN_REVISION_CONFLICT',retryable:false})}]);
  const r=await c.run({action:'guardar_plan_semana'});assert.equal(r.ok,false);assert.equal(r.canContinue,false);assert.equal(r.code,'PLAN_REVISION_CONFLICT');
  assert.deepEqual(c.counts(),{requests:1,waits:0});
});

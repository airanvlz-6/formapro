import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const authId = '00000000-0000-4000-8000-000000000001';
const athleteId = '00000000-0000-4000-8000-000000000002';
const otherId = '00000000-0000-4000-8000-000000000003';
const user = { id: authId, email: 'verified@example.invalid', email_confirmed_at: '2026-09-05' };
const linked = { id: athleteId, auth_user_id: authId, codigo: 'FP-SERVER' };
const profile = { categoria: 'fuerza', objetivo: 'Progresar', nivel: 'Principiante' };
const plain = x => JSON.parse(JSON.stringify(x));

function fixture(options = {}) {
  const calls = [], inserts = [];
  let rows = options.rows ?? [linked];
  const db = { from(table) {
    calls.push(['from', table]); assert.equal(table, 'usuarios');
    const q = {
      select(fields) { assert.equal(fields, 'id,codigo,auth_user_id'); return q; },
      eq(field, value) { assert.equal(field, 'auth_user_id'); assert.equal(value, authId); return q; },
      async limit(n) { assert.equal(n, 2); return { data: plain(rows), error: options.readError ?? null }; },
      async insert(payload) {
        inserts.push(plain(payload));
        if (options.insertThrows) throw Error('private transport detail');
        if (!options.noCommit) rows = [{ ...payload, id: athleteId }];
        return { error: options.insertError ?? null };
      },
    }; return q;
  } };
  const auth = { async getUser(token) {
    calls.push(['getUser', token]); assert.equal(token, 'verified-token');
    if (options.authThrows) throw Error('private upstream detail');
    return { data: { user: options.user === undefined ? user : options.user }, error: options.authError ?? null };
  } };
  const cache = new Map();
  function load(file) {
    const path = resolve(root, file);
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} }; cache.set(path, module);
    const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Request, Response, URL, fetch,
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-fixture', SUPABASE_SERVICE_ROLE_KEY: 'service-fixture' } },
      require(name) {
        if (name === 'server-only') return {};
        if (name === 'node:crypto') return crypto;
        if (name === '@supabase/supabase-js') return { createClient(url, key, settings) {
          assert.equal(settings.auth.persistSession, false); assert.equal(settings.auth.autoRefreshToken, false);
          return key === 'anon-fixture' ? { auth } : db;
        } };
        return load(name.startsWith('@/') ? name.slice(2) + '.ts' : resolve(dirname(path), name + '.ts'));
      },
    });
    return module.exports;
  }
  const route = load('app/api/auth/athlete/route.ts');
  async function request(body, header = 'Bearer verified-token', query = '') {
    const method = body === undefined ? 'GET' : 'POST';
    const response = await route[method](new Request('https://fixture.invalid/api/auth/athlete' + query, {
      method, headers: { ...(header ? { Authorization: header } : {}), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, ...await response.json() };
  }
  return { request, load, db, auth, calls, inserts };
}

for (const [header,code] of [[null,'AUTH_REQUIRED'],['Basic x','AUTH_INVALID'],['Bearer','AUTH_INVALID'],['Bearer a,b','AUTH_INVALID']]) {
  test(`real route ${header ?? 'missing'} cannot access privileged clients`, async () => {
    const f = fixture(); const result = await f.request({ authUserId: authId, codigo: 'FP-SERVER' }, header);
    assert.equal(result.code, code); assert.equal(result.retryable, false); assert.equal(f.calls.length, 0);
  });
}
for (const [options, code] of [
  [{authError:{status:401}},'AUTH_INVALID'], [{authError:{status:503}},'AUTH_VERIFICATION_UNAVAILABLE'],
  [{authThrows:true},'AUTH_VERIFICATION_UNAVAILABLE'], [{user:null},'AUTH_INVALID'],
  [{user:{...user,email_confirmed_at:null}},'AUTH_EMAIL_CONFIRMATION_REQUIRED'],
]) test(`verification fails closed: ${JSON.stringify(options)}`, async () => {
  const f=fixture(options); const result=await f.request(); assert.equal(result.code,code);
  assert.equal(f.calls.filter(c=>c[0]==='from').length,0); assert.equal(JSON.stringify(result).includes('private'),false);
});

test('verified Auth ID alone resolves existing linked athlete; query/body identifiers have no authority', async () => {
  const f=fixture();const result=await f.request(undefined, 'Bearer verified-token', '?codigo=OTHER&authUserId=OTHER');
  assert.equal(result.athlete.athleteId,athleteId);assert.equal(result.athlete.legacyCodigo,'FP-SERVER');
  assert.equal(result.athlete.principal.authUserId,authId);
  const same=await f.request({intent:'create_new_account',authUserId:otherId,id:otherId,codigo:'STOLEN'});
  assert.equal(same.athlete.athleteId,athleteId);assert.equal(f.inserts.length,0);
});
for(const [rows,code]of [[[],'ATHLETE_NOT_LINKED'],[[linked,linked],'ATHLETE_LINK_AMBIGUOUS'],[[{...linked,auth_user_id:otherId}],'ATHLETE_LINK_INVALID']]) {
  test(code,async()=>{const f=fixture({rows});assert.equal((await f.request()).code,code);assert.equal(f.inserts.length,0);});
}
test('read failure is unavailable, never not-linked or bootstrap permission',async()=>{
  const f=fixture({rows:[],readError:{code:'transport'}});
  assert.equal((await f.request({intent:'create_new_account',profile})).code,'ATHLETE_RESOLUTION_UNAVAILABLE');
  assert.equal(f.inserts.length,0);
});
test('forged structural principal rejected; optional alias consistency only checks resolved row',async()=>{
  const f=fixture(),core=f.load('lib/auth/athleteIdentity.ts');
  await assert.rejects(core.resolveAuthenticatedAthlete(f.db,{authUserId:authId}),{code:'AUTH_INVALID'});
  const principal=await core.verifySupabasePrincipal(new Request('https://fixture.invalid',{headers:{Authorization:'Bearer verified-token'}}),f.auth);
  await assert.rejects(core.resolveAuthenticatedAthlete(f.db,principal,'OTHER'),{code:'ATHLETE_MISMATCH'});
});
test('bootstrap projects nested profile and sets identity/email/privileges on server',async()=>{
  const f=fixture({rows:[]});const result=await f.request({intent:'create_new_account',profile:{...profile,admin:true},
    id:otherId,auth_user_id:otherId,authUserId:otherId,codigo:'STOLEN',email:'spoof@example.invalid',admin:true,premium:true, stripe_customer_id:'bad'});
  assert.equal(result.ok,true);const p=f.inserts[0];
  assert.deepEqual(Object.keys(p).sort(),['auth_user_id','codigo','email','categoria','especialidad','perfil','modo_entrada','marcas','historial','admin','premium'].sort());
  assert.equal(p.auth_user_id,authId);assert.equal(p.email,user.email);assert.equal(p.admin,false);assert.equal(p.premium,false);
  assert.match(p.codigo,/^FP-[A-F0-9]{20}$/);assert.equal(p.id,undefined);
  assert.deepEqual(p.perfil,{objetivo_general:'Progresar',nivel:'Principiante'});
  await f.request({intent:'create_new_account',profile});assert.equal(f.inserts.length,1);
});
test('no implicit bootstrap, no email/code fallback even when supplied',async()=>{
  const f=fixture({rows:[]});assert.equal((await f.request({email:user.email,codigo:'LEGACY',profile})).code,'ACCOUNT_BOOTSTRAP_INTENT_REQUIRED');
  assert.equal((await f.request()).code,'ATHLETE_NOT_LINKED');assert.equal(f.inserts.length,0);
});
test('concurrent UNIQUE violation re-resolves winner without replay',async()=>{
  const f=fixture({rows:[],insertError:{code:'23505'}});assert.equal((await f.request({intent:'create_new_account',profile})).ok,true);
  assert.equal(f.inserts.length,1);
});
test('alias collision/unresolved duplicate reports explicit conflict without reinsert',async()=>{
  const f=fixture({rows:[],insertError:{code:'23505'},noCommit:true});assert.equal((await f.request({intent:'create_new_account',profile})).code,'ACCOUNT_BOOTSTRAP_CONFLICT');
  assert.equal(f.inserts.length,1);
});
test('unknown insert outcome has no automatic replay',async()=>{
  const f=fixture({rows:[],insertThrows:true});assert.equal((await f.request({intent:'create_new_account',profile})).code,'ACCOUNT_BOOTSTRAP_UNAVAILABLE');assert.equal(f.inserts.length,1);
});
test('signup confirmation, callback SDK session, explicit bootstrap and resolution integration',async()=>{
  const f=fixture({rows:[]}),flow=f.load('lib/auth/webAuthFlow.ts');let session=null,exchanges=0;
  const auth={
    async signUp(input){assert.equal(input.options.emailRedirectTo,'https://forgeapp.es/auth/callback');return {data:{session:null},error:null};},
    async getSession(){return {data:{session},error:null};},
    async exchangeCodeForSession(code){assert.equal(code,'one-time-code');exchanges++;session={access_token:'verified-token'};return {data:{session},error:null};},
  };
  assert.equal((await flow.signupForNewAccount(auth,'new@example.invalid','not-a-real-password','https://forgeapp.es')).state,'confirmation_required');
  assert.equal(f.inserts.length,0);
  assert.equal((await flow.authenticatedIdentityRequest(auth)).code,'AUTH_REQUIRED');
  const url='https://forgeapp.es/auth/callback?code=one-time-code';
  await Promise.all([flow.completeAuthCallback(auth,url),flow.completeAuthCallback(auth,url)]);assert.equal(exchanges,1);
  const transport=async(path,init)=>{assert.equal(path,'/api/auth/athlete');return Response.json(await f.request(init.body?JSON.parse(init.body):undefined,init.headers.Authorization));};
  assert.equal((await flow.authenticatedIdentityRequest(auth,undefined,transport)).code,'ATHLETE_NOT_LINKED');
  assert.equal(f.inserts.length,0);
  assert.equal((await flow.authenticatedIdentityRequest(auth,{intent:'create_new_account',profile},transport)).athlete.athleteId,athleteId);
  assert.equal((await flow.authenticatedIdentityRequest(auth,undefined,transport)).athlete.athleteId,athleteId);
});
test('invalid callback does not exchange or bootstrap',async()=>{
  const flow=fixture().load('lib/auth/webAuthFlow.ts');let calls=0;
  const result=await flow.completeAuthCallback({exchangeCodeForSession(){calls++;}},'https://forgeapp.es/auth/callback?error=denied');
  assert.equal(result.ok,false);assert.equal(calls,0);
});

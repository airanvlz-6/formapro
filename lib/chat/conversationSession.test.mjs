import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { sportsRuntime, compile } from '../sports/trainingContractTestRuntime.mjs';

const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const authId='11111111-1111-4111-8111-111111111111';
const load=sportsRuntime({Error,console:{info(){},warn(){},log(){}}});
const {conversationSession:session,conversationTurn}=load('../chat/conversationSession');
const native=decision=>Response.json({stop_reason:'tool_use',content:[{type:'tool_use',id:'toolu_test',name:'submit_coach_turn',input:decision}]});

test('canonical conversation and session protocol against PostgreSQL',async t=>{
  const pg=new PGlite();
  try {
    await pg.exec(`create role anon; create role authenticated; create role service_role;
      create table usuarios(id uuid primary key,codigo text unique,auth_user_id uuid,perfil jsonb,historial jsonb);
      create table active_sessions(user_codigo text primary key,session_id uuid,owner_since timestamptz,updated_at timestamptz,last_message_at timestamptz);`);
    await pg.exec(readFileSync('docs/sql/chat-canonical-session.sql','utf8'));
    const db={
      async rpc(name,args){try{return {data:(await pg.query(`select ${name}($1,$2,$3,$4) as result`,Object.values(args))).rows[0].result};}catch(error){return {error};}},
      from(table){const params=[],filters=[];let fields='*',one=false,limit=100;
        const q={select(v){fields=v;return q;},eq(k,v){params.push(v);filters.push(`${k}=$${params.length}`);return q;},
          single(){one=true;return q;},limit(n){limit=n;return q;},
          async then(resolve,reject){try{const r=await pg.query(`select ${fields} from ${table} where ${filters.join(' and ')||'true'} limit ${limit}`,params);
            return resolve({data:one?r.rows[0]:r.rows,error:null});}catch(e){return reject(e);}}};return q;}
    };
    const history=async()=> (await pg.query("select historial from usuarios where codigo='u'")).rows[0].historial;
    const owner=async()=> (await pg.query("select * from active_sessions where user_codigo='u'")).rows[0];
    const journal=async()=> (await pg.query("select perfil from usuarios where codigo='u'")).rows[0].perfil.coach_first_turns;
    const reset=async()=>{await pg.exec('truncate usuarios,active_sessions');await pg.query(`insert into usuarios values
      ('22222222-2222-4222-8222-222222222222','u',$1,'{"keep":true}','[{"role":"assistant","content":"Anterior"}]'),
      ('33333333-3333-4333-8333-333333333333','other','44444444-4444-4444-8444-444444444444','{}','[]')`,[authId]);};
    let calls=0;
    const handler=(provider=async()=>native({answer:'Respuesta',calls:[]}))=>{
      const identity={exports:{}};vm.runInNewContext(compile(readFileSync('lib/auth/athleteIdentity.ts','utf8')),{
        module:identity,exports:identity.exports,require:n=>n==='node:crypto'?crypto:{}});
      const m={exports:{}};vm.runInNewContext(compile(readFileSync('lib/chat/coachFirstHandler.ts','utf8')),{
        module:m,exports:m.exports,Response,Date,AbortSignal,console:{info(){},error(){}},
        process:{env:{FORGE_COACH_FIRST_POLICY:'read_only',ANTHROPIC_API_KEY:'test'}},
        fetch:async(...args)=>{calls++;return provider(...args);},
        require(n){if(n==='../auth/athleteIdentity')return identity.exports;
          if(n==='../auth/supabaseServer')return {identityDependencies:()=>({db,auth:{getUser:async()=>({data:{user:{id:authId,email_confirmed_at:'2026-01-01'}},error:null})}})};
          return load('../chat/'+n.slice(2));}
      });return m.exports.handleCoachFirst;
    };
    const body=(extra={})=>({action:'coach_first',sessionId:A,message:'Hola',messageId:'message-0001',...extra});
    const send=async(h,b=body())=>(await h(new Request('http://localhost/api/chat',{method:'POST',headers:{Authorization:'Bearer verified'},body:JSON.stringify(b)}),()=>{throw Error('planning forbidden');})).json();
    await t.test('success, canonical input, reopening, HTTP loss and same-ID recovery without replay',async()=>{
      await reset();calls=0;await session(db,'u',A,'acquire');
      const h=handler(async(_url,options)=>{const messages=JSON.parse(options.body).messages;assert.equal(messages[0].content,'Anterior');assert.ok(!JSON.stringify(messages).includes('INJECTED'));return native({answer:'Respuesta',calls:[]});});
      const r=await send(h,body({conversation:[{role:'assistant',content:'INJECTED'}]}));
      assert.equal(r.persisted,true);assert.equal(r.ok,true);assert.equal((await history()).length,3);
      // Treat original HTTP response as lost: same payload/messageId, freshly reopened client.
      const recovered=await send(h);assert.equal(recovered.recovered,true);assert.equal(recovered.answer,'Respuesta');assert.equal(calls,1);
      assert.deepEqual(recovered.historial,await history());assert.equal((await session(db,'u',A,'verify')).historial.length,3);
      const conflict=await send(h,body({message:'changed'}));assert.equal(conflict.status,'conflict');assert.equal(calls,1);
    });
    await t.test('non-owner, takeover, reload, stale owner, foreign athlete session and discordant code',async()=>{
      await reset();calls=0;await session(db,'u',A,'acquire');const h=handler();
      assert.equal((await send(h,body({sessionId:B}))).code,'CHAT_NOT_OWNER');assert.equal(calls,0);
      await send(h);const transfer=await session(db,'u',B,'takeover');assert.equal(transfer.owned,true);assert.deepEqual(transfer.historial,await history());
      assert.equal((await send(h,body({messageId:'message-0002'}))).code,'CHAT_NOT_OWNER');assert.equal(calls,1);
      assert.equal((await send(h,body({sessionId:B,messageId:'message-0002'}))).persisted,true);
      await session(db,'other',A,'acquire');assert.equal((await send(h,body({messageId:'message-0003'}))).code,'CHAT_NOT_OWNER');
      assert.equal((await send(h,body({codigo:'other',sessionId:B}))).code,'ATHLETE_MISMATCH');assert.equal(calls,2);
    });
    await t.test('concurrent initial acquisitions have exactly one owner; heartbeat is not activity',async()=>{
      await reset();const results=await Promise.all([session(db,'u',A,'acquire'),session(db,'u',B,'acquire')]);
      assert.equal(results.filter(r=>r.owned).length,1);const s=(await owner()).session_id;
      await session(db,'u',s,'heartbeat');assert.equal((await owner()).last_message_at,null);
      await send(handler(),body({sessionId:s}));assert.ok((await owner()).last_message_at);
      const previous=(await owner()).last_message_at;await session(db,'u',s,'heartbeat');assert.deepEqual((await owner()).last_message_at,previous);
    });
    await t.test('takeover during provider prevents late write, including A -> B -> A',async()=>{
      for(const returnToA of [false,true]){
        await reset();calls=0;await session(db,'u',A,'acquire');let release,started;
        const ready=new Promise(r=>started=r),pending=new Promise(r=>release=r);
        const h=handler(async()=>{started();await pending;return native({answer:'Late',calls:[]});});
        const turn=send(h);await ready;await session(db,'u',B,'takeover');if(returnToA)await session(db,'u',A,'takeover');release();
        const r=await turn;assert.equal(r.persisted,false);assert.equal(r.status,'conflict');assert.equal((await history()).length,1);assert.equal(calls,1);
        assert.equal(Object.values(await journal())[0].status,'conflict');
      }
    });
    await t.test('history changed concurrently: no overwrite; receipts retained on conflict',async()=>{
      await reset();await session(db,'u',A,'acquire');const turn=conversationTurn('u','message-0001',{message:'Hola'});
      const begin=await session(db,'u',A,'begin',turn);
      await pg.query("update usuarios set historial=historial || $1::jsonb where codigo='u'",[JSON.stringify([{role:'assistant',content:'Concurrent'}])]);
      const r=await session(db,'u',A,'finish',{id:turn.id,epoch:begin.epoch,before:begin.historial,message:'Hola',answer:'Answer',status:'completed',receipts:[{tool:'record_execution',status:'committed'}]});
      assert.equal(r.status,'conflict');assert.equal((await history()).at(-1).content,'Concurrent');assert.equal((await journal())[turn.id].receipts[0].status,'committed');
    });
    await t.test('read_only persists conversation but every sports mutation remains rejected',async()=>{
      await reset();await session(db,'u',A,'acquire');let round=0;
      const names=['update_availability','update_session','record_execution','record_athlete_data','transition_restriction','generate_week'];
      const h=handler(async()=>native(round++?{answer:'Sin cambios deportivos',calls:[]}:{answer:null,calls:names.map(name=>({name,arguments:{}}))}));
      const r=await send(h);assert.equal(r.persisted,true);assert.equal(r.results.length,names.length);
      assert.ok(r.results.every(x=>x.code==='COACH_FIRST_READ_ONLY'));assert.equal((await history()).length,3);
      const profile=(await pg.query("select perfil from usuarios where codigo='u'")).rows[0].perfil;
      delete profile.coach_first_turns;assert.deepEqual(profile,{keep:true});
    });
    await t.test('mobile alias fails closed without session and shares owner/idempotency protocol',async()=>{
      await reset();calls=0;await session(db,'u',A,'acquire');const h=handler();
      const mobile={action:'enviar_mensaje_coach',datos:{mensaje:'Hola',messageId:'message-mobile'}};
      assert.equal((await send(h,mobile)).code,'CHAT_SESSION_REQUIRED');assert.equal(calls,0);
      mobile.datos.sessionId=B;assert.equal((await send(h,mobile)).code,'CHAT_NOT_OWNER');assert.equal(calls,0);
      mobile.datos.sessionId=A;assert.equal((await send(h,mobile)).persisted,true);assert.equal((await send(h,mobile)).recovered,true);assert.equal(calls,1);
    });
    await t.test('unknown errors never save an accepted pair or repeat provider; terminal saves its explicit answer',async()=>{
      await reset();calls=0;await session(db,'u',A,'acquire');const h=handler(async()=>{throw Error('provider failed');});
      const r=await send(h);assert.equal(r.persisted,false);assert.equal((await history()).length,1);
      await send(h);assert.equal(calls,1);assert.equal(Object.values(await journal())[0].status,'unknown');
      const tr=conversationTurn('u','terminal-0001',{}),begin=await session(db,'u',A,'begin',tr);
      const terminal=await session(db,'u',A,'finish',{id:tr.id,epoch:begin.epoch,before:begin.historial,message:'Question',answer:'No puedo confirmar los cambios.',status:'terminal',receipts:[{status:'unknown'}]});
      assert.equal(terminal.persisted,true);assert.equal((await history()).at(-1).content,'No puedo confirmar los cambios.');
    });
    await t.test('retention is last 15 individual messages; legacy history preserved inside that window',async()=>{
      await reset();await session(db,'u',A,'acquire');const previous=Array.from({length:15},(_,i)=>({role:'assistant',content:String(i)}));
      await pg.query("update usuarios set historial=$1 where codigo='u'",[JSON.stringify(previous)]);
      await send(handler());const h=await history();assert.equal(h.length,15);assert.deepEqual(h.slice(0,13),previous.slice(2));
    });
    await t.test('RPC unavailable is fail closed; untrusted roles cannot call the writer',async()=>{
      const r=await session({rpc:async()=>{throw Error('offline');}},'u',A,'begin',{});assert.equal(r.ok,false);assert.equal(r.status,'unknown');
      await pg.exec('set role authenticated');await assert.rejects(pg.query("select public.forge_conversation_session('u',$1,'takeover','{}')",[A]),/permission denied/);await pg.exec('reset role');
    });
    await t.test('commit transport uncertainty recovers the committed pair without repeating provider',async()=>{
      await reset();calls=0;await session(db,'u',A,'acquire');const original=db.rpc;
      db.rpc=async(name,args)=>{const r=await original(name,args);if(args.p_operation==='finish')throw Error('response lost');return r;};
      const h=handler();try{assert.equal((await send(h)).persisted,false);}finally{db.rpc=original;}
      assert.equal((await history()).length,3);assert.equal((await send(h)).recovered,true);assert.equal(calls,1);
    });
    await t.test('concurrent identical claims allow one provider; expired owners reacquire atomically',async()=>{
      await reset();await session(db,'u',A,'acquire');const turn=conversationTurn('u','same-id-0001',{});
      const r=await Promise.all([session(db,'u',A,'begin',turn),session(db,'u',A,'begin',turn)]);
      assert.equal(r.filter(x=>x.status==='committed').length,1);assert.equal(r.filter(x=>x.status==='already_claimed').length,1);
      await pg.exec("update active_sessions set last_message_at=now()-interval '46 minutes',owner_since=now()-interval '50 minutes'");
      assert.equal((await session(db,'u',A,'verify')).sinDueñoRegistrado,true);
      assert.equal((await session(db,'u',A,'begin',conversationTurn('u','expired-0001',{}))).code,'CHAT_NOT_OWNER');
      const acquire=await Promise.all([session(db,'u',A,'acquire'),session(db,'u',B,'acquire')]);
      assert.equal(acquire.filter(x=>x.owned).length,1);
    });
    await t.test('receipts survive a subsequent provider failure and takeover; conversation is not accepted',async()=>{
      await reset();await session(db,'u',A,'acquire');let round=0;
      const h=handler(async()=>{
        if(!round++)return native({answer:null,calls:[{name:'record_execution',arguments:{}}]});
        await session(db,'u',B,'takeover');throw Error('provider failed after tool');
      });
      const r=await send(h);assert.equal(r.code,'CHAT_COMMIT_CONFLICT');assert.equal(r.persisted,false);
      assert.equal((await history()).length,1);const j=Object.values(await journal())[0];
      assert.equal(j.status,'conflict');assert.equal(j.receipts[0].tool,'record_execution');assert.equal(j.receipts[0].status,'rejected');
    });
  } finally {await pg.close();}
});

test('actual web enviar guard rejects checking, conflict, lost ownership and not-yet-hydrated states',async()=>{
  const s=readFileSync('app/FormaPro.tsx','utf8');
  const ast=ts.createSourceFile('FormaPro.tsx',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let arrow;function find(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='enviar')arrow=n.initializer;ts.forEachChild(n,find);}find(ast);
  assert.ok(arrow);
  for(const state of [{verificandoSesion:true},{mostrarConflictoSesion:true},{pestanaBloqueada:true},{escritorListoRef:{current:false}}]){
    const context={console:{log(){}},imagenesAdjuntas:[],cargando:false,bloqueado:false,escritorListoRef:{current:true},
      verificandoSesion:false,mostrarConflictoSesion:false,pestanaBloqueada:false,...state,
      coachFirstEnabled:()=>{throw Error('blocked UI reached execution');}};
    const m={exports:{}};vm.runInNewContext(compile('exports.enviar='+arrow.getText(ast)),{...context,exports:m.exports});
    await m.exports.enviar('Hola');
  }
});

test('actual takeover callback enables writer only after confirmed canonical history; failure remains blocked',async()=>{
  const s=readFileSync('app/FormaPro.tsx','utf8'),ast=ts.createSourceFile('FormaPro.tsx',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let arrow;function find(n){if(ts.isJsxAttribute(n)&&n.name.getText(ast)==='onClick'&&n.initializer?.getText(ast).includes('takeover:true'))arrow=n.initializer.expression;ts.forEachChild(n,find);}find(ast);
  assert.ok(arrow);
  for(const succeeds of [true,false]){
    let resolveRequest;const pending=new Promise(r=>resolveRequest=r),writer={current:true},events=[];
    const m={exports:{}};vm.runInNewContext(compile('exports.takeover='+arrow.getText(ast)),{exports:m.exports,
      escritorListoRef:writer,sessionIdRef:{current:B},codigoUsuario:'u',
      setVerificandoSesion:v=>events.push(['checking',v]),setErrorSesion:v=>events.push(['error',v]),
      setMostrarConflictoSesion:v=>{assert.ok(events.some(e=>e[0]==='history'));events.push(['conflict',v]);},
      setPestanaBloqueada:v=>events.push(['blocked',v]),
      apiCall:async request=>{assert.equal(request.datos.takeover,true);return pending;},
      aplicarHistorialCanonico:h=>{assert.equal(writer.current,false);events.push(['history',h]);}
    });
    const running=m.exports.takeover();assert.equal(writer.current,false);
    resolveRequest(succeeds?{ok:true,owned:true,historial:[{role:'assistant',content:'Canonical'}]}:{ok:false});await running;
    assert.equal(writer.current,succeeds);assert.equal(events.some(e=>e[0]==='history'),succeeds);
    assert.equal(events.some(e=>e[0]==='conflict'&&e[1]===false),succeeds);
  }
});

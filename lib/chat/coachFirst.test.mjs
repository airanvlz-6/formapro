import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as crypto from 'node:crypto';
import { sportsRuntime, plain, equippedProfileFixture, compile } from '../sports/trainingContractTestRuntime.mjs';
const today = '2026-09-22', week = '2026-09-21';
class Clock extends Date { constructor(...a) { super(...(a.length ? a : [today+'T12:00:00Z'])); } static now() { return Date.parse(today+'T12:00:00Z'); } }
const load = sportsRuntime({ Date: Clock, Error, console: { info(){},warn(){},log(){} } });
const loop = load('../chat/coachFirstLoop'), store = load('../chat/coachFirstStore');
const availability = load('chatAvailability'), tools = load('../chat/coachFirstTools');
const days = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
function database() {
  const db = { writes: [], reads: [], conflict: false, uncertain: false, tables: {
    usuarios: [{codigo:'u',modo_entrada:'coach',categoria:'box',especialidad:'crossfit',objetivo_principal:'crossfit',
      perfil:{...equippedProfileFixture(),dias:'4'},distribucion_semanal:{box:['martes','jueves'],carrera:['lunes','miercoles','viernes','domingo']},
      workout_history:[], ciclo_actual:{bloque:'acumulacion',semana:1,totalSemanas:4,planningWeekStart:week}}],
    athlete_training_sources:[{user_codigo:'u',disciplina:'box',owner:'forge',activo:true,dias:['martes','jueves']},
      {user_codigo:'u',disciplina:'carrera',owner:'forge',activo:true,dias:['lunes','miercoles','viernes','domingo']}],
    weekly_plan:[{id:'plan',user_codigo:'u',week_start:week,revision:1, sessions:days.map((dia,i)=>({dia,tipo:i===1?'box':'descanso',
      titulo:'Sesión',descripcion:'Trabajo planificado',por_que:'Objetivo',session_id:`00000000-0000-4000-8000-00000000000${i}`,completada:false}))}],
    athlete_state_events:[], athlete_coaching_notes:[],
  }, from(table) {
    db.reads.push(table); const filters=[]; let patch, one=false, limit=Infinity;
    const q={select(){return q;},eq(k,v){filters.push(r=>typeof r[k]==='object'&&typeof v==='string'?JSON.stringify(r[k])===v:r[k]===v);return q;},
      is(k,v){filters.push(r=>v===null?r[k]==null:r[k]===v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},
      gte(k,v){filters.push(r=>r[k]>=v);return q;},lte(k,v){filters.push(r=>r[k]<=v);return q;},lt(k,v){filters.push(r=>r[k]<v);return q;},
      or(){return q;},order(){return q;},range(){return q;},limit(n){limit=n;return q;},
      single(){one=true;return q;},maybeSingle(){one=true;return q;},update(value){patch=value;return q;},
      then(resolve,reject){try{let rows=(db.tables[table]??[]).filter(r=>filters.every(f=>f(r))).slice(0,limit);
        if(patch){ if(db.conflict)rows=[]; else {db.writes.push({table,patch:plain(patch)});rows.forEach(r=>Object.assign(r,plain(patch)));}
          if(db.uncertain)throw Error('transport'); }
        return Promise.resolve({data:plain(one?rows[0]??null:rows),error:null}).then(resolve,reject);
      }catch(e){return Promise.reject(e).then(resolve,reject);}}};return q;
  }};return db;
}
const input = message => ({message,messageId:'message-0001',timestamp:today+'T12:00:00Z',timezone:'Atlantic/Canary',conversation:[]});
const dispatchFor = (db,i=input('reporte')) => tools.coachFirstTools(db,'u',i,'turn',async()=>({status:'rejected'}),()=>{});

test('A/B: flag defaults OFF; simple Coach gets original message, no dispatcher/read/writer',async()=>{
  assert.equal(load('../chat/coachFirstFlag').coachFirstEnabled(),false);
  const i=input('  ¿por qué descansar?\nNo cambies nada.  '); let calls=0;
  const r=await loop.runCoachFirstLoop(i,{complete:async messages=>{calls++;assert.equal(JSON.parse(messages[0].content).originalMessage,i.message);
    return JSON.stringify({answer:'El descanso permite recuperarte.',calls:[]});},dispatch:()=>{throw Error('unexpected tool');}});
  assert.equal(calls,1);assert.equal(r.ok,true);assert.equal(r.results.length,0);
});

test('C/L: real availability and event writers preserve both operations and pending context',async()=>{
  const db=database(), i=input('Esta semana puedo hacer Box martes y jueves. Carrera lunes, miércoles, viernes y domingo. El sábado quiero descansar. El domingo tengo una carrera de 5 km.');
  i.pending={kind:'availability',id:'pending-1'};
  const snapshot=await availability.readAvailabilityConfirmation(db,'u',week);
  const actions=[{name:'update_availability',arguments:{operation:'replace',week,snapshotDigest:snapshot.snapshotDigest,
    availability:{box:['martes','jueves'],carrera:['lunes','miercoles','viernes','domingo']}}},
    {name:'record_athlete_data',arguments:{kind:'reported_event',description:'Carrera',date:'2026-09-27',details:{distance:{value:5,unit:'km'}},status:'reported'}}];
  let n=0;
  const r=await loop.runCoachFirstLoop(i,{complete:async messages=>{if(!n++){const payload=JSON.parse(messages[0].content);assert.equal(payload.originalMessage,i.message);assert.equal(payload.pending.id,'pending-1');return JSON.stringify({answer:'',calls:actions});}
    return JSON.stringify({answer:'Disponibilidad y evento registrados.',calls:[]});},dispatch:dispatchFor(db,i)});
  assert.equal(r.ok,true);assert.deepEqual(plain(r.results.map(x=>x.status)),['committed','committed']);
  const p=db.tables.usuarios[0].perfil;
  assert.deepEqual(p.weekly_availability[week].availability,actions[0].arguments.availability);
  assert.ok(Object.values(p.weekly_availability[week].availability).every(v=>!v.includes('sabado')));
  assert.equal(p.reported_events[0].details.distance.value,5);assert.equal(p.reported_events[0].date,'2026-09-27');
  assert.equal(db.tables.usuarios[0].objetivo_principal,'crossfit');
});

test('D/E/F: patch preserves omitted disciplines, [] means zero, invalid history falls back',async()=>{
  const db=database();db.tables.usuarios[0].perfil.weekly_availability={[week]:{broken:true}};
  const before=await availability.readAvailabilityConfirmation(db,'u',week);assert.equal(before.ok,true);
  assert.deepEqual(plain(before.availability.box),['martes','jueves']);
  const r=await availability.updateStructuredChatAvailability(db,'u',{operation:'patch',week,snapshotDigest:before.snapshotDigest,availability:{box:[]}});
  assert.equal(r.ok,true,JSON.stringify(r));assert.deepEqual(plain(r.availability.box),[]);
  assert.deepEqual(plain(r.availability.carrera),['lunes','miercoles','viernes','domingo']);
});

test('Availability snapshot confirm is read-only; dated exception can be removed without losing base',async()=>{
  const db=database();let s=await availability.readAvailabilityConfirmation(db,'u',week);
  assert.equal((await availability.updateStructuredChatAvailability(db,'u',{operation:'confirm',week,snapshotDigest:s.snapshotDigest})).ok,true);
  assert.equal(db.writes.length,0);
  let r=await availability.updateStructuredChatAvailability(db,'u',{operation:'exception',week,snapshotDigest:s.snapshotDigest,date:today,unavailable:true});
  assert.equal(r.ok,true);assert.deepEqual(plain(r.availability.box),['jueves']);
  r=await availability.updateStructuredChatAvailability(db,'u',{operation:'exception',week,snapshotDigest:r.snapshotDigest,date:today,unavailable:false});
  assert.equal(r.ok,true);assert.deepEqual(plain(r.availability.box),['martes','jueves']);
});

test('G: local adaptation uses real action authority, CAS/readback, no completion/reviewer/longitudinal reads',async()=>{
  const db=database(), run=dispatchFor(db,input('Hoy no puedo hacer jerk pesado, me molesta el hombro. Cámbiame la sesión.'));
  const result=await run({name:'update_session',arguments:{date:today,sessionId:db.tables.weekly_plan[0].sessions[1].session_id,
    expectedRevision:1,reason:'Evitar la carga que produce molestia',state:'REST'}},1);
  assert.equal(result.status,'committed',JSON.stringify(result));assert.equal(db.tables.weekly_plan[0].revision,2);
  assert.equal(db.tables.weekly_plan[0].sessions[1].completada,false);
  assert.ok(!db.reads.includes('running_execution_records'));assert.ok(!db.reads.includes('physiology_records'));
  assert.equal(db.tables.athlete_state_events.length,0);
});

test('G: external target and completed target cannot be adapted',async()=>{
  for(const state of ['external','completed']){const db=database(),target=db.tables.weekly_plan[0].sessions[1];
    if(state==='external')target.owner='external';else target.completada=true;
    const r=await dispatchFor(db)({name:'update_session',arguments:{date:today,sessionId:target.session_id,expectedRevision:1,reason:'Cambio',state:'REST'}},1);
    assert.equal(r.status,'rejected');assert.equal(db.writes.length,0);}
});

test('H: external execution preserves date/measurements and never completes Forge',async()=>{
  const db=database(),before=JSON.stringify(db.tables.weekly_plan);
  const r=await dispatchFor(db)({name:'record_execution',arguments:{date:today,discipline:'box',description:'Trabajo por mi cuenta',durationMinutes:35,rpe:6}},1);
  assert.equal(r.status,'committed');assert.equal(JSON.stringify(db.tables.weekly_plan),before);
  const e=db.tables.usuarios[0].workout_history[0];assert.equal(e.fecha,today);assert.equal(e.duracion,35);assert.equal(e.external,true);assert.equal(e.operationId,'turn:1');
});

test('I: linked completion requires declared association and authorized target',async()=>{
  for(const associated of [false,true]){const db=database(),target=db.tables.weekly_plan[0].sessions[1];
    const r=await dispatchFor(db,input('He realizado esta sesión; reduje la carga.'))({name:'record_execution',arguments:{
      date:today,discipline:'box',description:'Sesión realizada con menos carga',sessionId:target.session_id,expectedRevision:1,associationConfirmed:associated}},1);
    assert.equal(r.status,associated?'committed':'rejected',JSON.stringify(r));assert.equal(db.tables.weekly_plan[0].sessions[1].completada,associated);}
});

test('J: conversation cannot clear a restriction',async()=>{
  const db=database(),r=await dispatchFor(db,input('ya estoy bien'))({name:'transition_restriction',arguments:{}},1);
  assert.equal(r.status,'confirmation_required');assert.equal(db.writes.length,0);
});

test('N: durable turn CAS permits one claimant, blocks changed payload and uncertain replay',async()=>{
  const db=database();const claims=await Promise.all([store.claimCoachTurn(db,'u','id',{message:'a'}),store.claimCoachTurn(db,'u','id',{message:'a'})]);
  assert.equal(claims.filter(r=>r.status==='committed').length,1);
  assert.equal((await store.claimCoachTurn(db,'u','id',{message:'b'})).status,'conflict');
  assert.equal((await store.claimCoachTurn(db,'u','id',{message:'a'})).status,'already_claimed');
  const uncertain=database();uncertain.uncertain=true;
  assert.equal((await store.claimCoachTurn(uncertain,'u','id',{message:'a'})).status,'unknown');
  assert.equal((await store.claimCoachTurn(uncertain,'u','id',{message:'a'})).status,'already_claimed');
});

test('N: unknown mutation stops remaining tools and never retries provider',async()=>{
  let writes=0,providers=0;
  const r=await loop.runCoachFirstLoop(input('varias operaciones'),{complete:async()=>{providers++;return JSON.stringify({answer:'',calls:[
    {name:'record_athlete_data',arguments:{}},{name:'generate_week',arguments:{}}]});},dispatch:async()=>{writes++;return{status:'unknown'};}});
  assert.equal(r.ok,false);assert.equal(writes,1);assert.equal(providers,1);
});

test('events support uncatalogued descriptions and missing date without creating details',async()=>{
  const db=database();const r=await store.recordReportedEvent(db,'u',{kind:'reported_event',description:'Encuentro sin modalidad conocida',status:'tentative'},
    {messageId:'m',message:'reporte',operationId:'o',timestamp:today});
  assert.equal(r.status,'committed');assert.equal('date' in r.event,false);assert.equal('details' in r.event,false);
});

test('production wiring: shared authenticated entry, early web return, server excludes legacy and shadow',()=>{
  const web=readFileSync('app/FormaPro.tsx','utf8'),route=readFileSync('app/api/chat/route.ts','utf8');
  const start=web.indexOf('const enviar=async'),branch=web.indexOf('if (coachFirstEnabled())',start),shadow=web.indexOf('void observeSemanticShadow',start);
  assert.ok(branch>start&&branch<shadow);assert.ok(web.slice(branch,shadow).includes('return;'));
  assert.ok(route.includes("body.action === 'coach_first' || body.action === 'enviar_mensaje_coach'"));
  assert.ok(route.includes('legacyConversationOperations.has(body.action)'));
  assert.ok(readFileSync('app/api/semantic-intake-shadow/route.ts','utf8').includes('!coachFirstEnabled()'));
  const handler=readFileSync('lib/chat/coachFirstHandler.ts','utf8');
  assert.ok(handler.indexOf('verifySupabasePrincipal(request, auth)')<handler.indexOf('claimCoachTurn(db'));
  assert.ok(handler.includes('resolveAuthenticatedAthlete(db, principal)'));
});

test('K: generation passes one event snapshot through Analyzer, Weekly, Builder and final save',async()=>{
  const db=database();await store.recordReportedEvent(db,'u',{kind:'reported_event',description:'Carrera 5 km',date:'2026-09-27',status:'reported'},
    {messageId:'m',message:'evento',operationId:'e',timestamp:today});
  const runtime=sportsRuntime({Date:Clock,console:{info(){},warn(){},log(){}}},(path,module)=>{
    if(path.endsWith('weeklyGenerationPreflight.ts'))return {...module,resolveWeeklyGenerationPreflight:async()=>({canContinue:true})};
    if(path.endsWith('weeklyGeneration.ts'))return {...module,beginWeeklyGeneration:async()=>({token:'server-token',planningRunId:'run',currentWeek:week,nextWeek:'2026-09-28',snapshots:{[week]:db.tables.weekly_plan[0]}})};
    return module;
  });
  const generation=runtime('../chat/coachFirstGeneration'),s=await availability.readAvailabilityConfirmation(db,'u',week),seen=[];
  const r=await generation.generateCoachFirstWeek(db,'u',{week,includeToday:true,snapshotDigest:s.snapshotDigest},'op',today,async(action,args,context)=>{
    seen.push({action,digest:context.reportedEvents.digest,text:generation.coachFirstPlanningText(context)});
    if(action==='analizar_bloque_semana')return {ok:true,analisis:{tipo_semana:'acumulacion'}};
    if(action==='planificar_semana')return {ok:true,estructura:{weeklyContractVersion:2,calendarReceipt:'receipt',contractDigest:'contract',contextDigest:'context',strategy:{adaptacion_principal:'Mantener'},
      sessions:days.map((dia,i)=>({dia,tipo:i===1?'box':'descanso'}))}};
    if(action==='construir_sesion_dia'){assert.equal(args.contractDigest,'contract');assert.equal(args.contextDigest,'context');return {ok:true,sesion:db.tables.weekly_plan[0].sessions[1]};}
    return {ok:true,commitConfirmed:true};
  });
  assert.equal(r.status,'committed',JSON.stringify(r));assert.equal(seen.length,4);assert.equal(new Set(seen.map(s=>s.digest)).size,1);
  assert.ok(seen.every(s=>s.text.includes('Carrera 5 km')));assert.equal(r.analyzerAuxiliaryEffects,'not_persisted_coach_first');
});

test('K/N: event revision changed during generation prevents final save, no stage replay',async()=>{
  const db=database(),s=await availability.readAvailabilityConfirmation(db,'u',week),seen=[];
  const runtime=sportsRuntime({Date:Clock,console:{info(){},warn(){},log(){}}},(path,module)=>{
    if(path.endsWith('weeklyGenerationPreflight.ts'))return {...module,resolveWeeklyGenerationPreflight:async()=>({canContinue:true})};
    if(path.endsWith('weeklyGeneration.ts'))return {...module,beginWeeklyGeneration:async()=>({token:'t',currentWeek:week,nextWeek:'2026-09-28',snapshots:{[week]:null}})};
    return module;
  });
  const r=await runtime('../chat/coachFirstGeneration').generateCoachFirstWeek(db,'u',{week,includeToday:true,snapshotDigest:s.snapshotDigest},'op',today,async action=>{
    seen.push(action);db.tables.usuarios[0].perfil.reported_events=[{id:'new'}];return {ok:true,analisis:{}};
  });
  assert.equal(r.status,'unknown');assert.deepEqual(seen,['analizar_bloque_semana']);
});

test('G: current restrictions block a technically structured prohibited adaptation',async()=>{
  const db=database();db.tables.athlete_coaching_notes=[{user_codigo:'u',movement:'push_press',constraint_level:'hard',status:'pending',valid_until:null}];
  const r=await dispatchFor(db,input('Cambia la sesión.'))({name:'update_session',arguments:{date:today,
    sessionId:db.tables.weekly_plan[0].sessions[1].session_id,expectedRevision:1,state:'TRAIN',reason:'Cambio',discipline:'box',
    intent:{kind:'open_coach',version:1,discipline:'box',adaptationId:'strength',stimulusId:'fuerza_maxima',pattern:'vertical_push',role:'PRIMARY',method:{kind:'coach_defined',label:'Fuerza'}},
    proposal:{schemaVersion:2,stimulusId:'fuerza_maxima',structureId:'strength_sets',blocks:[{blockType:'main',movements:[{movementId:'push_press',prescription:{doseInstruction:'Tres series de cinco repeticiones con carga cómoda y dos minutos de descanso.'}}]}]}}},1);
  assert.equal(r.code,'CHAT_ACTION_RESTRICTION_CONFIRMATION',JSON.stringify(r));assert.equal(db.writes.length,0);
});

test('Availability scope extension and stale snapshot cannot write',async()=>{
  for(const mode of ['scope','stale']){const db=database(),s=await availability.readAvailabilityConfirmation(db,'u',week);
    const r=await availability.updateStructuredChatAvailability(db,'u',{operation:'patch',week,snapshotDigest:mode==='stale'?'stale':s.snapshotDigest,
      availability:mode==='scope'?{cycling:['lunes']}:{box:['lunes']}});
    assert.equal(r.ok,false);assert.equal(db.writes.length,0);}
});

test('G: executable local TRAIN adaptation succeeds through reused contract and validators',async()=>{
  const db=database();
  const r=await dispatchFor(db)({name:'update_session',arguments:{date:today,
    sessionId:db.tables.weekly_plan[0].sessions[1].session_id,expectedRevision:1,state:'TRAIN',reason:'Trabajo tolerable',discipline:'box',
    intent:{kind:'open_coach',version:1,discipline:'box',adaptationId:'aerobic',stimulusId:'aerobic',pattern:'cyclic',role:'SUPPORTING',method:{kind:'coach_defined',label:'Trabajo tolerable'}},
    proposal:{schemaVersion:2,stimulusId:'aerobic',structureId:'Continuo libre',blocks:[{blockType:'main',movements:[{movementId:'bike',prescription:{durationSeconds:1200,doseInstruction:'Mantén un esfuerzo cómodo, RPE 3-4.'}}]}]}}},1);
  assert.equal(r.status,'committed',JSON.stringify(r));assert.equal(db.tables.weekly_plan[0].sessions[1].completada,false);
  assert.ok(db.tables.weekly_plan[0].sessions[1].structuredPrescription);
});

test('rollback blocks affected legacy planning, preserves unaffected weeks and stored reports',async()=>{
  const db=database();assert.equal(await store.legacyPlanningCanReadReports(db,'u',week),true);
  db.tables.usuarios[0].perfil.reported_events=[{description:'Evento',date:'2026-09-27',status:'reported'}];
  assert.equal(await store.legacyPlanningCanReadReports(db,'u',week),false);
  assert.equal(await store.legacyPlanningCanReadReports(db,'u','2026-10-05'),true);
  db.tables.usuarios[0].perfil.reported_events.push({description:'Sin fecha',status:'tentative'});
  assert.equal(await store.legacyPlanningCanReadReports(db,'u','2026-10-05'),false);assert.equal(db.writes.length,0);
});

function authenticatedHandler(db, auth, provider, policy, errors = []) {
  const identity={exports:{}};
  vm.runInNewContext(compile(readFileSync('lib/auth/athleteIdentity.ts','utf8')),{
    module:identity,exports:identity.exports,require:name=>name==='node:crypto'?crypto:{},
  });
  const handler={exports:{}};
  vm.runInNewContext(compile(readFileSync('lib/chat/coachFirstHandler.ts','utf8')),{
    module:handler,exports:handler.exports,Response,Date:Clock,AbortSignal,console:{info(){},error:(marker,event)=>errors.push({marker,...event})},
    process:{env:{ANTHROPIC_API_KEY:'offline-placeholder',...(policy === undefined ? {} : {FORGE_COACH_FIRST_POLICY:policy})}},fetch:provider,
    require(name){if(name==='../auth/athleteIdentity')return identity.exports;
      if(name==='../auth/supabaseServer')return {identityDependencies:()=>({db,auth})};
      return load('../chat/'+name.slice(2));},
  });
  return handler.exports.handleCoachFirst;
}

test('handler logs correlated sanitized exceptions without changing unknown response or retrying',async()=>{
  for (const scenario of ['syntax','transport','unsafe','http']) {
    const db=database(),authId='11111111-1111-4111-8111-111111111111',errors=[];
    Object.assign(db.tables.usuarios[0],{id:'22222222-2222-4222-8222-222222222222',auth_user_id:authId});
    let calls=0;
    const secret='PRIVATE_USER_CONVERSATION_COOKIE_TOKEN_KEY';
    const handle=authenticatedHandler(db,{getUser:async()=>({data:{user:{id:authId,email_confirmed_at:today}},error:null})},async()=>{
      calls++;
      if(scenario==='transport')throw Object.assign(new Error('fetch failed'),{code:'ECONNRESET',status:503,cause:{token:secret}});
      if(scenario==='unsafe')throw {name:secret,message:secret,code:secret,status:secret,stack:secret};
      if(scenario==='http')return new Response(secret,{status:401});
      return Response.json({content:[{type:'text',text:secret}]});
    },'read_only',errors);
    const messageId='cef852f8-e86b-4973-9d6b-d3d4e1f09699';
    const response=await handle(new Request('http://localhost/api/chat',{method:'POST',headers:{Authorization:'Bearer verified-token'},
      body:JSON.stringify({action:'coach_first',message:secret,messageId,conversation:[{role:'user',content:secret}]})}),()=>{throw Error('unexpected planning');});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{route:'coach_first',status:'unknown',code:'COACH_FIRST_UNAVAILABLE',retryable:false,
      answer:'No puedo confirmar el resultado del turno. No lo he reintentado.'});
    assert.equal(calls,1);assert.equal(errors.length,1);
    const log=errors[0];assert.equal(log.marker,'COACH_FIRST_ERROR');assert.equal(log.messageId,messageId);assert.equal(log.claimed,true);
    assert.equal(log.stage,scenario==='syntax'?'coach_loop':scenario==='http'?'provider_http':'provider_fetch');
    assert.ok(!JSON.stringify(log).includes(secret));assert.ok(!JSON.stringify(log).includes('offline-placeholder'));
    if(scenario==='syntax'){assert.equal(log.errorName,'SyntaxError');assert.equal(log.errorMessage,'Invalid syntax; source excerpt redacted');}
    if(scenario==='transport'){assert.equal(log.errorMessage,'fetch failed');assert.equal(log.errorCode,'ECONNRESET');assert.equal(log.errorStatus,503);}
  }
});

test('M/B/N: actual handler verifies Supabase principal, binds athlete, calls Coach once and refuses replay',async()=>{
  const db=database(), authId='11111111-1111-4111-8111-111111111111';
  Object.assign(db.tables.usuarios[0],{id:'22222222-2222-4222-8222-222222222222',auth_user_id:authId});
  let providers=0,verifications=0;
  const handle=authenticatedHandler(db,{getUser:async token=>{verifications++;assert.equal(token,'verified-token');return{data:{user:{id:authId,email_confirmed_at:today}},error:null};}},async(_url,options)=>{
    providers++;const payload=JSON.parse(options.body);assert.equal(JSON.parse(payload.messages[0].content).originalMessage,'  pregunta intacta  ');
    return Response.json({content:[{type:'text',text:JSON.stringify({answer:'Respuesta.',calls:[]})}]});
  });
  const request=(body={},authorized=true)=>new Request('http://localhost/api/chat',{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:'Bearer verified-token'}:{})},
    body:JSON.stringify({action:'coach_first',message:'  pregunta intacta  ',messageId:'unique-message-id',...body})});
  const planning=()=>{throw Error('unexpected planning');};
  assert.equal((await handle(request({},false),planning)).status,401);assert.equal(db.writes.length,0);
  assert.equal((await handle(request({codigo:'OTHER'}),planning)).status,403);assert.equal(db.writes.length,0);
  const result=await (await handle(request(),planning)).json();assert.equal(result.ok,true);assert.equal(providers,1);
  assert.equal((await (await handle(request(),planning)).json()).code,'TURN_NOT_REPLAYED');assert.equal(providers,1);
  assert.equal(verifications,3);assert.ok(db.reads.every(t=>t==='usuarios'));
});

test('read-only policy rejects every mutation and future tool before any authority or database access',async()=>{
  let authorities=0,accesses=0;
  const guarded=sportsRuntime({Date:Clock,Error},(path,module)=>{
    const names=['applyChatCoachActions','recordExternalExecution','updateStructuredChatAvailability','recordReportedEvent'];
    return {...module,...Object.fromEntries(names.filter(n=>typeof module[n]==='function').map(n=>[n,()=>{authorities++;throw Error('authority reached');}]))};
  })('../chat/coachFirstTools');
  const dispatch=guarded.coachFirstTools({from(){accesses++;throw Error('database reached');}},'u',input('consulta'),'turn',
    async()=>{authorities++;throw Error('generation reached');},()=>{},'read_only');
  for(const name of ['update_availability','update_session','record_execution','record_athlete_data','transition_restriction','generate_week','future_mutation']){
    const r=await dispatch({name,arguments:{}},1);assert.equal(r.status,'rejected');assert.equal(r.reason,'read_only_policy');
  }
  assert.equal(authorities,0);assert.equal(accesses,0);
});

test('read-only allows canonical reads; normal default and explicit normal preserve generation capability; invalid policy fails closed',async()=>{
  const db=database();let generated=0;
  const dispatch=tools.coachFirstTools(db,'u',input('consulta'),'turn',async()=>{generated++;return{status:'committed'};},()=>{},'read_only');
  const r=await dispatch({name:'read_context',arguments:{resource:'week',week}},1);
  assert.equal(r.status,'read');assert.equal(r.data.week_start,week);assert.equal(db.writes.length,0);
  for(const policy of [undefined,'normal']){
    const normal=tools.coachFirstTools(db,'u',input('consulta'),'turn',async()=>{generated++;return{status:'committed'};},()=>{},policy);
    assert.equal((await normal({name:'generate_week',arguments:{}},1)).status,'committed');
  }
  assert.equal(generated,2);
  for(const invalid of ['', 'READ_ONLY', 'invalid', null])assert.throws(()=>tools.resolveCoachFirstPolicy(invalid),/POLICY_INVALID/);
  assert.equal(tools.resolveCoachFirstPolicy(undefined),'normal');
});

test('authenticated handler selects read-only from server, ignores client elevation, preserves only journal writes',async()=>{
  const db=database(),authId='11111111-1111-4111-8111-111111111111';
  Object.assign(db.tables.usuarios[0],{id:'22222222-2222-4222-8222-222222222222',auth_user_id:authId});
  const before=plain(db.tables);let calls=0;
  const handle=authenticatedHandler(db,{getUser:async()=>({data:{user:{id:authId,email_confirmed_at:today}},error:null})},async(_url,options)=>{
    const messages=JSON.parse(options.body).messages;
    if(calls++)assert.equal(JSON.parse(messages.at(-1).content).toolResult.reason,'read_only_policy');
    return Response.json({content:[{type:'text',text:JSON.stringify(calls===1?{answer:'',calls:[{name:'record_athlete_data',arguments:{kind:'reported_event',description:'Evento',status:'reported'}}]}:{answer:'No he guardado cambios.',calls:[]})}]});
  },'read_only');
  const response=await handle(new Request('http://localhost/api/chat',{method:'POST',headers:{Authorization:'Bearer token'},
    body:JSON.stringify({action:'coach_first',message:'consulta',messageId:'policy-test-message',mode:'normal',policy:'normal'})}),()=>{throw Error('planning reached');});
  const r=await response.json();assert.equal(r.ok,true);assert.equal(r.results[0].reason,'read_only_policy');assert.equal(calls,2);
  assert.ok(db.tables.usuarios[0].perfil.coach_first_turns);
  const after=plain(db.tables);delete after.usuarios[0].perfil.coach_first_turns;assert.deepEqual(after,before);
  assert.ok(db.writes.every(w=>w.table==='usuarios'&&Object.keys(w.patch).length===1&&'perfil' in w.patch));
});

test('A/B: actual POST blocks every legacy chat writer before any privileged access while ON',async()=>{
  const route={exports:{}},flag=load('../chat/coachFirstFlag');let routed=0;
  const forbidden=()=>{throw Error('legacy reached');};
  vm.runInNewContext(compile(readFileSync('app/api/chat/route.ts','utf8')),{
    module:route,exports:route.exports,console,process:{env:{}},
    require(name){
      if(name==='@supabase/supabase-js')return{createClient:()=>({from:forbidden})};
      if(name==='next/server')return {NextResponse:Response};
      if(name==='@/lib/chat/coachFirstFlag')return {...flag,coachFirstEnabled:()=>true};
      if(name==='@/lib/chat/coachFirstHandler')return {handleCoachFirst:async()=>{routed++;return Response.json({route:'coach_first'});}};
      return new Proxy({},{get:()=>forbidden});
    },
  });
  for(const action of [...flag.legacyConversationOperations,undefined]){
    const r=await route.exports.POST(new Request('http://localhost/api/chat',{method:'POST',body:JSON.stringify({action})}));
    assert.equal(r.status,409);assert.equal((await r.json()).code,'COACH_FIRST_ROUTE_REQUIRED');
  }
  for(const action of ['coach_first','enviar_mensaje_coach'])await route.exports.POST(new Request('http://localhost/api/chat',{method:'POST',body:JSON.stringify({action})}));
  assert.equal(routed,2);
});

test('Analyzer actual branch computes analysis but suppresses both auxiliary writes, even on provider failure',async()=>{
  const source=readFileSync('app/api/chat/route.ts','utf8'),ast=ts.createSourceFile('route.ts',source,ts.ScriptTarget.Latest,true);
  function find(n){if(ts.isIfStatement(n)&&n.expression.getText(ast)==='action === "analizar_bloque_semana"')return n;
    return ts.forEachChild(n,find);}
  const body=find(ast).thenStatement.getText(ast);
  for(const fails of [false,true]){
    const db=database();db.tables.usuarios[0].athlete_development=[{nombre_visible:'Antigua',estado:'activa',detectado:'2025-01-01'}];
    db.tables.athlete_coaching_notes=[{id:'note',status:'pending',issue:'Observación'}];
    const context={week,includeToday:true,availability:{box:['martes']},availabilityDigest:'availability',operationId:'op',reportedEvents:{digest:'event-digest',records:[{description:'Encuentro',status:'reported'}]}};
    const execute=vm.runInNewContext(compile(`async function execute() ${body}\nexports.execute=execute;`),{
      exports:{},Date:Clock,console:{log(){},error(){}},supabase:db,codigo:'u',apiKey:'offline-placeholder',
      coachFirstPlanning:context,coachFirstPlanningText:load('../chat/coachFirstGeneration').coachFirstPlanningText,
      getCanonicalRestrictions:async()=>({restrictions:[],reassessments:[]}),
      strategyDemandIds:()=>[],loadAthletePrescriptionContext:async()=>({}),resolveCompletionDate:load('../planning/recordCompletion').resolveCompletionDate,
      generarEstadoCanonico:async()=>({ciclo:{}}),buildFocusContext:async()=>({esModoFocus:false}),
      buildExposureReport:()=>({exposiciones:[]}),exposureReportToPromptText:()=>'',agregarExposicionPorPatron:()=>({}),agregarExposicionPorModalidad:()=>({}),
      loadEventContext:async()=>({authority:{}}),eventAuthorityText:()=>'',boundEventAnalysis:v=>v,normalizeStrategyProposal:v=>v,
      calcularFrecuenciaRealRelativa:()=>0,aplicarTrainingFrequencySafetyNet:()=>({diasEntrenoSugeridos:3,corregido:false}),
      NextResponse:Response,require:()=>({MOVEMENT_LIBRARY:{}}),fetch:async(_url,options)=>{
        assert.ok(JSON.parse(options.body).messages[0].content.includes('event-digest'));
        if(fails)throw Error('offline transport failure');
        return Response.json({content:[{text:JSON.stringify({coaching_notes_incorporadas:['note'],dias_entreno_sugeridos:3})}]});
      },
    });
    const response=await execute();assert.equal(response.status,fails?500:200);assert.equal(db.writes.length,0);
    assert.equal(db.tables.usuarios[0].athlete_development[0].estado,'activa');assert.equal(db.tables.athlete_coaching_notes[0].status,'pending');
  }
});

test('N: post-write session readback transport failure is unknown, never committed or retried',async()=>{
  const db=database(),from=db.from.bind(db);
  db.from=table=>{if(table==='weekly_plan'&&db.writes.some(w=>w.table==='weekly_plan'))throw Error('readback unavailable');return from(table);};
  const r=await dispatchFor(db)({name:'update_session',arguments:{date:today,sessionId:db.tables.weekly_plan[0].sessions[1].session_id,expectedRevision:1,reason:'Descanso',state:'REST'}},1);
  assert.equal(r.status,'unknown');assert.equal(db.writes.filter(w=>w.table==='weekly_plan').length,1);
});

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

test('read failures log only allowlisted diagnostics while preserving the exact Coach result',async t=>{
  const secret='PRIVATE_USER_PLAN_PROFILE_SQL_TOKEN_STACK';
  const cases=[
    {name:'arguments',args:{extra:secret},code:'READ_INVALID',stage:'validation'},
    {name:'range',args:{date:'1900-01-01'},code:'READ_RANGE_INVALID',stage:'validation'},
    {name:'limit',args:{limit:61},code:'READ_LIMIT_INVALID',stage:'validation'},
    {name:'size',setup(db){db.tables.usuarios[0].perfil.reported_events=[{description:secret.repeat(5000)}];},
      code:'READ_SIZE_LIMIT',stage:'read_result'},
    {name:'prescription table failure',setup(db){
      const from=db.from.bind(db);
      db.from=table=>{
        const q=from(table);
        if(table==='session_modification_events')q.then=(resolve,reject)=>Promise.resolve({data:null,error:{message:secret,code:secret}}).then(resolve,reject);
        return q;
      };
    },code:'PRESCRIPTION_CONTEXT_READ_FAILED',stage:'session_modification_events'},
    {name:'profile',setup(db){db.tables.usuarios[0].perfil=secret;},code:'COACH_FIRST_PROFILE_UNAVAILABLE',stage:'profile'},
    {name:'reported events',setup(db){db.tables.usuarios[0].perfil.reported_events={secret};},code:'REPORTED_EVENTS_INVALID',stage:'reported_events'},
    {name:'canonical read',args:{resource:'week'},setup(db){db.from=()=>{throw new Error(secret);};},
      code:'UNEXPECTED_READ_ERROR',stage:'canonical_read'},
    ...[new Error(secret),new Error('PRESCRIPTION_CONTEXT_READ_FAILED:'+secret),
      new Error('READ_SIZE_LIMIT '+secret),{message:secret,code:'READ_SIZE_LIMIT',stack:secret},
      {get message(){throw new Error(secret);}},null,secret].map((error,index)=>({
        name:'unexpected planning error '+index,setup(db){db.from=()=>{throw error;};},
        code:'UNEXPECTED_READ_ERROR',stage:'planning_loader',
      })),
    {name:'unexpected profile error',setup(db){
      const from=db.from.bind(db);
      db.from=table=>{const q=from(table),select=q.select;
        q.select=(fields,...rest)=>{if(table==='usuarios'&&fields==='perfil')throw new Error(secret);return select(fields,...rest);};return q;};
    },code:'UNEXPECTED_READ_ERROR',stage:'profile'},
  ];
  for(const fixture of cases)await t.test(fixture.name,async()=>{
    for(const policy of ['normal','read_only']){
      const db=database(),observations=[];fixture.setup?.(db);
      const dispatch=tools.coachFirstTools(db,'u',input(secret),'turn',()=>{throw Error('unexpected generation');},e=>observations.push(e),policy);
      const args={resource:'planning',...fixture.args};
      const result=await dispatch({name:'read_context',arguments:args},1);
      assert.deepEqual(plain(result),{status:'rejected',code:'TOOL_UNAVAILABLE'});
      assert.deepEqual(plain(observations),[{route:'coach_first',policy,tool:'read_context',authority:'canonical_read_projection',
        status:'rejected',operationId:'turn:1',resource:args.resource,failureCode:fixture.code,failureStage:fixture.stage}]);
      assert.ok(!JSON.stringify(observations).includes(secret));
      assert.ok(!JSON.stringify(observations).includes('errorMessage'));
      assert.ok(!JSON.stringify(observations).includes('stack'));
      assert.equal(db.writes.length,0);
    }
  });
});

test('successful planning read has no failure diagnostics and no previous failure leaks to the next call',async()=>{
  const db=database(),observations=[];
  const dispatch=tools.coachFirstTools(db,'u',input('consulta'),'turn',()=>{throw Error('unexpected generation');},e=>observations.push(e));
  await dispatch({name:'read_context',arguments:{resource:'planning',limit:61}},1);
  const result=await dispatch({name:'read_context',arguments:{resource:'planning'}},2);
  assert.equal(result.status,'read');assert.equal(result.data.athlete.cycle.block.value,'acumulacion');
  assert.ok(!('failureCode' in result));assert.ok(!('failureStage' in result));
  assert.deepEqual(plain(observations[1]),{route:'coach_first',policy:'normal',tool:'read_context',authority:'canonical_read_projection',
    status:'read',operationId:'turn:2',resource:'planning'});
  assert.equal(db.writes.length,0);
});

test('A/B: flag defaults OFF; simple Coach gets original message, no dispatcher/read/writer',async()=>{
  assert.equal(load('../chat/coachFirstFlag').coachFirstEnabled(),false);
  const i=input('  ¿por qué descansar?\nNo cambies nada.  '); let calls=0;
  const r=await loop.runCoachFirstLoop(i,{complete:async messages=>{calls++;assert.equal(JSON.parse(messages[0].content).originalMessage,i.message);
    return {answer:'El descanso permite recuperarte.',calls:[]};},dispatch:()=>{throw Error('unexpected tool');}});
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
  const r=await loop.runCoachFirstLoop(i,{complete:async messages=>{if(!n++){const payload=JSON.parse(messages[0].content);assert.equal(payload.originalMessage,i.message);assert.equal(payload.pending.id,'pending-1');return {answer:'',calls:actions};}
    return {answer:'Disponibilidad y evento registrados.',calls:[]};},dispatch:dispatchFor(db,i)});
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
  const r=await loop.runCoachFirstLoop(input('varias operaciones'),{complete:async()=>{providers++;return {answer:'',calls:[
    {name:'record_athlete_data',arguments:{}},{name:'generate_week',arguments:{}}]};},dispatch:async()=>{writes++;return{status:'unknown'};}});
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
  assert.ok(handler.indexOf('verifySupabasePrincipal(request, auth)')<handler.indexOf('conversationSession(db'));
  assert.ok(handler.includes('resolveAuthenticatedAthlete(db, principal)'));
});

test('incident: text (including fences) is never parsed as a Coach decision',async()=>{
  const invalidTexts = ['', 'Respuesta directa.', '```json\n{"answer":"Respuesta","calls":[]}\n```', '{"answer":"unfinished'];
  for (const raw of invalidTexts) {
    let completions=0,dispatches=0;const events=[];
    await assert.rejects(loop.runCoachFirstLoop(input('offline fixture'),{
      complete:async()=>{completions++;return raw;},
      dispatch:async()=>{dispatches++;throw Error('unexpected tool');},observe:e=>events.push(e),
    }),{name:'Error',message:'COACH_FIRST_OUTPUT_INVALID'});
    assert.equal(completions,1);assert.equal(dispatches,0);assert.equal(events.length,1);
    assert.equal(events[0].coachCalls,1);assert.equal(events[0].tools,0);assert.equal(events[0].reads,0);
    assert.equal(events[0].unknownOrPartial,false);assert.equal(events[0].casConflict,false);
  }
  await assert.rejects(loop.runCoachFirstLoop(input('offline fixture'),{
    complete:async()=>({answer:'Respuesta',calls:'invalid'}),dispatch:async()=>{throw Error('unexpected tool');},
  }),{name:'Error',message:'COACH_FIRST_OUTPUT_INVALID'});
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

const nativeTurn = decision => Response.json({stop_reason:'tool_use',content:[{type:'tool_use',id:'toolu_fixture',name:'submit_coach_turn',input:decision}]});
test('native envelope rejects absent, duplicate, wrong tool, refusal and truncation without text fallback',()=>{
  const read=load('../chat/coachFirstOutput').readCoachFirstOutput;
  const block={type:'tool_use',id:'toolu_fixture',name:'submit_coach_turn',input:{answer:'ok',calls:[]}};
  for(const output of [null,{stop_reason:'end_turn',content:[{type:'text',text:'```json\n{"answer":"ok","calls":[]}\n```'}]},
    {stop_reason:'max_tokens',content:[block]},{stop_reason:'refusal',content:[block]},
    {stop_reason:'tool_use',content:[]},{stop_reason:'tool_use',content:[block,block]},
    {stop_reason:'tool_use',content:[{...block,name:'read_context'}]}]){
    assert.throws(()=>read(output),{message:'COACH_FIRST_OUTPUT_INVALID'});
  }
  assert.deepEqual(read({stop_reason:'tool_use',content:[{type:'text',text:'Ignored Markdown ```'},block]}),block.input);
});

// Deterministic transport/source fixtures, NOT a semantic evaluator of model decisions.
// The provider is scripted: these verify that the actual system instruction reaches it,
// source distinctions survive reads, and neither history nor repeated reads are forced.
// A live evaluation must separately assess whether the model chooses evidence or uncertainty.
test('evidence discipline: source and progressive-read contract fixtures',async t=>{
  const recorded={fecha:'2026-09-18',tipo:'carrera',duracion:30,notas:'Rodaje registrado'};
  const fixtures=[
    {name:'planned is not performed',message:'¿Cómo retomo esta semana?',resources:['week','history'],
      answer:'Hay una sesión planificada; el registro disponible corresponde a un rodaje anterior.',
      check(results){assert.equal(results[0].data.sessions[1].completada,false);
        assert.deepEqual(results[0].data.sessions[1].reportedExecution,[]);assert.deepEqual(results[1].data.records,[recorded]);}},
    {name:'adapted is not performed',message:'¿El ajuste de la sesión cambia lo que hice?',resources:['week'],
      setup(db){const s=db.tables.weekly_plan[0].sessions[1];s.titulo='Prescripción adaptada';
        s.chatPrescriptionHistory=[{id:'adapted',original:{titulo:'Prescripción original',tipo:'box'}}];},
      answer:'La adaptación cambia la prescripción; no demuestra que la hayas realizado.',
      check(results){const s=results[0].data.sessions[1];assert.equal(s.titulo,'Prescripción adaptada');
        assert.equal(s.originalPrescription.titulo,'Prescripción original');assert.equal(s.completada,false);assert.deepEqual(s.reportedExecution,[]);}},
    {name:'previous assistant is not independent evidence',message:'¿Qué antecedente usarías para recomendarme entrenar?',resources:['history'],
      prior:'Tu última sesión fue ayer.',setup(db){db.tables.usuarios[0].historial=[{role:'assistant',content:this.prior}];},
      answer:'El historial consultado contiene un rodaje registrado; la afirmación anterior no lo sustituye.',
      check(results){assert.deepEqual(results[0].data.records,[recorded]);}},
    {name:'empty history does not prove inactivity',message:'¿Cuánto tiempo llevo sin entrenar?',resources:['history'],
      setup(db){db.tables.usuarios[0].workout_history=[];},
      answer:'No encuentro entrenamientos registrados en esta fuente. ¿Cuándo entrenaste por última vez?',
      check(results){assert.deepEqual(results[0].data.records,[]);assert.equal(results[0].data.semantics,'LEGACY_RECORDED_NOT_VERIFIED');}},
    {name:'history supports latest recorded workout with coverage limits',message:'¿Cuál es el último entrenamiento registrado?',resources:['history'],
      answer:'El último entrenamiento registrado en la fuente consultada es un rodaje de 30 minutos.',
      check(results){assert.deepEqual(results[0].data.records,[recorded]);assert.equal(results[0].data.truncated,false);
        assert.equal(results[0].data.semantics,'LEGACY_RECORDED_NOT_VERIFIED');assert.equal(results[0].coverage.limit,14);}},
    {name:'sufficient evidence already read needs no redundant read',message:'Resume el entrenamiento registrado y su duración.',resources:['history'],
      answer:'El registro indica carrera durante 30 minutos.',check(results){assert.deepEqual(results[0].data.records,[recorded]);}},
    {name:'greeting needs no history',message:'Hola',resources:[],answer:'Hola, ¿en qué puedo ayudarte?',check(results){assert.deepEqual(results,[]);}},
    {name:'general guidance needs no history',message:'¿Para qué sirve un calentamiento?',resources:[],
      answer:'Sirve para preparar progresivamente el cuerpo para el esfuerzo.',check(results){assert.deepEqual(results,[]);}},
  ];
  for(const fixture of fixtures)await t.test(fixture.name,async()=>{
    const db=database(),authId='11111111-1111-4111-8111-111111111111',observations=[];
    Object.assign(db.tables.usuarios[0],{id:'22222222-2222-4222-8222-222222222222',auth_user_id:authId,workout_history:[recorded]});
    fixture.setup?.(db);let rounds=0;
    const handle=authenticatedHandler(db,{getUser:async()=>({data:{user:{id:authId,email_confirmed_at:today}},error:null})},async(_url,options)=>{
      const request=JSON.parse(options.body);rounds++;
      assert.equal(request.system,loop.COACH_FIRST_INSTRUCTION);
      assert.deepEqual(request.tools,[plain(load('../chat/coachFirstOutput').COACH_FIRST_OUTPUT_TOOL)]);
      if(rounds===1){
        if(fixture.prior)assert.deepEqual(request.messages[0],{role:'assistant',content:fixture.prior});
        assert.equal(JSON.parse(request.messages.at(-1).content).originalMessage,fixture.message);
        if(fixture.resources.length)return nativeTurn({answer:null,calls:fixture.resources.map(resource=>({name:'read_context',arguments:{resource}}))});
      }else{
        assert.equal(rounds,2,'existing evidence must be usable without another provider/read round');
        const results=request.messages.slice(-fixture.resources.length).map(m=>JSON.parse(m.content).toolResult);
        assert.ok(results.every(r=>r.status==='read'));fixture.check(results);
      }
      return nativeTurn({answer:fixture.answer,calls:[]});
    },'read_only',[],observations);
    const r=await (await handle(new Request('http://localhost/api/chat',{method:'POST',headers:{Authorization:'Bearer token'},
      body:JSON.stringify({action:'coach_first',sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',message:fixture.message,messageId:'evidence-fixture-001'})}),
      ()=>{throw Error('unexpected planning');})).json();
    assert.equal(r.ok,true);assert.equal(r.answer,fixture.answer);assert.equal(rounds,fixture.resources.length?2:1);
    assert.deepEqual(r.results.map(x=>x.name),fixture.resources.map(()=>'read_context'));
    assert.deepEqual(observations.filter(x=>x.tool==='read_context').map(x=>x.resource),fixture.resources);
    if(!fixture.resources.length){fixture.check(r.results);assert.equal(db.reads.length,1,'only identity read, no implicit context');}
  });
});

test('native rounds read progressive context and answer afterwards, preserving multiple calls',async()=>{
  for(const resources of [['state'],['state','week']]){
    const db=database(),authId='11111111-1111-4111-8111-111111111111',observations=[];
    Object.assign(db.tables.usuarios[0],{id:'22222222-2222-4222-8222-222222222222',auth_user_id:authId});
    let requests=0;
    const handle=authenticatedHandler(db,{getUser:async()=>({data:{user:{id:authId,email_confirmed_at:today}},error:null})},async(_url,options)=>{
      const request=JSON.parse(options.body);requests++;
      assert.deepEqual(request.tool_choice,{type:'tool',name:'submit_coach_turn',disable_parallel_tool_use:true});
      if(requests===1)return nativeTurn({answer:null,calls:resources.map(resource=>({name:'read_context',arguments:{resource}}))});
      const returned=request.messages.slice(-resources.length).map(m=>JSON.parse(m.content).toolResult);
      assert.ok(returned.every(r=>r.name==='read_context' && r.status==='read'));
      assert.equal(returned[0].data.specialty,'crossfit');
      return nativeTurn({answer:'Respuesta después de leer contexto.',calls:[]});
    },'read_only',[],observations);
    const result=await (await handle(new Request('http://localhost/api/chat',{method:'POST',headers:{Authorization:'Bearer verified-token'},
      body:JSON.stringify({action:'coach_first',sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',message:'Consulta offline',messageId:'read-native-fixture'})}),()=>{throw Error('unexpected planning');})).json();
    assert.equal(result.ok,true);assert.equal(requests,2);assert.equal(result.coachCalls,2);
    assert.equal(result.results.length,resources.length);assert.equal(result.answer,'Respuesta después de leer contexto.');
    assert.ok(observations.some(e=>e.marker==='COACH_FIRST_OPERATION' && e.reads===resources.length));
    assert.ok(db.writes.every(w=>w.table==='usuarios' && Object.keys(w.patch).join()==='perfil'));
  }
});

test('structured loop retains round and total tool limits',async()=>{
  let calls=0,dispatches=0;
  const complete=async()=>{calls++;return {answer:null,calls:[{name:'read_context',arguments:{resource:'state'}}]};};
  const result=await loop.runCoachFirstLoop(input('offline'),{complete,dispatch:async()=>{dispatches++;return {status:'read'};}});
  assert.equal(result.ok,false);assert.equal(calls,8);assert.equal(dispatches,8);
  dispatches=0;
  await assert.rejects(loop.runCoachFirstLoop(input('offline'),{complete:async()=>({answer:null,calls:Array(8).fill({name:'read_context',arguments:{resource:'state'}})}),
    dispatch:async()=>{dispatches++;return {status:'read'};}}),{message:'COACH_FIRST_TOOL_INVALID'});
  assert.equal(dispatches,24);
});
function authenticatedHandler(db, auth, provider, policy, errors = [], observations = []) {
  // Provider-focused fixtures. The real SQL/ownership protocol is exercised in conversationSession.test.mjs.
  db.rpc = async (_name, {p_operation, p_payload}) => {
    const row=db.tables.usuarios[0]; row.historial ??= [];
    if(p_operation==='begin') {
      row.perfil.coach_first_turns ??= {};
      if(row.perfil.coach_first_turns[p_payload.id])return {data:{ok:false,status:'already_claimed',code:'TURN_NOT_REPLAYED'}};
      row.perfil.coach_first_turns[p_payload.id]={digest:p_payload.digest,status:'claimed'};
      return {data:{ok:true,status:'committed',historial:plain(row.historial),epoch:today+'T12:00:00Z'}};
    }
    const persisted=['completed','terminal'].includes(p_payload.status);
    if(persisted) row.historial=[...row.historial,{role:'user',content:p_payload.message},{role:'assistant',content:p_payload.answer}].slice(-15);
    Object.assign(row.perfil.coach_first_turns[p_payload.id],{status:p_payload.status,receipts:p_payload.receipts,persisted});
    return {data:{ok:persisted,persisted,status:p_payload.status,historial:plain(row.historial)}};
  };
  const identity={exports:{}};
  vm.runInNewContext(compile(readFileSync('lib/auth/athleteIdentity.ts','utf8')),{
    module:identity,exports:identity.exports,require:name=>name==='node:crypto'?crypto:{},
  });
  const handler={exports:{}};
  vm.runInNewContext(compile(readFileSync('lib/chat/coachFirstHandler.ts','utf8')),{
    module:handler,exports:handler.exports,Response,Date:Clock,AbortSignal,console:{info:(marker,event)=>observations.push({marker,...event}),error:(marker,event)=>errors.push({marker,...event})},
    process:{env:{ANTHROPIC_API_KEY:'offline-placeholder',...(policy === undefined ? {} : {FORGE_COACH_FIRST_POLICY:policy})}},fetch:provider,
    require(name){if(name==='../auth/athleteIdentity')return identity.exports;
      if(name==='../auth/supabaseServer')return {identityDependencies:()=>({db,auth})};
      return load('../chat/'+name.slice(2));},
  });
  return handler.exports.handleCoachFirst;
}

test('text-only/truncated provider responses fail closed without logging their content',async()=>{
  const privateText='PRIVATE_TOKEN_MESSAGE_ANSWER_CONVERSATION';
  for (const stopReason of ['max_tokens',privateText]) {
    const db=database(),authId='11111111-1111-4111-8111-111111111111',observations=[],errors=[];
    Object.assign(db.tables.usuarios[0],{id:'22222222-2222-4222-8222-222222222222',auth_user_id:authId});
    const raw=' \n```json\n'+privateText+'\n```\t';let calls=0;
    const handle=authenticatedHandler(db,{getUser:async()=>({data:{user:{id:authId,email_confirmed_at:today}},error:null})},async()=>{
      calls++;return Response.json({stop_reason:stopReason,content:[{type:'text',text:raw},
        {type:'thinking',thinking:privateText},{type:'text',text:''}]});
    },'read_only',errors,observations);
    const response=await handle(new Request('http://localhost/api/chat',{method:'POST',headers:{Authorization:'Bearer verified-token'},
      body:JSON.stringify({action:'coach_first',sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',message:privateText,messageId:'message-raw-001'})}),()=>{throw Error('unexpected planning');});
    assert.equal(response.status,200);assert.equal((await response.json()).code,'COACH_FIRST_UNAVAILABLE');assert.equal(calls,1);
    assert.equal(observations.filter(e=>e.marker==='COACH_FIRST_RAW_INVALID').length,0);
    assert.equal(errors[0].errorMessage,'COACH_FIRST_OUTPUT_INVALID');
    assert.ok(!JSON.stringify([...observations,...errors]).includes(privateText));
    assert.ok(!JSON.stringify([...observations,...errors]).includes('offline-placeholder'));
  }
});

test('structured invalid batches and empty terminal answers reject before dispatch',async()=>{
  const valid={name:'read_context',arguments:{resource:'state'}};
  for(const decision of [null,[],{answer:null,calls:[]},{answer:42,calls:[]},{answer:'x',calls:Array(9).fill(valid)},
    {answer:'x',calls:[valid,{name:'read_context',arguments:'not an object'}]},{answer:'x',calls:[{...valid,extra:true}]}]){
    let calls=0;
    await assert.rejects(loop.runCoachFirstLoop(input('offline'),{complete:async()=>decision,dispatch:async()=>{calls++;}}),
      e=>['COACH_FIRST_OUTPUT_INVALID','COACH_FIRST_TOOL_INVALID'].includes(e.message));
    assert.equal(calls,0);
  }
});

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
      body:JSON.stringify({action:'coach_first',sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',message:secret,messageId,conversation:[{role:'user',content:secret}]})}),()=>{throw Error('unexpected planning');});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{route:'coach_first',status:'unknown',code:'COACH_FIRST_UNAVAILABLE',persisted:false,retryable:false,
      answer:'No puedo confirmar el resultado del turno. No lo he reintentado.'});
    assert.equal(calls,1);assert.equal(errors.length,1);
    const log=errors[0];assert.equal(log.marker,'COACH_FIRST_ERROR');assert.equal(log.messageId,messageId);assert.equal(log.claimed,true);
    assert.equal(log.stage,scenario==='syntax'?'provider_structured_output':scenario==='http'?'provider_http':'provider_fetch');
    assert.ok(!JSON.stringify(log).includes(secret));assert.ok(!JSON.stringify(log).includes('offline-placeholder'));
    if(scenario==='syntax'){assert.equal(log.errorName,'Error');assert.equal(log.errorMessage,'COACH_FIRST_OUTPUT_INVALID');}
    if(scenario==='transport'){assert.equal(log.errorMessage,'fetch failed');assert.equal(log.errorCode,'ECONNRESET');assert.equal(log.errorStatus,503);}
  }
});

test('M/B/N: actual handler verifies Supabase principal, binds athlete, calls Coach once and refuses replay',async()=>{
  const db=database(), authId='11111111-1111-4111-8111-111111111111';
  Object.assign(db.tables.usuarios[0],{id:'22222222-2222-4222-8222-222222222222',auth_user_id:authId});
  let providers=0,verifications=0;
  const handle=authenticatedHandler(db,{getUser:async token=>{verifications++;assert.equal(token,'verified-token');return{data:{user:{id:authId,email_confirmed_at:today}},error:null};}},async(_url,options)=>{
    providers++;const payload=JSON.parse(options.body);assert.equal(JSON.parse(payload.messages[0].content).originalMessage,'  pregunta intacta  ');
    assert.deepEqual(payload.tool_choice,{type:'tool',name:'submit_coach_turn',disable_parallel_tool_use:true});
    assert.equal(payload.tools[0].input_schema.properties.calls.maxItems,8);
    assert.equal(payload.model,'claude-sonnet-4-5');
    return nativeTurn({answer:'Respuesta.',calls:[]});
  });
  const request=(body={},authorized=true)=>new Request('http://localhost/api/chat',{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:'Bearer verified-token'}:{})},
    body:JSON.stringify({action:'coach_first',sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',message:'  pregunta intacta  ',messageId:'unique-message-id',...body})});
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

test('authenticated handler selects read-only from server, ignores client elevation, persists conversation and journal only',async()=>{
  const db=database(),authId='11111111-1111-4111-8111-111111111111';
  Object.assign(db.tables.usuarios[0],{id:'22222222-2222-4222-8222-222222222222',auth_user_id:authId});
  const before=plain(db.tables);let calls=0;
  const handle=authenticatedHandler(db,{getUser:async()=>({data:{user:{id:authId,email_confirmed_at:today}},error:null})},async(_url,options)=>{
    const messages=JSON.parse(options.body).messages;
    if(calls++)assert.equal(JSON.parse(messages.at(-1).content).toolResult.reason,'read_only_policy');
    return nativeTurn(calls===1?{answer:null,calls:[{name:'record_athlete_data',arguments:{kind:'reported_event',description:'Evento',status:'reported'}}]}:{answer:'No he guardado cambios.',calls:[]});
  },'read_only');
  const response=await handle(new Request('http://localhost/api/chat',{method:'POST',headers:{Authorization:'Bearer token'},
    body:JSON.stringify({action:'coach_first',sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',message:'consulta',messageId:'policy-test-message',mode:'normal',policy:'normal'})}),()=>{throw Error('planning reached');});
  const r=await response.json();assert.equal(r.ok,true);assert.equal(r.results[0].reason,'read_only_policy');assert.equal(calls,2);
  assert.ok(db.tables.usuarios[0].perfil.coach_first_turns);
  const after=plain(db.tables);delete after.usuarios[0].perfil.coach_first_turns;
  assert.equal(after.usuarios[0].historial.length,2);delete after.usuarios[0].historial;assert.deepEqual(after,before);
  assert.ok(db.writes.every(w=>w.table==='usuarios'&&Object.keys(w.patch).length===1&&'perfil' in w.patch));
});

test('A/B: actual POST blocks every legacy chat writer after the Auth boundary while ON',async()=>{
  const route={exports:{}},flag=load('../chat/coachFirstFlag');let routed=0;
  const forbidden=()=>{throw Error('legacy reached');};
  vm.runInNewContext(compile(readFileSync('app/api/chat/route.ts','utf8')),{
    module:route,exports:route.exports,console,process:{env:{}},
    require(name){
      if(name==='@supabase/supabase-js')return{createClient:()=>({from:forbidden})};
      if(name==='next/server')return {NextResponse:Response,NextRequest:Request};
      if(name==='@/lib/auth/chatIdentity')return {authorizeChatRequest:async req=>req.json()};
      if(name==='@/lib/auth/athleteIdentity')return {IdentityError:class extends Error {}};
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

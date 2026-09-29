import test from 'node:test';
import { installWeeklyAvailabilityRpc } from '../sports/weeklyAvailabilityCasTestFixture.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { weeklyBudgetFixture } from '../planning/weeklyBudgetFixture.mjs';
import { sportsRuntime, plain, equippedProfileFixture, compile } from '../sports/trainingContractTestRuntime.mjs';
const today='2026-09-27',week='2026-09-21',next='2026-09-28',user='u';
const days=['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const quiet={log(){},info(){},warn(){},error(){}};
const routeText=readFileSync('app/api/chat/route.ts','utf8'),route=ts.createSourceFile('route.ts',routeText,ts.ScriptTarget.Latest,true);
function find(node,predicate){if(predicate(node))return node;let found;ts.forEachChild(node,c=>{found??=find(c,predicate);});return found;}
class Clock extends Date {constructor(...a){super(...(a.length?a:[today+'T12:00:00Z']));} static now(){return Date.parse(today+'T12:00:00Z');}}
const declaration=availability=>({version:1,source:'explicit_user_declaration',availability:plain(availability),resolution:Object.values(availability).some(d=>d.length)?'DECLARED_AVAILABILITY':'EXPLICIT_ZERO_TRAINING',excludedDisciplines:[],unavailableDays:[],unresolvedDays:[]});

// Each request gets fresh modules/tools. Only server journal receipts and database facts survive.
function protocolFixture(declared=false) {
  const db=database(declared),calls=[],transitions=[];let sequence=0,coachCalls=0;
  return {db,calls,transitions,get coachCalls(){return coachCalls;},async request(message,options={}) {
    const id=`protocol-${++sequence}`,timestamp=options.timestamp??next+'T12:00:00Z';
    const load=sportsRuntime({Date:Clock,Error,console:{...quiet,info:(marker,event)=>{
      if(marker==='WEEKLY_GENERATION_PROTOCOL_TRANSITION')transitions.push(plain(event));
    }}}),protocol=load('../chat/generationTarget');
    const input={message,messageId:id,timestamp,timezone:'Atlantic/Canary',conversation:[]};
    const dispatchTool=load('../chat/coachFirstTools').coachFirstTools(db,user,input,id,async args=>{
      calls.push({name:'generation_boundary',arguments:plain(args)});
      return {status:'partial'}; // No provider, Planner or Builder is called.
    },()=>{});
    const receipts=[],results=[];
    const dispatch=async call=>{
      calls.push(plain(call));const result=await dispatchTool(call,results.length+1);
      results.push({name:call.name,...result});
      if(call.name!=='read_context')receipts.push({tool:call.name,status:result.status,...(call.name==='prepare_generation'?{
        generationTarget:result.generationTarget,availabilitySnapshotDigest:result.snapshotDigest,
        pendingRequirement:protocol.generationRequirement(result)}:{})});
      return result;
    };
    const pending=await protocol.readPendingGenerationRequirement(db,user);
    let result;
    if(pending) {
      result=await protocol.resumeWeeklyGeneration(pending,message,dispatch);
      if(result.checkpoint)receipts.findLast(r=>r.tool==='prepare_generation').pendingRequirement=protocol.generationRequirement(result.checkpoint);
    } else result=await load('../chat/coachFirstLoop').runCoachFirstLoop(input,{
      complete:async()=>{coachCalls++;return {answer:null,clarification:null,mutationIntents:[],calls:[{
        name:'prepare_generation',arguments:{period:options.period??'current_week',...options.arguments}}]};},
      dispatch,advanceGeneration:protocol.advanceWeeklyGeneration,
    });
    db.tables.usuarios[0].perfil.coach_first_turns??={};
    db.tables.usuarios[0].perfil.coach_first_turns[id]={persisted:true,finishedAt:new Date(Date.parse(timestamp)+sequence*1000).toISOString(),receipts:plain(receipts)};
    return {result,results,pending:plain(await protocol.readPendingGenerationRequirement(db,user))};
  }};
}

test('durable protocol: availability then temporal then generation, without another Coach choice',async()=>{
  const f=protocolFixture();
  const first=await f.request('Genera mi semana');assert.equal(first.pending.kind,'availability');
  assert.equal(first.pending.targetWeekStart,next);assert.equal(first.pending.includeToday,undefined);
  const confirmed=await f.request('si, es correcta');
  assert.equal(confirmed.pending.kind,'temporal');assert.notEqual(confirmed.result.answer,first.result.answer);
  assert.equal(f.db.tables.usuarios[0].perfil.weekly_availability[next].source,'explicit_user_declaration');
  assert.ok(f.db.writes.length>0);assert.ok(f.db.reads.filter(t=>t==='usuarios').length>f.db.writes.length);
  const last=await f.request('incluir hoy');assert.equal(last.pending,null);
  assert.equal(f.coachCalls,1);const generated=f.calls.filter(c=>c.name==='generation_boundary');
  assert.equal(generated.length,1);assert.equal(generated[0].arguments.includeToday,true);
  assert.deepEqual(f.transitions.map(t=>[t.fromRequirement,t.toRequirement]),[['none','availability'],['availability','temporal'],['temporal','ready']]);
  assert.equal(f.calls.filter(c=>c.name==='update_availability').length,1);
});

test('ambiguous replies retain the same durable requirement, with no writes or generation',async()=>{
  const f=protocolFixture();const first=await f.request('Genera mi semana');
  const ambiguous=await f.request('no lo tengo claro');assert.deepEqual(ambiguous.pending,first.pending);
  assert.equal(f.db.writes.length,0);assert.equal(f.coachCalls,1);
  const confirmed=await f.request('sí');assert.equal(confirmed.pending.kind,'temporal');
  const temporal=await f.request('no lo tengo claro');assert.deepEqual(temporal.pending,confirmed.pending);
  assert.equal(f.calls.some(c=>c.name==='generation_boundary'),false);assert.equal(f.coachCalls,1);
  const resolved=await f.request('próximo día disponible');assert.equal(resolved.pending,null);
  assert.equal(f.calls.find(c=>c.name==='generation_boundary').arguments.includeToday,false);
});

test('changed snapshot is re-presented before accepting an affirmative reply',async()=>{
  const f=protocolFixture();const first=await f.request('Genera mi semana');
  f.db.tables.usuarios[0].distribucion_semanal.box=['jueves'];
  f.db.tables.athlete_training_sources[0].dias=['jueves'];
  const stale=await f.request('sí');assert.equal(stale.pending.kind,'availability');
  assert.notEqual(stale.pending.snapshotDigest,first.pending.snapshotDigest);
  assert.equal(f.calls.some(c=>c.name==='update_availability'),false);
  assert.equal((await f.request('sí')).pending.kind,'temporal');assert.equal(f.coachCalls,1);
});

test('availability modification uses existing authority, explicit zero never falls back to profile',async()=>{
  for(const message of ['box martes y jueves, carrera lunes y domingo','esta semana no entreno']) {
    const f=protocolFixture();await f.request('Genera mi semana');const modified=await f.request(message);
    const weekly=f.db.tables.usuarios[0].perfil.weekly_availability?.[next];assert.ok(weekly);
    if(message.includes('no entreno')) {
      assert.equal(weekly.resolution,'EXPLICIT_ZERO_TRAINING');
      // Existing preflight permits a rest-only week; continuation must retain zero availability.
      assert.deepEqual(weekly.availability,{box:[],carrera:[]});assert.equal(modified.pending,null);
      assert.equal(f.transitions.some(t=>t.toRequirement==='temporal'),false);
    } else {
      assert.deepEqual(weekly.availability.carrera,['lunes','domingo']);assert.equal(modified.pending.kind,'temporal');
    }
    assert.equal(f.coachCalls,1);
  }
});

test('future week, existing declaration and explicit temporal choice avoid redundant questions',async()=>{
  const future=protocolFixture();await future.request('Genera la próxima semana',{timestamp:today+'T12:00:00Z',period:'next_week'});
  const result=await future.request('sí',{timestamp:today+'T12:01:00Z'});assert.equal(result.pending,null);
  assert.equal(future.transitions.some(t=>t.toRequirement==='temporal'),false);
  assert.equal(future.calls.filter(c=>c.name==='generation_boundary').length,1);
  const existing=protocolFixture(true);assert.equal((await existing.request('Genera mi semana')).pending.kind,'temporal');
  assert.equal(existing.calls.some(c=>c.name==='update_availability'),false);
  const explicit=protocolFixture();await explicit.request('Genera desde hoy',{arguments:{includeToday:true}});
  assert.equal((await explicit.request('sí')).pending,null);
  assert.equal(explicit.calls.find(c=>c.name==='generation_boundary').arguments.includeToday,true);
});

test('pending retains target through Sunday to Monday and expires without generation',async()=>{
  const rollover=protocolFixture();await rollover.request('Próxima semana',{timestamp:today+'T12:00:00Z',period:'next_week'});
  const monday=await rollover.request('sí');assert.equal(monday.pending.kind,'temporal');assert.equal(monday.pending.targetWeekStart,next);
  const expired=protocolFixture();await expired.request('Esta semana',{timestamp:today+'T12:00:00Z'});
  const gone=await expired.request('sí');assert.equal(gone.pending,null);assert.equal(gone.result.status,'rejected');
  assert.equal(expired.calls.some(c=>c.name==='generation_boundary'),false);assert.equal(expired.coachCalls,1);
});

test('CAS conflict keeps availability pending and never advances or automatically retries writes',async()=>{
  const f=protocolFixture();await f.request('Genera');f.db.conflict=true;
  const result=await f.request('sí');assert.equal(result.pending.kind,'availability');
  assert.equal(f.calls.filter(c=>c.name==='update_availability').length,1);
  assert.equal(f.calls.some(c=>c.name==='generation_boundary'),false);assert.equal(f.coachCalls,1);
});

test('temporary coaching intent survives administrative clarification without reinterpretation',async()=>{
  const f=protocolFixture(),turnIntent={version:1,purpose:'maintenance',approach:'conservative',volumeIntent:'unspecified',intensityIntent:'unspecified'};
  assert.deepEqual((await f.request('Semana conservadora',{arguments:{turnIntent}})).pending.turnIntent,turnIntent);
  assert.deepEqual((await f.request('sí')).pending.turnIntent,turnIntent);
  await f.request('incluir hoy');assert.deepEqual(f.calls.find(c=>c.name==='generation_boundary').arguments.turnIntent,turnIntent);
});
function database(declared = true) {
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
    db.reads.push(table); const filters=[]; let patch, one=false, limit=Infinity, ordering;
    const q={select(){return q;},eq(k,v){filters.push(r=>typeof r[k]==='object'&&typeof v==='string'?JSON.stringify(r[k])===v:r[k]===v);return q;},
      is(k,v){filters.push(r=>v===null?r[k]==null:r[k]===v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},
      gte(k,v){filters.push(r=>r[k]>=v);return q;},lte(k,v){filters.push(r=>r[k]<=v);return q;},lt(k,v){filters.push(r=>r[k]<v);return q;},
      or(){return q;},order(field,options){ordering={field,...options};return q;},range(){return q;},limit(n){limit=n;return q;},
      single(){one=true;return q;},maybeSingle(){one=true;return q;},update(value){patch=value;return q;},insert(value){db.tables[table]??=[];const row={id:'generated-plan',...plain(value)};db.tables[table].push(row);db.writes.push({table,patch:row});filters.push(r=>r===row);return q;},
      then(resolve,reject){try{let rows=(db.tables[table]??[]).filter(r=>filters.every(f=>f(r)));
        if(ordering)rows.sort((a,b)=>String(a[ordering.field]).localeCompare(String(b[ordering.field]))*(ordering.ascending?1:-1));
        rows=rows.slice(0,limit);
        if(patch){ if(db.conflict)rows=[]; else {db.writes.push({table,patch:plain(patch)});rows.forEach(r=>Object.assign(r,plain(patch)));}
          if(db.uncertain)throw Error('transport'); }
        return Promise.resolve({data:plain(one?rows[0]??null:rows),error:null}).then(resolve,reject);
      }catch(e){return Promise.reject(e).then(resolve,reject);}}};return q;
  }};
  if(declared) for(const target of [week,next]) db.tables.usuarios[0].perfil.weekly_availability={
    ...db.tables.usuarios[0].perfil.weekly_availability,[target]:declaration(db.tables.usuarios[0].distribucion_semanal)};
  return installWeeklyAvailabilityRpc(db);
}
test('pending target survives follow-up and a Monday rollover; current week stays current and untrusted future is rejected',async()=>{
  const db=database(),load=sportsRuntime({Date:Clock,console:quiet,Error}),tools=load('../chat/coachFirstTools');
  const input={message:'Genera mi próxima semana de entrenamientos',messageId:'turn-first',timestamp:today+'T12:00:00Z',timezone:'Atlantic/Canary',conversation:[]};
  const prepare=tools.coachFirstTools(db,user,input,'first',async()=>{throw Error('unexpected generation');},()=>{});
  const withoutPending=tools.coachFirstTools(db,user,input,'missing',async()=>{throw Error('unexpected generation');},()=>{});
  assert.equal((await withoutPending({name:'prepare_generation',arguments:{period:'pending'}},0)).code,'GENERATION_PENDING_MISSING');
  const beforePreparation=JSON.stringify(db.tables);
  const r=await prepare({name:'prepare_generation',arguments:{period:'next_week'}},1);assert.equal(r.targetWeekStart,next);
  assert.equal(db.writes.length,0);assert.equal(JSON.stringify(db.tables),beforePreparation);
  assert.ok(!db.reads.includes('weekly_plan_generation_log'));
  // Same journal fields persisted by handleCoachFirst/conversationSession after an availability question.
  db.tables.usuarios[0].perfil.coach_first_turns={first:{persisted:true,finishedAt:today+'T12:01:00Z',receipts:[{tool:'prepare_generation',status:r.status,generationTarget:r.generationTarget}]}};
  for(const timestamp of [today+'T12:02:00Z',next+'T12:00:00Z']){
    const follow=tools.coachFirstTools(db,user,{...input,message:'Mantenemos misma disponibilidad',messageId:'follow-up',timestamp},'second',async()=>{},()=>{});
    const pending=await follow({name:'prepare_generation',arguments:{period:'pending'}},1);assert.equal(pending.targetWeekStart,next);
  }
  for(const message of ['Genera esta semana','Regenera explícitamente esta semana']){
    const current=tools.coachFirstTools(db,user,{...input,message},'current',async()=>{},()=>{});
    assert.equal((await current({name:'prepare_generation',arguments:{period:'current_week'}},1)).targetWeekStart,week);
  }
  const bad=await prepare({name:'prepare_generation',arguments:{period:'2026-10-12'}},2);assert.equal(bad.status,'rejected');
  const badDate=await prepare({name:'prepare_generation',arguments:{period:'next_week',week:'2026-10-12'}},3);assert.equal(badDate.status,'rejected');
  db.tables.usuarios[0].perfil.coach_first_turns.first.receipts.push({tool:'generate_week',status:'partial'});
  const blocked=await prepare({name:'prepare_generation',arguments:{period:'pending'}},4);assert.equal(blocked.code,'GENERATION_PENDING_ALREADY_ATTEMPTED');
});

test('preparation alone cannot close with a false success; a necessary clarification preserves the target',async()=>{
  for(const clarification of [null,'¿Qué cambio de disponibilidad quieres aplicar?']){
    const load=sportsRuntime({Date:Clock,console:quiet,Error});let round=0;
    const outcome=await load('../chat/coachFirstLoop').runCoachFirstLoop({message:'Genera mi próxima semana',messageId:'pending',timestamp:today+'T12:00:00Z',timezone:'Atlantic/Canary',conversation:[]},{
      dispatch:async()=>({status:'prepared',generationTarget:{weekStart:next}}),
      complete:async()=>({mutationIntents:[],clarification,answer:'Semana guardada',calls:round++===0?[{name:'prepare_generation',arguments:{period:'next_week'}}]:[]}),
    });
    assert.equal(outcome.ok,false);assert.notEqual(outcome.answer,'Semana guardada');
    if(clarification)assert.equal(outcome.status,'clarification_required');
    else assert.ok(round>2);
  }
});

test('prepared generation cannot report success without persistence receipt; known provider failure is observable',async()=>{
  for(const saved of [{status:'committed',commitConfirmed:true},{status:'partial',code:'PLANNER_NOT_ADMITTED',failureReason:'LLM_REQUEST_FAILED',requirements:{ok:false,code:'WEEKLY_PLANNER_FAILED',errors:['LLM_REQUEST_FAILED']}}]){
    const db=database(),load=sportsRuntime({Date:Clock,console:quiet,Error}),events=[];
    const input={message:'Genera mi próxima semana de entrenamientos',messageId:'failure',timestamp:today+'T12:00:00Z',timezone:'Atlantic/Canary',conversation:[]};
    const dispatch=load('../chat/coachFirstTools').coachFirstTools(db,user,input,'failure',async args=>{assert.equal(args.week,next);return saved;},e=>events.push(e));let round=0;
    const outcome=await load('../chat/coachFirstLoop').runCoachFirstLoop(input,{dispatch,complete:async messages=>{
      const base={mutationIntents:[],clarification:null,answer:null};
      if(round++===0)return {...base,calls:[{name:'prepare_generation',arguments:{period:'next_week'}}]};
      const r=JSON.parse(messages.at(-1).content).toolResult;
      return {...base,calls:[{name:'generate_week',arguments:{availabilityReadId:r.availabilityReadId,snapshotDigest:r.snapshotDigest}}]};
    }});
    assert.equal(outcome.ok,false);assert.equal(round,2);assert.equal(db.writes.length,0);
    if(saved.status==='partial'){assert.equal(events.at(-1).failureReason,'LLM_REQUEST_FAILED');assert.ok(outcome.answer.includes('servicio de planificación'));}
    else assert.equal(outcome.results.at(-1).code,'GENERATION_READBACK_UNCONFIRMED');
  }
});
for(const mode of ['transient','valid','permanent','empty','json','content','no_tool','truncated'])test('exact Sunday request: real pipeline '+mode,{timeout:180000},async(t)=>{
  const started=performance.now(),timings=[];
  const failure=!['transient','valid'].includes(mode);
  const db=database(),load=sportsRuntime({Date:Clock,console:quiet,Error,fetch:(...args)=>provider(...args)}),calls=[],builderStarts=[],builderEnds=[];
  const row=db.tables.usuarios[0];row.perfil.duracion='60 min';row.perfil.dias=7;
  row.distribucion_semanal={box:['martes','jueves','viernes','sabado'],carrera:['lunes','miercoles','domingo']};
  db.tables.athlete_training_sources.forEach(s=>s.dias=row.distribucion_semanal[s.disciplina]);
  row.perfil.weekly_availability[next]=declaration(row.distribucion_semanal);
  Object.assign(db.tables.weekly_plan[0].sessions[6],{tipo:'carrera',titulo:'Carrera 50 min Z2',descripcion:'50 min Z2',completada:true});
  const original=JSON.stringify(db.tables.weekly_plan[0]);let released,weeklyAttempts=0;const gate=new Promise(r=>released=r);
  async function provider(_url,request){
    const body=JSON.parse(request.body),prompt=body.messages[0].content;
    let answer;
    if(prompt.includes('WEEKLY_CONTRACT:\n')){
      weeklyAttempts++;
      if(mode==='permanent'||mode==='transient'&&weeklyAttempts===1)return new Response('',{status:mode==='permanent'?401:503});
      if(['empty','json','content','no_tool'].includes(mode))return new Response({empty:'',json:'{invalid',content:'{}',no_tool:JSON.stringify({stop_reason:'end_turn',content:[{type:'text',text:'not a plan'}],usage:{output_tokens:5}})}[mode],{status:200});
      const contract=JSON.parse(prompt.split('WEEKLY_CONTRACT:\n')[1].split('\nCOACH_FIRST_REPORTED_EVENTS')[0]);
      assert.equal(contract.targetWeekStart,next);
      assert.equal(body.max_tokens,4096);
      answer=weeklyBudgetFixture(contract.contextDigest);
      return new Response(JSON.stringify({id:'synthetic',type:'message',role:'assistant',model:'synthetic',stop_reason:mode==='truncated'?'max_tokens':'tool_use',stop_sequence:null,
        usage:{input_tokens:320,output_tokens:mode==='truncated'?4096:2092},content:[{type:'tool_use',id:'weekly',name:'submit_weekly_guidance',input:answer}]}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(prompt.includes('CONTRACT:\n')){
      const c=JSON.parse(prompt.split('CONTRACT:\n')[1].split('\nContexto no autoritativo:')[0]);
      builderStarts.push(c.targetDay);if(builderStarts.length===7)released();await gate;
      const running=c.discipline==='carrera';
      answer={schemaVersion:2,stimulusId:running?'base_aerobica':'tecnica',structureId:running?'continuo':'strength_sets',explanation:'Trabajo técnico y aeróbico controlado.',
        finalDecision:{kind:'session_decision',version:1,stimulus:running?'base_aerobica':'tecnica',reason:'Coherencia semanal'},
        blocks:[{blockType:'main',movements:[{movementId:running?'rodaje_z2':'goblet_squat',prescription:running?{durationSeconds:1800,intensity:{kind:'rpe',value:4}}:{sets:3,reps:5,restSeconds:90,intensity:{kind:'rpe',value:6}}}]}]};
      builderEnds.push(c.targetDay);
    }else if(prompt.includes('KEEP'))answer={decision:'KEEP',rationale:'Distribución técnica y aeróbica coherente.',days:[]};
    else answer={tipo_semana:'acumulacion',objetivo:'Consolidar base',volumen_relativo:0.7,intensidad_relativa:0.6,debilidad_prioritaria:null,dias_entreno_sugeridos:7,coaching_notes_incorporadas:[],strategyProposal:{version:1,preferredAdaptations:[]}};
    return {ok:true,status:200,json:async()=>({content:[{type:'text',text:JSON.stringify(answer)}]})};
  }
  async function execute(action,datos,coachFirstPlanning){
    const actionStart=performance.now();
    calls.push({action,week:datos.targetWeekStart});assert.equal(datos.targetWeekStart,next);
    const block=find(route,n=>ts.isIfStatement(n)&&n.expression.getText(route)===`action === "${action}"`);assert.ok(block,action);
    const globals={Date:Clock,console:quiet,Error,Buffer,structuredClone,AbortSignal,setTimeout,clearTimeout,
      supabase:db,codigo:user,datos,coachFirstPlanning,apiKey:'synthetic',fetch:provider,NextResponse:{json:body=>body},
      require:name=>load('../'+name.slice('@/lib/'.length))};
    for(const n of route.statements)if(ts.isImportDeclaration(n)&&!n.importClause?.isTypeOnly&&n.moduleSpecifier.text.startsWith('@/lib/'))
      for(const b of n.importClause?.namedBindings?.elements??[])if(!b.isTypeOnly)Object.defineProperty(globals,b.name.text,{get:()=>load('../'+n.moduleSpecifier.text.slice('@/lib/'.length))[(b.propertyName??b.name).text]});
    const helpers=['generarEstadoCanonico','buildFocusContext'].map(name=>find(route,n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(route)).join('\n');
    const result=await vm.runInNewContext(compile(`${helpers}\nasync function run(){${block.thenStatement.getText(route)}}\nrun();`),globals);
    timings.push({action,startMs:actionStart-started,endMs:performance.now()-started,durationMs:performance.now()-actionStart});
    if(!failure)assert.equal(result.ok,true,action+': '+JSON.stringify(result));return result;
  }
  const input={message:'Genera mi próxima semana de entrenamientos',messageId:'next-week-fixture',timestamp:today+'T12:00:00Z',timezone:'Atlantic/Canary',conversation:[]};
  const events=[],dispatch=load('../chat/coachFirstTools').coachFirstTools(db,user,input,'turn',
    (args,op)=>load('../chat/coachFirstGeneration').generateCoachFirstWeek(db,user,args,op,today,execute),e=>events.push(e));let round=0;
  const outcome=await load('../chat/coachFirstLoop').runCoachFirstLoop(input,{dispatch,complete:async messages=>{
    const base={mutationIntents:[],clarification:null,answer:null};
    if(round++===0)return {...base,calls:[{name:'prepare_generation',arguments:{period:'next_week'}}]};
    const last=JSON.parse(messages.at(-1).content).toolResult;
    if(round===2){assert.equal(last.status,'prepared',JSON.stringify(last));assert.equal(last.targetWeekStart,next);return {...base,calls:[{name:'generate_week',arguments:{availabilityReadId:last.availabilityReadId,snapshotDigest:last.snapshotDigest}}]};}
    assert.equal(last.receipt.verified,true);assert.equal(last.savedPlan.weekStart,next);assert.equal(last.savedPlan.sessions.length,7);
    return {...base,answer:'Tu semana del 28 de septiembre al 4 de octubre está guardada. Alterna carrera y trabajo de Box para consolidar la base y practicar técnica con cargas controladas.',calls:[]};
  }});
  if(failure){assert.equal(outcome.ok,false);assert.equal(round,2);assert.equal(weeklyAttempts,1);
    const reason=mode==='permanent'?'LLM_REQUEST_FAILED':'WEEKLY_PROVIDER_RESPONSE_INVALID';
    assert.equal(outcome.results.at(-1).failureReason,reason);assert.equal(events.at(-1).failureReason,reason);
    assert.equal(JSON.stringify(db.tables.weekly_plan[0]),original);assert.equal(db.tables.usuarios[0].workout_history.length,0);
    assert.equal(builderStarts.length,0);assert.ok(!db.tables.weekly_plan.some(p=>p.week_start===next));
    assert.ok(!db.writes.some(w=>w.table==='weekly_plan_generation_log'||w.table==='weekly_plan'));
    assert.ok(!calls.some(c=>c.action==='guardar_plan_semana'));return;}
  assert.equal(weeklyAttempts,mode==='transient'?2:1);assert.equal(outcome.ok,true,JSON.stringify(outcome));assert.equal(round,3);assert.equal(builderStarts.length,7);assert.equal(builderEnds.length,7);
  assert.ok(outcome.answer.includes('Alterna carrera'));assert.equal(JSON.stringify(db.tables.weekly_plan[0]),original);
  const saved=db.tables.weekly_plan.find(p=>p.week_start===next);assert.ok(saved);assert.equal(saved.sessions.length,7);assert.ok(saved.sessions.every(s=>!s.completada));
  assert.equal(db.tables.usuarios[0].workout_history.length,0);assert.ok(calls.every(c=>c.week===next));
  if(mode==='valid'){
    const builders=timings.filter(x=>x.action==='construir_sesion_dia');
    t.diagnostic(JSON.stringify({simulationOnly:true,totalMs:performance.now()-started,layers:timings.filter(x=>x.action!=='construir_sesion_dia'),
      parallelBuildersWallMs:Math.max(...builders.map(x=>x.endMs))-Math.min(...builders.map(x=>x.startMs)),builderDurationsMs:builders.map(x=>x.durationMs),
      note:'Route timings include validation and save/readback in their respective actions; synthetic provider, not a production latency estimate.'}));
  }
});

test('FIX A: unresolved preparation asks once and stops the same batch before generation',async()=>{
  const db=database(),load=sportsRuntime({console:quiet,Error});let generations=0,rounds=0;
  const input={message:'Genera mi semana',messageId:'temporal',timestamp:next+'T12:00:00Z',timezone:'Atlantic/Canary',conversation:[]};
  const dispatch=load('../chat/coachFirstTools').coachFirstTools(db,user,input,'temporal',async()=>{generations++;},()=>{});
  const outcome=await load('../chat/coachFirstLoop').runCoachFirstLoop(input,{dispatch,complete:async()=>{
    rounds++;return {mutationIntents:[],clarification:null,answer:null,calls:[
      {name:'prepare_generation',arguments:{period:'current_week'}},
      {name:'generate_week',arguments:{availabilityReadId:'temporal:1',snapshotDigest:'unused'}}]};
  }});
  assert.equal(rounds,1);assert.equal(generations,0);assert.equal(outcome.results.length,1);
  assert.equal(outcome.status,'clarification_required');
  const prepared=outcome.results[0];assert.equal(prepared.targetWeekStart,next);
  assert.equal(prepared.includeToday,undefined);assert.equal(prepared.canContinue,false);
  assert.equal(prepared.requirements.code,'TEMPORAL_DECISION_REQUIRED');
  assert.equal(prepared.requirements.temporalDecision,null);
  assert.equal(prepared.requirements.availabilityStatus,'VALID');
  assert.equal(outcome.answer,prepared.requirements.preflightRequirement.text);
  // Even bypassing the loop cannot dispatch an unresolved prepared target.
  const blocked=await dispatch({name:'generate_week',arguments:{availabilityReadId:prepared.availabilityReadId,snapshotDigest:prepared.snapshotDigest}},2);
  assert.equal(blocked.status,'rejected');assert.equal(generations,0);assert.equal(db.writes.length,0);
});

for(const includeToday of [true,false])test(`FIX A: pending reply rereads same target and preserves explicit ${includeToday}`,async()=>{
  const db=database(),load=sportsRuntime({console:quiet,Error}),args=[];
  const input={message:'Genera mi semana',messageId:'first',timestamp:next+'T12:00:00Z',timezone:'Atlantic/Canary',conversation:[]};
  const tools=load('../chat/coachFirstTools');
  const first=tools.coachFirstTools(db,user,input,'first',async()=>{throw Error('unexpected');},()=>{});
  const prepared=await first({name:'prepare_generation',arguments:{period:'current_week'}},1);
  db.tables.usuarios[0].perfil.coach_first_turns={first:{persisted:true,finishedAt:input.timestamp,
    receipts:[{tool:'prepare_generation',status:prepared.status,generationTarget:prepared.generationTarget}]}};
  const beforeReads=db.reads.length;
  // Availability can change between the question and the answer: do not reuse its old snapshot.
  db.tables.usuarios[0].distribucion_semanal.carrera=['lunes','miercoles','viernes'];
  db.tables.athlete_training_sources[1].dias=['lunes','miercoles','viernes'];
  db.tables.usuarios[0].perfil.weekly_availability[next]=declaration(db.tables.usuarios[0].distribucion_semanal);
  const follow=tools.coachFirstTools(db,user,{...input,messageId:'reply',message:includeToday?'Incluir hoy':'Próximo día disponible'},'reply',async a=>{args.push(a);return {status:'partial'};},()=>{});
  const resolved=await follow({name:'prepare_generation',arguments:{period:'pending',includeToday}},1);
  assert.ok(db.reads.length>beforeReads);assert.notEqual(resolved.availabilityReadId,prepared.availabilityReadId);
  assert.notEqual(resolved.snapshotDigest,prepared.snapshotDigest);
  assert.ok(!resolved.requirements.availability.carrera.includes('domingo'));
  assert.equal(resolved.targetWeekStart,prepared.targetWeekStart);assert.equal(resolved.canContinue,true,JSON.stringify(resolved));
  assert.equal(resolved.requirements.temporalDecision.reason,'explicit_intent');assert.equal(resolved.includeToday,includeToday);
  assert.equal(resolved.requirements.preflightRequirement,undefined);
  await follow({name:'generate_week',arguments:{availabilityReadId:resolved.availabilityReadId,snapshotDigest:resolved.snapshotDigest}},2);
  assert.equal(args.length,1);assert.equal(args[0].week,next);assert.equal(args[0].includeToday,includeToday);
  assert.equal(db.writes.length,0);
  const expired=tools.coachFirstTools(db,user,{...input,timestamp:'2026-10-05T12:00:00Z'},'expired',async()=>{throw Error('unexpected');},()=>{});
  assert.equal((await expired({name:'prepare_generation',arguments:{period:'pending',includeToday}},1)).code,'GENERATION_PENDING_EXPIRED');
});

for(const includeToday of [undefined,true,false])test(`FIX A: future preparation ${includeToday} needs no temporal question`,async()=>{
  const db=database(),load=sportsRuntime({console:quiet,Error});let received;
  const input={message:'Próxima semana',messageId:'future',timestamp:today+'T12:00:00Z',timezone:'Atlantic/Canary',conversation:[]};
  const dispatch=load('../chat/coachFirstTools').coachFirstTools(db,user,input,'future',async a=>{received=a;return {status:'partial'};},()=>{});
  const r=await dispatch({name:'prepare_generation',arguments:{period:'next_week',...(includeToday===undefined?{}:{includeToday})}},1);
  assert.equal(r.canContinue,true,JSON.stringify(r));assert.equal(r.requirements.preflightRequirement,undefined);
  assert.equal(r.requirements.temporalDecision.reason,includeToday===undefined?'today_outside_target_week':'explicit_intent');
  await dispatch({name:'generate_week',arguments:{availabilityReadId:r.availabilityReadId,snapshotDigest:r.snapshotDigest}},2);
  assert.equal(received.includeToday,includeToday===undefined?false:includeToday);
});

function availabilityTurn(timestamp=next+'T12:00:00Z',message='Genera mi semana'){
  return {message,messageId:'availability-fixture',timestamp,timezone:'Atlantic/Canary',conversation:[]};
}
function rememberPreparation(db,result){
  db.tables.usuarios[0].perfil.coach_first_turns={availability:{persisted:true,finishedAt:next+'T12:00:00Z',receipts:[{
    tool:'prepare_generation',status:result.status,generationTarget:result.generationTarget,availabilitySnapshotDigest:result.snapshotDigest}]}};
}
test('weekly gate: profile default asks availability before temporal and stops same batch',async()=>{
  const db=database(false),load=sportsRuntime({console:quiet,Error}),input=availabilityTurn();let generated=0;
  const dispatch=load('../chat/coachFirstTools').coachFirstTools(db,user,input,'ask',async()=>{generated++;},()=>{});
  const result=await load('../chat/coachFirstLoop').runCoachFirstLoop(input,{dispatch,complete:async()=>({answer:null,clarification:null,mutationIntents:[],calls:[
    {name:'prepare_generation',arguments:{period:'current_week',includeToday:true}},
    {name:'generate_week',arguments:{availabilityReadId:'ask:1',snapshotDigest:'unused',includeToday:true}}]})});
  assert.equal(result.status,'clarification_required');assert.equal(result.results.length,1);assert.equal(generated,0);
  const r=result.results[0];assert.equal(r.requirements.preflightRequirement.kind,'availability');
  assert.match(result.answer,/2026-09-28/);assert.match(result.answer,/lunes/);assert.equal(db.writes.length,0);
  const bypass=await dispatch({name:'generate_week',arguments:{availabilityReadId:r.availabilityReadId,snapshotDigest:r.snapshotDigest,includeToday:true}},2);
  assert.equal(bypass.code,'WEEKLY_AVAILABILITY_CONFIRMATION_REQUIRED');assert.equal(generated,0);
});
for(const includeToday of [undefined,true])test(`weekly confirmation persists; pending rereads; temporal intent ${includeToday}`,async()=>{
  const db=database(false),load=sportsRuntime({console:quiet,Error}),tools=load('../chat/coachFirstTools');let generated=0;
  const create=(id,message)=>tools.coachFirstTools(db,user,availabilityTurn(undefined,message),id,async()=>{generated++;return {status:'partial'};},()=>{});
  const first=await create('first','Genera mi semana')({name:'prepare_generation',arguments:{period:'current_week'}},1);
  rememberPreparation(db,first);
  const follow=create('follow',includeToday?'Sí, mantenla e incluye hoy':'Sí');
  const pending=await follow({name:'prepare_generation',arguments:{period:'pending'}},1);
  assert.equal(pending.targetWeekStart,next);assert.equal(pending.canConfirmAvailability,true);
  const saved=await follow({name:'update_availability',arguments:{operation:'confirm',week:next,snapshotDigest:pending.snapshotDigest}},2);
  assert.equal(saved.status,'committed',JSON.stringify(saved));assert.equal(saved.weeklyOverride.status,'valid');
  assert.equal(db.writes.length,1);assert.equal(db.writes[0].table,'usuarios');
  assert.deepEqual(db.tables.usuarios[0].perfil.weekly_availability[next].availability,db.tables.usuarios[0].distribucion_semanal);
  assert.notEqual(saved.snapshotDigest,first.snapshotDigest);
  const stale=await follow({name:'generate_week',arguments:{availabilityReadId:pending.availabilityReadId,snapshotDigest:pending.snapshotDigest,includeToday:true}},3);
  assert.equal(stale.code,'GENERATION_AVAILABILITY_READ_REQUIRED');assert.equal(generated,0);
  const ready=await follow({name:'prepare_generation',arguments:{period:'pending',...(includeToday===undefined?{}:{includeToday})}},4);
  assert.equal(ready.targetWeekStart,next);assert.equal(ready.availability.weeklyOverride.status,'valid');
  if(includeToday===undefined){assert.equal(ready.requirements.code,'TEMPORAL_DECISION_REQUIRED');assert.equal(ready.includeToday,undefined);}
  else {assert.equal(ready.canContinue,true);assert.equal(ready.includeToday,true);
    await follow({name:'generate_week',arguments:{availabilityReadId:ready.availabilityReadId,snapshotDigest:ready.snapshotDigest}},5);assert.equal(generated,1);}
  assert.equal(db.writes.length,1);
});
test('weekly gate rejects changed presented digest and asks new availability',async()=>{
  const db=database(false),load=sportsRuntime({console:quiet,Error}),tools=load('../chat/coachFirstTools');
  const create=id=>tools.coachFirstTools(db,user,availabilityTurn(),id,async()=>{throw Error('generation forbidden');},()=>{});
  const old=await create('first')({name:'prepare_generation',arguments:{period:'current_week'}},1);rememberPreparation(db,old);
  db.tables.athlete_training_sources[0].dias=['jueves'];db.tables.usuarios[0].distribucion_semanal.box=['jueves'];
  const dispatch=create('follow');
  const pending=await dispatch({name:'prepare_generation',arguments:{period:'pending'}},1);
  assert.equal(pending.canConfirmAvailability,false);assert.notEqual(pending.snapshotDigest,old.snapshotDigest);
  const stale=await dispatch({name:'update_availability',arguments:{operation:'confirm',week:next,snapshotDigest:old.snapshotDigest}},2);
  assert.equal(stale.code,'AVAILABILITY_CONFIRMATION_STALE');assert.equal(db.writes.length,0);
});
for(const operation of ['patch','replace'])test(`weekly ${operation} readback preserves habitual defaults and explicit zero`,async()=>{
  const db=database(false),load=sportsRuntime({console:quiet,Error}),api=load('chatAvailability');
  const baseline=plain(db.tables.usuarios[0].distribucion_semanal),initial=await api.readAvailabilityConfirmation(db,user,next);
  const availability=operation==='patch'?{box:['martes','viernes','sabado']}:{box:[],carrera:[]};
  const r=await api.updateStructuredChatAvailability(db,user,{operation,week:next,snapshotDigest:initial.snapshotDigest,availability});
  assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.weeklyOverride.status,'valid');assert.equal(r.actualizado,true);
  assert.deepEqual(db.tables.usuarios[0].distribucion_semanal,baseline);
  const again=await api.readAvailabilityConfirmation(db,user,next);
  assert.equal(again.snapshotDigest,r.snapshotDigest);
  if(operation==='patch'){assert.deepEqual(plain(again.availability.box),availability.box);assert.deepEqual(plain(again.availability.carrera),baseline.carrera);}
  else {assert.equal(again.weeklyOverride.declaration.resolution,'EXPLICIT_ZERO_TRAINING');assert.deepEqual(plain(again.availability),availability);}
});
test('weekly confirmation CAS failure never authorizes generation',async()=>{
  const db=database(false),load=sportsRuntime({console:quiet,Error}),api=load('chatAvailability');
  const r=await api.readAvailabilityConfirmation(db,user,next);db.conflict=true;
  const failed=await api.updateStructuredChatAvailability(db,user,{operation:'confirm',week:next,snapshotDigest:r.snapshotDigest});
  assert.equal(failed.ok,false);assert.equal(failed.code,'AVAILABILITY_CONFIRMATION_STALE');assert.equal(db.tables.usuarios[0].perfil.weekly_availability,undefined);
});

test('pending availability reply loop confirms, rereads and stops for unresolved temporal choice',async()=>{
  const db=database(false),load=sportsRuntime({console:quiet,Error}),tools=load('../chat/coachFirstTools'),input=availabilityTurn(undefined,'Sí');
  const original=await tools.coachFirstTools(db,user,input,'first',async()=>{throw Error('unexpected');},()=>{})({name:'prepare_generation',arguments:{period:'current_week'}},1);
  rememberPreparation(db,original);let rounds=0,generated=0;
  const dispatch=tools.coachFirstTools(db,user,input,'reply',async()=>{generated++;},()=>{});
  const result=await load('../chat/coachFirstLoop').runCoachFirstLoop(input,{dispatch,complete:async messages=>{
    const base={answer:null,clarification:null,mutationIntents:[]};rounds++;
    if(rounds===1)return {...base,calls:[{name:'prepare_generation',arguments:{period:'pending'}}]};
    if(rounds===2){const r=JSON.parse(messages.at(-1).content).toolResult;assert.equal(r.canConfirmAvailability,true);
      return {...base,calls:[{name:'update_availability',arguments:{operation:'confirm',week:r.targetWeekStart,snapshotDigest:r.snapshotDigest}}]};}
    return {...base,calls:[{name:'prepare_generation',arguments:{period:'pending'}}]};
  }});
  assert.equal(rounds,3);assert.equal(generated,0);assert.equal(result.status,'clarification_required');
  assert.equal(result.results.at(-1).requirements.code,'TEMPORAL_DECISION_REQUIRED');
  assert.equal(result.results.at(-1).targetWeekStart,next);assert.equal(db.writes.length,1);
});
test('pending availability gate also stops generate_week in the reply batch',async()=>{
  const db=database(false),load=sportsRuntime({console:quiet,Error}),tools=load('../chat/coachFirstTools'),input=availabilityTurn();
  const first=await tools.coachFirstTools(db,user,input,'first',async()=>{},()=>{})({name:'prepare_generation',arguments:{period:'current_week'}},1);
  rememberPreparation(db,first);const names=[];
  const dispatch=tools.coachFirstTools(db,user,input,'reply',async()=>{throw Error('unexpected generation');},()=>{});
  const r=await load('../chat/coachFirstLoop').runCoachFirstLoop(input,{dispatch:async(call,n)=>{names.push(call.name);return dispatch(call,n);},complete:async()=>({
    answer:null,clarification:null,mutationIntents:[],calls:[{name:'prepare_generation',arguments:{period:'pending'}},
      {name:'generate_week',arguments:{availabilityReadId:'reply:1',snapshotDigest:first.snapshotDigest,includeToday:true}}]})});
  assert.equal(r.status,'clarification_required');assert.deepEqual(names,['prepare_generation']);assert.equal(db.writes.length,0);
});
test('read_context cannot bypass a missing weekly declaration',async()=>{
  const db=database(false),load=sportsRuntime({console:quiet,Error});let generated=0;
  const dispatch=load('../chat/coachFirstTools').coachFirstTools(db,user,availabilityTurn(),'bypass',async()=>{generated++;},()=>{});
  const r=await dispatch({name:'read_context',arguments:{resource:'availability',week:next}},1);
  await dispatch({name:'read_context',arguments:{resource:'planning',week:next}},2);
  const result=await dispatch({name:'generate_week',arguments:{availabilityReadId:r.availabilityReadId,snapshotDigest:r.data.snapshotDigest,includeToday:true}},3);
  assert.equal(result.code,'WEEKLY_AVAILABILITY_CONFIRMATION_REQUIRED');assert.equal(generated,0);
});

test('availability confirmation cannot switch the prepared target week',async()=>{
  const db=database(false),load=sportsRuntime({console:quiet,Error});
  const dispatch=load('../chat/coachFirstTools').coachFirstTools(db,user,availabilityTurn(),'target',async()=>{throw Error('unexpected');},()=>{});
  const r=await dispatch({name:'prepare_generation',arguments:{period:'current_week'}},1);
  const other=await dispatch({name:'update_availability',arguments:{operation:'confirm',week:'2026-10-05',snapshotDigest:r.snapshotDigest}},2);
  assert.equal(other.code,'GENERATION_TARGET_MISMATCH');assert.equal(db.writes.length,0);
});

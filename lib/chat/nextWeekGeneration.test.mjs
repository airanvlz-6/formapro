import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sportsRuntime, plain, equippedProfileFixture, compile } from '../sports/trainingContractTestRuntime.mjs';
const today='2026-09-27',week='2026-09-21',next='2026-09-28',user='u';
const days=['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const quiet={log(){},info(){},warn(){},error(){}};
const routeText=readFileSync('app/api/chat/route.ts','utf8'),route=ts.createSourceFile('route.ts',routeText,ts.ScriptTarget.Latest,true);
function find(node,predicate){if(predicate(node))return node;let found;ts.forEachChild(node,c=>{found??=find(c,predicate);});return found;}
class Clock extends Date {constructor(...a){super(...(a.length?a:[today+'T12:00:00Z']));} static now(){return Date.parse(today+'T12:00:00Z');}}
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
  }};return db;
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
for(const mode of ['transient','valid','permanent','empty','json','content','no_tool'])test('exact Sunday request: real pipeline '+mode,{timeout:180000},async()=>{
  const failure=!['transient','valid'].includes(mode);
  const db=database(),load=sportsRuntime({Date:Clock,console:quiet,Error,fetch:(...args)=>provider(...args)}),calls=[],builderStarts=[],builderEnds=[];
  const row=db.tables.usuarios[0];row.perfil.duracion='60 min';row.perfil.dias=7;
  row.distribucion_semanal={box:['martes','jueves','viernes','sabado'],carrera:['lunes','miercoles','domingo']};
  db.tables.athlete_training_sources.forEach(s=>s.dias=row.distribucion_semanal[s.disciplina]);
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
      answer={contractVersion:3,contextDigest:contract.contextDigest,selections:days.map(day=>({day,state:'TRAIN',discipline:row.distribucion_semanal.box.includes(day)?'box':'carrera',guidance:{kind:'weekly_guidance',version:2,stimulus:row.distribucion_semanal.box.includes(day)?'tecnica':'base_aerobica'}}))};
      return new Response(JSON.stringify({id:'synthetic',type:'message',role:'assistant',model:'synthetic',stop_reason:'tool_use',stop_sequence:null,
        usage:{input_tokens:320,output_tokens:180},content:[{type:'tool_use',id:'weekly',name:'submit_weekly_guidance',input:answer}]}),{status:200,headers:{'content-type':'application/json'}});
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
    calls.push({action,week:datos.targetWeekStart});assert.equal(datos.targetWeekStart,next);
    const block=find(route,n=>ts.isIfStatement(n)&&n.expression.getText(route)===`action === "${action}"`);assert.ok(block,action);
    const globals={Date:Clock,console:quiet,Error,Buffer,structuredClone,AbortSignal,setTimeout,clearTimeout,
      supabase:db,codigo:user,datos,coachFirstPlanning,apiKey:'synthetic',fetch:provider,NextResponse:{json:body=>body},
      require:name=>load('../'+name.slice('@/lib/'.length))};
    for(const n of route.statements)if(ts.isImportDeclaration(n)&&!n.importClause?.isTypeOnly&&n.moduleSpecifier.text.startsWith('@/lib/'))
      for(const b of n.importClause?.namedBindings?.elements??[])if(!b.isTypeOnly)Object.defineProperty(globals,b.name.text,{get:()=>load('../'+n.moduleSpecifier.text.slice('@/lib/'.length))[(b.propertyName??b.name).text]});
    const helpers=['generarEstadoCanonico','buildFocusContext'].map(name=>find(route,n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(route)).join('\n');
    const result=await vm.runInNewContext(compile(`${helpers}\nasync function run(){${block.thenStatement.getText(route)}}\nrun();`),globals);
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
});

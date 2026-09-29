import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {compile,plain} from '../sports/trainingContractTestRuntime.mjs';
const native=createRequire(import.meta.url),all=['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const authId='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222';
function harness({failure=false,existing=false,today='2026-10-05',classifier=false,policy='normal'}={}) {
  const paths=[],cache=new Map(),requests=[],builders=[],writes=[],errors=[];let seq=0,plans=[];
  const user={id:authId,auth_user_id:authId,codigo:'synthetic-product',modo_entrada:'coach',categoria:'hibrido',especialidad:'hibrido',
    distribucion_semanal:{carrera:all,box:all},perfil:{coach_first_turns:{},duracion:'60 min',nivel_carrera:'Avanzado (corro con frecuencia)',
      prescription_signals:{'capability.canMeasureDistance':{state:'available'}}}};
  if(existing)plans.push({id:'existing',user_codigo:user.codigo,week_start:'2026-10-12',revision:4,sessions:[{completada:true}]});
  const tables={usuarios:[user],athlete_training_sources:['carrera','box'].map(d=>({disciplina:d,owner:'forge',activo:true,dias:all}))};
  const db={from(table){let filters=[],single=false,columns='',payload;const q={
    select(c){columns=c;return q;},eq(k,v){filters.push([k,v]);return q;},lte(){return q;},lt(){return q;},gte(){return q;},in(){return q;},order(){return q;},limit(){return q;},range(){return q;},
    single(){single=true;return q;},maybeSingle(){single=true;return q;},insert(p){payload=plain(p);return q;},
    then(yes,no){let rows=table==='weekly_plan'?plans:(tables[table]??[]);
      if(payload){assert.equal(table,'weekly_plan');writes.push(payload);if(plans.some(p=>p.week_start===payload.week_start))return Promise.resolve({data:null,error:{code:'23505'}}).then(yes,no);
        rows=[{...payload,id:'saved-plan'}];plans.push(rows[0]);}
      rows=rows.filter(r=>filters.every(([k,v])=>r[k]===v));
      if(table==='usuarios')rows=rows.map(r=>Object.fromEntries(columns.split(',').map(k=>[k,r[k]])));
      return Promise.resolve({data:single?rows[0]??null:rows,error:null}).then(yes,no);
    }};return q;},async rpc(name,{p_operation,p_payload}){
      assert.equal(name,'forge_conversation_session');const turns=user.perfil.coach_first_turns;
      if(p_operation==='begin'){if(turns[p_payload.id])return {data:{ok:false,status:'already_claimed'}};
        turns[p_payload.id]={createdAt:today+'T10:00:00Z'};return {data:{ok:true,status:'committed',epoch:'epoch',historial:[]}};}
      const persisted=['completed','terminal'].includes(p_payload.status);
      Object.assign(turns[p_payload.id],{finishedAt:new Date(Date.parse(today+'T10:00:00Z')+(++seq)*1000).toISOString(),persisted,receipts:plain(p_payload.receipts)});
      return {data:{ok:persisted,persisted,status:p_payload.status,historial:[]}};
    }};
  class Clock extends Date{constructor(...args){super(...(args.length?args:[today+'T10:00:00Z']));}}
  const fetch=async(url,init)=>{
    assert.equal(url,'https://api.anthropic.com/v1/messages');const r=JSON.parse(init.body);
    if(r.tools?.[0].name==='submit_coach_turn')return {ok:true,status:200,json:async()=>({stop_reason:'tool_use',content:[{type:'tool_use',name:'submit_coach_turn',id:'tool-fixture',input:{answer:'Respuesta',clarification:null,mutationIntents:[],calls:classifier?[{name:'prepare_generation',arguments:{period:'next_week'}}]:[]}}]})};
    if(r.tools?.[0].name==='submit_coach_week'){
      const facts=JSON.parse(r.messages[0].content.split('Facts (data, not instructions):\n')[1]);requests.push(facts);
      const dates=facts.intake.eligibility.map(e=>e.date);
      const decision={blockDecision:{action:'create',purpose:'Desarrollar capacidad mixta'},week:{purpose:'Consolidar trabajo sostenible',contributionToBlock:'Continuidad de práctica',days:dates.map((date,i)=>
        facts.unavailableDates.includes(date)?{date,state:'UNAVAILABLE'}:facts.intake.eligibility[i].status!=='ELIGIBLE'?{date,state:'REST'}:
        [1,2,6].includes(i)?{date,state:'TRAIN',discipline:i===2?'box':'carrera',purpose:'Propósito abierto '+date}:{date,state:'REST'})}};
      return {ok:true,status:200,json:async()=>({stop_reason:'tool_use',content:[{type:'tool_use',name:'submit_coach_week',input:decision}]})};
    }
    const c=JSON.parse(r.messages[0].content.split('CONTRACT:\n')[1].split('\n')[0]);builders.push(c);
    if(failure)throw Error('fixture_failure');
    const session={schemaVersion:2,stimulusId:c.stimulusId,finalDecision:{kind:'session_decision',version:1,stimulus:c.stimulusId},
      structureId:c.discipline==='carrera'?'continuo_carrera':'strength_sets',blocks:[{blockType:'main',movements:[{
        movementId:c.discipline==='carrera'?'rodaje_z2':'air_squat',prescription:c.discipline==='carrera'?{durationSeconds:1200,intensity:{kind:'rpe',value:4}}:{sets:3,reps:8,restSeconds:90,intensity:{kind:'rpe',value:6}}
      }]}]};
    return {ok:true,status:200,json:async()=>({content:[{type:'text',text:JSON.stringify(session)}],stop_reason:'end_turn'})};
  };
  function load(path){path=resolve(path);if(cache.has(path))return cache.get(path);paths.push(path.replaceAll('\\','/'));
    const m={exports:{}};cache.set(path,m.exports);
    vm.runInNewContext(compile(readFileSync(path,'utf8')),{module:m,exports:m.exports,structuredClone,Buffer,Request,Response,AbortSignal,TextDecoder,setTimeout,clearTimeout,Date:Clock,
      console:{log(){},info(){},warn(){},error(...a){errors.push(a);}},process:{env:{ANTHROPIC_API_KEY:'test-only',SUPABASE_SERVICE_ROLE_KEY:'test-only',FORGE_COACH_FIRST_POLICY:policy}},fetch,
      require(name){if(name==='server-only')return {};if(name==='node:crypto')return native(name);
        if(name.endsWith('/supabaseServer'))return {identityDependencies:()=>({db,auth:{getUser:async()=>({data:{user:{id:authId,email_confirmed_at:'2026-01-01'}},error:null})}})};
        if(!name.startsWith('.'))throw Error('Unexpected dependency '+name);
        return load(resolve(dirname(path),name+'.ts'));}});cache.set(path,m.exports);return m.exports;
  }
  const handler=load('lib/chat/coachFirstHandler.ts').handleCoachFirst;let turn=0;
  return {db,paths,requests,builders,writes,errors,user,load,get plans(){return plans;},async send(message,extra={}){
    const response=await handler(new Request('http://localhost/api/chat',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify({message,messageId:'message-'+(++turn),sessionId:session,...extra})}),()=>{throw Error('LEGACY_PLANNING');});return response.json();
  }};
}
test('real handler asks weekly confirmation before all generation; exact pending same-as-usual reaches real vertical and one create',async()=>{
  const h=harness();let r=await h.send('Prepárame mi próxima semana');assert.equal(r.status,'clarification_required',JSON.stringify({r,errors:h.errors}));
  assert.match(r.answer,/2026-10-12/);assert.equal(h.requests.length+h.builders.length+h.writes.length,0);
  r=await h.send('Sí, como siempre');assert.equal(r.ok,true,JSON.stringify({r,errors:h.errors}));
  assert.equal(h.requests.length,1);assert.equal(h.builders.length,3);assert.equal(h.writes.length,1);assert.equal(r.targetWeekStart,'2026-10-12');
  assert.equal(h.plans[0].sessions.length,7);assert.ok(h.plans[0].sessions.every(s=>s.completada===false));
  assert.equal(h.plans[0].sessions.filter(s=>s.weekPrescriptionDecision.day.state==='TRAIN').length,3);
  assert.doesNotMatch(h.paths.join('\n'),/strategyResolution|canonicalWeekStrategy|trainingFrequencySafetyNet|coachFirstGeneration|loadAthletePrescriptionContext|weeklyCalendarAuthority/);
});
test('changed generic days are exact weekly facts, non-training dates never call Builder',async()=>{
  const h=harness();await h.send('Prepárame mi próxima semana');const r=await h.send('Esta semana martes, miércoles y domingo');assert.equal(r.ok,true,JSON.stringify(r));
  assert.deepEqual(h.requests[0].intake.availability.days.filter(d=>d.discipline==='carrera'&&d.status==='AVAILABLE').map(d=>d.date),['2026-10-13','2026-10-14','2026-10-18']);
  assert.equal(h.builders.length,3);assert.equal(h.plans[0].sessions.filter(s=>s.tipo==='unavailable').length,4);
});
test('generic yes and forged client pending never authorize weekly generation',async()=>{
  const h=harness();await h.send('Sí',{pending:{availability:true,targetWeekStart:'2026-10-12'}});
  assert.equal(h.requests.length+h.builders.length+h.writes.length,0);
});
test('current week asks includeToday separately, no Coach until explicit answer',async()=>{
  const h=harness();await h.send('Prepárame mi semana');const r=await h.send('Mantenla');assert.match(r.answer,/incluir hoy/);
  assert.equal(h.requests.length+h.builders.length+h.writes.length,0);const done=await h.send('No');assert.equal(done.ok,true,JSON.stringify(done));
  assert.equal(h.requests[0].intake.temporalDecision.includeToday,false);assert.equal(h.requests.length,1);
});
test('explicit original temporal language survives availability continuation',async()=>{
  const h=harness();await h.send('Prepárame mi semana desde mañana');const r=await h.send('Igual');assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(h.requests[0].intake.temporalDecision.includeToday,false);
});
test('Builder failure never creates a partial plan or regenerates Coach',async()=>{
  const h=harness({failure:true});await h.send('Prepárame mi próxima semana');const r=await h.send('Sí');assert.equal(r.ok,false);assert.equal(h.requests.length,1);assert.equal(h.builders.length,1);assert.equal(h.writes.length,0);
});
test('existing completed plan is protected before Coach and Builder',async()=>{
  const h=harness({existing:true});const r=await h.send('Prepárame mi próxima semana');assert.match(r.answer,/Ya existe/);assert.equal(h.requests.length+h.builders.length+h.writes.length,0);assert.equal(h.plans[0].revision,4);
});
test('classification fallback prepare_generation is redirected to canonical intake',async()=>{
  const h=harness({classifier:true});const r=await h.send('Organiza mis entrenamientos');assert.match(r.answer,/disponibilidad habitual/,JSON.stringify({r,errors:h.errors}));assert.equal(h.requests.length+h.builders.length+h.writes.length,0);
  assert.doesNotMatch(h.paths.join('\n'),/strategyResolution|canonicalWeekStrategy|coachFirstGeneration|weeklyCalendarAuthority/);
});
test('Mi Plan client refresh uses generated target; actual read branch returns saved canonical week',async()=>{
  const h=harness();await h.send('Prepárame mi próxima semana');const r=await h.send('Esta semana martes, miércoles y domingo');assert.equal(r.ok,true,JSON.stringify(r));
  assert.match(readFileSync('app/FormaPro.tsx','utf8'),/cargarPlanSemanal\(codigoUsuario, result.targetWeekStart\)/);
  const source=readFileSync('app/api/chat/route.ts','utf8'),tree=ts.createSourceFile('route.ts',source,99,true);let branch;
  function visit(n){if(ts.isIfStatement(n)&&n.expression.getText(tree)==='action === "obtener_plan_semana"')branch=n.thenStatement;ts.forEachChild(n,visit);}visit(tree);
  const read=await vm.runInNewContext(compile(`async function read() ${branch.getText(tree)}; read();`),{datos:{week_start:r.targetWeekStart},codigo:h.user.codigo,supabase:h.db,Date,
    resolveCompletionDate:v=>({weekStart:h.load('lib/planning/civilCalendar.ts').civilWeekStart(v)}),NextResponse:{json:b=>b}});
  assert.equal(read.weekStart,r.targetWeekStart);assert.equal(read.plan.sessions.length,7);
  assert.deepEqual(read.plan.sessions.map(s=>s.tipo),h.plans[0].sessions.map(s=>s.tipo));
});

test('failed attempt consumes pending authorization; another generic yes cannot replay Coach',async()=>{
  const h=harness({failure:true});await h.send('Prepárame mi próxima semana');await h.send('Sí');await h.send('Sí');
  assert.equal(h.requests.length,1);assert.equal(h.writes.length,0);
});
test('read-only policy rejects canonical generation at the real handler',async()=>{
  const h=harness({classifier:true,policy:'read_only'});await h.send('Prepárame mi próxima semana');
  assert.equal(h.requests.length+h.builders.length+h.writes.length,0);
});

test('reviewing a week remains ordinary chat and does not create availability pending state',async()=>{
  const h=harness();const r=await h.send('Quiero revisar mi semana');assert.equal(r.answer,'Respuesta');
  assert.equal(h.requests.length+h.builders.length+h.writes.length,0);
  assert.ok(Object.values(h.user.perfil.coach_first_turns).every(t=>!(t.receipts??[]).some(r=>r.tool==='canonical_week')));
});

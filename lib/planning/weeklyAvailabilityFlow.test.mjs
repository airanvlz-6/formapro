import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sportsRuntime, fakeDatabase, equippedProfileFixture, plain, compile } from '../sports/trainingContractTestRuntime.mjs';
const week='2026-09-14',today='2026-09-13';
class FixedDate extends Date {constructor(...args){super(...(args.length?args:[today+'T12:00:00Z']));}static now(){return Date.parse(today+'T12:00:00Z');}}
const ui=ts.createSourceFile('FormaPro.tsx',readFileSync('app/FormaPro.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function find(n,p){return p(n)?n:ts.forEachChild(n,c=>find(c,p));}
const orchestrator=find(ui,n=>ts.isVariableDeclaration(n)&&n.name.getText(ui)==='orquestarGeneracionSemana').initializer.getText(ui);
const habitual={box:['lunes','miercoles','viernes'],carrera:['martes','sabado']};
const cases=[
  ['habitual without declaration',null,5],
  ['open prescriptions','Box lunes, miércoles, viernes y domingo. Corro martes, jueves y sábado.',7],
  ['normal hybrid','Box lunes y miércoles. Corro martes y sábado.',4],
  ['running only','Esta semana solo carrera. Lunes, miércoles, viernes y domingo.',4],
  ['box only','Esta semana entreno lunes, martes, jueves y sábado en el box.',4],
  ['vacation two days','Estoy de vacaciones. Solo corro martes y sábado.',2],
  ['explicit zero','Esta semana no entreno.',0],
  ['regeneration to zero','Esta semana descanso completamente.',0],
];
for(const [name,text,count] of cases)test('actual orchestrator -> shared authorities -> complete persistence: '+name,async()=>{
  const events=[],runtime=sportsRuntime({Date:FixedDate,console:{info:(...a)=>events.push(a),log(){},warn(){},error(){}}});
  const load=name=>runtime(name.startsWith('../sports/')?name:'../planning/'+name);
  const days=plain(load('weeklyCalendar').calendarDays),parser=load('../sports/weeklyAvailabilityDeclaration');
  const declaration=text?plain(parser.parseWeeklyAvailabilityDeclaration(text,['box','carrera'],habitual)):null;
  if(text)assert.ok(declaration);
  const snapshot=name==='regeneration to zero'?{id:'synthetic-plan',user_codigo:'synthetic',week_start:week,revision:1,
    sessions:days.map((dia,i)=>({session_id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,dia,tipo:'box',titulo:'Uncompleted prior prescription',descripcion:'Prior work'}))}:null;
  const tables={usuarios:{codigo:'synthetic',modo_entrada:'coach',categoria:'box',especialidad:'crossfit',objetivo_principal:{descripcion:'crossfit'},
    ciclo_actual:{bloque:'acumulacion',semana:1,totalSemanas:4,planningWeekStart:week,blockId:'synthetic'},
    perfil:{...equippedProfileFixture(),dias:5,duracion:'60 min',...(declaration?{weekly_availability:{[week]:declaration}}:{})},
    workout_history:[],distribucion_semanal:habitual},athlete_training_sources:[],athlete_state_events:[],athlete_coaching_notes:[],weekly_plan:snapshot?[snapshot]:[]};
  if(name==='open prescriptions')tables.usuarios.perfil.prescription_signals={};
  const db=fakeDatabase(tables),from=db.from.bind(db);db.from=table=>{const q=from(table);if(table==='weekly_plan')q.maybeSingle=async()=>({data:snapshot,error:null});return q;};
  const calendar=load('weeklyCalendarAuthority'),allowed=plain((await calendar.loadWeeklyCalendarContext(db,'synthetic',week)).allowed);
  assert.equal(new Set(Object.values(allowed).flat()).size,count);
  if(name==='running only'||name==='vacation two days')assert.deepEqual(allowed.box,[]);
  if(name==='box only')assert.deepEqual(allowed.carrera,[]);
  const confirmation=await load('../sports/chatAvailability').readAvailabilityConfirmation(db,'synthetic',week);assert.equal(confirmation.ok,true);
  const request={targetWeekStart:week,today,empezarHoy:false,snapshot,openCoachVersion:1,strategyVersion:1,coherenceVersion:1,planningRunId:'synthetic-availability',confirmedAvailabilityDigest:confirmation.snapshotDigest};
  const actions=[],persisted=[],sessionEvidence=[];let weeklyCalls=0;
  const makeIntent=discipline=>({kind:'open_coach',version:1,discipline,adaptationId:'contextual_practice',stimulusId:'controlled_practice',pattern:discipline==='carrera'?'run':'horizontal_push',role:'PRIMARY',method:{kind:'coach_defined',label:'Contextual practice'}});
  const completeWeekly=async prompt=>{
    assert.ok(count>0,'explicit zero must not request a model to invent training');weeklyCalls++;
    const c=JSON.parse(prompt.split('WEEKLY_CONTRACT:\n')[1]);assert.deepEqual(c.openFacts.allowed,allowed);
    assert.equal(c.frequencyPolicy.minExecutableDays,0);
    return JSON.stringify({contractVersion:2,contextDigest:c.contextDigest,selections:days.map(day=>{
      const discipline=Object.keys(allowed).find(d=>allowed[d].includes(day));return {day,state:discipline?'TRAIN':'REST',decision:{role:'PRIMARY',reason:'Inside the declared week'},...(discipline?{intent:makeIntent(discipline)}:{})};})});
  };
  const context={structuredClone,Date:FixedDate,console:{log:(...a)=>events.push(a),error:(...a)=>events.push(a)},codigoUsuario:'synthetic',
    weeklyPlanningContinuationRef:{current:{codigo:'synthetic',generation:{currentWeek:'2026-09-07',nextWeek:week,token:'synthetic-token',snapshots:{[week]:snapshot},planningRunId:'synthetic-availability'},targetWeekStart:week}},
    availabilityConfirmationRef:{current:confirmation.snapshotDigest},setMensajes(){},distribucionSemanal:habitual,cicloActual:{semana:1,bloque:'acumulacion',totalSemanas:4},
    memoriaCoach:{},debilidades:[],estadoFisiologico:{},estadoCanonico:{},historialFisiologico:[],aplicarTodasLasReglas(){},
    noWeeklyPrescription:load('weeklyRegeneration').noWeeklyPrescription,cargarPlanSemanal:async()=>{},
    // Intentionally hostile habitual UI validation cannot overrule modern server authority.
    validarIntegridadSemana:()=>({valido:false,diasCorregir:days,violaciones:['habitual frequency suggestion']}),
    apiCall:async ({action,datos})=>{
      actions.push(action);
      if(action==='preflight_generacion_semana')return load('weeklyGenerationPreflight').resolveWeeklyGenerationPreflight(db,'synthetic',{...request,temporalIntent:false});
      if(action==='analizar_bloque_semana')return {ok:true,analisis:{tipo_semana:'acumulacion',dias_entreno_sugeridos:5}};
      if(action==='planificar_semana')return load('prepareAllowedWeeklyPlanContract').planBoundedWeek(db,'synthetic',request,completeWeekly,'synthetic-token');
      if(action==='construir_sesion_dia'){
        const r=await load('../sports/sessionAuthority').generateTrainingSession(db,'synthetic',{targetWeekStart:week,day:datos.dia,discipline:datos.tipo,stimulus:datos.stimulusId,intent:datos.intent,state:datos.state,acceptedCurrentWeek:datos.acceptedCurrentWeek,
          weekly:{receipt:datos.calendarReceipt,generationToken:datos.generationToken,optionId:datos.optionId}},async prompt=>{
            const c=JSON.parse(prompt.split('CONTRACT:\n')[1].split('\nIntent canónico:')[0].split('\nContexto no autoritativo:')[0]);
            if(name==='open prescriptions'){
              const recipes=[
                {movementId:'back_squat',prescription:{sets:3,reps:8,intensity:{kind:'rpe',value:7}}},
                {movementId:'running',prescription:{doseInstruction:'4x400m suave, recupera caminando'}},
                {movementId:'Spanish squat',prescription:{doseInstruction:'3 series técnicas'}},
                {movementId:'rodaje_z2',prescription:{durationSeconds:600,intensity:{kind:'rpe',value:5}}},
                {movementId:'generated:carry',variant:{canonicalFamily:'front_rack_carry',displayName:'single-arm front rack carry',modifiers:{arm:'single'}},prescription:{doseInstruction:'3 carries cortos, carga moderada'}},
                {movementId:'rowing_erg',prescription:{doseInstruction:'10 min suave, deja margen'}},
                {movementId:'Copenhagen plank',prescription:{doseInstruction:'2x30s por lado; deja 3 reps en recámara'}},
              ];
              return JSON.stringify({schemaVersion:2,stimulusId:c.stimulusId,structureId:'Coach chosen format',blocks:[{blockType:'main',movements:[recipes[days.indexOf(datos.dia)]]}]});
            }
            return JSON.stringify({schemaVersion:2,stimulusId:c.stimulusId,structureId:c.discipline==='carrera'?'continuo_carrera':'strength_sets',blocks:[{blockType:'main',movements:[{
              movementId:c.discipline==='carrera'?'rodaje_z2':'bench_press',prescription:c.discipline==='carrera'?{durationSeconds:600,intensity:{kind:'rpe',value:5}}:{sets:2,reps:5,restSeconds:60,intensity:{kind:'rpe',value:5}}}]}]});
          });
        assert.equal(r.ok,true,JSON.stringify(r));sessionEvidence.push(r.sesion);return r;
      }
      if(action==='guardar_plan_semana'){
        assert.equal(datos.plan.sessions.length,7);assert.equal(sessionEvidence.length,count);
        const admission=await calendar.assertWeeklyCalendar(db,'synthetic',week,datos.plan.sessions,datos.calendarReceipt,{requireV2:true,sessionEvidence,generationToken:'synthetic-token'});
        const reviewed=await load('enforceWholeWeek').enforceWholeWeek('synthetic',week,datos.plan.sessions,sessionEvidence,datos.calendarReceipt,admission,async()=>JSON.stringify({decision:'KEEP',rationale:'Declared availability governs this week.',days:[]}));
        assert.equal(reviewed.ok,true,JSON.stringify(reviewed));
        const identity=load('prescriptionIdentity').preparePrescriptionSessions(datos.plan.sessions.map(session=>({kind:'new',session})),snapshot??undefined);
        const operationType=snapshot?'regenerate_week':'create_week',candidate={...snapshot,...datos.plan,revision:1,sessions:identity.sessions};
        const validated=await load('planMutation').validatePlanMutation({command:{operationType,source:'weekly_orchestrator',target:{userCodigo:'synthetic',weekStart:week},proposal:candidate,...(snapshot?{expectedRevision:1}:{})},
          candidate,context:{identityProof:identity.identityProof,...(snapshot?{existingPlan:snapshot}:{})},changeSet:{operationType,affectedDays:days,changedFields:['sessions']}});
        assert.equal(validated.status,'ready_for_commit',JSON.stringify(validated));
        const write=payload=>{persisted.push(plain(payload));const q={eq(){return q;},select(){return q;},maybeSingle:async()=>({data:{id:'synthetic-plan',user_codigo:'synthetic',week_start:week,revision:snapshot?2:1},error:null})};return q;};
        const memoryStore={from:()=>({insert:write,update:write})};
        const saved=await load('planPersistence')[snapshot?'mutatePlanWithCAS':'createPlan'](memoryStore,validated.mutation);
        assert.equal(saved.status,'committed',JSON.stringify(saved));return {ok:true,sessions:identity.sessions};
      }
      throw Error('Unexpected action '+action);
    }};
  const run=vm.runInNewContext(compile(`const run=${orchestrator};run;`),context);
  const result=await run(false);assert.equal(result?.sessions?.length,7,JSON.stringify(result));
  assert.equal(actions.filter(a=>a==='construir_sesion_dia').length,count);assert.equal(persisted.length,1);assert.equal(persisted[0].sessions.length,7);
  const targets=events.find(e=>e[0]==='ORCHESTRATOR_BUILDER_TARGETS')[1];assert.equal(targets.count,count);
  if(count===0){assert.equal(weeklyCalls,0);assert.ok(persisted[0].sessions.every(s=>s.tipo==='descanso'));}
  assert.deepEqual(tables.usuarios.distribucion_semanal,habitual);
});

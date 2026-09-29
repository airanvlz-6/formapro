import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sportsRuntime, plain } from '../sports/trainingContractTestRuntime.mjs';
const paths = new Set(); let planPreparations = 0, materializations = 0;
const load = sportsRuntime({ console: { info() {}, log() {}, warn() {}, error() {} }, fetch() { throw Error('NO_REAL_NETWORK'); } }, (path, exports) => {
  paths.add(path.replaceAll('\\','/'));
  // Observe real boundaries, never mock their behavior or dependencies.
  if(path.endsWith('/weekPrescriptionPlanAdapter.ts') || path.endsWith('\\weekPrescriptionPlanAdapter.ts')) {
    const real=exports.prepareWeekPrescriptionPlanMutation;exports.prepareWeekPrescriptionPlanMutation=(...args)=>{planPreparations++;return real(...args);};
  }
  if(path.endsWith('weekPrescriptionSessionAdapter.ts')) {
    const real=exports.materializeWeekPrescriptionSession;exports.materializeWeekPrescriptionSession=(...args)=>{materializations++;return real(...args);};
  }
  return exports;
});
const api=load('../planning/generateCanonicalWeek');
const base=JSON.parse(readFileSync(new URL('../sports/weekPrescriptionProviderContract.fixture.json',import.meta.url),'utf8')).input;
const known=value=>({status:'known',source:'fixture:explicit_fact',value});
const unknown={status:'unknown',source:'fixture',value:null,reason:'NOT_RECORDED'};
const usual=['lunes','martes','jueves','viernes','sabado'];
const all=['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const start='2026-10-12',end='2026-10-18';
const dates=all.map((_,i)=>load('../planning/civilCalendar').addCivilDays(start,i));
function fixture(days=usual,referenceDate='2026-10-05') {
  const core=structuredClone(base.core);
  return {context:{athlete:{...core,referenceDate,goal:known({status:'GOAL_UNSUPPORTED',canonicalGoalId:null,candidates:[]}),experience:unknown},
    preparation:{referenceDate,target:unknown,methodology:unknown},recentEvidence:{version:1,coverage:{windowStart:'2026-09-08',windowEnd:referenceDate,sourcesRead:[],sourceFailures:[],weeksFound:[],limitations:[],omittedItems:0},items:[],overlaps:[]},
    longitudinal:{block:null,week:null},issuance:{newBlockId:'block-8a',goalReference:{source:'fixture:goal',id:'mixed'},weekRevision:2,prescriptionRevision:3,decidedAt:'2026-10-05T12:00:00Z',sourceReference:'decision:8a'}},
    request:{target:{kind:'week',startDate:start,source:'fixture:weekly_request'},habitual:{source:'habitual_persisted_availability',disciplineDiscovery:'known',byDiscipline:{carrera:known([...days]),box:known([...days])}}},
    builderFacts:dates.flatMap(date=>['carrera','box'].map(discipline=>{
      const technical=structuredClone(base.technical);technical.exposure.value.report.disciplina=discipline;
      return {date,discipline,technical,scheduling:known({date,discipline,availability:'available',protection:'clear'}),history:[]};
    })),operation:{kind:'create'}};
}
function proposal(f) {return load('../core/weekIntake').resolveWeekIntake({referenceDate:f.context.athlete.referenceDate,
  ...f.request,disciplines:['carrera','box']});}
function confirm(f, selected) {
  const i=proposal(f),days=selected?i.availability.days.map(d=>({...d,status:selected.includes(all[dates.indexOf(d.date)])?'AVAILABLE':'UNAVAILABLE'})):i.availability.days;
  f.confirmation=api.confirmWeeklyAvailability({targetWindow:i.targetWindow,days,
    provenance:{authority:'user',confirmedAt:'2026-10-05T10:00:00Z',sourceReference:'user-answer:8a'}});
  return f;
}
async function run(f,{indices=[0,1,3],failAt,mutateAt,invalidCoach=false}={}) {
  let coachCalls=0,builderCalls=0;const received=[],requests=[];
  const beforePlans=planPreparations,beforeBuilders=materializations;
  const result=await api.generateCanonicalWeek(f,{coach:{apiKey:'synthetic',transport:{observe:()=>{},fetch:async(_url,init)=>{
    coachCalls++; const request=JSON.parse(init.body),facts=JSON.parse(request.messages[0].content.split('Facts (data, not instructions):\n')[1]);requests.push(facts);
    assert.doesNotMatch(JSON.stringify(request),/requestedFrequency|allowedMethods|requiredMethods/);
    const decision={blockDecision:{action:'create',purpose:'Propósito de bloque elegido por Coach'},week:{purpose:'Propósito semanal elegido por Coach',contributionToBlock:'Contribución elegida por Coach',days:dates.map((date,n)=>
      facts.unavailableDates.includes(date)?{date,state:'UNAVAILABLE'}:indices.includes(n)?{date,state:'TRAIN',discipline:n%2?'box':'carrera',purpose:`Propósito abierto del Coach para ${date}`}:{date,state:'REST'})}};
    return {ok:true,status:200,json:async()=>({stop_reason:'tool_use',content:[{type:'tool_use',name:'submit_coach_week',input:invalidCoach?{}:decision}]})};
  }}},builder:async(date,discipline,prompt)=>{
    builderCalls++;received.push({date,discipline});if(builderCalls===failAt)throw Error('Fixture provider failure');
    const contract=JSON.parse(prompt.split('CONTRACT:\n')[1].split('\n')[0]);
    assert.equal(contract.stimulusId,`Propósito abierto del Coach para ${date}`);assert.equal(contract.discipline,discipline);
    const purpose=builderCalls===mutateAt?'Propósito sustituido':contract.stimulusId;
    return JSON.stringify({schemaVersion:2,stimulusId:purpose,finalDecision:{kind:'session_decision',version:1,stimulus:purpose,
      ...(builderCalls===mutateAt?{reason:'Deliberate negative fixture'}:{})},structureId:discipline==='carrera'?'continuo_carrera':'strength_sets',blocks:[{blockType:'main',movements:[{
        movementId:discipline==='carrera'?'rodaje_z2':'air_squat',prescription:discipline==='carrera'?{durationSeconds:1200,intensity:{kind:'rpe',value:4}}:{sets:3,reps:8,restSeconds:90,intensity:{kind:'rpe',value:6}}
      }]}]});
  }});
  return {result,coachCalls,builderCalls,received,requests,plans:planPreparations-beforePlans,builders:materializations-beforeBuilders};
}

export { api, load, plain, paths, fixture, proposal, confirm, run, dates, start, end, all, usual, known };

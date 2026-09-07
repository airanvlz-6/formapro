import { resolveCompletionDate } from '../planning/recordCompletion';
import { plannedPrescriptionLoad, externalActualLoad, summarizeLoad } from './prescriptionLoadAdapter';
import { resolveSessionLoad, unknownQuantity, type SessionLoad } from './trainingLoad';

/** Read-only backend boundary. Missing deployment schemas are never guessed or queried as if present. */
export async function loadTrainingLoad(db:any,userCodigo:string,fromDate:string,toDate:string){
  const from=resolveCompletionDate(fromDate),to=resolveCompletionDate(toDate);
  if(!userCodigo?.trim()||!from||!to||from.date!==fromDate||to.date!==toDate||fromDate>toDate||Date.parse(toDate)-Date.parse(fromDate)>90*86400000)
    throw new Error('TRAINING_LOAD_INVALID_WINDOW');
  const rows=async(q:PromiseLike<any>,single=false)=>{const r=await q;if(r.error||(single?!r?.data:!Array.isArray(r?.data)))throw new Error('TRAINING_LOAD_READ_FAILED');return r.data;};
  const pages=async(query:()=>any)=>{
    const result:any[]=[];
    for(let offset=0;offset<100000;offset+=500){
      const page=await rows(query().order('id').range(offset,offset+499));result.push(...page);
      if(page.length<500)return result;
    }
    throw new Error('TRAINING_LOAD_READ_LIMIT');
  };
  const [profile,plans,external,modifications]=await Promise.all([
    rows(db.from('usuarios').select('workout_history,ciclo_actual').eq('codigo',userCodigo).single(),true),
    pages(()=>db.from('weekly_plan').select('id,week_start,sessions').eq('user_codigo',userCodigo).gte('week_start',from.weekStart).lte('week_start',to.weekStart)),
    pages(()=>db.from('external_training_records').select('id,fecha,disciplina,duracion,intensidad_percibida,source,load_quality').eq('user_codigo',userCodigo).gte('fecha',fromDate).lte('fecha',toDate)),
    pages(()=>db.from('session_modification_events').select('id,week_start,dia,original_tipo,modified_tipo').eq('user_codigo',userCodigo).gte('week_start',from.weekStart).lte('week_start',to.weekStart)),
  ]);
  if(profile.workout_history!=null&&!Array.isArray(profile.workout_history))throw new Error('TRAINING_LOAD_HISTORY_INVALID');
  const within=(date:string)=>date>=fromDate&&date<=toDate;
  const days=['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
  const planned:SessionLoad[]=[], completedFlags:{id:string;date:string;completed:boolean}[]=[];
  for(const [pi,p] of plans.entries()){
    if(!resolveCompletionDate(p.week_start)||!Array.isArray(p.sessions))throw new Error('TRAINING_LOAD_PLAN_INVALID');
    for(const [si,s] of p.sessions.entries()){
      const index=days.indexOf(String(s?.dia||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());if(index<0)throw new Error('TRAINING_LOAD_PLAN_DAY_INVALID');
      const date=new Date(Date.parse(p.week_start)+index*86400000).toISOString().slice(0,10);if(!within(date)||['descanso','external_blocked','sin_registrar'].includes(s.tipo))continue;
      const id=`plan:${p.id||pi}:${s.session_id||si}`;
      planned.push(plannedPrescriptionLoad(s,date,id));completedFlags.push({id,date,completed:s.completada===true});
    }
  }
  const history:SessionLoad[]=[],externalSessions:SessionLoad[]=[],excluded:string[]=[];
  for(const [i,w] of (profile.workout_history||[]).entries()){
    const date=resolveCompletionDate(w.fecha)?.date;if(!date){excluded.push(`history:${i}:date_unknown`);continue;}if(!within(date))continue;
    // Existing workout duration accepts arbitrary legacy values and has no validated unit. Keep as unknown.
    history.push(resolveSessionLoad({id:`history:${w.workout_id||i}`,date,kind:'actual',discipline:typeof w.tipo==='string'?w.tipo:null,
      source:`usuarios.workout_history.${i}`,segments:[],duration:unknownQuantity('s'),executionStatus:'reported',
      diagnostics:['EXECUTION_STRUCTURE_UNAVAILABLE','LEGACY_DURATION_UNIT_UNVERIFIED','NO_PLANNED_EXECUTION_RELATION']}));
  }
  for(const [i,r] of external.entries()){
    const date=resolveCompletionDate(r.fecha)?.date;if(!date){excluded.push(`external:${i}:date_unknown`);continue;}if(within(date))externalSessions.push(externalActualLoad({...r,fecha:date},`external:${r.id||i}`));
  }
  const weekReports=(sessions:SessionLoad[])=>Object.fromEntries([...new Set(sessions.map(s=>resolveCompletionDate(s.date)!.weekStart))].sort()
    .map(week=>[week,summarizeLoad(sessions.filter(s=>resolveCompletionDate(s.date)!.weekStart===week))]));
  return {schemaVersion:1,window:{fromDate,toDate},planned:summarizeLoad(planned),actual:{history:summarizeLoad(history),external:summarizeLoad(externalSessions),
    combinedStatus:history.length&&externalSessions.length?'unknown_cross_source_overlap':'single_source',
    combined:history.length&&externalSessions.length?null:summarizeLoad([...history,...externalSessions])},
    weeks:{planned:weekReports(planned),historyActual:weekReports(history),externalActual:weekReports(externalSessions)},
    completionFacts:completedFlags,modifications:modifications.map((m:any)=>({id:m.id,weekStart:m.week_start,day:m.dia,originalType:m.original_tipo,modifiedType:m.modified_tipo,loadStatus:'unknown_text_only'})),
    block:{status:'identity_unresolved_no_persistence',label:profile.ciclo_actual?.bloque||null},cycle:{status:'identity_unresolved_no_persistence'},
    diagnostics:['TRAINING_LOAD_RESOLUTION','EXECUTION_TABLES_NOT_IMPLEMENTED_IN_CHECKOUT','NO_IMPLICIT_DEDUPLICATION_OR_LINKING','NO_BLOCK_NAME_AGGREGATION',...excluded]};
}

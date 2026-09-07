import { validateAdmittedWholeWeek } from './wholeWeekAdapter';
import { repairSessionWithinReceipt, verifiedRepairContract } from '../sports/sessionAuthority';
import { calendarKey } from './weeklyCalendar';
import { resolveWeekRepairPlan, MAX_WEEK_REPAIR_TARGETS, type RepairCandidate } from './wholeWeekRepairPlan';

/** Two finite stages, a shared distinct-target budget, and no provisional writes. */
export async function enforceWholeWeek(codigo:string,week:string,rows:any[],sourceSessions:any[],calendarReceipt:string,
  authority:{evidence:any;contexts:Record<string,any>},complete:(prompt:string)=>Promise<string>) {
  const finalRows=structuredClone(rows),finalSources=structuredClone(sourceSessions);
  const validate=()=>validateAdmittedWholeWeek(week,finalRows,authority.evidence,authority.contexts);
  const initial=validate();let result=initial,repairCount=0;
  const orchestration={version:1,maxDistinctTargets:MAX_WEEK_REPAIR_TARGETS,maxModelCalls:MAX_WEEK_REPAIR_TARGETS*2,
    localRepairCount:0,targetedRegenerationCount:0,targetedSessionCount:0,affectedSessionIds:[] as string[],
    stages:[] as {stage:string;targetIds:string[];failedIds:string[];limitExceeded:boolean;nonRepairableCodes:string[]}[],finalStatus:initial.status};
  const candidates:RepairCandidate[]=rows.map((row,index)=>{
    const day=calendarKey(row.dia),slot=authority.evidence.admittedSlots.find((s:any)=>s.day===day);
    const source=sourceSessions.find(s=>calendarKey(s.dia)===day);
    let contract:any;
    if(source&&!slot?.protected)try{contract=verifiedRepairContract(source,codigo,week,calendarReceipt);}catch{/* No authority, no target. */}
    return {id:`${day}:${index}`,index,role:contract?.intent?.role||null,protected:!!slot?.protected,authorized:!!contract,
      intent:contract?.intent||{kind:'unknown'},discipline:contract?.discipline||''};
  });
  for(const stage of ['local','targeted'] as const){
    if(result.status==='pass')break;
    const plan=resolveWeekRepairPlan(result.diagnostics,candidates,orchestration.affectedSessionIds);
    const trace={stage,targetIds:plan.affectedSessionIds,failedIds:[] as string[],limitExceeded:plan.limitExceeded,
      nonRepairableCodes:plan.nonRepairableDiagnostics.map(d=>d.code)};
    orchestration.stages.push(trace);
    if(plan.limitExceeded||plan.nonRepairableDiagnostics.length||!plan.repairGroups.length)break;
    if(stage==='targeted')orchestration.targetedRegenerationCount=1;
    for(const group of plan.repairGroups){
      const {target}=group,sourceIndex=finalSources.findIndex(s=>calendarKey(s.dia)===calendarKey(finalRows[target.index].dia));
      if(!orchestration.affectedSessionIds.includes(target.id))orchestration.affectedSessionIds.push(target.id);
      repairCount++;if(stage==='local')orchestration.localRepairCount++;else orchestration.targetedSessionCount++;
      try{
        const replacement=await repairSessionWithinReceipt(finalSources[sourceIndex],codigo,week,calendarReceipt,group.diagnostics,
          finalRows.map(s=>({day:s.dia,intent:s.structuredPrescription?.objective?.intent||null,role:s.structuredPrescription?.sessionRole||null,
            proposal:s.structuredPrescription?.proposal||null})),complete,stage);
        const {sessionReceipt:_receipt,...content}=replacement;
        finalRows[target.index]=content;finalSources[sourceIndex]=replacement;
      }catch{trace.failedIds.push(target.id);}
    }
    result=validate();
  }
  result=validate();orchestration.finalStatus=result.status;
  if(result.status!=='pass')return {ok:false as const,code:repairCount?'WEEK_REPAIR_FAILED':'WEEK_COHERENCE_INVALID',result,repairCount,orchestration};
  return {ok:true as const,sessions:finalRows,sessionEvidence:finalSources,result,initial,repairCount,orchestration};
}

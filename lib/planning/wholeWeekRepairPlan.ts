import type { WeekDiagnostic } from './wholeWeekValidation';

// Seven slots permit at most six executable days. Three targets handle four identical
// exposures (three redundant copies), changing at most three of the seven calendar slots.
// Both stages share this distinct-target budget, with at most two calls per target.
export const MAX_WEEK_REPAIR_TARGETS = 3;
export type RepairCandidate = { id:string; index:number; role:string|null; protected:boolean; authorized:boolean;
  intent:{kind:string;adaptationId?:string;goalId?:string;weaknessId?:string|null}; discipline:string };

/** Exact hitting-set search over <=7 slots. Warnings never create repair targets. */
export function resolveWeekRepairPlan(diagnostics:WeekDiagnostic[],candidates:RepairCandidate[],alreadyAffected:string[]=[]){
  const eligible=candidates.filter(c=>c.authorized&&!c.protected);
  const groups=diagnostics.filter(d=>d.severity==='ERROR').map(d=>{
    let targets:RepairCandidate[]=[];
    if(d.repairability==='same_contract')targets=eligible.filter(c=>d.sessionIds.includes(c.id));
    else if(['WEEK_PRIMARY_ADAPTATION_MISSING','WEEK_OBJECTIVE_UNCOVERED'].includes(d.code)){
      const g=d.evidence && typeof d.evidence==='object' ? d.evidence as Record<string,unknown> : {};
      targets=eligible.filter(c=>c.intent.kind==='adaptation' && (d.dimension==='goal' ? c.intent.goalId===d.evidence
        : (!g.adaptationId || c.intent.adaptationId===g.adaptationId) && (!g.discipline || c.discipline===g.discipline)
          && (!g.weaknessId || c.intent.weaknessId===g.weaknessId) && (!!g.adaptationId||!!g.discipline||!!g.weaknessId)));
    }
    return {diagnostic:d,candidateIds:targets.map(c=>c.id)};
  });
  const nonRepairableDiagnostics=groups.filter(g=>!g.candidateIds.length).map(g=>g.diagnostic);
  const pool=eligible.filter(c=>groups.some(g=>g.candidateIds.includes(c.id)));
  let best:RepairCandidate[]|null=null,bestRank:number[]=[];
  if(!nonRepairableDiagnostics.length && pool.length<=7)for(let mask=0;mask<2**pool.length;mask++){
    const selected=pool.filter((_,i)=>mask&(1<<i));
    if(!groups.every(g=>selected.some(c=>g.candidateIds.includes(c.id)))||new Set([...alreadyAffected,...selected.map(c=>c.id)]).size>MAX_WEEK_REPAIR_TARGETS)continue;
    const roleCost:Record<string,number>={MAINTENANCE:0,OPTIONAL:1,SUPPORTING:2,PRIMARY:3};
    const rank=[selected.length,selected.reduce((n,c)=>n+(roleCost[c.role||'']??3),0),selected.filter(c=>!alreadyAffected.includes(c.id)).length,
      -selected.reduce((n,c)=>n+c.index,0),mask];
    if(!best||rank.some((n,i)=>n<bestRank[i]&&rank.slice(0,i).every((v,j)=>v===bestRank[j]))){best=selected;bestRank=rank;}
  }
  const limitExceeded=!nonRepairableDiagnostics.length&&best===null;
  return {limit:MAX_WEEK_REPAIR_TARGETS,limitExceeded,nonRepairableDiagnostics,
    repairableDiagnostics:groups.filter(g=>g.candidateIds.length).map(g=>g.diagnostic),affectedSessionIds:(best||[]).map(c=>c.id),
    repairGroups:(best||[]).map(target=>({target,diagnostics:groups.filter(g=>g.candidateIds.includes(target.id)).map(g=>g.diagnostic)}))};
}

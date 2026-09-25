import { validateAdmittedWholeWeek } from './wholeWeekAdapter';
import { repairSessionWithinReceipt, verifiedRepairContract } from '../sports/sessionAuthority';
import { calendarKey } from './weeklyCalendar';
import { currentWeekCoachingContext } from './currentWeekCoachingContext';
import { resolveWeekRepairPlan, MAX_WEEK_REPAIR_TARGETS, type RepairCandidate } from './wholeWeekRepairPlan';

/** Two finite stages, a shared distinct-target budget, and no provisional writes. */
export async function enforceWholeWeek(codigo:string,week:string,rows:any[],sourceSessions:any[],calendarReceipt:string,
  authority:{evidence:any;contexts:Record<string,any>},complete:(prompt:string)=>Promise<string>) {
  const finalRows=structuredClone(rows),finalSources=structuredClone(sourceSessions);
  const validate=()=>validateAdmittedWholeWeek(week,finalRows,authority.evidence,authority.contexts);
  const initial=validate();let result=initial,repairCount=0;
  const orchestration={version:1,maxDistinctTargets:MAX_WEEK_REPAIR_TARGETS,
    maxModelCalls:MAX_WEEK_REPAIR_TARGETS*2 + (authority.evidence.coherenceVersion === 1 ? 1 + MAX_WEEK_REPAIR_TARGETS : 0),
    maxAdvisoryRevisionTargets:authority.evidence.coherenceVersion === 1 ? MAX_WEEK_REPAIR_TARGETS : 0,
    localRepairCount:0,targetedRegenerationCount:0,targetedSessionCount:0,affectedSessionIds:[] as string[],
    reconsideration: { count: 0, decision: 'NOT_NEEDED', rationale: '', revisedDays: [] as string[], failure: null as string | null },
    stages:[] as {stage:string;targetIds:string[];failedIds:string[];failedReasons:{id:string;reason:string}[];limitExceeded:boolean;nonRepairableCodes:string[]}[],finalStatus:initial.status};
  const candidates:RepairCandidate[]=rows.map((row,index)=>{
    const day=calendarKey(row.dia),slot=authority.evidence.admittedSlots.find((s:any)=>s.day===day);
    const source=sourceSessions.find(s=>calendarKey(s.dia)===day);
    let contract:any;
    if(source&&!slot?.protected)try{contract=verifiedRepairContract(source,codigo,week,calendarReceipt);}catch{/* No authority, no target. */}
    return {id:`${day}:${index}`,index,role:contract?.finalDecision?.role||contract?.intent?.role||null,protected:!!slot?.protected,authorized:!!contract,
      intent:contract?.intent||{kind:'unknown'},discipline:contract?.discipline||''};
  });
  for(const stage of ['local','targeted'] as const){
    if(result.status==='pass')break;
    const plan=resolveWeekRepairPlan(result.diagnostics,candidates,orchestration.affectedSessionIds);
    const trace={stage,targetIds:plan.affectedSessionIds,failedIds:[] as string[],failedReasons:[] as {id:string;reason:string}[],limitExceeded:plan.limitExceeded,
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
          finalRows.map(s=>({day:s.dia,finalDecision:s.structuredPrescription?.finalDecision||null,intent:s.structuredPrescription?.objective?.intent||null,role:s.structuredPrescription?.sessionRole||null,
            proposal:s.structuredPrescription?.proposal||null})),complete,stage);
        const {sessionReceipt:_receipt,...content}=replacement;
        finalRows[target.index]=content;finalSources[sourceIndex]=replacement;
      }catch(error:any){trace.failedIds.push(target.id);trace.failedReasons.push({id:target.id,reason:error?.message||'REPAIR_FAILED'});}
    }
    result=validate();
  }
  result=validate();orchestration.finalStatus=result.status;
  if(result.status!=='pass')return {ok:false as const,code:repairCount?'WEEK_REPAIR_FAILED':'WEEK_COHERENCE_INVALID',result,repairCount,orchestration};
  const warnings = result.diagnostics.filter(d => d.severity === 'WARNING');
  if (authority.evidence.coherenceVersion === 1 && warnings.length) {
    const review = orchestration.reconsideration;
    review.count = 1;
    const beforeRows = structuredClone(finalRows), beforeSources = structuredClone(finalSources);
    try {
      const eligible = candidates.filter(c => c.authorized && !c.protected).map(c => calendarKey(finalRows[c.index].dia));
      const contracts = finalSources.filter(s => eligible.includes(calendarKey(s.dia))).map(s => {
        const c = verifiedRepairContract(s, codigo, week, calendarReceipt);
        return { day: calendarKey(s.dia), intent: c.intent, coachingGuidance:c.coachingGuidance, finalDecision:c.finalDecision, doseContext:c.doseContext, restrictions: c.restrictionsSnapshot,
          availableDays: c.availableDays, historicalExposure: c.exposureContext ?? null };
      });
      const raw = await complete(`WHOLE_WEEK_COACH_RECONSIDERATION\nWarnings are advisory. You may KEEP this week consciously, including repeated movements, or REVISE up to ${MAX_WEEK_REPAIR_TARGETS} eligible sessions inside their unchanged signed contracts. ${authority.evidence.contractVersion === 3 ? 'The last admitted session decision is current. Weekly guidance is original provenance. You may revise sporting decisions with reasons, within unchanged factual authorization.' : 'Weekly intents remain fixed.'} Return only JSON {"decision":"KEEP|REVISE","rationale":"brief reason","days":[]}. KEEP requires empty days. There will be no second reconsideration.\nCONTEXT:\n${JSON.stringify({
        originalDecision: authority.evidence.coachingDecisions ?? null, objective: authority.evidence.strategy,
        week: currentWeekCoachingContext(week, finalRows, authority.evidence.admittedSlots), warnings, eligibleDays: eligible, contracts })}`);
      const decision = JSON.parse(raw);
      if (!decision || Object.keys(decision).sort().join(',') !== 'days,decision,rationale'
        || !['KEEP', 'REVISE'].includes(decision.decision) || typeof decision.rationale !== 'string'
        || !decision.rationale.trim() || decision.rationale.length > 600 || !Array.isArray(decision.days)
        || new Set(decision.days).size !== decision.days.length || decision.days.some((d: any) => !eligible.includes(d))
        || decision.days.length > MAX_WEEK_REPAIR_TARGETS || (decision.decision === 'KEEP' ? decision.days.length !== 0 : !decision.days.length))
        throw new Error('WEEK_RECONSIDERATION_INVALID');
      review.decision = decision.decision; review.rationale = decision.rationale.trim();
      for (const day of decision.days) {
        const sourceIndex = finalSources.findIndex(s => calendarKey(s.dia) === day), rowIndex = finalRows.findIndex(s => calendarKey(s.dia) === day);
        const replacement = await repairSessionWithinReceipt(finalSources[sourceIndex], codigo, week, calendarReceipt,
          { advisoryWarnings: warnings, coachRationale: review.rationale },
          currentWeekCoachingContext(week, finalRows, authority.evidence.admittedSlots), complete);
        const { sessionReceipt: _receipt, ...content } = replacement;
        finalRows[rowIndex] = content; finalSources[sourceIndex] = replacement;
        review.revisedDays.push(day);
      }
      const reviewed = validate();
      if (reviewed.status !== 'pass') throw new Error('WEEK_RECONSIDERATION_HARD_INVALID');
      result = reviewed; repairCount += review.revisedDays.length;
    } catch (error: any) {
      // Advisory review failure cannot invalidate an otherwise admitted week or admit an invalid revision.
      finalRows.splice(0, finalRows.length, ...beforeRows); finalSources.splice(0, finalSources.length, ...beforeSources);
      review.failure = typeof error?.message === 'string' && /^[A-Z][A-Z0-9_]{1,100}$/.test(error.message)
        ? error.message : 'WEEK_RECONSIDERATION_FAILED'; review.decision = 'UNAVAILABLE'; review.revisedDays = [];
      result = validate();
    }
    try { if (process.env.FORGE_WEEKLY_COACHING_DIAGNOSTICS === '1') console.info('WHOLE_WEEK_COACH_FEEDBACK', {
      planningRunId: authority.evidence.planning?.planningRunId ?? null, weekStart: week, warnings: warnings.map(d => d.code), ...(authority.evidence.contractVersion === 3 ? {count:review.count,decision:review.decision,revisedDays:review.revisedDays,failure:review.failure} : review) }); }
    catch { /* Diagnostics never change admission. */ }
  }
  return {ok:true as const,sessions:finalRows,sessionEvidence:finalSources,result,initial,repairCount,orchestration};
}

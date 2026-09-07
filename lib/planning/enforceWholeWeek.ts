import { validateAdmittedWholeWeek } from './wholeWeekAdapter';
import { repairSessionWithinReceipt } from '../sports/sessionAuthority';
import { calendarKey } from './weeklyCalendar';

/** Batch barrier after every proposal exists. At most one changed session and one model call. No writes. */
export async function enforceWholeWeek(codigo:string,week:string,rows:any[],sourceSessions:any[],calendarReceipt:string,
  authority:{evidence:any;contexts:Record<string,any>},complete:(prompt:string)=>Promise<string>) {
  let finalRows = structuredClone(rows), finalSources = [...sourceSessions];
  const initial = validateAdmittedWholeWeek(week,finalRows,authority.evidence,authority.contexts);
  let repairCount = 0;
  if (initial.status === 'repair_required') {
    const targetIds = [...new Set(initial.repairHints.flatMap(h=>h.sessionIds))].reverse();
    const target = targetIds.map(id=>Number(id.split(':')[1])).find(index=> {
      const slot=authority.evidence.admittedSlots.find((s:any)=>s.day===calendarKey(finalRows[index].dia));
      return !slot?.protected && finalSources.some(s=>calendarKey(s.dia)===calendarKey(finalRows[index].dia));
    });
    if (target !== undefined) {
      const source=finalSources.find(s=>calendarKey(s.dia)===calendarKey(finalRows[target].dia))!;
      repairCount=1;
      try {
        const replacement=await repairSessionWithinReceipt(source,codigo,week,calendarReceipt,initial.diagnostics,
          finalRows.map(s=>s.structuredPrescription?.proposal || null),complete);
        const {sessionReceipt:_receipt,...content}=replacement;
        finalRows[target]=content;finalSources=finalSources.map(s=>s===source?replacement:s);
      } catch (error:any) {
        return {ok:false as const,code:'WEEK_REPAIR_FAILED',result:initial,repairCount,reason:error.message};
      }
    }
  }
  const result=validateAdmittedWholeWeek(week,finalRows,authority.evidence,authority.contexts);
  if(result.status !== 'pass')return {ok:false as const,code:repairCount?'WEEK_REPAIR_FAILED':'WEEK_COHERENCE_INVALID',result,repairCount};
  return {ok:true as const,sessions:finalRows,sessionEvidence:finalSources,result,initial,repairCount};
}

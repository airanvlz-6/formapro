import { canonicalDigest, executionIdentity } from './executionIntegrity';
import type { RunningExecutionEvidence } from './runningExecution';
import { resolveCompletionDate } from '../planning/recordCompletion';
import type { PrescriptionScope } from '../sports/prescriptionScope';

const row = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const text = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null;
const normalize = (v: unknown) => text(v)?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() ?? '';
type Metric = 'totalDurationSeconds' | 'workDurationSeconds' | 'distanceMeters' | 'paceSecondsPerKm' | 'averageHr' | 'maximumHr' | 'rpe';
type Fact = { value: number; sources: string[]; confidence: 'LEGACY_STRUCTURED_UNVERIFIED' | 'SERVER_VALIDATED_SELF_REPORT' };
export type HistoricalRun = {
  executionId: string; athlete: string; date: string; discipline: 'carrera';
  reference: string | null; identity: 'EXPLICIT' | 'DATE_ONLY';
  hint: 'easy' | 'long_run' | 'intervals' | 'quality' | null;
  methodId: string | null; metrics: Partial<Record<Metric, Fact>>; sensation: string | null;
  completion: 'FULL' | 'PARTIAL' | 'MODIFIED' | 'ABANDONED' | 'UNKNOWN';
  provenance: 'MODERN_STRUCTURED' | 'LEGACY_STRUCTURED'; sourceRecords: string[];
  diagnostics: string[]; countable: boolean;
};
const kinds: Record<string, HistoricalRun['hint']> = { carrera:null, running:null, run:null, z2:'easy', rodaje:'easy',
  'rodaje z2':'easy', 'carrera z2':'easy', 'rodaje suave':'easy', 'rodaje largo':'long_run', 'tirada larga':'long_run', long_run:'long_run', 'long run':'long_run',
  intervalos:'intervals', intervals:'intervals', series:'intervals', tempo:'quality', umbral:'quality' };
/** Only full-field unit-bearing quantities. Bare numbers require a dedicated explicit unit field. */
function quantity(raw: unknown, dimension: 'duration' | 'distance' | 'pace', explicitUnit?: unknown): number | null {
  const q = row(raw);
  let value: unknown = q.value ?? raw, unit: unknown = q.unit ?? explicitUnit;
  if (typeof raw === 'string') {
    const m = /^(\d+(?:[.,]\d+)?)\s*(s|sec|seconds|min|minutes|h|hours|m|meters|km|kilometers|s\/km|min\/km)$/.exec(raw.trim());
    const pace = dimension === 'pace' ? /^(\d+):([0-5]\d)\s*min\/km$/.exec(raw.trim()) : null;
    if (pace) return Number(pace[1]) * 60 + Number(pace[2]);
    if (!m) return null;
    value = Number(m[1].replace(',', '.')); unit = m[2];
  }
  const factors: Record<string, number> = dimension === 'duration' ? {s:1,sec:1,seconds:1,min:60,minutes:60,h:3600,hours:3600}
    : dimension === 'distance' ? {m:1,meters:1,km:1000,kilometers:1000} : {'s/km':1,'min/km':60};
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || typeof unit !== 'string' || !Object.hasOwn(factors, unit)) return null;
  const result = value * factors[unit]; return Number.isFinite(result) && result <= Number.MAX_SAFE_INTEGER ? result : null;
}
function legacyRun(raw: unknown, index: number, athlete: string, asOfDate: string): HistoricalRun | null {
  const r = row(raw), kind = normalize(r.tipo), explicitRunning = ['carrera','running','run'].includes(normalize(r.disciplina));
  if (text(r.disciplina) && !explicitRunning) return null;
  if (!explicitRunning && !Object.hasOwn(kinds, kind)) return null;
  const date = resolveCompletionDate(r.fecha)?.date;
  if (!date || date > asOfDate) return null;
  const reference = text(r.workout_id) ?? text(r.session_id);
  const source = `usuarios.workout_history.${index}`;
  const result: HistoricalRun = { executionId: canonicalDigest([athlete,'legacy',reference ? 'id' : 'date',reference ?? date]), athlete, date, discipline:'carrera',
    reference, identity:reference ? 'EXPLICIT' : 'DATE_ONLY', hint:Object.hasOwn(kinds,kind)?kinds[kind]:null, methodId:null, metrics:{},
    sensation:text(r.sensacion), completion:'UNKNOWN', provenance:'LEGACY_STRUCTURED', sourceRecords:[source],
    diagnostics:['LEGACY_WRITER_UNVERIFIED', ...(reference ? [] : ['IDENTITY_DATE_ONLY'])], countable:!!reference };
  const fields: [Metric,string[], 'duration' | 'distance' | 'pace' | 'hr' | 'rpe'][] = [
    ['totalDurationSeconds',['duracion_total','duracion'],'duration'], ['workDurationSeconds',['duracion_trabajo'],'duration'],
    ['distanceMeters',['distancia'],'distance'], ['paceSecondsPerKm',['ritmo'],'pace'],
    ['averageHr',['fc_media'],'hr'], ['maximumHr',['fc_maxima','fc_max'],'hr'], ['rpe',['rpe'],'rpe'] ];
  for (const [metric, aliases, dimension] of fields) {
    const facts = aliases.filter(k=>r[k] != null).map(k=>{
      const value = dimension === 'hr' || dimension === 'rpe' ? typeof r[k] === 'number' && Number.isFinite(r[k])
        && r[k] >= (dimension === 'hr' ? 1 : 0) && r[k] <= (dimension === 'hr' ? 250 : 10) ? r[k] : null
        : quantity(r[k],dimension,r[k+'_unidad']);
      return {value,source:source+'.'+k};
    });
    if (facts.some(f=>f.value === null)) result.diagnostics.push('INVALID_OR_UNITLESS_'+metric);
    const valid = facts.filter(f=>f.value !== null);
    if (new Set(valid.map(f=>f.value)).size > 1) { result.diagnostics.push('CONFLICT_'+metric); continue; }
    if (valid.length) result.metrics[metric] = {value:valid[0].value!,sources:valid.map(f=>f.source),confidence:'LEGACY_STRUCTURED_UNVERIFIED'};
  }
  if (result.metrics.workDurationSeconds && result.metrics.totalDurationSeconds && result.metrics.workDurationSeconds.value > result.metrics.totalDurationSeconds.value) {
    delete result.metrics.workDurationSeconds; delete result.metrics.totalDurationSeconds; result.diagnostics.push('CONFLICT_DURATION');
  }
  if (result.metrics.averageHr && result.metrics.maximumHr && result.metrics.averageHr.value > result.metrics.maximumHr.value) {
    delete result.metrics.averageHr; delete result.metrics.maximumHr; result.diagnostics.push('CONFLICT_HR');
  }
  // Existing mixed writers cannot attest complete execution, even if an arbitrary field says FULL.
  return result;
}
/** Read-only bridge; never returns RunningExecutionRecord or supplies B3 dose evidence. */
export function mergeRunningHistory(athlete: string, history: unknown, modern: RunningExecutionEvidence, asOfDate: string) {
  if (!athlete || resolveCompletionDate(asOfDate)?.date !== asOfDate || (history != null && !Array.isArray(history))) throw new Error('HISTORICAL_RUNNING_INPUT_INVALID');
  const diagnostics: string[] = [], records: HistoricalRun[] = [], legacy = (history ?? []).flatMap((r: unknown,i: number)=>{
    const projected=legacyRun(r,i,athlete,asOfDate);return projected ? [projected] : [];
  });
  const groups = new Map<string, HistoricalRun[]>();
  for(const r of legacy){const key=JSON.stringify([r.reference ? 'id' : 'date',r.reference ?? r.date]);groups.set(key,[...(groups.get(key)??[]),r]);}
  for(const group of groups.values()) {
    const first=structuredClone(group[0]);first.sourceRecords=group.flatMap(r=>r.sourceRecords);
    first.diagnostics=[...new Set(group.flatMap(r=>r.diagnostics))];
    if(new Set(group.map(r=>r.date)).size>1){first.countable=false;first.metrics={};first.diagnostics.push('IDENTITY_DATE_CONFLICT');}
    else {
      for(const metric of new Set(group.flatMap(r=>Object.keys(r.metrics))) as Set<Metric>){
        const facts=group.flatMap(r=>r.metrics[metric]?[r.metrics[metric]!]:[]);
        if(new Set(facts.map(f=>f.value)).size>1 || group.some(r=>r.diagnostics.includes('CONFLICT_'+metric)
          || ['totalDurationSeconds','workDurationSeconds'].includes(metric)&&r.diagnostics.includes('CONFLICT_DURATION')
          || ['averageHr','maximumHr'].includes(metric)&&r.diagnostics.includes('CONFLICT_HR'))){delete first.metrics[metric];first.diagnostics.push('CONFLICT_'+metric);}
        else first.metrics[metric]={...facts[0],sources:facts.flatMap(f=>f.sources)};
      }
      if(new Set(group.map(r=>r.hint).filter(Boolean)).size>1)first.hint=null;
      else first.hint=group.find(r=>r.hint)?.hint??null;
    }
    if(group.length>1)first.diagnostics.push(first.reference?'DUPLICATE_ID_RECONCILED':'AMBIGUOUS_SAME_DAY');
    if(first.metrics.totalDurationSeconds && first.metrics.workDurationSeconds && first.metrics.workDurationSeconds.value>first.metrics.totalDurationSeconds.value){
      delete first.metrics.totalDurationSeconds;delete first.metrics.workDurationSeconds;first.diagnostics.push('CONFLICT_DURATION');
    }
    if(first.metrics.averageHr && first.metrics.maximumHr && first.metrics.averageHr.value>first.metrics.maximumHr.value){
      delete first.metrics.averageHr;delete first.metrics.maximumHr;first.diagnostics.push('CONFLICT_HR');
    }
    records.push(first);
  }
  for(const m of modern.records.filter(r=>r.occurredAt<=asOfDate)){
    if(m.athleteScope !== canonicalDigest(athlete))throw new Error('HISTORICAL_RUNNING_ATHLETE_MISMATCH');
    const matches=records.filter(r=>r.provenance==='LEGACY_STRUCTURED' && r.reference && (()=>{
      try{return executionIdentity(athlete,'forge_manual',r.reference)===m.executionId || r.reference===m.planAssociation?.sessionId;}catch{return false;}
    })());
    // Same explicit identity with contradictory dates is not silently repaired.
    const dateConflict=matches.some(r=>r.date!==m.occurredAt || r.diagnostics.includes('IDENTITY_DATE_CONFLICT'));
    for(const r of matches)records.splice(records.indexOf(r),1);
    const source='running_execution_records.'+m.executionId;
    const metrics: HistoricalRun['metrics']={};
    for(const [target,key] of [['totalDurationSeconds','totalDurationSeconds'],['workDurationSeconds','mainWorkDurationSeconds'],['distanceMeters','totalDistanceMeters']] as const)
      if(m.quantities[key]!==undefined)metrics[target]={value:m.quantities[key]!,sources:[source+'.quantities.'+key],confidence:'SERVER_VALIDATED_SELF_REPORT'};
    if(m.intensityObservation)metrics.rpe={value:m.intensityObservation.value,sources:[source+'.intensityObservation'],confidence:'SERVER_VALIDATED_SELF_REPORT'};
    records.push({executionId:m.executionId!,athlete,date:m.occurredAt,discipline:'carrera',reference:m.planAssociation?.sessionId??null,identity:'EXPLICIT',
      hint:['running_threshold','running_vo2','running_specific'].includes(m.executionIdentity.methodId??'')?'quality':null,methodId:m.executionIdentity.methodId??null,
      metrics:dateConflict?{}:metrics,sensation:null,completion:m.completeness,provenance:'MODERN_STRUCTURED',sourceRecords:[source,...matches.flatMap(r=>r.sourceRecords)],
      diagnostics:dateConflict?['IDENTITY_DATE_CONFLICT']:matches.length?['MODERN_SUPERSEDES_LEGACY']:[],countable:!dateConflict});
  }
  // A conflicted modern identity must not regain credibility through its legacy counterpart.
  for(const r of records)if(r.reference){try{if(modern.conflicts.includes(executionIdentity(athlete,'forge_manual',r.reference)!)){r.countable=false;r.metrics={};r.diagnostics.push('MODERN_IDENTITY_CONFLICT');}}catch{/* legacy IDs need not satisfy modern writer grammar */}}
  for(const r of records.filter(r=>r.identity==='DATE_ONLY')){
    r.countable=!records.some(other=>other!==r&&other.date===r.date);
    if(!r.countable)r.diagnostics.push('POSSIBLE_OVERLAP_EXCLUDED_FROM_TOTALS');
  }
  if(modern.conflicts.length)diagnostics.push('MODERN_CONFLICTS_PRESENT');
  records.sort((a,b)=>a.date.localeCompare(b.date)||a.executionId.localeCompare(b.executionId));
  const summarize=(startDate:string)=>{
    const rows=records.filter(r=>r.date>=startDate&&r.date<=asOfDate), counted=rows.filter(r=>r.countable);
    const sum=(field:Metric)=>{const facts=counted.flatMap(r=>r.metrics[field]?[r.metrics[field]!]:[]);
      return {value:facts.length?facts.reduce((n,f)=>n+f.value,0):null,knownExecutions:facts.length,status:!facts.length?'UNKNOWN':facts.length===rows.length&&rows.every(r=>r.identity==='EXPLICIT'&&!r.diagnostics.some(d=>d.startsWith('CONFLICT')))?'AVAILABLE':'PARTIAL'};};
    const longest=(field:Metric)=>{const known=counted.filter(r=>r.metrics[field]);const best=known.sort((a,b)=>b.metrics[field]!.value-a.metrics[field]!.value)[0];
      return best?{value:best.metrics[field]!.value,date:best.date,executionId:best.executionId}:null;};
    return {startDate,endDate:asOfDate,executedSessions:counted.length,countInterpretation:'MINIMUM_IDENTIFIED_OR_DISTINCT_DAY_EXPOSURES',
      duration:sum('totalDurationSeconds'),distance:sum('distanceMeters'),longestDuration:longest('totalDurationSeconds'),longestDistance:longest('distanceMeters'),
      lastLongRunDate:counted.filter(r=>r.hint==='long_run').at(-1)?.date??null,
      qualityExposure:counted.filter(r=>['quality','intervals'].includes(r.hint??'')).map(r=>({executionId:r.executionId,date:r.date,provenance:r.provenance,hint:r.hint})),
      completionCounts:Object.fromEntries(['FULL','PARTIAL','MODIFIED','ABANDONED','UNKNOWN'].map(s=>[s,counted.filter(r=>r.completion===s).length])),
      excludedAmbiguousExecutions:rows.length-counted.length,captureCompleteness:'UNKNOWN',authority:'REPORTED_EVIDENCE_NOT_MEASURED',
      reconciliationStatus:modern.conflicts.length?'CONFLICT':rows.some(r=>!r.countable||r.identity==='DATE_ONLY')?'PARTIAL':'RESOLVED'};
  };
  const body={version:1 as const,policy:'historical_running_read_v1',athlete,asOfDate,records,diagnostics,
    coverage:{firstDate:records[0]?.date??null,lastDate:records.at(-1)?.date??null,captureCompleteness:'UNKNOWN',modernReadLimit:1000,legacy:'ALL_PERSISTED_ROWS',
      legacyInputRows:(history??[]).length,legacyAdmittedRows:legacy.length,modernConflicts:[...modern.conflicts],modernAmbiguousCount:modern.ambiguousCount},
    summaries:{all:summarize(records[0]?.date??asOfDate),...Object.fromEntries([7,28].map(days=>[String(days),summarize(new Date(Date.parse(asOfDate)-(days-1)*86400000).toISOString().slice(0,10))]))}};
  return {...body,digest:canonicalDigest(body)};
}
export type RunningHistory = ReturnType<typeof mergeRunningHistory>;
export function scopeRunningHistory(history: RunningHistory, scope: PrescriptionScope) {
  return {history,managedProgressionEvidence:scope.prescriptionAllowed&&scope.managedDisciplines.includes('carrera'),
    use:scope.prescriptionAllowed&&scope.managedDisciplines.includes('carrera')?'MANAGED_HISTORY':'READ_ONLY_CONTEXT',numericalProgressionAuthorized:false};
}

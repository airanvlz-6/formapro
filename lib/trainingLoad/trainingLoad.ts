/** Multidimensional accounting of admitted facts, not fatigue, readiness or a universal score. */
export type Quantity = { status: 'complete' | 'partial' | 'unknown' | 'not_applicable'; minimum: number | null;
  maximum: number | null; unit: string; sources: string[] };
export type LoadVector = Record<'durationSeconds' | 'workSeconds' | 'recoverySeconds' | 'distanceMeters' | 'repetitions' | 'externalVolumeKg' | 'sessionRpeMinutes', Quantity>;
export type SegmentInput = { id: string; movementId: string | null; pattern: string | null; source: string;
  sets?: number; reps?: number; kg?: { minimum: number; maximum: number }; durationSeconds?: number; distanceMeters?: number;
  restSeconds?: number; perSide?: boolean; multiplier: number | null; externalLoadApplicable: boolean;
  intensity?: unknown; categories?: Record<string, string>; formatContext?: unknown; };
export type SegmentLoad = { input: SegmentInput; vector: LoadVector };
export type LoadSessionInput = { id: string; date: string; kind: 'planned' | 'actual'; discipline: string | null;
  source: string; segments: SegmentInput[]; duration?: Quantity; sessionRpe?: number;
  executionStatus: string; adaptationId?: string | null; weaknessId?: string | null; methodId?: string | null;
  structureId?: string | null; stimulusId?: string | null; diagnostics?: string[] };
export type SessionLoad = Omit<LoadSessionInput, 'segments' | 'duration' | 'sessionRpe'> & { schemaVersion: 1;
  segments: SegmentLoad[]; vector: LoadVector; status: 'complete' | 'partial' | 'unknown'; diagnostics: string[] };
const units: Record<keyof LoadVector, string> = { durationSeconds: 's', workSeconds: 's', recoverySeconds: 's', distanceMeters: 'm', repetitions: 'reps', externalVolumeKg: 'kg', sessionRpeMinutes: 'min_RPE' };
export const unknownQuantity = (unit: string): Quantity => ({ status: 'unknown', minimum: null, maximum: null, unit, sources: [] });
export const notApplicable = (unit: string): Quantity => ({ ...unknownQuantity(unit), status: 'not_applicable' });
export function quantity(value: number, unit: string, source: string, maximum = value): Quantity {
  if (![value, maximum].every(Number.isFinite) || value < 0 || maximum < value) throw new Error('TRAINING_LOAD_INVALID_QUANTITY');
  return { status: 'complete', minimum: value, maximum, unit, sources: [source] };
}
export function sumQuantities(values: Quantity[], unit: string): Quantity {
  if (!values.length) return unknownQuantity(unit);
  if (values.some(v => v.unit !== unit)) throw new Error('TRAINING_LOAD_UNIT_MISMATCH');
  if(values.some(v=>!['complete','partial','unknown','not_applicable'].includes(v.status)||!Array.isArray(v.sources)
    ||[v.minimum,v.maximum].some(n=>n!==null&&(!Number.isFinite(n)||n<0))
    ||v.minimum!==null&&v.maximum!==null&&v.maximum<v.minimum
    ||v.status==='complete'&&(v.minimum===null||v.maximum===null)
    ||['unknown','not_applicable'].includes(v.status)&&(v.minimum!==null||v.maximum!==null)))throw new Error('TRAINING_LOAD_INVALID_QUANTITY');
  const applicable = values.filter(v => v.status !== 'not_applicable');
  if (!applicable.length) return notApplicable(unit);
  const known = applicable.filter(v => v.minimum !== null);
  if (!known.length) return unknownQuantity(unit);
  const complete = applicable.every(v => v.status === 'complete' && v.maximum !== null);
  return { status: complete ? 'complete' : 'partial', minimum: known.reduce((s,v) => s + v.minimum!, 0),
    maximum: applicable.every(v=>v.maximum!==null) ? known.reduce((s,v) => s + v.maximum!, 0) : null, unit,
    sources: [...new Set(known.flatMap(v => v.sources))] };
}
const emptyVector = (): LoadVector => Object.fromEntries(Object.entries(units).map(([k,u]) => [k, unknownQuantity(u)])) as LoadVector;
export function aggregateVectors(vectors: LoadVector[]): LoadVector {
  return Object.fromEntries(Object.entries(units).map(([k,u]) => [k, sumQuantities(vectors.map(v => v[k as keyof LoadVector]), u)])) as LoadVector;
}
export function resolveSegmentLoad(input: SegmentInput): SegmentLoad {
  for (const key of ['sets','reps','durationSeconds','distanceMeters','restSeconds'] as const) if (input[key] !== undefined
    && (!Number.isFinite(input[key]) || input[key]! < 0 || ['sets','reps'].includes(key) && !Number.isSafeInteger(input[key]))) throw new Error('TRAINING_LOAD_INVALID_DOSE');
  if (input.multiplier !== null && (!Number.isSafeInteger(input.multiplier) || input.multiplier < 0)) throw new Error('TRAINING_LOAD_INVALID_MULTIPLIER');
  if (input.kg && (![input.kg.minimum,input.kg.maximum].every(Number.isFinite) || input.kg.minimum < 0 || input.kg.maximum < input.kg.minimum)) throw new Error('TRAINING_LOAD_INVALID_KG');
  const v = emptyVector(), q = (n: number, unit: string, max=n) => quantity(n,unit,input.source,max);
  const n = input.sets === undefined || input.multiplier === null ? null : input.sets * input.multiplier;
  if (n !== null) {
    if (input.reps !== undefined) v.repetitions=q(n*input.reps*(input.perSide?2:1),'reps');
    if (input.durationSeconds !== undefined) v.workSeconds=q(n*input.durationSeconds,'s');
    if (input.distanceMeters !== undefined) v.distanceMeters=q(n*input.distanceMeters,'m');
    if (input.restSeconds !== undefined) v.recoverySeconds=q(Math.max(0,input.sets!-1)*input.restSeconds*input.multiplier!,'s');
    if (v.workSeconds.status === 'complete' && v.recoverySeconds.status === 'complete') v.durationSeconds=sumQuantities([v.workSeconds,v.recoverySeconds],'s');
  }
  if (!input.externalLoadApplicable && !input.kg) v.externalVolumeKg=notApplicable('kg');
  else if (input.kg && v.repetitions.status === 'complete') v.externalVolumeKg=q(v.repetitions.minimum!*input.kg.minimum,'kg',v.repetitions.maximum!*input.kg.maximum);
  return { input, vector:v };
}
export function resolveSessionLoad(input: LoadSessionInput): SessionLoad {
  const segments=input.segments.map(resolveSegmentLoad), vector=aggregateVectors(segments.map(s=>s.vector));
  if (input.duration) {sumQuantities([input.duration],'s');vector.durationSeconds=input.duration;}
  if (input.kind==='actual' && input.sessionRpe !== undefined && Number.isFinite(input.sessionRpe) && input.sessionRpe>=1 && input.sessionRpe<=10
    && vector.durationSeconds.status==='complete' && vector.durationSeconds.minimum===vector.durationSeconds.maximum)
    vector.sessionRpeMinutes=quantity(vector.durationSeconds.minimum!/60*input.sessionRpe,'min_RPE',input.source);
  const relevant=Object.values(vector).filter(v=>v.status!=='not_applicable');
  const status = relevant.every(v=>v.status==='unknown') ? 'unknown' : relevant.every(v=>v.status==='complete') ? 'complete' : 'partial';
  const { duration: _duration, sessionRpe:_rpe, ...rest }=input;
  return { ...rest,schemaVersion:1,segments,vector,status,diagnostics:[...(input.diagnostics||[]),status==='unknown'?'TRAINING_LOAD_UNKNOWN':status==='partial'?'TRAINING_LOAD_PARTIAL':'TRAINING_LOAD_RESOLUTION'] };
}
export function plannedActualDelta(planned: SessionLoad, actual: SessionLoad) {
  if (planned.kind!=='planned'||actual.kind!=='actual') throw new Error('TRAINING_LOAD_KIND_MISMATCH');
  return { code:'PLANNED_ACTUAL_LOAD_DELTA', plannedId:planned.id,actualId:actual.id,
    dimensions:Object.fromEntries(Object.keys(units).map(key=>{
      const p=planned.vector[key as keyof LoadVector],a=actual.vector[key as keyof LoadVector];
      const comparable=p.status==='complete'&&a.status==='complete'&&p.unit===a.unit;
      return [key,{comparable,unit:p.unit,minimum:comparable?a.minimum!-p.maximum!:null,maximum:comparable?a.maximum!-p.minimum!:null}];
    })) };
}
/** Groups retain all contributing sessions. No assumption that one date means one session. */
export function aggregateLoadSessions(sessions: SessionLoad[]) {
  if (new Set(sessions.map(s=>`${s.kind}:${s.id}`)).size!==sessions.length) throw new Error('TRAINING_LOAD_DUPLICATE_ID');
  const group=(rows:SessionLoad[],key:(s:SessionLoad)=>string)=>Object.fromEntries([...new Set(rows.map(key))].sort().map(k=>{
    const members=rows.filter(s=>key(s)===k);return [k,{sessionIds:members.map(s=>s.id),vector:aggregateVectors(members.map(s=>s.vector))}];
  }));
  return Object.fromEntries((['planned','actual'] as const).map(kind=>{
    const rows=sessions.filter(s=>s.kind===kind);
    return [kind,{sessionCount:rows.length,vector:aggregateVectors(rows.map(s=>s.vector)),byDate:group(rows,s=>s.date),
      byDiscipline:group(rows,s=>s.discipline||'unknown'),byAdaptation:group(rows,s=>s.adaptationId||'unattributed'),
      byWeakness:group(rows,s=>s.weaknessId||'unattributed'),byMethod:group(rows,s=>s.methodId||'unknown'),
      byCategory:Object.fromEntries([...new Set(rows.flatMap(s=>s.segments.flatMap(e=>Object.entries(e.input.categories||{}).map(([k,v])=>`${k}:${v}`))))].sort().map(category=>{
        const matches=rows.flatMap(s=>s.segments.filter(e=>Object.entries(e.input.categories||{}).some(([k,v])=>`${k}:${v}`===category)).map(e=>({sessionId:s.id,segment:e})));
        return [category,{sessions:new Set(matches.map(m=>m.sessionId)).size,segments:matches.length,vector:aggregateVectors(matches.map(m=>m.segment.vector))}];
      })),
      byPattern:Object.fromEntries([...new Set(rows.flatMap(s=>s.segments.map(e=>e.input.pattern).filter(Boolean)))].sort().map(pattern=>
        [pattern,{vector:aggregateVectors(rows.flatMap(s=>s.segments.filter(e=>e.input.pattern===pattern).map(e=>e.vector)))}]))}];
  }));
}

/** Explicit temporal grouping only; labels never identify a block/cycle instance. No persistence. */
export function aggregateLoadWindow(sessions:SessionLoad[],window:{fromDate:string;toDate:string;level:'week'|'block'|'cycle';instanceId?:string}){
  const validDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
  if(!validDate(window.fromDate)||!validDate(window.toDate)||window.fromDate>window.toDate)
    throw new Error('TRAINING_LOAD_INVALID_WINDOW');
  return {schemaVersion:1,window,identityStatus:window.level==='week'||window.instanceId?'explicit':'temporal_only_identity_unknown',persisted:false,
    load:aggregateLoadSessions(sessions.filter(s=>s.date>=window.fromDate&&s.date<=window.toDate))};
}

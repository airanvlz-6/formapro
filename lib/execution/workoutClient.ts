import type { WorkoutData, WorkoutRecord } from './workoutContracts';

export type PendingWorkout = {method:'POST'|'PUT'|'DELETE'; body: {
  requestId:string; confirmed:true; executionId?:string; expectedRevision?:number; workout?:WorkoutData;
}};
export class WorkoutClientError extends Error {
  constructor(public code:string, public uncertain=false) { super(code); }
}
const dataFields = ['executedOn','discipline','title','description','result','durationSeconds','distanceMeters',
  'averageHeartRateBpm','maximumHeartRateBpm','rpe','loadKg','sensations','observations','discomfort','prescription','libraryWorkoutId','running'];
export function workoutDataFromHistory(row:Record<string,any>): WorkoutData {
  return Object.fromEntries(dataFields.filter(k=>row[k]!==undefined).map(k=>[k,row[k]])) as WorkoutData;
}
const activeEnvelopes = new Map<string,PendingWorkout>();

/** Client transport only. The backend owns identity, validation and all persistence decisions.
 * Only a request token is kept in session storage, never workout data. The frozen
 * form envelope lives in memory; after navigation the backend recovers any receipt. */
export function workoutClient(athlete:string, executionId:string|undefined, storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,
  transport:typeof fetch, newId:()=>string) {
  const key=`forge.workout.pending.v2:${encodeURIComponent(athlete)}:${executionId ?? 'create'}`;
  const pending=():PendingWorkout|null=>activeEnvelopes.get(key) ?? null;
  const clear=()=>{storage.removeItem(key);activeEnvelopes.delete(key);};
  const recover=async():Promise<WorkoutRecord|null>=>{
    const requestId=storage.getItem(key);if(!requestId)return null;
    const response=await transport(`/api/workouts?requestId=${encodeURIComponent(requestId)}`,{cache:'no-store'});
    const body=await response.json();
    if(!response.ok)throw new WorkoutClientError('WORKOUT_READ_FAILED');
    if(body.record){if(body.record.version!==2 || executionId&&body.record.executionId!==executionId)throw new WorkoutClientError('WORKOUT_READ_FAILED');clear();return body.record;}
    return null;
  };
  return {
    pending,recover,
    async read() {
      const response=await transport(`/api/workouts?executionId=${encodeURIComponent(executionId!)}`,{cache:'no-store'});
      const body=await response.json();
      if(!response.ok)throw new WorkoutClientError(body.code ?? 'WORKOUT_READ_FAILED');
      const row=body.records?.find((r:any)=>r.executionId===executionId && r.source==='running_execution_records.v2');
      if(!row)throw new WorkoutClientError('WORKOUT_NOT_FOUND');
      return {executionId:row.executionId as string,revision:row.revision as number,data:workoutDataFromHistory(row)};
    },
    async submit(method:PendingWorkout['method'],workout?:WorkoutData,revision?:number) {
      let attempt=pending();
      if(!attempt){
        attempt={method,body:{requestId:storage.getItem(key) ?? newId(),confirmed:true,
          ...(executionId ? {executionId,expectedRevision:revision} : {}),...(workout ? {workout} : {})}};
        storage.setItem(key,attempt.body.requestId);
        activeEnvelopes.set(key,JSON.parse(JSON.stringify(attempt)));
        attempt=pending()!;
      }
      let response:Response, body:any;
      try {response=await transport('/api/workouts',{method:attempt.method,headers:{'Content-Type':'application/json'},body:JSON.stringify(attempt.body)});body=await response.json();}
      catch {throw new WorkoutClientError('WORKOUT_WRITE_UNCONFIRMED',true);}
      if(!response.ok){
        // An expired session on retry says nothing about whether the earlier request committed.
        const uncertain=response.status>=500 || response.status===401 || response.status===403 || response.status===408 || response.status===429 || body.code==='WORKOUT_REQUEST_CONFLICT';
        if(!uncertain)clear();
        throw new WorkoutClientError(body.code ?? 'WORKOUT_WRITE_FAILED',uncertain);
      }
      if(body.ok!==true || !['committed','already_applied'].includes(body.status) || body.record?.version!==2
        || !body.record.executionId || !Number.isSafeInteger(body.record.revision)
        || executionId && body.record.executionId!==executionId)throw new WorkoutClientError('WORKOUT_WRITE_UNCONFIRMED',true);
      clear();
      return body.record as WorkoutRecord;
    },
  };
}

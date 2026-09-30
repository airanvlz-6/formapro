import { validateRunningExecution } from './runningExecution';
import { ExecutionError, object, keys } from './executionIntegrity';
import type { WorkoutData } from './workoutContracts';

/** Domain extension only. Unknown specialties remain valid without a structured adapter. */
export function validateWorkoutExtensions(data: WorkoutData, athlete: string, today: string, executionId: string) {
  if (data.running === undefined) return {};
  if (data.discipline !== 'carrera') throw new ExecutionError('WORKOUT_EXTENSION_DISCIPLINE_INVALID');
  const input = object(data.running); keys(input, ['method','quantities','structure','completeness','intensityObservation']);
  const structuredRunning = validateRunningExecution({...input,sourceActivityId:executionId,occurredAt:data.executedOn,
    ...(data.prescription ? {planSessionId:data.prescription.sessionId} : {})},athlete,today);
  structuredRunning.executionId = executionId;
  for (const [field,value] of Object.entries({durationSeconds:structuredRunning.quantities.totalDurationSeconds,
    distanceMeters:structuredRunning.quantities.totalDistanceMeters,rpe:structuredRunning.intensityObservation?.value})) {
    const declared = data[field as keyof WorkoutData];
    if (declared !== undefined && value !== undefined && declared !== value) throw new ExecutionError('WORKOUT_EXTENSION_METRIC_CONFLICT');
  }
  return {structuredRunning};
}

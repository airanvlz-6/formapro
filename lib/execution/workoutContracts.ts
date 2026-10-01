import type { RunningExecutionRecord } from './runningExecution';
export type WorkoutData = {
  executedOn: string; discipline: string; title: string; description: string; result?: string;
  durationSeconds?: number; distanceMeters?: number; averageHeartRateBpm?: number; maximumHeartRateBpm?: number;
  rpe?: number; loadKg?: number; sensations?: string; observations?: string; discomfort?: string;
  prescription?: { planId: string; sessionId: string; relation: 'performed' | 'replaced' };
  libraryWorkoutId?: string;
  /** Original structured input, revalidated on every correction. Never a client-supplied sealed record. */
  running?: Record<string, unknown>;
};
export type WorkoutRecord = {
  version: 2; executionId: string; athleteScope: string; revision: number;
  requestId: string; requestDigest: string; operation: 'create' | 'update' | 'delete';
  createdAt: string; updatedAt: string; deletedAt: string | null;
  source: 'confirmed_workout'; verification: 'SERVER_VALIDATED_SELF_REPORT';
  prescriptionReferences: {planId:string; sessionId:string}[];
  data: WorkoutData; structuredRunning?: RunningExecutionRecord;
};
export type WorkoutRow = { record: WorkoutRecord; signature: string; content_digest: string };
export interface WorkoutDatabase {
  from(table: string): any;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: any; error: any }>;
}
export type WorkoutRequest = { requestId: string; confirmed: true; workout: WorkoutData };
export type UpdateWorkoutRequest = WorkoutRequest & { executionId: string; expectedRevision: number };
export type DeleteWorkoutRequest = { requestId: string; confirmed: true; executionId: string; expectedRevision: number };

import type { RunningExecutionEvidence, RunningExecutionRecord } from '../execution/runningExecution';
import type { StrategicIntent } from './goalTransferModel';
import { RUNNING_METHOD_DOSE_POLICIES } from './runningMethodDosePolicies';

export function compatibleRunningExecutions(evidence: RunningExecutionEvidence | undefined, intent: StrategicIntent) {
  const family = RUNNING_METHOD_DOSE_POLICIES.find(p => p.methodId === intent.methodId)?.family;
  const variant = family === 'EVENT_SPECIFIC' ? `${intent.goalId}:${intent.pattern}` : family === 'TECHNICAL_EXPOSURE' ? intent.pattern : intent.methodId;
  const records = (evidence?.records ?? []).filter(r => r.executionIdentity.status === 'EXPLICIT_SELF_REPORTED'
    && r.executionIdentity.methodId === intent.methodId && r.executionIdentity.variant === variant && r.executionIdentity.pattern === intent.pattern);
  const projected = records.map(r => {
    const missing: string[] = [];
    if (family === 'RECOVERY' || family === 'AEROBIC_CONTINUOUS') {
      if (r.quantities.totalDurationSeconds === undefined && r.quantities.totalDistanceMeters === undefined) missing.push('TOTAL_QUANTITY_UNKNOWN');
    } else if (family === 'TECHNICAL_EXPOSURE') {
      if (!r.structure?.bouts.length || r.structure.bouts.some(b => b.durationSeconds === undefined && b.distanceMeters === undefined && b.repetitions === undefined)) missing.push('TECHNICAL_BOUT_QUANTITY_UNKNOWN');
    } else if (r.quantities.mainWorkDurationSeconds === undefined && r.quantities.mainWorkDistanceMeters === undefined) missing.push('MAIN_WORK_UNKNOWN');
    if (family !== 'RECOVERY' && family !== 'AEROBIC_CONTINUOUS') {
      if (!r.structure) missing.push('STRUCTURE_UNKNOWN');
      if (r.structure && r.structure.mode !== 'continuous') {
        if (!r.structure.bouts.length || r.structure.bouts.some(b => b.durationSeconds === undefined && b.distanceMeters === undefined && b.repetitions === undefined)) missing.push('BOUT_QUANTITY_UNKNOWN');
        const between = r.structure.bouts.slice(0,-1);
        if (between.some(b => !r.structure!.recoveries?.some(q => q.afterBout === b.boutIndex && (q.durationSeconds !== undefined || q.distanceMeters !== undefined)))) missing.push('RECOVERY_UNKNOWN');
      }
    }
    if (r.completeness !== 'FULL') missing.push('INCOMPLETE_OR_MODIFIED_EXECUTION');
    return {executionId: r.executionId!, date:r.occurredAt, provenance:r.provenance, verification:r.verification,
      executionIdentity:structuredClone(r.executionIdentity), quantities:structuredClone(r.quantities),
      ...(r.structure ? {structure:structuredClone(r.structure)} : {}),
      ...(r.intensityObservation ? {intensityObservation:structuredClone(r.intensityObservation)} : {}),
      completeness:r.completeness, missing};
  });
  return { status: evidence?.conflicts.length ? 'CONFLICT' as const : !records.length ? 'UNKNOWN' as const
      : projected.some(r => !r.missing.length) ? 'AVAILABLE' as const : 'PARTIAL' as const,
    // Admission of self-report is not measurement or proof of physiological method execution.
    authority: 'STRUCTURED_SELF_REPORTED' as const, records: projected,
    integrityStatus: evidence?.conflicts.length ? 'CONFLICT' : !evidence || evidence.writerStatus === 'WRITER_UNAVAILABLE' ? 'WRITER_UNAVAILABLE'
      : !records.length ? (evidence.records.some(r => r.executionIdentity.status === 'UNKNOWN') ? 'IDENTITY_UNKNOWN' : 'NO_COMPATIBLE_EXECUTION')
      : records.some(r => r.completeness !== 'FULL') ? 'INCOMPLETE_EXECUTION' : 'SERVER_VALIDATED_SELF_REPORT',
    missing: [...new Set(projected.flatMap(r => r.missing))].sort() };
}

/** Descriptive totals only; explicitly self-reported, never mixed into legacy OBSERVED metrics. */
export function selfReportedExecutionTotals(records: readonly RunningExecutionRecord[], startDate: string, endDate: string) {
  const rows = records.filter(r => r.occurredAt >= startDate && r.occurredAt <= endDate);
  const sum = (field: 'totalDurationSeconds' | 'totalDistanceMeters') => {
    const values = rows.flatMap(r => r.quantities[field] === undefined ? [] : [r.quantities[field]!]);
    return {value:values.length ? values.reduce((a,b) => a+b,0) : null, knownActivities:values.length,
      status:!values.length ? 'UNKNOWN' : values.length === rows.length ? 'AVAILABLE' : 'PARTIAL'};
  };
  return {authority:'STRUCTURED_SELF_REPORTED' as const, startDate,endDate, duration:sum('totalDurationSeconds'),distance:sum('totalDistanceMeters'), captureCompleteness:'UNKNOWN' as const};
}

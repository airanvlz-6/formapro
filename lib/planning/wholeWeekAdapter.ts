import { MOVEMENT_LIBRARY } from '../sports/movementLibrary';
import { WORKOUT_STRUCTURE_LIBRARY } from '../sports/workoutStructureLibrary';
import { transferMethod } from '../sports/goalTransferModel';
import { buildStructuredExposureReport } from '../sports/exposureEngine';
import { plannedPrescriptionLoad, externalActualLoad } from '../trainingLoad/prescriptionLoadAdapter';
import { calendarKey, calendarState, calendarDays } from './weeklyCalendar';
import { validateWholeWeek, type WeekSessionFacts, type WholeWeekInput } from './wholeWeekValidation';
import { estimateSessionDuration } from '../sports/sessionDose';
import { timeAuthorityForIntent } from '../sports/sessionTimeDosePolicy';
import { validateSessionTimeDose, sameSessionTimeDoseAuthority } from '../sports/sessionTimeDoseAuthority';
import type { AllowedTrainingContract } from '../sports/allowedTrainingContract';

/** Domain metadata lives here. The validator has no specialty branches or catalog taxonomy. */
export function wholeWeekInput(week: string, rows: readonly any[], evidence: any, contexts: Record<string, any> = {}): WholeWeekInput {
  const strategy = evidence.strategy || null;
  const sessions: WeekSessionFacts[] = rows.map((row, index) => {
    const day = calendarKey(row.dia), slot = evidence.admittedSlots.find((s: any) => s.day === day);
    if (!slot || !calendarDays.includes(day)) throw new Error('WEEK_SLOT_MISSING');
    const date = new Date(Date.parse(week) + calendarDays.indexOf(day) * 86400000).toISOString().slice(0,10);
    const stored = row.structuredPrescription, proposal = stored?.proposal;
    const structured = stored?.schemaVersion === 2 && proposal?.schemaVersion === 2 && Array.isArray(proposal.blocks);
    const main = structured ? proposal.blocks.filter((b: any) => b.blockType === 'main').flatMap((b: any) => b.movements) : [];
    const intent = stored?.objective?.intent, method = intent?.kind === 'adaptation' ? transferMethod(intent.methodId) : undefined;
    // Recompute from admitted facts, never trust the stored duration estimate.
    let adaptationDoseSatisfied: boolean | undefined;
    if (structured && stored.timeAuthority?.policyId) {
      const temporal = timeAuthorityForIntent(stored.timeBudget, intent);
      const same = sameSessionTimeDoseAuthority(temporal, stored.timeAuthority);
      const estimate = estimateSessionDuration({ doseContext: { references: stored.references || [], timeAuthority: temporal } } as AllowedTrainingContract, proposal);
      adaptationDoseSatisfied = same && validateSessionTimeDose(temporal, { ...estimate, expectedSeconds: estimate.expectedSeconds ?? null }).length === 0;
    }
    const adaptation = strategy?.adaptations.find((a: any) => a.id === intent?.adaptationId);
    const movements: string[] = main.map((m: any) => m.movementId);
    const metadata = movements.map(id => MOVEMENT_LIBRARY[id]);
    const patterns = [...new Set(metadata.filter(Boolean).map(m => m.movement_pattern))];
    const structure = WORKOUT_STRUCTURE_LIBRARY[proposal?.structureId];
    const demanding: string[] = [];
    // Existing scientific rule 003 used RPE 8/9; blueprint used >=85%. Keep these as review categories only.
    for (const m of main) {
      const i = m.prescription.intensity;
      if (i?.kind === 'rpe' && (i.max ?? i.value) >= 8) demanding.push('high_prescribed_rpe');
      if (i?.kind === 'percent_1rm' && (i.max ?? i.value) >= 85) demanding.push('high_relative_strength');
    }
    if (structure?.stimulus_type === 'anaerobic') demanding.push('anaerobic_structure');
    const state = calendarState(row), role = stored?.sessionRole || (intent?.kind === 'adaptation' ? intent.role : null);
    const intensity = main.map((m: any) => ({ movementId:m.movementId, intensity:m.prescription.intensity || null,
      reference: stored.references?.filter((r: any) => r.id === m.prescription.intensity?.referenceId).map((r:any)=>({id:r.id,value:r.value,unit:r.unit,movementId:r.movementId})) || [] }));
    const load = ['TRAIN','RECOVERY'].includes(state) ? plannedPrescriptionLoad(row,date,`${day}:${index}`) : null;
    return { id:`${day}:${index}`,date,discipline:row.tipo || null,state,protected:!!slot.protected,structured,
      ...(adaptationDoseSatisfied !== undefined ? { adaptationDoseSatisfied } : {}),
      adaptationId:intent?.kind === 'adaptation' ? intent.adaptationId : null,methodId:method?.id || null,weaknessId:intent?.weaknessId || null,role,
      structure:proposal?.structureId || null,stimulus:proposal?.stimulusId || null,movements,patterns,
      dose:structured ? proposal.blocks.map((b: any)=>({blockType:b.blockType,formatDose:b.formatDose || null,movements:b.movements})) : null,intensity,
      impact:metadata.some(m => m?.impact === 'alto') ? 'high' : metadata.length && metadata.every(m => m && m.impact) ? 'not_high' : 'unknown',
      demanding:[...new Set(demanding)],
      contributionValid:!!(method && adaptation && intent.role === adaptation.role && method.stimulusId === proposal?.stimulusId
        && method.discipline === row.tipo && strategy.methods.includes(method.id) && intent.goalId === strategy.goal.id
        && patterns.includes(intent.pattern) && (strategy.weeklyDecisionAuthority === 'coach' || !adaptation.requiredPattern || patterns.includes(adaptation.requiredPattern))),
      recoveryContradiction:(state === 'RECOVERY' || role === 'RECOVERY') && (demanding.length > 0 || !['aerobic','skill'].includes(structure?.stimulus_type)),load };
  });
  const exposure = buildStructuredExposureReport(sessions.filter(s => s.structured).flatMap(s =>
    s.load?.segments.filter(e => e.input.movementId && (e.input.formatContext as any)?.blockType === 'main').map(e => ({sessionId:s.id,movementId:e.input.movementId!,
      repetitions:e.vector.repetitions.status === 'complete' ? e.vector.repetitions.minimum : null})) || []));
  // Context snapshots may repeat the same external rows across disciplines; never sum snapshots.
  const external = Object.entries(contexts).map(([discipline, context]) => ({discipline,
    sessions:(context.externalLoadContext?.records || []).filter((r:any)=>r.fecha >= week && r.fecha <= new Date(Date.parse(week)+6*86400000).toISOString().slice(0,10))
      .map((r:any,index:number)=>externalActualLoad(r,`context:${discipline}:${index}`)), combinedStatus:'unknown_cross_source_overlap',combined:null }));
  return {sessions,strategy:strategy ? {weeklyDecisionAuthority:strategy.weeklyDecisionAuthority,goal:strategy.goal.id,adaptations:strategy.adaptations,required:strategy.coverage,deferred:strategy.deferred} : null,exposure,external,
    // Qualitative review relation over existing patterns, not a dose threshold or a new pattern taxonomy.
    interferenceRules:[{id:'demanding-support-before-primary-locomotion-v1',sourcePatterns:['squat','hinge','lunge','olympic_lift'],targetPatterns:['run','jump','locomotion']}],
    contextLimitations:['EXTERNAL_SNAPSHOTS_NOT_SUMMED','EXTERNAL_PATTERNS_UNKNOWN','RECENT_EXECUTION_STRUCTURE_UNAVAILABLE',
      'NO_RELIABLE_PREVIOUS_WEEK_EXECUTED_DOSE','NO_WEEKLY_TIME_CAP','NO_WITHIN_DAY_ORDER_AUTHORITY','NO_SIGNED_EXACT_REPETITION_POLICY']};
}
export const validateAdmittedWholeWeek = (week:string,rows:readonly any[],evidence:any,contexts:Record<string,any> = {}) =>
  validateWholeWeek(wholeWeekInput(week,rows,evidence,contexts));

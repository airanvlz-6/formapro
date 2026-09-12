import { aerobicExecutionGate } from './aerobicExecutionGate';
import { builderTrace, contractFailureStage, sufficiencyFailure, type SufficiencyFailure, type BuilderCompletion } from './builderDiagnostics';
import { intentMatchingMovementIds } from './prescriptionIntent';
import { validateAllowedTrainingContract, type AllowedTrainingContract } from './allowedTrainingContract';
import { parseStructuredSession, validateSessionAgainstTrainingContract, renderContractSession, STRUCTURED_SESSION_INSTRUCTIONS } from './structuredSession';
import { detectarSesionDuplicada, type SesionParaComparar } from '../validators/sessionDuplicationValidator';
import { STRUCTURED_DOSE_INSTRUCTIONS } from './sessionProfessionalRenderer';
import { prescriptionGenerationOptions } from './prescriptionDataSufficiency';
import { emitSessionDoseAuthority, emitSessionCoachingDiagnostic, sessionCoachingHistoryDiagnostic } from './sessionDoseDiagnostics';
import { calculatedLoad } from './sessionDose';
import type { PresentationVersion } from './sessionPresentation';

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}
/** One private immutable snapshot for prompt, both attempts, validation and rendering. */
export async function generateContractSession(contract: AllowedTrainingContract, history: SesionParaComparar[],
  complete: (prompt: string) => Promise<string | BuilderCompletion>, context = '', planningRunId?: string, presentationVersion: PresentationVersion = 'legacy') {
  const authority = freeze(structuredClone(contract));
  const coach = authority.doseContext?.sessionDecisionAuthority === 'coach';
  const preflight = validateAllowedTrainingContract(authority);
  if (!preflight.ok) return { ok: false as const, code: 'TRAINING_CONTRACT_INVALID', violations: preflight.errors };
  if(authority.runningEventPreparation && authority.discipline==='carrera' && authority.intensityAuthority?.status !== 'RESOLVED')
    return {ok:false as const,code:'D3_C2_INTENSITY_UNRESOLVED',violations:['D3_C2_INTENSITY_UNRESOLVED']};
  if(authority.runningEventPreparation && authority.discipline==='carrera' && authority.runningMethodDose?.status !== 'RESOLVED')
    return {ok:false as const,code:'D3_B3_DOSE_UNRESOLVED',violations:['D3_B3_DOSE_UNRESOLVED']};
  // Current server issuance attaches B.3.2B before this composition boundary. Keep historical
  // contracts without the extension usable by existing isolated/legacy contract consumers.
  if (authority.runningMethodDose && authority.runningMethodDose.status !== 'RESOLVED') return { ok: false as const,
    code: authority.runningMethodDose.status === 'CONFLICT' ? 'RUNNING_METHOD_DOSE_CONFLICT' : 'RUNNING_METHOD_DOSE_UNRESOLVED',
    violations: authority.runningMethodDose.diagnostics };
  const singleContinuous = authority.runningMethodDose?.version === 2 && authority.runningMethodDose.dose?.composition === 'SINGLE_CONTINUOUS_TOTAL';
  const singleIntervals = authority.runningMethodDose?.version === 2 && authority.runningMethodDose.dose?.composition === 'SINGLE_INTERVAL_MAIN';
  if (singleContinuous || singleIntervals) {
    const gate = aerobicExecutionGate(authority);
    if (gate.errors.length) return {ok:false as const,code:gate.errors[0],violations:gate.errors};
  }
  const trace = builderTrace(authority, planningRunId);
  if (authority.intensityAuthority) {
    try { console.info?.('METHOD_INTENSITY_AUTHORITY', { version: authority.intensityAuthority.version, status: authority.intensityAuthority.status,
      reason: authority.intensityAuthority.reason, scope: 'main',
      ...(authority.intensityAuthority.version === 2 ? { codesCsv: authority.intensityAuthority.diagnostics?.join(',') } : {}) }); } catch { /* Non-authoritative diagnostic. */ }
  }
  const recent = structuredClone(history);
  const intentInstruction = authority.intent && authority.intent.kind !== 'stimulus_only'
    ? `\nIntent canónico: el bloque main debe incluir al menos un ID de ${JSON.stringify(intentMatchingMovementIds(authority.intent, authority.allowedMovementIds))}. Otros IDs permitidos pueden acompañarlo. Un movimiento solo en warmup/cooldown no satisface el intent.` : '';
  const options = authority.doseContext?.sufficiency ? prescriptionGenerationOptions(authority.doseContext.sufficiency,
    authority.doseContext.references, authority.allowedMovementIds, authority.discipline) : null;
  const timeInstruction = authority.doseContext?.timeAuthority?.targetDuration
    ? '\nLa banda temporal y minimumUsefulDurationSeconds de doseContext.timeAuthority pertenecen al servidor. Compón dentro de esa banda sin cambiar intent, pools ni intensidad autorizada. El máximo conservador estimado debe caber bajo hardMaximumSeconds; expectedSeconds es el punto medio operativo del rango, no una medición. No añadas descansos o transiciones artificiales para satisfacer la dosis.' : '';
  const representationInstruction = '\nCada movementId aparece como máximo una vez DENTRO de cada bloque, también en carrera/cíclicos. Puede repetirse ENTRE warmup, main y cooldown con su dosis propia. Para intervalos homogéneos usa la dosis estructurada sets/durationSeconds/restSeconds; no una entrada duplicada por intervalo. No combines dosis heterogéneas ni inventes cantidades para evitar esta regla.';
  const intensityInstruction = options ? '\nSELECCIÓN DE INTENSIDAD: doseContext.references contiene referencias conocidas, no permiso para medirlas. Para cada movimiento, referenceId debe pertenecer a SU executableReferenceIds. HR exige además canMeasureHeartRate available; unknown/unavailable/ambiguous no autorizan HR. Un dispositivo disponible no crea una referencia. Respeta las opciones existentes y el intent; no inventes equivalencias entre HR, ritmo y RPE.' : '';
  const methodInstruction = coach
    ? '\nINTENSIDAD: elige la expresión entre intensityAuthority.choices para main, si existe. Los valores RPE de esas choices son guías deportivas, no targets obligatorios: decide tu valor RPE válido. Las referencias sí son exactas e indivisibles; conserva referenceId, compatibilidad y capacidad. Sin choices, usa las opciones ejecutables del movimiento.'
    : authority.intensityAuthority?.status === 'RESOLVED'
    ? `\nMETHOD INTENSITY RESOLVED: en main solo admite los movementId de intensityAuthority.targets. Copia EXACTAMENTE su primary a prescription.intensity. No elijas otra métrica, referencia o rango. secondary es una guía separada ya autorizada del servidor; no la añadas al schema de la propuesta. Esta autoridad tiene precedencia sobre las opciones generales de referencias.`
    : authority.intensityAuthority ? '\nMETHOD INTENSITY UNRESOLVED: no existe selección deportiva determinista. Conserva las reglas de ejecutabilidad existentes; no declares compatibilidad fisiológica resuelta.' : '';
  const builderOptions = coach ? { movements: options, mainIntensityChoices: authority.intensityAuthority?.choices ?? null }
    : authority.intensityAuthority?.status === 'RESOLVED'
    ? { main: authority.intensityAuthority.targets, preparationOnly: options } : options;
  const doseInstruction = authority.runningMethodDose ? '\nRUNNING METHOD DOSE: runningMethodDose.dose es autoridad inmutable del servidor. main debe respetar métrica, selectedTarget y límites explícitos de la versión recibida, estructuras, número de esfuerzos, límites por esfuerzo y descansos. Un máximo no selecciona un target. Suma el trabajo de TODOS los movimientos main multiplicado por sets. No conviertas distancia a tiempo, no cambies intensidad autorizada y no añadas trabajo a preparación para eludir la dosis. La preparación requiere su propia autoridad de composición; no hereda permisos de main. timeBudget es solo un techo; no lo rellenes.' : '';
  const variantsInstruction = authority.runningMethodDose?.version===2 && authority.runningMethodDose.allowedSelections
    ? '\nAUTHORIZED VARIANTS: choose ONE complete allowedSelections entry. Its structure, movement, work, efforts and recovery are indivisible server-owned quantities. No blending, extra blocks or quantities.' : '';
  const compositionInstruction = variantsInstruction || (singleContinuous ? '\nCOMPOSITION AUTHORITY: replaces the default block layout. blocks must contain exactly ONE main block, ONE continuous running movement from runningMethodDose.dose.allowedMovementIds, with the exact selected total seconds and C2 primary intensity. NO warmup, cooldown, extra preparation, intervals or other movements. The selected duration is the ENTIRE outing.'
    : singleIntervals ? '\nCOMPOSITION AUTHORITY: exactly ONE main block and ONE authorized movement. Copy exact efforts to sets, bout seconds to durationSeconds and recovery seconds to restSeconds. Rest occurs only between efforts. No extra blocks or quantities. C2 owns intensity.' : '');
  const coachInstruction = `\nDiseña la sesión concreta que mejor continúe el proceso del atleta. La decisión semanal establece el propósito general.
Usa objetivo, adaptación, método, historial, exposición, respuesta previa, estado actual, restricciones, tiempo, referencias, capacidades y equipo suministrados.
Decide movimientos, estructura compatible, sets/reps/duración/distancia, esfuerzos, descanso, intensidad y progresión, mantenimiento o regresión respecto a exposiciones reales.
Una declaración habitual describe contexto, no obliga a repetir esa dosis. B3 advisory y las bandas RPE son conocimiento orientativo, no límites ejecutables ni permiso para inventar hechos.
No interpretes una prescripción como ejecución. UNKNOWN sigue siendo UNKNOWN. No infieras tolerancia, HR o respuesta faltante. Justifica decisiones conservadoras cuando la evidencia sea incompleta.
Solo usa IDs y referencias suministrados. El servidor calcula cargas y expresa referencias; no escribas kg, bpm ni ritmos libres. No rellenes el presupuesto de tiempo por obligación.
Puedes usar solo main o warmup/main con cooldown opcional, respetando la semántica de la estructura. No añadas preparación para eludir validación.
Incluye explanation como razón breve (1–400 caracteres), sin razonamiento interno. Esa razón no modifica factibilidad. Devuelve el schema existente.`;
  const instructions = authority.contractVersion === 3 ? STRUCTURED_DOSE_INSTRUCTIONS : STRUCTURED_SESSION_INSTRUCTIONS;
  const prompt = `${coach ? instructions.replace('La explicación y el objetivo se derivan por código, no los escribas.', 'El objetivo se deriva del intent.') + coachInstruction : instructions}${timeInstruction}${representationInstruction}${intensityInstruction}${methodInstruction}${coach ? '' : doseInstruction + compositionInstruction}\nCONTRACT:\n${JSON.stringify(authority)}${intentInstruction}\nContexto no autoritativo:\n${context}\nOpciones ejecutables por alcance (preparationOnly nunca amplía main):\n${JSON.stringify(builderOptions)}\nHistorial para evitar duplicación:\n${JSON.stringify(recent)}`;
  if (coach) emitSessionCoachingDiagnostic('SESSION_COACH_INPUT', { intent: authority.intent,
    history: sessionCoachingHistoryDiagnostic(context, authority.discipline),
    feasibleMovements: authority.allowedMovementIds, feasibleStructures: authority.allowedStructureIds,
    references: authority.doseContext?.references.map(({ id, kind, metric, value, unit }) => ({ id, kind, metric, value, unit })),
    timeAuthority: authority.doseContext?.timeAuthority, restrictionStatus: authority.restrictionsSnapshot.state,
    runningEvidence: authority.runningMethodDose?.version === 2 ? {
      habitual: authority.runningMethodDose.evidence.habitualDeclarations?.facts,
      executionStatus: authority.runningMethodDose.evidence.structuredMethodExecution?.status,
      executions: authority.runningMethodDose.evidence.structuredMethodExecution?.records.map(({ executionId: _id, ...r }) => r),
    } : null });
  let previousErrors: string[] = [];
  let missingDetails: SufficiencyFailure[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    trace.beginAttempt();
    let raw;
    const duplicateCorrection = attempt && previousErrors.some(v => v.startsWith('DUPLICATE_MOVEMENT:'))
      ? `\nREPAIR_CONSTRAINTS:\n${JSON.stringify({ previousErrors: ['DUPLICATE_MOVEMENT'], scope: 'within_each_block',
        instruction: 'Cada movementId debe aparecer como máximo una vez dentro de cada bloque. Recompón la propuesta dentro del mismo contrato; no traslades ni elimines dosis automáticamente. Esta restricción no prohíbe repetir un movementId entre warmup y main con dosis apropiadas.' })}` : '';
    try { raw = trace.completion(await complete(prompt + (attempt ? `\nLa primera propuesta fue rechazada: ${JSON.stringify(previousErrors)}. Devuelve una composición válida dentro del MISMO contrato; no repitas la propuesta rechazada.` : '') + duplicateCorrection)); }
    catch { trace.emit(attempt + 1, 'provider', 'SESSION_GENERATION_FAILED', ['LLM_REQUEST_FAILED'], false, 'provider_failure_terminal'); return { ok: false as const, code: 'SESSION_GENERATION_FAILED', violations: ['LLM_REQUEST_FAILED'], diagnostics: trace.summary() }; }
    const parsed = parseStructuredSession(raw);
    if (!parsed.ok) {
      previousErrors = parsed.violations;
      const duplicate = parsed.violations.some(v => v.startsWith('DUPLICATE_MOVEMENT:'));
      const retry = !attempt && (coach || duplicate || parsed.violations.some(v => v.startsWith('DOSE_')));
      trace.emit(attempt + 1, parsed.violations.some(v => v.startsWith('JSON_')) ? 'parseStructuredSession' : 'checkSessionShape', 'SESSION_PROPOSAL_INVALID', parsed.violations, retry, retry ? duplicate ? 'duplicate_movement_retry' : 'dose_parse_retry' : attempt ? 'attempt_limit' : 'parse_rule_not_retryable');
      if (retry) continue;
      return { ok: false as const, code: 'SESSION_PROPOSAL_INVALID', violations: parsed.violations, diagnostics: trace.summary() };
    }
    missingDetails = [];
    if (coach && !parsed.proposal.explanation?.trim()) {
      previousErrors = ['SESSION_COACH_REASON_REQUIRED'];
      trace.emit(attempt + 1, 'checkSessionShape', 'SESSION_PROPOSAL_INVALID', previousErrors, !attempt, attempt ? 'attempt_limit' : 'dose_parse_retry');
      if (!attempt) continue;
      return { ok: false as const, code: 'SESSION_PROPOSAL_INVALID', violations: previousErrors, diagnostics: trace.summary() };
    }
    const coachingDecision = coach ? { reason: parsed.proposal.explanation!, structureId: parsed.proposal.structureId,
      blocks: structuredClone(parsed.proposal.blocks) } : undefined;
    if (coachingDecision) emitSessionCoachingDiagnostic('SESSION_COACH_DECISION', coachingDecision);
    const validation = validateSessionAgainstTrainingContract(authority, parsed.proposal, (estimate, errors) =>
      emitSessionDoseAuthority(authority, { ...estimate, expectedSeconds: estimate.expectedSeconds ?? null }, errors, trace.summary().planningRunId ?? undefined),
      (signal, state, block, movement) => { missingDetails.push(sufficiencyFailure(signal, state, block, movement)); });
    if (!validation.ok) {
      if (coach) emitSessionCoachingDiagnostic('SESSION_AUTHORITY_RESOLUTION', { rejections: validation.violations });
      previousErrors = validation.violations;
      const retry = !attempt && (coach || validation.violations.some(v => v.startsWith('RUNNING_METHOD_DOSE_') || v.startsWith('PRESCRIPTION_DATA_') || v.startsWith('DOSE_') || v.startsWith('STRUCTURE_') || v.startsWith('SESSION_DOSE_') || v.startsWith('SESSION_BUDGET_') || v.startsWith('SESSION_DURATION_')));
      trace.emit(attempt + 1, contractFailureStage(validation.violations), 'SESSION_CONTRACT_INVALID', validation.violations, !!retry, retry ? 'contract_rule_retry' : attempt ? 'attempt_limit' : 'contract_rule_not_retryable', missingDetails);
      if (retry) continue;
      return { ok: false as const, code: 'SESSION_CONTRACT_INVALID', violations: validation.violations, diagnostics: trace.summary() };
    }
    // Commentary is not part of the executable proposal or its receipt.
    if (coach) delete validation.proposal.explanation;
    const session = renderContractSession(authority, validation.proposal, presentationVersion);
    const duplicate = detectarSesionDuplicada(session, recent).esDuplicado;
    if (coach) {
      emitSessionCoachingDiagnostic('SESSION_AUTHORITY_RESOLUTION', { rejections: duplicate ? ['SESSION_DUPLICATE'] : [],
        expressions: validation.proposal.blocks.flatMap(b => b.movements.map(m => ({ movementId: m.movementId,
          calculatedLoad: calculatedLoad(authority, m.prescription), reference: m.prescription.intensity && 'referenceId' in m.prescription.intensity
            ? authority.doseContext?.references.filter(r => r.id === (m.prescription.intensity as { referenceId: string }).referenceId)
              .map(({ id, metric, value, unit }) => ({ id, metric, value, unit }))[0] : null }))) });
      if (!duplicate) emitSessionCoachingDiagnostic('BUILDER_OUTPUT', validation.proposal);
    }
    if (!duplicate) { trace.emit(attempt + 1, 'complete', 'PASS', [], false, 'accepted'); return { ok: true as const, contract: authority,
      proposal: validation.proposal, session, coachingDecision, attempts: attempt + 1, diagnostics: trace.summary() }; }
    trace.emit(attempt + 1, 'duplication', 'SESSION_DUPLICATE', ['SESSION_DUPLICATE'], !attempt, attempt ? 'attempt_limit' : 'duplicate_retry');
    previousErrors = ['SESSION_DUPLICATE'];
  }
  return { ok: false as const, code: 'SESSION_DUPLICATE', violations: ['RETRY_STILL_DUPLICATE'], diagnostics: trace.summary() };
}

import { builderTrace, contractFailureStage, type BuilderCompletion } from './builderDiagnostics';
import { intentMatchingMovementIds } from './prescriptionIntent';
import { validateAllowedTrainingContract, type AllowedTrainingContract } from './allowedTrainingContract';
import { parseStructuredSession, validateSessionAgainstTrainingContract, renderContractSession, STRUCTURED_SESSION_INSTRUCTIONS } from './structuredSession';
import { detectarSesionDuplicada, type SesionParaComparar } from '../validators/sessionDuplicationValidator';
import { STRUCTURED_DOSE_INSTRUCTIONS } from './sessionProfessionalRenderer';
import { prescriptionGenerationOptions } from './prescriptionDataSufficiency';

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}
/** One private immutable snapshot for prompt, both attempts, validation and rendering. */
export async function generateContractSession(contract: AllowedTrainingContract, history: SesionParaComparar[],
  complete: (prompt: string) => Promise<string | BuilderCompletion>, context = '', planningRunId?: string) {
  const authority = freeze(structuredClone(contract));
  const preflight = validateAllowedTrainingContract(authority);
  if (!preflight.ok) return { ok: false as const, code: 'TRAINING_CONTRACT_INVALID', violations: preflight.errors };
  const trace = builderTrace(authority, planningRunId);
  const recent = structuredClone(history);
  const intentInstruction = authority.intent && authority.intent.kind !== 'stimulus_only'
    ? `\nIntent canónico: el bloque main debe incluir al menos un ID de ${JSON.stringify(intentMatchingMovementIds(authority.intent, authority.allowedMovementIds))}. Otros IDs permitidos pueden acompañarlo. Un movimiento solo en warmup/cooldown no satisface el intent.` : '';
  const options = authority.doseContext?.sufficiency ? prescriptionGenerationOptions(authority.doseContext.sufficiency,
    authority.doseContext.references, authority.allowedMovementIds, authority.discipline) : null;
  const prompt = `${authority.contractVersion === 3 ? STRUCTURED_DOSE_INSTRUCTIONS : STRUCTURED_SESSION_INSTRUCTIONS}\nCONTRACT:\n${JSON.stringify(authority)}${intentInstruction}\nContexto no autoritativo:\n${context}\nOpciones ejecutables resueltas por el servidor (solo sus referencias pueden usarse; sin distancia medible usa duración):\n${JSON.stringify(options)}\nHistorial para evitar duplicación:\n${JSON.stringify(recent)}`;
  let previousErrors: string[] = [];
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
      const retry = !attempt && (duplicate || parsed.violations.some(v => v.startsWith('DOSE_')));
      trace.emit(attempt + 1, parsed.violations.some(v => v.startsWith('JSON_')) ? 'parseStructuredSession' : 'checkSessionShape', 'SESSION_PROPOSAL_INVALID', parsed.violations, retry, retry ? duplicate ? 'duplicate_movement_retry' : 'dose_parse_retry' : attempt ? 'attempt_limit' : 'parse_rule_not_retryable');
      if (retry) continue;
      return { ok: false as const, code: 'SESSION_PROPOSAL_INVALID', violations: parsed.violations, diagnostics: trace.summary() };
    }
    const validation = validateSessionAgainstTrainingContract(authority, parsed.proposal);
    if (!validation.ok) {
      previousErrors = validation.violations;
      const retry = !attempt && validation.violations.some(v => v.startsWith('PRESCRIPTION_DATA_') || v.startsWith('DOSE_') || v.startsWith('STRUCTURE_') || v.startsWith('SESSION_DOSE_') || v.startsWith('SESSION_BUDGET_') || v.startsWith('SESSION_DURATION_'));
      trace.emit(attempt + 1, contractFailureStage(validation.violations), 'SESSION_CONTRACT_INVALID', validation.violations, !!retry, retry ? 'contract_rule_retry' : attempt ? 'attempt_limit' : 'contract_rule_not_retryable');
      if (retry) continue;
      return { ok: false as const, code: 'SESSION_CONTRACT_INVALID', violations: validation.violations, diagnostics: trace.summary() };
    }
    const session = renderContractSession(authority, validation.proposal);
    if (!detectarSesionDuplicada(session, recent).esDuplicado) { trace.emit(attempt + 1, 'complete', 'PASS', [], false, 'accepted'); return { ok: true as const, contract: authority,
      proposal: validation.proposal, session, attempts: attempt + 1, diagnostics: trace.summary() }; }
    trace.emit(attempt + 1, 'duplication', 'SESSION_DUPLICATE', ['SESSION_DUPLICATE'], !attempt, attempt ? 'attempt_limit' : 'duplicate_retry');
    previousErrors = ['SESSION_DUPLICATE'];
  }
  return { ok: false as const, code: 'SESSION_DUPLICATE', violations: ['RETRY_STILL_DUPLICATE'], diagnostics: trace.summary() };
}

import { intentMatchingMovementIds } from './prescriptionIntent';
import { validateAllowedTrainingContract, type AllowedTrainingContract } from './allowedTrainingContract';
import { parseStructuredSession, validateSessionAgainstTrainingContract, renderContractSession, STRUCTURED_SESSION_INSTRUCTIONS } from './structuredSession';
import { detectarSesionDuplicada, type SesionParaComparar } from '../validators/sessionDuplicationValidator';

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}
/** One private immutable snapshot for prompt, both attempts, validation and rendering. */
export async function generateContractSession(contract: AllowedTrainingContract, history: SesionParaComparar[],
  complete: (prompt: string) => Promise<string>, context = '') {
  const authority = freeze(structuredClone(contract));
  const preflight = validateAllowedTrainingContract(authority);
  if (!preflight.ok) return { ok: false as const, code: 'TRAINING_CONTRACT_INVALID', violations: preflight.errors };
  const recent = structuredClone(history);
  const intentInstruction = authority.intent && authority.intent.kind !== 'stimulus_only'
    ? `\nIntent canónico: el bloque main debe incluir al menos un ID de ${JSON.stringify(intentMatchingMovementIds(authority.intent, authority.allowedMovementIds))}. Otros IDs permitidos pueden acompañarlo. Un movimiento solo en warmup/cooldown no satisface el intent.` : '';
  const prompt = `${STRUCTURED_SESSION_INSTRUCTIONS}\nCONTRACT:\n${JSON.stringify(authority)}${intentInstruction}\nContexto no autoritativo:\n${context}\nHistorial para evitar duplicación:\n${JSON.stringify(recent)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw;
    try { raw = await complete(prompt + (attempt ? '\nLa primera propuesta fue rechazada por dosis, estructura o duplicación. Devuelve una composición válida dentro del MISMO contrato; no repitas la propuesta rechazada.' : '')); }
    catch { return { ok: false as const, code: 'SESSION_GENERATION_FAILED', violations: ['LLM_REQUEST_FAILED'] }; }
    const parsed = parseStructuredSession(raw);
    if (!parsed.ok) {
      if (!attempt && parsed.violations.some(v => v.startsWith('DOSE_'))) continue;
      return { ok: false as const, code: 'SESSION_PROPOSAL_INVALID', violations: parsed.violations };
    }
    const validation = validateSessionAgainstTrainingContract(authority, parsed.proposal);
    if (!validation.ok) {
      if (!attempt && validation.violations.some(v => v.startsWith('DOSE_') || v.startsWith('STRUCTURE_'))) continue;
      return { ok: false as const, code: 'SESSION_CONTRACT_INVALID', violations: validation.violations };
    }
    const session = renderContractSession(authority, validation.proposal);
    if (!detectarSesionDuplicada(session, recent).esDuplicado) return { ok: true as const, contract: authority,
      proposal: validation.proposal, session, attempts: attempt + 1 };
  }
  return { ok: false as const, code: 'SESSION_DUPLICATE', violations: ['RETRY_STILL_DUPLICATE'] };
}

/** Actionable retry feedback for Numeric Truth heart-rate rejections. It only locates the failing
 * fields and lists the executable referenceIds already attached to the contract: it never validates,
 * repairs or relaxes anything, and never echoes proposal text or any physiological figure. */
export const HR_REPAIR_VIOLATIONS = ['NUMERIC_TRUTH:HR_REFERENCE_REQUIRED', 'NUMERIC_TRUTH:HR_ZONE_MISMATCH'] as const;
const HR_FIGURE = /\d+(?:\.\d+)?(?:\s*[-–—]\s*\d+(?:\.\d+)?)?\s*(?:ppm|bpm)\b/i;
const HR_ZONE_LABEL = /\bZ[1-5]\b/i;
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const safeId = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_:.\-]{1,80}$/.test(v) ? v : null);

export const HR_REPAIR_RULE = 'Las cifras bpm/ppm solo son válidas si el propio movimiento usa intensity {kind:"reference", referenceId} compatible. '
  + 'Corrige CADA path indicado de una de estas dos formas: (a) usa intensity.kind="reference" con uno de los executableReferenceIds de ESE movimiento '
  + 'y no repitas la cifra de FC en texto; o (b) elimina las cifras/rangos bpm y ppm del texto libre y usa RPE/RIR. '
  + 'No calcules, copies ni reconstruyas cifras de FC desde contexto, historial o memoria. Conserva lo demás del MISMO contrato.';

export function hrReferenceRepairFeedback(violations: readonly string[], proposal: any,
  executableReferenceIds: (movementId: string) => string[]): string {
  if (!HR_REPAIR_VIOLATIONS.some(code => violations.includes(code))) return '';
  const zoneMismatch = violations.includes('NUMERIC_TRUTH:HR_ZONE_MISMATCH');
  const flagged = (...fields: unknown[]) => fields.some(f => HR_FIGURE.test(text(f)) || zoneMismatch && HR_ZONE_LABEL.test(text(f)));
  const failures: { path: string; movementId?: string; executableReferenceIds?: string[] }[] = [];
  const blocks = Array.isArray(proposal?.blocks) ? proposal.blocks : [];
  blocks.forEach((b: any, bi: number) => {
    const movements = Array.isArray(b?.movements) ? b.movements : [];
    if (flagged(b?.title)) failures.push({ path: `blocks[${bi}].title` });
    if (flagged(b?.formatInstruction)) failures.push({ path: `blocks[${bi}].formatInstruction` });
    movements.forEach((m: any, mi: number) => {
      const p = m?.prescription, id = safeId(m?.movementId);
      const entry = (field: string) => ({ path: `blocks[${bi}].movements[${mi}].${field}`, ...(id ? { movementId: id } : {}),
        executableReferenceIds: id ? executableReferenceIds(id) : [] });
      if (flagged(p?.doseInstruction)) failures.push(entry('prescription.doseInstruction'));
      if (flagged(m?.name, m?.variant?.displayName)) failures.push(entry('name'));
    });
  });
  return `\nREPAIR_HR_REFERENCE:\n${JSON.stringify({ previousErrors: HR_REPAIR_VIOLATIONS.filter(code => violations.includes(code)),
    rule: HR_REPAIR_RULE, failures })}`;
}

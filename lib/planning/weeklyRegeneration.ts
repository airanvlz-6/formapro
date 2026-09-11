import { isExecutableCalendarState } from './weeklyCalendar';

export type RegenerationPolicy = { pendingManagedDays: string[] };
type Slot = { state: string; protected?: boolean };
export function executablePrescriptionCounts(slots: readonly Slot[]) {
  return {
    preservedExecutableDays: slots.filter(s => s.protected && isExecutableCalendarState(s.state)).length,
    newExecutableDays: slots.filter(s => !s.protected && isExecutableCalendarState(s.state)).length,
  };
}
/** A terminal planning outcome, never permission to persist a generation. */
export function noWeeklyPrescription(reason: 'NO_FEASIBLE_REMAINING_SELECTION' | 'NO_REMAINING_MANAGED_DAYS' | 'EMPTY_BUILDER_TARGETS' | 'NO_NEW_EXECUTABLE_SELECTION') {
  return { ok: false as const, code: reason === 'NO_REMAINING_MANAGED_DAYS'
    ? 'WEEKLY_REGENERATION_NO_OP' : 'NO_NEW_EXECUTABLE_PRESCRIPTION', reason,
    canContinue: false as const, noOp: reason === 'NO_REMAINING_MANAGED_DAYS' };
}
export function weeklyRegenerationOutcome(policy: RegenerationPolicy | undefined, slots: readonly Slot[]) {
  if (!policy) return null;
  if (!policy.pendingManagedDays.length) return noWeeklyPrescription('NO_REMAINING_MANAGED_DAYS');
  return executablePrescriptionCounts(slots).newExecutableDays ? null : noWeeklyPrescription('NO_FEASIBLE_REMAINING_SELECTION');
}
/** Presentation only. All decisions originate in the shared server contract. */
export function weeklyGenerationOutcomeMessage(result: { code?: string; reason?: string } | null | undefined) {
  if (result?.code === 'SESSION_DOSE_TIME_INFEASIBLE') return 'El rodaje habitual confirmado no cabe en el tiempo disponible. La duración seleccionada se conserva; revisa la disponibilidad antes de planificarlo.';
  if (result?.code === 'RUNNING_DOSE_CAPABILITY_INSUFFICIENT') return 'La planificación de carrera queda pendiente: todavía no hay una dosis autorizada compatible con la evidencia disponible. Guardar tu rutina habitual no autoriza por sí solo una dosis.';
  if (result?.code === 'NO_NEW_EXECUTABLE_PRESCRIPTION') return 'No se ha obtenido una nueva prescripción válida con el contrato actual. Conservo el plan anterior; no se ha consumido una generación.';
  if (result?.code === 'WEEKLY_REGENERATION_NO_OP') return 'No quedan días gestionados pendientes de planificación. Conservo el plan actual sin generar otra versión.';
  if (result?.code === 'GENERATION_LOG_READ_FAILED') return 'No se ha podido comprobar el límite de generaciones de esta semana. No se ha guardado una versión nueva.';
  if (result?.code === 'PLAN_REVISION_CONFLICT') return 'El plan cambió mientras se generaba la semana. Conservo la versión más reciente y no la he reemplazado.';
  if (result?.code === 'PLAN_PERSISTENCE_UNKNOWN') return 'No se puede confirmar si la nueva semana quedó guardada. No se ha reintentado.';
  if (result?.code === 'PLAN_PERSISTENCE_ERROR') return 'La escritura de la nueva semana devolvió un error confirmado. El plan anterior sigue disponible.';
  if (result?.code === 'WEEK_FINAL_VALIDATION_FAILED' || result?.code === 'WEEK_COHERENCE_INVALID' || result?.code === 'WEEK_REPAIR_FAILED') return 'La semana no superó la comprobación final de coherencia. No se ha guardado una versión nueva.';
  if (result?.code === 'WEEKLY_PROTECTED_SESSION_MISMATCH' || result?.code === 'WEEKLY_CONTEXT_STALE') return 'El contexto semanal cambió mientras se generaba el plan. No se ha reemplazado la versión guardada.';
  if (result?.code === 'MAX_GENERATIONS_REACHED' || result?.reason === 'MAX_GENERATIONS_REACHED') return 'Esta semana ya ha sido planificada dos veces. Puedes solicitar cambios en sesiones concretas.';
  return 'No se ha confirmado una semana nueva por un error técnico. El plan guardado sigue disponible.';
}

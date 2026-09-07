/** Terminal HTTP 200 application envelope: the existing transport retries non-2xx. */
export function wholeWeekFailure(code:string){
  return {ok:false as const,code:['WEEK_COHERENCE_INVALID','WEEK_REPAIR_FAILED','WEEK_FINAL_VALIDATION_FAILED'].includes(code)?code:'WEEK_REPAIR_FAILED',
    retryable:false as const,planningStatus:'could_not_build_valid_week',
    message:'No se ha guardado una semana nueva porque no se pudo completar una planificación válida. El plan que ya estuviera guardado se conserva.'};
}

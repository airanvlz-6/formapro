const steps: Record<string, string> = {
  analizar_bloque_semana: 'Paso 1 — Block Analyzer',
  planificar_semana: 'Paso 2 — Weekly Coach',
  construir_sesion_dia: 'Paso 3 — Session Builder',
  guardar_plan_semana: 'Paso 4 — Guardado',
};
type Event = { step: string; layer: 'server'; invocation: number;
  status: 'started' | 'returned' | 'threw'; durationMs?: number };

/** Request-local DEBUG projection of actual handler calls, never their payloads/results.
 * `returned` means the handler returned, not that planning or persistence succeeded.
 */
export function createOrchestratorTrace(enabled: boolean) {
  const events: Event[] = [];
  let invocation = 0;
  const append = (event: Event) => { if (events.length < 64) events.push(event); };
  return {
    wrap<T extends (action: string, ...args: any[]) => Promise<any>>(execute: T): T {
      if (!enabled) return execute;
      return (async (action: string, ...args: any[]) => {
        if (!Object.hasOwn(steps, action)) return execute(action, ...args);
        const base = { step: steps[action], layer: 'server' as const, invocation: ++invocation };
        const start = Date.now();
        append({ ...base, status: 'started' });
        try {
          const result = await execute(action, ...args);
          append({ ...base, status: 'returned', durationMs: Math.max(0, Date.now() - start) });
          return result;
        } catch (error) {
          append({ ...base, status: 'threw', durationMs: Math.max(0, Date.now() - start) });
          throw error;
        }
      }) as T;
    },
    response() { return enabled && events.length ? { debug: { orchestratorTrace: events.slice() } } : {}; },
  };
}

/** The server's optional DEBUG field is the gate, including in production. */
export function logOrchestratorTrace(response: any) {
  try {
    if (Array.isArray(response?.debug?.orchestratorTrace))
      for (const event of response.debug.orchestratorTrace) console.log('[FORGE ORCHESTRATOR DEBUG]', event);
  } catch { /* Console availability cannot affect the conversation or generation. */ }
}

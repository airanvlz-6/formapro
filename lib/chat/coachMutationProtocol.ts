import { developmentWriteAnswer } from '../athlete/developmentAreaStore';

export const MUTATION_ACTIONS = ['record_execution', 'propose_development_area', 'respond_development_proposal'] as const;
export type MutationAction = typeof MUTATION_ACTIONS[number];
export const mutationAction = (v: unknown): v is MutationAction => MUTATION_ACTIONS.includes(v as MutationAction);
/** The LLM classifies meaning. This state machine only checks declared obligations and tool evidence. */
export function mutationProtocol() {
  const required = new Set<MutationAction>();
  const attempts = new Map<MutationAction, any[]>();
  const resolved = (action: MutationAction) => {
    const rows = attempts.get(action) ?? [];
    return rows.length > 0 && rows.every(r => ['committed', 'already_applied'].includes(r.status)
      && r.receipt?.verified === true && (action === 'record_execution'
        ? ['forge_execution', 'external_execution'].includes(r.receipt.kind)
        : ['candidate', 'active', 'rejected'].includes(r.receipt.state)));
  };
  return {
    declare(value: unknown) {
      if (!Array.isArray(value) || value.length > 3 || new Set(value).size !== value.length || !value.every(mutationAction))
        throw new Error('COACH_FIRST_OUTPUT_INVALID');
      value.forEach(a => required.add(a));
    },
    attempted(name: string, result: any) {
      if (!mutationAction(name)) return;
      required.add(name);
      attempts.set(name, [...(attempts.get(name) ?? []), result]);
    },
    pending: () => [...required].filter(a => !resolved(a)),
    summary: () => ({ mutationIntents: required.size, mutationIntentsResolved: [...required].filter(resolved).length,
      mutationIntentsPending: [...required].filter(a => !resolved(a)).length }),
    answer(results: any[]) {
      const executions = results.filter(r => r.name === 'record_execution' && r.receipt?.verified);
      return [executions.length ? executions.map(r => r.receipt.kind === 'forge_execution'
        ? `Ejecución registrada y sesión Forge completada (${r.receipt.date}).`
        : `Ejecución externa registrada (${r.receipt.date}); no completa una sesión Forge.`).join('\n') : null,
      developmentWriteAnswer(results)].filter(Boolean).join('\n\n') || null;
    },
  };
}

import { silentGroundingTrace, type GroundingTrace } from '../diagnostics/groundingTrace';

/** Shared raw factual reads for technical projection and the legacy context.
 * No strategy, restrictions/ownership reinterpretation, writes or defaults.
 */
export function readPrescriptionInputs(db: any, user: string, asOfDate: string,
  trace: GroundingTrace = silentGroundingTrace, projection: 'legacy' | 'builder' = 'legacy') {
  async function read(table: 'usuarios' | 'weekly_plan', query: PromiseLike<{ data: unknown; error: unknown }>, single = false) {
    return trace.async(`athlete.${table}`, async () => {
      const result = await query;
      if (result.error || (single ? !result.data || Array.isArray(result.data) || typeof result.data !== 'object' : !Array.isArray(result.data)))
        throw new Error(`PRESCRIPTION_CONTEXT_READ_FAILED:${table}`);
      return result.data;
    });
  }
  return Promise.all([
    read('usuarios', db.from('usuarios').select(projection === 'builder'
      ? 'especialidad,perfil,test_atleta,marcas_especificas,historial_marcas,datos_entrenamiento'
      : 'modo_entrada,categoria,especialidad,perfil,objetivo_principal,test_atleta,marcas_especificas,historial_marcas,datos_entrenamiento,athlete_development,ciclo_actual,debilidades,workout_history')
      .eq('codigo', user).single(), true),
    read('weekly_plan', db.from('weekly_plan').select('week_start,sessions').eq('user_codigo', user)
      .lte('week_start', asOfDate).order('week_start', { ascending: false }).limit(4)),
  ]).then(([profile, plans]) => ({ user: profile, plans }));
}

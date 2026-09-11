import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalDigest } from '../execution/executionIntegrity';
import type { RunningHabitualInteraction, RunningHabitualConfirmation } from './runningHabitualConfirmation';
import type { HabitualRunningProfileStore } from './runningHabitualDeclarations';
import type { RunningDoseSelection } from '../sports/runningMethodDoseAuthority';

const methods = ['running_long_run', 'running_threshold', 'running_recovery'] as const;
export type MethodBaseline = { methodId: typeof methods[number]; authority: 'ATHLETE_DECLARATION';
  semantics: 'CURRENT_COMFORTABLY_COMPLETED_METHOD_BASELINE'; confirmedAt: string;
  variants: { mode: 'continuous' | 'intervals'; workSeconds: number; efforts: number; boutSeconds: number; recoverySeconds: number }[] };
const object = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
/** Explicit current habitual quantities. Neither a workout report nor an inferred capacity. */
export function methodBaselineFact(input: unknown, confirmedAt: string): MethodBaseline {
  const r = object(input);
  if (Object.keys(r).some(k => !['methodId', 'variants', 'confirmedCurrentComfortable'].includes(k))
    || !methods.includes(r.methodId) || r.confirmedCurrentComfortable !== true || !Number.isFinite(Date.parse(confirmedAt))
    || !Array.isArray(r.variants) || !r.variants.length || r.variants.length > 2) throw new Error('METHOD_BASELINE_INVALID');
  const seen = new Set<string>();
  const variants = r.variants.map((raw: unknown) => {
    const v = object(raw);
    if (Object.keys(v).some(k => !['mode','workSeconds','efforts','boutSeconds','recoverySeconds'].includes(k))
      || !['continuous','intervals'].includes(v.mode) || seen.has(v.mode) || !positive(v.workSeconds)
      || !positive(v.efforts) || !positive(v.boutSeconds) || !Number.isSafeInteger(v.recoverySeconds) || v.recoverySeconds < 0
      || v.workSeconds !== v.efforts * v.boutSeconds || !Number.isSafeInteger(v.workSeconds + (v.efforts - 1) * v.recoverySeconds)
      || (v.mode === 'continuous' ? v.efforts !== 1 || v.recoverySeconds !== 0
        : r.methodId !== 'running_threshold' || v.efforts < 2 || v.recoverySeconds <= 0)) throw new Error('METHOD_BASELINE_STRUCTURE_INVALID');
    seen.add(v.mode);
    return {mode:v.mode as 'continuous'|'intervals',workSeconds:v.workSeconds,efforts:v.efforts,boutSeconds:v.boutSeconds,recoverySeconds:v.recoverySeconds};
  });
  return { methodId: r.methodId, authority: 'ATHLETE_DECLARATION', semantics: 'CURRENT_COMFORTABLY_COMPLETED_METHOD_BASELINE', confirmedAt,
    variants: variants.sort((a: MethodBaseline['variants'][number], b: MethodBaseline['variants'][number]) => a.mode.localeCompare(b.mode)) };
}
function mac(payload: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('RUNNING_CONFIRMATION_AUTHORITY_UNAVAILABLE');
  return createHmac('sha256', key).update('running-method-baseline-v1:' + payload).digest('base64url');
}
export function sealMethodBaseline(user: string, interaction: RunningHabitualInteraction, fact: MethodBaseline) {
  if (!user || !interaction.planningRunId || !/^\d{4}-\d{2}-\d{2}$/.test(interaction.targetWeekStart)) throw new Error('METHOD_BASELINE_BINDING_REQUIRED');
  const payload = Buffer.from(JSON.stringify({user:canonicalDigest(user),interaction,fact})).toString('base64url');
  return payload + '.' + mac(payload);
}
export function readMethodBaselines(profile: unknown, user: string, interaction?: RunningHabitualInteraction): MethodBaseline[] {
  if (!interaction) return [];
  return Object.values(object(object(profile).runningMethodDeclarations)).flatMap(token => {
    try {
      if (typeof token !== 'string' || token.length > 10000) return [];
      const [p,s,extra] = token.split('.'), a=Buffer.from(s ?? ''), b=Buffer.from(mac(p));
      if (extra || a.length !== b.length || !timingSafeEqual(a,b)) return [];
      const stored = JSON.parse(Buffer.from(p,'base64url').toString());
      if (stored.user !== canonicalDigest(user) || canonicalDigest(stored.interaction) !== canonicalDigest(interaction)) return [];
      const fact = methodBaselineFact({methodId:stored.fact.methodId,variants:stored.fact.variants,confirmedCurrentComfortable:true},stored.fact.confirmedAt);
      return canonicalDigest(fact) === canonicalDigest(stored.fact) ? [fact] : [];
    } catch { return []; }
  });
}
export async function saveMethodBaseline(db: HabitualRunningProfileStore, user: string, input: unknown,
  interaction: RunningHabitualInteraction, confirmedAt = new Date().toISOString()) {
  const fact = methodBaselineFact(input, confirmedAt), token = sealMethodBaseline(user, interaction, fact);
  const current = await db.from('usuarios').select('perfil').eq('codigo',user).single();
  if (current.error || !current.data) throw new Error('METHOD_BASELINE_READ_FAILED');
  const profile=object(current.data.perfil);
  const saved=await db.from('usuarios').update({perfil:{...profile,runningMethodDeclarations:{...object(profile.runningMethodDeclarations),[fact.methodId]:token}}}).eq('codigo',user);
  if (saved.error) throw new Error('METHOD_BASELINE_SAVE_FAILED');
  return {ok:true,authority:fact.authority,methodId:fact.methodId,recordedExecution:false};
}
export function methodBaselineRequirement(methodId: string) {
  if (!(methods as readonly string[]).includes(methodId)) return null;
  return {kind:'CURRENT_METHOD_BASELINE_REQUIRED',methodId,authority:'ATHLETE_DECLARATION',action:'confirmar_baseline_metodo',
    fields: methodId === 'running_threshold' ? ['structure_variant','accumulated_work_seconds','efforts','bout_seconds','passive_recovery_seconds'] : ['current_duration_seconds'],
    text: methodId === 'running_threshold' ? 'Indica el trabajo de umbral que completas cómodamente en tu rutina actual: continuo o intervalos, tiempo de trabajo y, si corresponde, esfuerzos y recuperación pasiva. No indiques una sesión objetivo.'
      : 'Indica la duración actual que completas cómodamente en este método. Se guardará como declaración de rutina, no como ejecución.',
    noBaseline:'PRODUCT_POLICY_DECISION_REQUIRED'};
}
export function baselineSelections(fact: MethodBaseline): RunningDoseSelection[] {
  const exact=(n:number)=>({minimum:n,maximum:n});
  return fact.variants.map(v=>({composition:v.mode==='continuous'?'SINGLE_CONTINUOUS_TOTAL':'SINGLE_INTERVAL_MAIN',
    allowedMovementIds:[fact.methodId==='running_long_run'?'rodaje_largo':fact.methodId==='running_threshold'?'series_umbral':'regenerativo'],
    metric:v.mode==='continuous'?'duration':'work_duration',unit:'seconds',selectedTarget:exact(v.workSeconds),maximumAuthorized:v.workSeconds,
    minimumUseful:null,compositionTolerance:null,structures:[v.mode==='intervals'?'intervalos_carrera':fact.methodId==='running_threshold'?'tempo_continuo':fact.methodId==='running_recovery'?'continuo_regenerativo':'continuo_carrera'],
    structureConstraints:{mode:v.mode,efforts:v.mode==='intervals'?exact(v.efforts):null,bout:v.mode==='intervals'?{unit:'seconds',range:exact(v.boutSeconds)}:null,
      recoverySeconds:v.mode==='intervals'?exact(v.recoverySeconds):null}}));
}

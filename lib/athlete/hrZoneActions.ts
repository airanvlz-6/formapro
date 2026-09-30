import { projectAthletePrescriptionProfile } from './athletePrescriptionContext';
import { admittedHrZones, hrZoneProposal, issueHrZoneProposal, confirmHrZoneProposal, hrZoneInputsStale, validHrZoneSystem } from './hrZoneBootstrap';
import type { HrZone } from '../sports/hrrZonePolicy';

/** Same authenticated chat identity as onboarding; only explicit actions write confirmation. */
export async function hrZoneAction(db: any, user: string, action: unknown, data: { zones?: HrZone[]; token?: unknown; digest?: unknown;
  values?: Record<string, unknown>; revision?: string }) {
  const read = await db.from('usuarios').select('perfil,datos_entrenamiento,test_atleta,marcas_especificas,historial_marcas,especialidad').eq('codigo', user).single();
  if (read.error || !read.data) throw new Error('HR_ZONE_PROFILE_READ_FAILED');
  const profile = read.data.perfil ?? {}, canonical = projectAthletePrescriptionProfile(read.data);
  const revision = JSON.stringify(profile);
  const existing = admittedHrZones(canonical.running, profile.hrZoneBootstrap);
  if (action === 'read') return { ok: true, state: existing ? 'ADMITTED' : 'UNCONFIGURED', revision,
    system: existing ?? (validHrZoneSystem(profile.hrZoneBootstrap) ? profile.hrZoneBootstrap : null),
    stale: !existing && hrZoneInputsStale(canonical.running, profile.hrZoneBootstrap),
    values: Object.fromEntries(['maxHr', 'restingHr', 'thresholdHr'].map(metric => {
      const r = canonical.running.byMetric[metric], e = r?.resolved;
      return [metric, { value: e?.value.value ?? null,
        source: e?.source ?? null, updatedAt: e?.updatedAt ?? null, status: r?.reason ?? 'unknown' }];
    })) };
  if (action === 'save_values') {
    if (data.revision !== revision) throw Error('HR_ZONE_PROFILE_CHANGED_RETRY');
    const values = data.values;
    if (!values || Object.keys(values).some(k => !['maxHr', 'restingHr', 'thresholdHr'].includes(k))) throw Error('HR_VALUES_INVALID');
    const updated = { ...profile }, now = new Date().toISOString();
    for (const [metric, key] of [['maxHr', 'fc_max'], ['restingHr', 'fc_reposo'], ['thresholdHr', 'umbral_fc']]) {
      if (!Object.hasOwn(values, metric)) continue;
      const value = values[metric];
      if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > 250) throw Error('HR_VALUES_INVALID');
      updated[key] = { value, unit: 'bpm', source: 'profile_editor', updated_at: now };
      if (metric === 'maxHr') { delete updated.fc_maxima; updated.fc_max_metodo = 'real'; }
    }
    const projected = projectAthletePrescriptionProfile({ ...read.data, perfil: updated });
    const max = projected.running.byMetric.maxHr?.resolved?.value.value;
    const rest = projected.running.byMetric.restingHr?.resolved?.value.value;
    if (typeof max === 'number' && typeof rest === 'number' && rest >= max) throw Error('HR_VALUES_INVALID');
    let query = db.from('usuarios').update({ perfil: updated }).eq('codigo', user);
    query = read.data.perfil == null ? query.is('perfil', null) : query.eq('perfil', revision);
    const result = await query.select('codigo');
    if (result.error || !result.data?.length) throw Error('HR_ZONE_PROFILE_CHANGED_RETRY');
    return { ok: true, state: 'SAVED' };
  }
  if (action === 'recalculate') {
    if (data.revision !== revision) throw Error('HR_ZONE_PROFILE_CHANGED_RETRY');
    const proposal = hrZoneProposal(canonical.running, new Date().toISOString(), undefined, true);
    if (!proposal) return { ok: true, state: 'MISSING_INPUTS' };
    return { ok: true, state: 'PROPOSED', proposal, token: issueHrZoneProposal(user, proposal, profile.hrZoneBootstrap) };
  }
  if (action === 'propose') {
    if (data.zones !== undefined && data.revision !== undefined && data.revision !== revision)
      throw Error('HR_ZONE_PROFILE_CHANGED_RETRY');
    if (data.zones === undefined && existing) return { ok: true, state: 'ADMITTED', system: existing };
    if (data.zones === undefined && canonical.prescriptionSignals.signals['capability.canMeasureHeartRate'].state !== 'available') return { ok: true, state: 'NO_MONITOR' };
    if (data.zones === undefined && hrZoneInputsStale(canonical.running, profile.hrZoneBootstrap)) return { ok: true, state: 'STALE_INPUTS' };
    if (data.zones === undefined && profile.hrZoneBootstrap?.confirmation === 'USER_CONFIRMED') return { ok: true, state: 'STALE_SYSTEM' };
    const proposal = hrZoneProposal(canonical.running, new Date().toISOString(), data.zones);
    if (!proposal) {
      if (data.zones !== undefined) throw new Error('HR_ZONES_INVALID');
      return { ok: true, state: 'MISSING_INPUTS' };
    }
    return { ok: true, state: 'PROPOSED', proposal, token: issueHrZoneProposal(user, proposal, profile.hrZoneBootstrap) };
  }
  if (!['confirm', 'rpe'].includes(String(action))) throw new Error('HR_ZONE_ACTION_INVALID');
  const stored = action === 'confirm' ? confirmHrZoneProposal(user, data.token, data.digest, canonical.running, profile.hrZoneBootstrap)
    : { declinedAt: new Date().toISOString() };
  let query = db.from('usuarios').update({ perfil: { ...profile, hrZoneBootstrap: stored } }).eq('codigo', user);
  query = read.data.perfil == null ? query.is('perfil', null) : query.eq('perfil', JSON.stringify(profile));
  const result = await query.select('codigo');
  if (result.error || !result.data?.length) throw new Error('HR_ZONE_PROFILE_CHANGED_RETRY');
  return { ok: true, state: action === 'confirm' ? 'CONFIRMED' : 'RPE' };
}

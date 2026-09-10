import { projectAthletePrescriptionProfile } from './athletePrescriptionContext';
import { admittedHrZones, hrZoneProposal, issueHrZoneProposal, confirmHrZoneProposal } from './hrZoneBootstrap';
import type { HrZone } from '../sports/hrrZonePolicy';

/** Same authenticated chat identity as onboarding; only explicit actions write confirmation. */
export async function hrZoneAction(db: any, user: string, action: unknown, data: { zones?: HrZone[]; token?: unknown; digest?: unknown }) {
  const read = await db.from('usuarios').select('perfil,datos_entrenamiento,test_atleta,marcas_especificas,especialidad').eq('codigo', user).single();
  if (read.error || !read.data) throw new Error('HR_ZONE_PROFILE_READ_FAILED');
  const profile = read.data.perfil ?? {}, canonical = projectAthletePrescriptionProfile(read.data);
  if (action === 'propose') {
    if (canonical.prescriptionSignals.signals['capability.canMeasureHeartRate'].state !== 'available') return { ok: true, state: 'NO_MONITOR' };
    const existing = admittedHrZones(canonical.running, profile.hrZoneBootstrap);
    const declared = data.zones ?? (existing?.origin === 'USER_DECLARED' ? existing.zones : undefined);
    const proposal = hrZoneProposal(canonical.running, new Date().toISOString(), declared);
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

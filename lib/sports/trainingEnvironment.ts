import { equipmentIds, isEquipmentAvailableByEnvironment } from './equipmentCatalog';
/** Domain-owned defaults, not an inventory asserted by the athlete or an LLM. */
export type TrainingEnvironment = 'BOX' | 'GYM' | 'HOME' | 'OUTDOOR' | 'UNKNOWN';
export type EquipmentCapabilityProfile = 'STANDARD_BOX' | 'STANDARD_GYM' | 'EXPLICIT' | 'MINIMAL' | 'UNKNOWN';
export type EnvironmentEvidence = {
  version: 1;
  environment: TrainingEnvironment;
  capabilityProfile: EquipmentCapabilityProfile;
  source: string | null;
  reason: 'catalog_selection' | 'unknown_or_mixed' | 'conflicting_selections';
  implicitEquipmentIds: readonly string[];
  inputPresence: { lugarEntreno: boolean; tipoSala: boolean; material: boolean };
  sessionEnvironmentSource?: 'DATE_OVERRIDE' | 'SESSION_EXPLICIT' | 'SESSION_ASSIGNMENT' | 'PROFILE' | 'UNKNOWN';
  assignedDiscipline?: string | null;
};
const key = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
// Canonical IDs and exact existing questionnaire options only. Mixed locations
// deliberately cannot grant a box inventory to a session that may occur at home.
const locations: Readonly<Record<string, TrainingEnvironment>> = {
  box: 'BOX', gym: 'GYM', home: 'HOME', outdoor: 'OUTDOOR', unknown: 'UNKNOWN',
  'box crossfit (equipamiento completo)': 'BOX',
  'gimnasio convencional adaptado': 'GYM',
  'en casa con equipamiento basico': 'HOME',
};
const rooms: Readonly<Record<string, TrainingEnvironment>> = {
  'sala de pesas completa': 'GYM', 'sala mixta (pesas + cardio)': 'GYM',
};
type EnvironmentInput = { lugar_entreno?: unknown; tipo_sala?: unknown; material?: unknown };
export function resolveTrainingEnvironment(profile: EnvironmentInput): EnvironmentEvidence {
  const evidence: { environment: TrainingEnvironment; source: string }[] = [];
  const add = (value: unknown, catalog: Readonly<Record<string, TrainingEnvironment>>, source: string) => {
    if (value == null || value === '') return;
    const normalized = typeof value === 'string' ? key(value) : '';
    evidence.push({ environment: Object.hasOwn(catalog, normalized) ? catalog[normalized] : 'UNKNOWN', source });
  };
  add(profile.lugar_entreno, locations, 'usuarios.perfil.lugar_entreno');
  add(profile.tipo_sala, rooms, 'usuarios.perfil.tipo_sala');
  const materials = Array.isArray(profile.material) ? profile.material : [profile.material];
  // Individual equipment declarations do not identify a facility. This particular
  // existing multi-select option explicitly declares access to a complete gym.
  if (materials.some(value => typeof value === 'string' && key(value) === 'gimnasio completo'))
    evidence.push({ environment: 'GYM', source: 'usuarios.perfil.material' });
  const distinct = new Set(evidence.map(e => e.environment));
  const environment = distinct.size === 1 ? evidence[0].environment : 'UNKNOWN';
  const capabilityProfile = ({ BOX: 'STANDARD_BOX', GYM: 'STANDARD_GYM', HOME: 'EXPLICIT', OUTDOOR: 'MINIMAL', UNKNOWN: 'UNKNOWN' } as const)[environment];
  return { version: 1, environment, capabilityProfile,
    source: environment === 'UNKNOWN' ? null : evidence[0].source,
    reason: distinct.size > 1 ? 'conflicting_selections' : environment === 'UNKNOWN' ? 'unknown_or_mixed' : 'catalog_selection',
    implicitEquipmentIds: equipmentIds.filter(id => isEquipmentAvailableByEnvironment(id, environment)),
    inputPresence: { lugarEntreno: profile.lugar_entreno != null && profile.lugar_entreno !== '',
      tipoSala: profile.tipo_sala != null && profile.tipo_sala !== '',
      material: Array.isArray(profile.material) ? profile.material.length > 0 : profile.material != null && profile.material !== '' } };
}

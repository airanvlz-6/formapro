import { equipmentIds } from '../sports/equipmentCatalog';
import { resolveTrainingEnvironment, type EnvironmentEvidence } from '../sports/trainingEnvironment';
import { resolveSessionTrainingEnvironment, type SessionEnvironmentInput } from '../sports/sessionTrainingEnvironment';

export type SignalState = 'available' | 'unavailable' | 'unknown' | 'ambiguous';
export type PrescriptionSignal = { state: SignalState; source: string | null; updatedAt: string | null };
export type PrescriptionSignals = { version: 1; signals: Record<string, PrescriptionSignal>; location: unknown;
  environment?: EnvironmentEvidence;
  maxHrMethod: 'declared_real' | 'estimated' | 'unknown' };
export { equipmentIds } from '../sports/equipmentCatalog';
export const capabilityIds = ['canMeasureHeartRate', 'canMeasurePace', 'canMeasureDistance'] as const;
export const signalIds = [...equipmentIds.map(id => `equipment.${id}`), ...capabilityIds.map(id => `capability.${id}`), 'skill.box.advanced', 'skill.carrera.advanced'];
const normalized = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const object = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const materialAliases: Record<string, string[]> = {
  'mancuernas': ['mancuerna'], 'kettlebells': ['kettlebell'], 'bandas elasticas': ['banda'],
  'barra de dominadas': ['barra_dominadas'], 'paralelas / dips': ['paralelas'], 'anillas': ['anillas'],
  'barras y discos': ['barra'], 'barra': ['barra'], 'rack': ['rack'], 'banco': ['banco'],
  'skierg': ['ski_erg'], 'sled / trineo': ['sled'], 'remo / rowerg': ['remo'], 'wall balls': ['balon_medicinal'], 'sandbag': ['sandbag'],
};
/** Material, then environment capabilities, then persistent answers and date overrides. */
export function projectPrescriptionSignals(raw: unknown, asOfDate?: string, session?: SessionEnvironmentInput): PrescriptionSignals {
  const profile = object(raw), signals: Record<string, PrescriptionSignal> = {};
  const set = (id: string, state: SignalState, source: string, updatedAt: string | null = null) => {
    if (signalIds.includes(id)) signals[id] = { state, source, updatedAt };
  };
  for (const id of signalIds) signals[id] = { state: 'unknown', source: null, updatedAt: null };
  const environment = session ? resolveSessionTrainingEnvironment(profile, session) : resolveTrainingEnvironment(profile);
  const materials = Array.isArray(profile.material) ? profile.material : typeof profile.material === 'string' ? [profile.material] : [];
  for (const value of materials) if (typeof value === 'string') {
    const key = normalized(value);
    for (const id of materialAliases[key] || (equipmentIds.includes(key) ? [key] : [])) set(`equipment.${id}`, 'available', 'usuarios.perfil.material');
  }
  for (const id of environment.implicitEquipmentIds)
    set(`equipment.${id}`, 'available', `derived:training_environment:v2:${environment.capabilityProfile}:${environment.source}`);
  const device = typeof profile.dispositivo === 'string' ? normalized(profile.dispositivo) : '';
  if (['si, reloj gps con pulsometro', 'si, solo pulsometro (banda o reloj basico)'].includes(device))
    set('capability.canMeasureHeartRate', 'available', 'usuarios.perfil.dispositivo');
  if (device === 'si, reloj gps con pulsometro') for (const id of ['canMeasurePace', 'canMeasureDistance']) set(`capability.${id}`, 'available', 'usuarios.perfil.dispositivo');
  if (device === 'no, entreno por sensacion (rpe)') set('capability.canMeasureHeartRate', 'unavailable', 'usuarios.perfil.dispositivo');
  // No GPS does not rule out a measured track or another distance measurement method.
  for (const [discipline, field] of [['box', 'nivel_cf'], ['carrera', 'nivel_carrera']] as const) {
    const level = profile[field];
    if (typeof level !== 'string') continue;
    if (['avanzado (+3 años)', 'avanzado (corro con frecuencia)', 'competidor'].map(normalized).includes(normalized(level))) set(`skill.${discipline}.advanced`, 'available', `usuarios.perfil.${field}`);
    else if (/^(principiante|intermedio)/.test(normalized(level))) set(`skill.${discipline}.advanced`, 'unavailable', `usuarios.perfil.${field}`);
  }
  // Explicit progressive answers replace the earlier declaration for that signal only.
  const stored = object(profile.prescription_signals);
  for (const id of signalIds) {
    const entry = object(stored[id]);
    if (['available', 'unavailable', 'ambiguous', 'unknown'].includes(entry.state) && !entry.date)
      set(id, entry.state, `usuarios.perfil.prescription_signals.${id}`, typeof entry.updatedAt === 'string' ? entry.updatedAt : null);
    const daily = object(object(profile.prescription_access)[asOfDate || ''])[id];
    if (daily && ['available', 'unavailable', 'ambiguous', 'unknown'].includes(daily.state))
      set(id, daily.state, `usuarios.perfil.prescription_access.${asOfDate}.${id}`, daily.updatedAt || null);
  }
  return { version: 1, signals, location: profile.lugar_entreno ?? null, environment,
    maxHrMethod: profile.fc_max_metodo === 'formula_edad' ? 'estimated' : profile.fc_max_metodo === 'real' || (typeof profile.fc_max === 'number' && profile.fc_max > 0 && !profile.fc_max_metodo)
      || (typeof profile.fc_max === 'string' && /^\d+(?:\.\d+)?$/.test(profile.fc_max.trim()) && Number(profile.fc_max) > 0 && !profile.fc_max_metodo) ? 'declared_real' : 'unknown' };
}

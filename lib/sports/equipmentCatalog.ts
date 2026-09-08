export type EquipmentCompatibility = 'BOX_COMPATIBLE' | 'GYM_COMPATIBLE' | 'BOTH' | 'EXPLICIT_ONLY';
type EquipmentDefinition = { compatibility: EquipmentCompatibility; family: 'free_weight' | 'support' | 'gymnastics' | 'functional' | 'ergometer' | 'machine' | 'specialized' };
/** Single domain catalog for equipment defaults. Membership is not inferred from
 * movement discipline: e.g. a strongman movement can be allowed at a Box without
 * every Box being assumed to own its implement. Unknown IDs never gain access. */
export const EQUIPMENT_CATALOG = {
  anillas: { compatibility: 'BOX_COMPATIBLE', family: 'gymnastics' },
  assault_bike: { compatibility: 'BOX_COMPATIBLE', family: 'ergometer' },
  balon_medicinal: { compatibility: 'BOTH', family: 'functional' },
  banco: { compatibility: 'BOTH', family: 'support' },
  barra: { compatibility: 'BOTH', family: 'free_weight' },
  barra_dominadas: { compatibility: 'BOTH', family: 'gymnastics' },
  bici_estatica: { compatibility: 'BOTH', family: 'ergometer' },
  bumper: { compatibility: 'BOX_COMPATIBLE', family: 'free_weight' },
  cajon: { compatibility: 'BOX_COMPATIBLE', family: 'functional' },
  comba: { compatibility: 'BOTH', family: 'functional' },
  cuerda: { compatibility: 'BOX_COMPATIBLE', family: 'gymnastics' },
  disco: { compatibility: 'BOTH', family: 'free_weight' },
  echo_bike: { compatibility: 'BOX_COMPATIBLE', family: 'ergometer' },
  ghd: { compatibility: 'BOX_COMPATIBLE', family: 'gymnastics' },
  kettlebell: { compatibility: 'BOTH', family: 'free_weight' },
  // Capability only: this does not add a movement or authorize a new dose.
  leg_press: { compatibility: 'GYM_COMPATIBLE', family: 'machine' },
  mancuerna: { compatibility: 'BOTH', family: 'free_weight' },
  paralelas: { compatibility: 'BOTH', family: 'gymnastics' },
  rack: { compatibility: 'BOTH', family: 'support' },
  remo: { compatibility: 'BOTH', family: 'ergometer' },
  sandbag: { compatibility: 'BOX_COMPATIBLE', family: 'functional' },
  ski_erg: { compatibility: 'BOX_COMPATIBLE', family: 'ergometer' },
  sled: { compatibility: 'BOX_COMPATIBLE', family: 'functional' },
  // Specialized strongman implement: explicit evidence required in any facility.
  yoke: { compatibility: 'EXPLICIT_ONLY', family: 'specialized' },
} as const satisfies Record<string, EquipmentDefinition>;
export const equipmentIds = Object.keys(EQUIPMENT_CATALOG).sort();
export function equipmentCompatibility(id: string): EquipmentCompatibility | null {
  return Object.hasOwn(EQUIPMENT_CATALOG, id) ? EQUIPMENT_CATALOG[id as keyof typeof EQUIPMENT_CATALOG].compatibility : null;
}
export function isEquipmentAvailableByEnvironment(id: string, environment: unknown): boolean {
  if (environment !== 'BOX' && environment !== 'GYM') return false;
  const compatibility = equipmentCompatibility(id);
  return compatibility === 'BOTH' || compatibility === `${environment}_COMPATIBLE`;
}

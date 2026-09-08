import { equipmentCompatibility, isEquipmentAvailableByEnvironment } from './equipmentCatalog';
import { MOVEMENT_LIBRARY } from './movementLibrary';
import type { PrescriptionSignals } from '../athlete/prescriptionSignals';

export const EQUIPMENT_DIAGNOSTIC_LIMIT = 32;
/** Bounded, flat JSON logs from already projected evidence. No reads, no
 * feasibility evaluation, no raw environment strings or arbitrary provenance. */
export function emitEquipmentAuthorityDiagnostic(signals: PrescriptionSignals, movementIds: readonly string[],
  planningRunId?: string, day?: string, log: (line: string) => void = line => console.info(line)): void {
  try {
    const env = signals.environment;
    const resolvedEnvironment = ['BOX', 'GYM', 'HOME', 'OUTDOOR', 'UNKNOWN'].includes(env?.environment || '') ? env!.environment : 'UNKNOWN';
    const required = [...new Set(movementIds.flatMap(id => {
      const movement = Object.hasOwn(MOVEMENT_LIBRARY, id) ? MOVEMENT_LIBRARY[id] : null;
      return movement ? (movement.equipmentRequirements || movement.equipment.map(id => [id])).flat() : [];
    }))].filter(id => equipmentCompatibility(id) !== null).sort();
    const base = {
      planningRunId: typeof planningRunId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(planningRunId) ? planningRunId : null,
      day: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].includes(day || '') ? day : null,
      rawEnvironmentPresent: env?.inputPresence?.lugarEntreno === true,
      rawRoomTypePresent: env?.inputPresence?.tipoSala === true,
      rawMaterialPresent: env?.inputPresence?.material === true,
      resolvedEnvironment,
      resolutionReason: ['catalog_selection', 'unknown_or_mixed', 'conflicting_selections'].includes(env?.reason || '') ? env!.reason : 'unknown_or_mixed',
      totalCount: required.length, truncated: required.length > EQUIPMENT_DIAGNOSTIC_LIMIT,
    };
    const emit = (value: object) => { try { log(JSON.stringify(value)); } catch { /* Logging never controls authority. */ } };
    emit({ event: 'EQUIPMENT_AUTHORITY_SUMMARY', ...base });
    for (const equipmentId of required.slice(0, EQUIPMENT_DIAGNOSTIC_LIMIT)) {
      const signal = signals.signals[`equipment.${equipmentId}`], source = signal?.source;
      const provenance = source === `usuarios.perfil.prescription_signals.equipment.${equipmentId}` ? 'explicit_persistent'
        : typeof source === 'string' && new RegExp(`^usuarios\\.perfil\\.prescription_access\\.\\d{4}-\\d{2}-\\d{2}\\.equipment\\.${equipmentId}$`).test(source) ? 'date_override'
        : source === 'usuarios.perfil.material' ? 'explicit_material'
        : typeof source === 'string' && /^derived:training_environment:v2:STANDARD_(BOX|GYM):usuarios\.perfil\.(lugar_entreno|tipo_sala|material)$/.test(source) ? 'derived_environment' : 'unknown';
      emit({ event: 'EQUIPMENT_AUTHORITY_DETAIL', ...base, equipmentId,
        environmentCompatibility: equipmentCompatibility(equipmentId),
        availableByEnvironment: isEquipmentAvailableByEnvironment(equipmentId, resolvedEnvironment),
        finalEquipmentState: ['available', 'unavailable', 'unknown', 'ambiguous'].includes(signal?.state) ? signal.state : 'unknown', provenance });
    }
  } catch { /* Malformed diagnostic input must not change the planning outcome. */ }
}

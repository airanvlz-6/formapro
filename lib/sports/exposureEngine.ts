// FORGE EXPOSURE ENGINE — registra determinísticamente qué estímulos/movimientos ha recibido
// realmente el atleta y con qué frecuencia, para que el Block Analyzer y el Session Builder
// puedan razonar sobre exposición real, no sobre "el LLM cree que ya hizo esto recientemente".
//
// Fuente de verdad: weekly_plan.sessions[].descripcion_real (texto libre reportado por el atleta)
// + weekly_plan.sessions[].tipo (categoria de sesion). Deterministico: usa matching de texto sobre
// los IDs conocidos de MOVEMENT_LIBRARY, nunca interpretacion del LLM.

import { MOVEMENT_LIBRARY, Movimiento } from "./movementLibrary";
import { legacySessionView } from './sessionPresentation';

/** Structured sibling of the existing textual report. No text parsing or inferred executed reps.
 * Counts distinct sessions and keeps unknown repetitions separate from known subtotals. */
export function buildStructuredExposureReport(rows: { sessionId: string; movementId: string; repetitions: number | null }[]) {
  const known = rows.filter(r => Object.hasOwn(MOVEMENT_LIBRARY, r.movementId));
  const summarize = (entries: typeof rows) => ({ sessions: new Set(entries.map(r => r.sessionId)).size,
    knownRepetitions: entries.reduce((n,r) => n + (r.repetitions ?? 0), 0),
    status: entries.every(r => r.repetitions !== null) ? 'complete' : entries.some(r => r.repetitions !== null) ? 'partial' : 'unknown' });
  return { source: 'ExposureEngine.structured',
    byMovement: Object.fromEntries([...new Set(known.map(r=>r.movementId))].sort().map(id=>[id,summarize(known.filter(r=>r.movementId===id))])),
    byPattern: Object.fromEntries([...new Set(known.map(r=>MOVEMENT_LIBRARY[r.movementId].movement_pattern))].sort()
      .map(pattern=>[pattern,summarize(known.filter(r=>MOVEMENT_LIBRARY[r.movementId].movement_pattern===pattern))])),
    unknownMovementRows: rows.length-known.length };
}

export interface ExposicionMovimiento {
  movementId: string;
  vecesUltimas4Semanas: number;
  ultimaFecha: string | null;
  respuestasReportadas: string[]; // fragmentos relevantes de descripcion_real, para contexto
}

export interface ExposureReport {
  disciplina: string;
  exposiciones: ExposicionMovimiento[];
  estimulosSubexpuestos: string[]; // estimulos de la disciplina con 0 exposiciones recientes
  estimulosSobreexpuestos: string[]; // estimulos con 4+ exposiciones en 4 semanas (posible monotonia)
}

// Normaliza texto para matching determinista (sin tildes, minuscula)
function normalizarTexto(s: string): string {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Detecta si un movimiento de la libreria aparece mencionado en el texto de una sesion real.
// Usa el id (con guiones bajos convertidos a espacios) como termino de busqueda, ademas de
// variantes conocidas del propio movimiento.
function movimientoApareceEnTexto(movimiento: Movimiento, textoNormalizado: string): boolean {
  const terminosBusqueda = [movimiento.id.replace(/_/g, " "), movimiento.id.replace(/_/g, "-"), movimiento.id.replace(/_/g, "")];
  return terminosBusqueda.some(t => textoNormalizado.includes(t));
}

/**
 * Construye el reporte de exposición real del atleta para una disciplina, a partir de las
 * sesiones completadas en las últimas ~4 semanas (recibidas ya consultadas por el caller).
 */
export function buildExposureReport(
  sesionesCompletadas: { fecha: string; tipo: string; titulo: string; descripcionReal: string; structuredPrescription?: Parameters<typeof legacySessionView>[0]['structuredPrescription'] }[],
  disciplina: string
): ExposureReport {
  const movimientosDisciplina = Object.values(MOVEMENT_LIBRARY).filter(m => m.discipline.some(d => d === disciplina));
  const exposiciones: ExposicionMovimiento[] = [];

  movimientosDisciplina.forEach(mov => {
    const sesionesConEsteMovimiento = sesionesCompletadas.filter(s => {
      const textoCompleto = normalizarTexto(`${legacySessionView(s).titulo} ${s.descripcionReal}`);
      return movimientoApareceEnTexto(mov, textoCompleto);
    });

    if (sesionesConEsteMovimiento.length > 0) {
      exposiciones.push({
        movementId: mov.id,
        vecesUltimas4Semanas: sesionesConEsteMovimiento.length,
        ultimaFecha: sesionesConEsteMovimiento.sort((a, b) => b.fecha.localeCompare(a.fecha))[0]?.fecha || null,
        respuestasReportadas: sesionesConEsteMovimiento.slice(0, 2).map(s => s.descripcionReal.substring(0, 150)),
      });
    }
  });

  const idsConExposicion = new Set(exposiciones.map(e => e.movementId));
  const estimulosConExposicion = new Set<string>();
  exposiciones.forEach(e => {
    const mov = MOVEMENT_LIBRARY[e.movementId];
    mov?.suitable_for.forEach(est => estimulosConExposicion.add(est));
  });

  const todosLosEstimulosDisciplina = new Set<string>();
  movimientosDisciplina.forEach(m => m.suitable_for.forEach(est => todosLosEstimulosDisciplina.add(est)));

  const estimulosSubexpuestos = Array.from(todosLosEstimulosDisciplina).filter(est => !estimulosConExposicion.has(est));
  const estimulosSobreexpuestos = exposiciones
    .filter(e => e.vecesUltimas4Semanas >= 4)
    .map(e => MOVEMENT_LIBRARY[e.movementId]?.suitable_for || [])
    .flat();

  return {
    disciplina,
    exposiciones: exposiciones.sort((a, b) => b.vecesUltimas4Semanas - a.vecesUltimas4Semanas),
    estimulosSubexpuestos,
    estimulosSobreexpuestos: Array.from(new Set(estimulosSobreexpuestos)),
  };
}

/**
 * Genera un resumen en texto plano del reporte de exposición, listo para inyectar en un prompt.
 * El LLM recibe esto como CONTEXTO, nunca decide la exposición por su cuenta.
 */
export function exposureReportToPromptText(report: ExposureReport): string {
  if (report.exposiciones.length === 0) {
    return "Sin historial de exposición reciente registrado para esta disciplina — es un atleta nuevo o sin datos suficientes aún.";
  }
  const topExpuestos = report.exposiciones.slice(0, 6).map(e => `${e.movementId} (${e.vecesUltimas4Semanas}x)`).join(", ");
  const subexpuestosTxt = report.estimulosSubexpuestos.length > 0 ? `Estímulos SIN exposición reciente (considera introducirlos): ${report.estimulosSubexpuestos.join(", ")}.` : "";
  const sobreexpuestosTxt = report.estimulosSobreexpuestos.length > 0 ? `Estímulos con posible MONOTONÍA (4+ exposiciones en 4 semanas, considera variar): ${report.estimulosSobreexpuestos.join(", ")}.` : "";
  return `Movimientos más expuestos recientemente: ${topExpuestos}. ${subexpuestosTxt} ${sobreexpuestosTxt}`.trim();
}

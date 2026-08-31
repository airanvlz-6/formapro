// FORGE DECISION LAYER — determina si el estado del atleta (Readiness + carga de la sesion
// prevista) justifica mostrar una sugerencia contextual. NUNCA modifica la sesion — solo
// clasifica el nivel de relevancia y construye el mensaje. La modificacion real solo ocurre
// si el usuario confirma explicitamente tras ver la sugerencia (accion separada, fuera de este motor).
//
// REGLA: Planificacion != ajuste reactivo. La semana generada es la fuente de verdad hasta que
// exista una decision EXPLICITA del usuario de cambiarla.

import { ReadinessResultado } from './readinessEngine';

export type NivelRelevancia = 'normal' | 'señal' | 'relevante' | 'critico';

export interface DecisionContextual {
  nivel: NivelRelevancia;
  mostrarInsight: boolean; // true si nivel >= 'relevante'
  ofrecerRevision: boolean; // true si nivel === 'critico'
  mensaje: string | null;
}

/**
 * Evalua si el Readiness de hoy + la intensidad prevista de la sesion justifican mostrar
 * algo al usuario. Nunca decide el cambio, solo si vale la pena preguntar.
 */
export function evaluarRelevanciaContextual(
  readiness: ReadinessResultado,
  intensidadSesionHoy: 'baja' | 'moderada' | 'alta' | null
): DecisionContextual {
  if (readiness.score === null) {
    return { nivel: 'normal', mostrarInsight: false, ofrecerRevision: false, mensaje: null };
  }

  const scoreBajo = readiness.score < 50;
  const scoreMuyBajo = readiness.score < 35;
  const sesionExigente = intensidadSesionHoy === 'alta';
  const hayCargaAlta = readiness.contribuyentes.carga?.valor === 'alta';

  // CRITICO: score muy bajo + sesion exigente prevista → vale la pena ofrecer revisar
  if (scoreMuyBajo && sesionExigente) {
    return {
      nivel: 'critico', mostrarInsight: true, ofrecerRevision: true,
      mensaje: `Tu recuperación está claramente por debajo de tu normal y la sesión de hoy es exigente. ¿Quieres que revise si merece la pena ajustar algo?`,
    };
  }

  // RELEVANTE: score bajo (sin llegar a critico) O carga alta acumulada + sesion exigente
  if ((scoreBajo && sesionExigente) || (hayCargaAlta && sesionExigente)) {
    return {
      nivel: 'relevante', mostrarInsight: true, ofrecerRevision: true,
      mensaje: readiness.resumenTexto + ' La sesión de hoy tiene carga elevada. ¿Quieres que revise si merece la pena ajustar algo?',
    };
  }

  // SEÑAL: algo notable pero no requiere accion (ej: score bajo pero sesion ya es suave)
  if (scoreBajo || hayCargaAlta) {
    return {
      nivel: 'señal', mostrarInsight: true, ofrecerRevision: false,
      mensaje: readiness.resumenTexto,
    };
  }

  // NORMAL: nada relevante que mostrar
  return { nivel: 'normal', mostrarInsight: false, ofrecerRevision: false, mensaje: null };
}
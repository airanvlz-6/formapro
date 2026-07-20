// FORGE SCIENTIFIC VALIDATOR — Biblioteca de reglas deterministas de metodologia.
// Cada regla es independiente, pequeña y testeable. Recibe el contexto necesario
// y devuelve las sesiones ya corregidas (con notas de validador añadidas si aplica).
// Activar/desactivar reglas es tan simple como comentar su linea en aplicarTodasLasReglas.

export interface ContextoValidacion {
  sesiones: any[];
  analisis: any; // salida del Block Analyzer
  estructura: any; // salida del Week Planner
  esDeload: boolean;
  hayLesionLumbarActiva: boolean;
  estadoFisio?: { hrv?: number; sueno?: number; fatiga_aguda?: number };
  debilidadesActivas?: any[];
  historialFisiologico?: { fecha: string; hrv?: number; sueno?: number }[];
}

// 001 — Deload nunca aumenta volumen/intensidad
function regla001Deload(ctx: ContextoValidacion) {
  if (!ctx.esDeload) return;
  ctx.sesiones.forEach((s: any) => {
    if (/aumenta(r|mos)?\s+(el\s+)?volumen|carga\s+maxima|nuevo\s+RM/i.test(s.descripcion || "")) {
      s.descripcion = (s.descripcion || "") + "\n\n⚠️ NOTA VALIDADOR [001-Deload]: Esta semana es DELOAD — reduce intensidad/volumen un 30-40% respecto a la semana anterior, no la aumentes.";
    }
  });
}

// 002 — Lesion lumbar activa: evitar peso muerto pesado sin variante conservadora
function regla002Lumbar(ctx: ContextoValidacion) {
  if (!ctx.hayLesionLumbarActiva) return;
  ctx.sesiones.forEach((s: any) => {
    if (/peso\s+muerto|deadlift/i.test(s.descripcion || "") && !/RDL|rumano|conservador|ligero|tecnica/i.test(s.descripcion || "")) {
      s.descripcion = (s.descripcion || "") + "\n\n⚠️ NOTA VALIDADOR [002-Lumbar]: Hay una molestia lumbar activa registrada — prioriza variantes conservadoras (RDL, técnica ligera) sobre carga máxima en este movimiento.";
    }
  });
}

// 003 — Evitar alta intensidad en dias consecutivos
function regla003IntensidadConsecutiva(ctx: ContextoValidacion) {
  ctx.sesiones.forEach((s: any, idx: number) => {
    const anterior = ctx.sesiones[idx - 1];
    if (anterior && /Z4|Z5|RPE\s*[89]|AMRAP|WOD/i.test(s.descripcion || "") && /Z4|Z5|RPE\s*[89]|AMRAP|WOD/i.test(anterior.descripcion || "")) {
      s.descripcion = (s.descripcion || "") + "\n\n⚠️ NOTA VALIDADOR [003-Intensidad]: El día anterior también fue de alta intensidad — vigila señales de fatiga acumulada y ajusta si es necesario.";
    }
  });
}

// 004 — Volumen semanal no debe dispararse respecto a semana anterior (heurística simple por conteo de series/reps mencionadas)
function regla004VolumenSemanal(ctx: ContextoValidacion) {
  // Heurística ligera: contar menciones de "series" o "x" (patron series x reps) como proxy de volumen
  const contarVolumen = (texto: string) => (texto.match(/\d+\s*x\s*\d+/g) || []).length;
  const volumenTotal = ctx.sesiones.reduce((acc: number, s: any) => acc + contarVolumen(s.descripcion || ""), 0);
  if (ctx.esDeload && volumenTotal > 25) {
    ctx.sesiones[0].descripcion = (ctx.sesiones[0].descripcion || "") + `\n\n⚠️ NOTA VALIDADOR [004-Volumen]: El volumen total estimado de la semana (${volumenTotal} bloques series×reps) parece alto para una semana deload — revisa si corresponde reducirlo.`;
  }
}

// 005 — Progresion de cargas: detectar saltos de peso irrealmente grandes (heurística simple sobre numeros seguidos de kg)
function regla005ProgresionCargas(ctx: ContextoValidacion) {
  ctx.sesiones.forEach((s: any) => {
    const pesos = [...(s.descripcion || "").matchAll(/(\d{2,3})\s*kg/gi)].map(m => parseInt(m[1]));
    if (pesos.length >= 2) {
      const max = Math.max(...pesos);
      const min = Math.min(...pesos);
      if (max > min * 1.5 && max - min > 30) {
        s.descripcion = (s.descripcion || "") + `\n\n⚠️ NOTA VALIDADOR [005-Progresion]: Se detectan cargas muy dispares en la misma sesión (${min}kg a ${max}kg) — verifica que no sea un salto de progresión irreal.`;
      }
    }
  });
}

// 006 — Recuperacion baja (HRV/sueño) no deberia acompañarse de VO2max/alta intensidad
function regla006Recuperacion(ctx: ContextoValidacion) {
  const hrv = ctx.estadoFisio?.hrv;
  const sueno = ctx.estadoFisio?.sueno;
  const recuperacionBaja = (hrv !== undefined && hrv < 60) || (sueno !== undefined && sueno < 60);
  if (!recuperacionBaja) return;
  ctx.sesiones.forEach((s: any, idx: number) => {
    if (idx === 0 && /VO2max|Z5|sprint/i.test(s.descripcion || "")) {
      s.descripcion = (s.descripcion || "") + "\n\n⚠️ NOTA VALIDADOR [006-Recuperacion]: Los últimos indicadores de recuperación (HRV/sueño) están bajos — considera reducir la intensidad de esta sesión si persiste el estado al llegar el día.";
    }
  });
}

// 007 — Consistencia con el objetivo del Block Analyzer
function regla007ConsistenciaBloque(ctx: ContextoValidacion) {
  const objetivo = (ctx.analisis?.objetivo || "").toLowerCase();
  const esObjetivoRecuperacion = /recuperacion|descarga|deload/.test(objetivo);
  if (!esObjetivoRecuperacion) return;
  ctx.sesiones.forEach((s: any) => {
    if (/hero\s+wod|benchmark|competicion|test\s+de\s+fuerza\s+maxima/i.test(s.descripcion || "")) {
      s.descripcion = (s.descripcion || "") + "\n\n⚠️ NOTA VALIDADOR [007-ConsistenciaBloque]: El objetivo de esta semana es recuperación, pero esta sesión parece de alta exigencia — verifica que sea coherente con el bloque.";
    }
  });
}

// 008 — Consistencia entre lo que decidio el Week Planner y lo que escribio el Session Builder
function regla008ConsistenciaPlanner(ctx: ContextoValidacion) {
  const estructuraSessions = ctx.estructura?.sessions || [];
  ctx.sesiones.forEach((s: any) => {
    const planeada = estructuraSessions.find((e: any) => e.dia === s.dia);
    if (!planeada) return;
    const tipoPlaneado = (planeada.tipo || "").toLowerCase();
    const tipoReal = (s.tipo || "").toLowerCase();
    if (tipoPlaneado && tipoReal && tipoPlaneado !== tipoReal && tipoPlaneado !== "otro") {
      s.descripcion = (s.descripcion || "") + `\n\n⚠️ NOTA VALIDADOR [008-ConsistenciaPlanner]: El planificador había decidido tipo "${tipoPlaneado}" para este día, pero la sesión generada es de tipo "${tipoReal}" — verifica coherencia.`;
    }
  });
}

// 009 — Debilidad activa sin trabajo relacionado durante la semana
function regla009AthleteDevelopment(ctx: ContextoValidacion) {
  const debilidadPrioritaria = ctx.analisis?.debilidad_prioritaria;
  if (!debilidadPrioritaria) return;
  const algunaSesionLaTrabaja = ctx.sesiones.some((s: any) => s.debilidad_relacionada === debilidadPrioritaria);
  if (!algunaSesionLaTrabaja && ctx.sesiones.length > 0) {
    ctx.sesiones[0].descripcion = (ctx.sesiones[0].descripcion || "") + `\n\n⚠️ NOTA VALIDADOR [009-AthleteDevelopment]: La debilidad prioritaria "${debilidadPrioritaria}" no aparece trabajada en ninguna sesión de esta semana — considera incluirla.`;
  }
}

// 010 — Repeticion excesiva del mismo ejercicio principal en la semana
function regla010RepeticionExcesiva(ctx: ContextoValidacion) {
  const extraerEjercicioPrincipal = (texto: string) => {
    const match = texto.match(/(back squat|front squat|deadlift|peso muerto|snatch|clean|press banca|press militar)/i);
    return match ? match[1].toLowerCase() : null;
  };
  const conteo: Record<string, number> = {};
  ctx.sesiones.forEach((s: any) => {
    const ej = extraerEjercicioPrincipal(s.descripcion || "");
    if (ej) conteo[ej] = (conteo[ej] || 0) + 1;
  });
  Object.entries(conteo).forEach(([ejercicio, count]) => {
    if (count >= 4) {
      const primeraSesion = ctx.sesiones.find((s: any) => extraerEjercicioPrincipal(s.descripcion || "") === ejercicio);
      if (primeraSesion) {
        primeraSesion.descripcion = (primeraSesion.descripcion || "") + `\n\n⚠️ NOTA VALIDADOR [010-Repeticion]: "${ejercicio}" aparece ${count} veces esta semana — verifica que haya suficiente variedad de estímulos.`;
      }
    }
  });
}

// Registro central de reglas activas. Comentar una linea = desactivar esa regla.
export function aplicarTodasLasReglas(ctx: ContextoValidacion) {
  regla001Deload(ctx);
  regla002Lumbar(ctx);
  regla003IntensidadConsecutiva(ctx);
  regla004VolumenSemanal(ctx);
  regla005ProgresionCargas(ctx);
  regla006Recuperacion(ctx);
  regla007ConsistenciaBloque(ctx);
  regla008ConsistenciaPlanner(ctx);
  regla009AthleteDevelopment(ctx);
  regla010RepeticionExcesiva(ctx);
  return ctx.sesiones;
}
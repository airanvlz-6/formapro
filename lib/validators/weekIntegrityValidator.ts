// FORGE WEEK INTEGRITY VALIDATOR
// Componente independiente del Scientific Validator. Aplica de forma deterministica las reglas
// definidas en FORGE_SEMANA_CANONICA.md: disponibilidad, variedad, jerarquia deportiva.
// Principio: el proposito no es generar la mejor semana posible, sino impedir que Forge genere
// una semana incompatible con la realidad del atleta.

interface SesionSemana {
  dia: string;
  tipo: string;
  titulo?: string;
  debilidad_relacionada?: string | null;
  completada?: boolean;
  [key: string]: any;
}

interface DistribucionSemanal {
  [disciplina: string]: string[] | string; // ej: {box: ["lunes","miercoles"], pista: ["martes"], observaciones: "..."}
}

interface ResultadoIntegridad {
  valido: boolean;
  violaciones: string[];
  diasCorregir: string[]; // dias que deberian regenerarse por no respetar disponibilidad
}

const normalizarDia = (d: string) => (d || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// Regla 1 — Disponibilidad: cada dia de distribucion_semanal.X debe tener el tipo correspondiente
function verificarDisponibilidad(sesiones: SesionSemana[], distribucion: DistribucionSemanal | null): { violaciones: string[]; diasCorregir: string[] } {
  const violaciones: string[] = [];
  const diasCorregir: string[] = [];
  if (!distribucion) return { violaciones, diasCorregir };

  // Mapeo de claves de disponibilidad a tipos esperados de sesion
  const MAPEO_TIPO: Record<string, string[]> = {
    box: ["box"],
    pista: ["carrera", "carrera_series", "carrera_larga", "intervalos"],
    carrera: ["carrera", "carrera_series", "carrera_larga", "intervalos"],
    gimnasticos: ["gimnasticos", "fuerza"],
    descanso: ["descanso"]
  };

  Object.entries(distribucion).forEach(([clave, dias]) => {
    if (clave === "observaciones" || !Array.isArray(dias)) return;
    const tiposEsperados = MAPEO_TIPO[clave.toLowerCase()] || [clave.toLowerCase()];
    dias.forEach((diaEsperado: string) => {
      const diaNorm = normalizarDia(diaEsperado);
      const sesionDelDia = sesiones.find(s => normalizarDia(s.dia) === diaNorm);
      if (!sesionDelDia) return;
      if (sesionDelDia.completada) return; // dias ya completados no se corrigen, se preservan
      const tipoReal = (sesionDelDia.tipo || "").toLowerCase();
      const cumple = tiposEsperados.some(t => tipoReal.includes(t) || t.includes(tipoReal));
      if (!cumple) {
        violaciones.push(`Disponibilidad: ${diaEsperado} debia ser tipo "${clave}" pero se genero tipo "${sesionDelDia.tipo}"`);
        diasCorregir.push(sesionDelDia.dia);
      }
    });
  });

  return { violaciones, diasCorregir };
}

// Regla 2 — Variedad: ninguna debilidad puede monopolizar la semana (max 3 dias)
function verificarVariedad(sesiones: SesionSemana[]): { violaciones: string[]; diasCorregir: string[] } {
  const violaciones: string[] = [];
  const diasCorregir: string[] = [];
  const conteo: Record<string, string[]> = {};

  sesiones.forEach(s => {
    if (!s.debilidad_relacionada) return;
    if (!conteo[s.debilidad_relacionada]) conteo[s.debilidad_relacionada] = [];
    conteo[s.debilidad_relacionada].push(s.dia);
  });

  Object.entries(conteo).forEach(([debilidad, dias]) => {
    if (dias.length > 3) {
      violaciones.push(`Variedad: la debilidad "${debilidad}" monopoliza ${dias.length} dias de la semana (${dias.join(", ")}) — maximo recomendado 3`);
      // Marcar para corregir los dias excedentes (a partir del 4to)
      diasCorregir.push(...dias.slice(3));
    }
  });

  return { violaciones, diasCorregir };
}

// Regla de Blueprint — validacion TEMPRANA a nivel de estructura, ANTES de construir sesiones completas.
// Corrige el Blueprint (solo tipo/dia) antes de gastar 7 llamadas al Session Builder.
export function validarBlueprintDisponibilidad(blueprint: { dia: string; tipo: string; [k: string]: any }[], distribucion: DistribucionSemanal | null): { valido: boolean; correcciones: { dia: string; tipoCorrecto: string }[] } {
  const correcciones: { dia: string; tipoCorrecto: string }[] = [];
  if (!distribucion) return { valido: true, correcciones };

  const MAPEO_TIPO: Record<string, string[]> = {
    box: ["box"],
    pista: ["carrera", "carrera_series", "carrera_larga", "intervalos"],
    carrera: ["carrera", "carrera_series", "carrera_larga", "intervalos"],
    gimnasticos: ["gimnasticos", "fuerza"],
    descanso: ["descanso"]
  };

  Object.entries(distribucion).forEach(([clave, dias]) => {
    if (clave === "observaciones" || !Array.isArray(dias)) return;
    const tipoCorrecto = clave === "box" ? "box" : clave === "pista" ? "carrera" : clave;
    dias.forEach((diaEsperado: string) => {
      const diaNorm = normalizarDia(diaEsperado);
      const diaBlueprint = blueprint.find(d => normalizarDia(d.dia) === diaNorm);
      if (!diaBlueprint) return;
      const tiposEsperados = MAPEO_TIPO[clave.toLowerCase()] || [clave.toLowerCase()];
      const tipoReal = (diaBlueprint.tipo || "").toLowerCase();
      const cumple = tiposEsperados.some(t => tipoReal.includes(t) || t.includes(tipoReal));
      if (!cumple) {
        correcciones.push({ dia: diaBlueprint.dia, tipoCorrecto });
      }
    });
  });

  return { valido: correcciones.length === 0, correcciones };
}

// Punto de entrada unico: aplica todas las reglas de integridad semanal
export function validarIntegridadSemana(sesiones: SesionSemana[], distribucionSemanal: string | DistribucionSemanal | null): ResultadoIntegridad {
  let distribucionParsed: DistribucionSemanal | null = null;
  if (typeof distribucionSemanal === "string") {
    try { distribucionParsed = JSON.parse(distribucionSemanal); } catch { distribucionParsed = null; }
  } else {
    distribucionParsed = distribucionSemanal;
  }

  const resultDisponibilidad = verificarDisponibilidad(sesiones, distribucionParsed);
  const resultVariedad = verificarVariedad(sesiones);

  const violaciones = [...resultDisponibilidad.violaciones, ...resultVariedad.violaciones];
  const diasCorregir = [...new Set([...resultDisponibilidad.diasCorregir, ...resultVariedad.diasCorregir])];

  return {
    valido: violaciones.length === 0,
    violaciones,
    diasCorregir
  };
}
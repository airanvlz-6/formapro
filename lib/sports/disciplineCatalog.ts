// FORGE DISCIPLINE CATALOG — fuente unica de verdad sobre que contenido pertenece a cada disciplina.
// Reutilizable por Session Builder, Regeneracion Forzada, Validators, Discovery, Coach, etc.

export interface DisciplinaCatalogo {
  permitido: string[];
  prohibido: string[];
}

export const CATALOGO_DISCIPLINAS: Record<string, DisciplinaCatalogo> = {
  carrera: {
    permitido: ["rodaje continuo", "series/intervalos (1000m, 800m, 400m)", "tempo run", "fartlek", "cuestas", "tecnica de carrera (skipping, drills)", "progresivos", "carrera larga Z2"],
    prohibido: ["press banca", "bench press", "flyes", "fondos", "dips", "press militar", "cualquier ejercicio de pesas de tren superior", "WOD de box", "halterofilia"]
  },
  box: {
    permitido: ["halterofilia (snatch, clean & jerk)", "WODs", "gimnasticos (pull-ups, HSPU, muscle-ups)", "metcons", "benchmarks CrossFit"],
    prohibido: ["sesiones de carrera pura sin ningun componente de box/gimnastico/halterofilia"]
  },
  fuerza: {
    permitido: ["sentadilla", "peso muerto", "press", "remo", "accesorios de fuerza", "hipertrofia"],
    prohibido: ["carrera continua de larga duracion sin componente de fuerza"]
  },
  descanso: {
    permitido: ["movilidad ligera", "caminar", "estiramientos"],
    prohibido: ["cualquier entrenamiento de intensidad"]
  }
};

export function getCatalogoDisciplina(disciplina: string): DisciplinaCatalogo {
  return CATALOGO_DISCIPLINAS[disciplina] || CATALOGO_DISCIPLINAS.box;
}

// Validacion deterministica post-generacion: verifica que la descripcion generada no contenga
// terminos prohibidos de otra disciplina. No confia solo en que el prompt se haya respetado.
export function validarCatalogoDisciplina(disciplina: string, descripcion: string): { valido: boolean; terminosProhibidosEncontrados: string[] } {
  const catalogo = getCatalogoDisciplina(disciplina);
  const descripcionLower = (descripcion || "").toLowerCase();
  const terminosProhibidosEncontrados = catalogo.prohibido.filter(termino =>
    descripcionLower.includes(termino.toLowerCase())
  );
  return {
    valido: terminosProhibidosEncontrados.length === 0,
    terminosProhibidosEncontrados
  };
}

export function buildCatalogoPrompt(disciplina: string): string {
  const catalogo = getCatalogoDisciplina(disciplina);
  return `PERMITIDO para esta sesion:\n${catalogo.permitido.map(p => `- ${p}`).join("\n")}\n\nPROHIBIDO ABSOLUTAMENTE:\n${catalogo.prohibido.map(p => `- ${p}`).join("\n")}`;
}
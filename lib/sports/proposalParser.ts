// FORGE PROPOSAL PARSER — deteccion 100% deterministica de una propuesta de modificacion de sesion
// en el texto de respuesta del Coach. Nunca depende de que el LLM genere un tag correctamente.
// Mismo principio que el Strength Record Parser: el LLM razona y comunica, el parser decide y guarda.

export interface ParsedProposal {
  detected: boolean;
  dia: string | null;
  motivo: string | null;
}

const DIAS_SEMANA: Record<string, string> = {
  lunes: "lunes", martes: "martes", "miercoles": "miercoles", "miércoles": "miercoles",
  jueves: "jueves", viernes: "viernes", sabado: "sabado", "sábado": "sabado", domingo: "domingo",
  hoy: "__HOY__", mañana: "__MANANA__", "manana": "__MANANA__"
};

// Verbos/frases que indican que el Coach esta proponiendo un cambio (no solo describiendo el plan actual)
const PATRON_PROPUESTA = /\b(propongo|te propongo|podr[ií]amos cambiar|mi recomendaci[oó]n es|sustituir[ií]a|sustituimos|movería|cambiar[ií]a|cambiamos|creo que ser[ií]a mejor|modificamos|modificar[ií]a|ajustamos|ajustar[ií]a)\b/i;

// Palabras que confirman que se esta hablando de una sesion/entreno (no de otra cosa)
const PATRON_SESION = /\b(sesi[oó]n|entreno|entrenamiento|plan de hoy|descanso activo)\b/i;

// Pregunta de confirmacion tipica al final de una propuesta
const PATRON_PREGUNTA_CONFIRMACION = /\¿(confirmas|te parece|est[aá]s de acuerdo|procedo|adelante)/i;

export function parseSessionProposal(respuestaCoach: string, mensajeUsuario: string): ParsedProposal {
  const textoCompleto = `${mensajeUsuario} ${respuestaCoach}`.toLowerCase();

  // Debe haber lenguaje de propuesta + mencion de sesion + (idealmente) pregunta de confirmacion
  const tienePropuesta = PATRON_PROPUESTA.test(respuestaCoach);
  const tieneSesion = PATRON_SESION.test(textoCompleto);
  const tienePregunta = PATRON_PREGUNTA_CONFIRMACION.test(respuestaCoach);

  if (!tienePropuesta || !tieneSesion || !tienePregunta) {
    return { detected: false, dia: null, motivo: null };
  }

  // Buscar el dia mencionado (prioriza el texto del usuario, luego el del coach)
  let diaEncontrado: string | null = null;
  for (const [clave, valor] of Object.entries(DIAS_SEMANA)) {
    if (textoCompleto.includes(clave)) {
      diaEncontrado = valor;
      break;
    }
  }
  // Resolver "hoy"/"mañana" a dia real
  if (diaEncontrado === "__HOY__" || diaEncontrado === "__MANANA__") {
    const hoyReal = new Date();
    if (diaEncontrado === "__MANANA__") hoyReal.setDate(hoyReal.getDate() + 1);
    const DIAS_ORDEN = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
    diaEncontrado = DIAS_ORDEN[hoyReal.getDay()];
  }

  if (!diaEncontrado) {
    return { detected: false, dia: null, motivo: null };
  }

  // Extraer motivo breve: buscar palabras clave de causa comunes
  const motivoMatch = textoCompleto.match(/(hrv|sueño|sueno|fatiga|calor|molestia|lesión|lesion|cansad|dolor)[a-záéíóúñ\s]{0,60}/i);
  const motivo = motivoMatch ? motivoMatch[0].trim() : "ajuste según contexto reportado";

  return { detected: true, dia: diaEncontrado, motivo };
}
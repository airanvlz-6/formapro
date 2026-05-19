'use client';
import { useState, useRef, useEffect } from "react";

const C = {
  bg: "#F6F4F0", card: "#FFFFFF", ink: "#1A1A1A", muted: "#6B6B6B",
  border: "#E5E0D8", accent: "#1A3C5E", accentLight: "#E8EEF4",
  warm: "#D4622A", warmLight: "#FDF0EB", tag: "#EDEAE4", success: "#2D6A4F", successLight: "#D8F3DC",
};

const CATEGORIAS = [
  { id: "carrera", emoji: "🏃", titulo: "Carrera", subtitulo: "Running & Trail", desc: "Para amantes del running o quienes se inician. Desde tu primer km hasta tu mejor marca.", color: "#1A3C5E", colorLight: "#E8EEF4" },
  { id: "funcional", emoji: "⚡", titulo: "Funcional", subtitulo: "Fitness & Bienestar", desc: "Dinámico y adaptable. Ideal para mantenerse en forma, bajar de peso o sentirse mejor.", color: "#2D6A4F", colorLight: "#D8F3DC" },
  { id: "hibrido", emoji: "🔄", titulo: "Hibrido", subtitulo: "Resistencia + Fuerza", desc: "Para atletas que buscan mejorar en resistencia y fuerza/potencia simultaneamente.", color: "#6B3FA0", colorLight: "#EDE7F6" },
  { id: "fuerza", emoji: "🏋️", titulo: "Fuerza", subtitulo: "Powerlifting & Olimpico", desc: "Para quienes buscan aumentar marcas en levantamientos olímpicos o powerlifting.", color: "#B5300B", colorLight: "#FDECEA" },
];

const FORMULARIOS: Record<string, Array<{id: string; label: string; tipo: string; opciones?: string[]; placeholder?: string}>> = {
  carrera: [
    { id: "edad", label: "¿Cuántos años tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Mas de 50"] },
    { id: "sexo", label: "¿Con que género te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    { id: "nivel", label: "¿Cual es tu experiencia en carrera?", tipo: "opciones", opciones: ["Inicio ahora (0-3 meses)", "Principiante (3-12 meses)", "Intermedio (1-3 años)", "Avanzado (+3 años)"] },
    { id: "distancia_objetivo", label: "¿Cual es tu distancia objetivo?", tipo: "opciones", opciones: ["5K", "10K", "Media maratón (21K)", "Maratón (42K)", "Trail / Ultra", "Sin distancia fija"] },
    { id: "marca_actual", label: "¿Tienes alguna marca de referencia?", tipo: "texto", placeholder: "Ej: corro 5K en 30 min, o nunca he corrido en carrera organizada" },
    { id: "dias", label: "¿Cuántos días por semana puedes entrenar?", tipo: "opciones", opciones: ["2 dias", "3 dias", "4 dias", "5 dias", "6 dias"] },
    { id: "duracion", label: "¿Cuánto tiempo disponible por sesión?", tipo: "opciones", opciones: ["30 min", "45 min", "1 hora", "1h 30min", "Más de 1h 30min"] },
    { id: "superficie", label: "¿Donde sueles entrenar?", tipo: "multi", opciones: ["Asfalto / ciudad", "Pista de atletismo", "Trail / montaña", "Cinta de correr", "Campo de hierba"] },
    { id: "lesiones", label: "¿Tienes lesiones o molestias?", tipo: "texto", placeholder: "Ej: periostitis, fascitis, rodilla... o ninguna" },
    { id: "objetivo_detalle", label: "¿Qué quieres conseguir exactamente?", tipo: "texto", placeholder: "Ej: completar mi primer 10K en junio, bajar de 45 min..." },
  ],
  funcional: [
    { id: "edad", label: "¿Cuántos años tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Más de 50"] },
    { id: "sexo", label: "¿Con qué género te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    { id: "nivel", label: "¿Cuál es tu nivel de experiencia?", tipo: "opciones", opciones: ["Sedentario / Empiezo de cero", "Algo activo (ejercicio ocasional)", "Moderado (1-2 años)", "Avanzado (+2 años)"] },
    { id: "objetivo_principal", label: "¿Cuál es tu objetivo principal?", tipo: "opciones", opciones: ["Perder peso / reducir grasa", "Tonificar y definir", "Ganar energía y bienestar", "Mejorar movilidad", "Mantenerme en forma"] },
    { id: "dias", label: "¿Cuántos días por semana puedes entrenar?", tipo: "opciones", opciones: ["2 días", "3 días", "4 días", "5 días"] },
    { id: "duracion", label: "¿Cuánto tiempo por sesión?", tipo: "opciones", opciones: ["20-30 min", "30-45 min", "45-60 min", "Más de 1 hora"] },
    { id: "material", label: "¿Con qué equipamiento cuentas?", tipo: "multi", opciones: ["Solo mi cuerpo (casa / parque)", "Mancuernas", "Bandas elásticas", "Kettlebells", "Máquinas de gimnasio", "Barra de dominadas"] },
    { id: "lesiones", label: "¿Tienes alguna limitación física o lesión?", tipo: "texto", placeholder: "Ej: dolor lumbar, rodilla operada... o ninguna" },
    { id: "objetivo_detalle", label: "Cuéntame tu situación y objetivo", tipo: "texto", placeholder: "Ej: tengo 15 kg de más, entreno por las mañanas..." },
  ],
  funcional_crossfit: [
    { id: "edad", label: "¿Cuántos años tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Más de 50"] },
    { id: "sexo", label: "¿Con qué género te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    { id: "nivel_cf", label: "¿Cuál es tu nivel en CrossFit?", tipo: "opciones", opciones: ["Principiante (0-1 año)", "Intermedio (1-3 años)", "Avanzado (+3 años)", "Competidor"] },
    { id: "nivel_olimpico", label: "¿Cómo es tu nivel en movimientos olímpicos?", tipo: "opciones", opciones: ["Ninguno / muy básico", "Básico (técnica en proceso)", "Competente (buena técnica)", "Avanzado (cargas altas)"] },
    { id: "gimnasticos", label: "¿Qué movimientos gimnásticos dominas?", tipo: "multi", opciones: ["Pull-ups / Chin-ups", "Toes to bar", "Handstand / HSPU", "Muscle-up en barra", "Muscle-up en anillas", "Double unders", "Ninguno aún"] },
    { id: "objetivo_cf", label: "¿Cuál es tu objetivo principal en CrossFit?", tipo: "opciones", opciones: ["Mejorar mi rendimiento general en el box", "Conseguir nuevos skills gimnásticos", "Mejorar técnica y carga en halterofilia", "Prepararme para competir en Open", "Mejorar movilidad y movimiento funcional"] },
    { id: "dias", label: "¿Cuántos días por semana puedes entrenar?", tipo: "opciones", opciones: ["3 días", "4 días", "5 días", "6 días"] },
    { id: "duracion", label: "¿Cuánto tiempo por sesión?", tipo: "opciones", opciones: ["45 min", "1 hora", "1h 30min", "Más de 1h 30min"] },
    { id: "lugar_entreno", label: "¿Dónde entrenas habitualmente?", tipo: "opciones", opciones: ["Box CrossFit (equipamiento completo)", "Gimnasio convencional adaptado", "En casa con equipamiento básico", "Mixto (box + casa)"] },
    { id: "punto_debil", label: "¿Cuál es tu mayor punto débil?", tipo: "opciones", opciones: ["Cardio / resistencia metabólica", "Fuerza máxima", "Técnica olímpica", "Movimientos gimnásticos", "Todos por igual"] },
    { id: "lesiones", label: "¿Lesiones o limitaciones actuales?", tipo: "texto", placeholder: "Ej: hombro, muñecas, lumbar... o ninguna" },
    { id: "objetivo_detalle", label: "¿Qué quieres conseguir?", tipo: "texto", placeholder: "Ej: mejorar mi Fran, conseguir el muscle-up, competir en Open..." },
  ],
  funcional_calistenia: [
    { id: "edad", label: "¿Cuántos años tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Más de 50"] },
    { id: "sexo", label: "¿Con qué género te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    { id: "nivel", label: "¿Cuál es tu nivel en calistenia?", tipo: "opciones", opciones: ["Principiante (0-1 año)", "Intermedio (1-3 años)", "Avanzado (+3 años)"] },
    { id: "dominadas", label: "¿Cuántas dominadas seguidas puedes hacer?", tipo: "opciones", opciones: ["Ninguna aún", "1-3 dominadas", "4-8 dominadas", "9-15 dominadas", "Más de 15 dominadas"] },
    { id: "fondos", label: "¿Cuántos fondos en paralelas seguidos?", tipo: "opciones", opciones: ["Ninguno aún", "1-5 fondos", "6-15 fondos", "Más de 15 fondos"] },
    { id: "habilidades_actuales", label: "¿Qué habilidades dominas actualmente?", tipo: "multi", opciones: ["Pull-ups / Chin-ups", "Dips en paralelas", "Muscle-up en barra", "Muscle-up en anillas", "Front lever", "Back lever", "Planche (cualquier progresión)", "Handstand (parada de manos)", "Ninguna aún"] },
    { id: "objetivo_skill", label: "¿Qué habilidad quieres conseguir o mejorar?", tipo: "texto", placeholder: "Ej: front lever, planche, muscle-up en anillas, handstand push-up..." },
    { id: "dias", label: "¿Cuántos días por semana puedes entrenar?", tipo: "opciones", opciones: ["2 días", "3 días", "4 días", "5 días"] },
    { id: "duracion", label: "¿Cuánto tiempo por sesión?", tipo: "opciones", opciones: ["30 min", "45 min", "1 hora", "Más de 1 hora"] },
    { id: "material", label: "¿Con qué equipamiento cuentas?", tipo: "multi", opciones: ["Barra de dominadas", "Paralelas / dips", "Anillas", "Parque de calistenia", "Solo suelo"] },
    { id: "objetivo_fisico", label: "¿Tienes también un objetivo físico?", tipo: "opciones", opciones: ["Solo skills y fuerza relativa", "Ganar algo de músculo", "Perder grasa mientras gano fuerza", "Solo mantenimiento y skills"] },
    { id: "lesiones", label: "¿Lesiones o limitaciones actuales?", tipo: "texto", placeholder: "Ej: hombro, codo, muñeca, lumbar... o ninguna" },
    { id: "objetivo_detalle", label: "¿Qué quieres conseguir exactamente?", tipo: "texto", placeholder: "Ej: conseguir el front lever en 4 meses, dominar el handstand..." },
  ],
  hibrido_hyrox: [
    { id: "edad", label: "¿Cuántos años tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Más de 50"] },
    { id: "sexo", label: "¿Con qué género te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    { id: "nivel_hyrox", label: "¿Cuál es tu experiencia en Hyrox?", tipo: "opciones", opciones: ["Nunca he competido", "1 carrera completada", "2-4 carreras", "Competidor habitual"] },
    { id: "tiempo_objetivo", label: "¿Cuál es tu tiempo objetivo?", tipo: "texto", placeholder: "Ej: terminar por primera vez, bajar de 1h30, sub 1h..." },
    { id: "punto_debil_hyrox", label: "¿Cuál es tu mayor punto débil?", tipo: "opciones", opciones: ["La carrera entre estaciones", "SkiErg", "Sled Push/Pull", "Burpees broad jumps", "Wall balls", "Rowing / Farmers carry", "Sandbag / Lunges"] },
    { id: "dias", label: "¿Cuántos días por semana puedes entrenar?", tipo: "opciones", opciones: ["3 días", "4 días", "5 días", "6 días"] },
    { id: "duracion", label: "¿Cuánto tiempo por sesión?", tipo: "opciones", opciones: ["45 min", "1 hora", "1h 30min", "Más de 1h 30min"] },
    { id: "material", label: "¿Tienes acceso al material de Hyrox?", tipo: "multi", opciones: ["SkiErg", "Sled / trineo", "Remo / RowErg", "Kettlebells", "Wall balls", "Sandbag", "Solo equipamiento básico"] },
    { id: "proxima_carrera", label: "¿Tienes carrera próxima?", tipo: "opciones", opciones: ["Sí, en menos de 6 semanas", "Sí, en 6-12 semanas", "Sí, en más de 3 meses", "No tengo fecha aún"] },
    { id: "lesiones", label: "¿Lesiones o limitaciones?", tipo: "texto", placeholder: "Ej: rodilla, hombro, lumbar... o ninguna" },
    { id: "objetivo_detalle", label: "¿Cuál es tu objetivo principal?", tipo: "texto", placeholder: "Ej: terminar mi primer Hyrox, bajar de 1h30 en categoría Open..." },
  ],
  hibrido_general: [
    { id: "edad", label: "¿Cuántos años tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Más de 50"] },
    { id: "sexo", label: "¿Con qué género te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    { id: "experiencia_fuerza", label: "¿Cuánta experiencia tienes en fuerza?", tipo: "opciones", opciones: ["Poca o ninguna", "1-2 años", "2-4 años", "Más de 4 años"] },
    { id: "experiencia_cardio", label: "Y en resistencia / cardio?", tipo: "opciones", opciones: ["Poca o ninguna", "1-2 anos", "2-4 anos", "Mas de 4 anos"] },
    { id: "prioridad", label: "Que quieres priorizar?", tipo: "opciones", opciones: ["50/50 equilibrado", "Mas fuerza que resistencia", "Mas resistencia que fuerza", "Potencia explosiva"] },
    { id: "marcas_actuales", label: "Cuales son tus marcas de referencia?", tipo: "texto", placeholder: "Ej: peso muerto 100kg, corro 10K en 50min..." },
    { id: "dias", label: "Cuantos dias por semana puedes entrenar?", tipo: "opciones", opciones: ["3 dias", "4 dias", "5 dias", "6 dias"] },
    { id: "duracion", label: "Cuanto tiempo por sesion?", tipo: "opciones", opciones: ["45 min", "1 hora", "1h 30min", "Mas de 1h 30min"] },
    { id: "material", label: "Con que equipamiento cuentas?", tipo: "multi", opciones: ["Gimnasio completo", "Barras y discos", "Mancuernas", "Kettlebells", "Cinta / Pista", "Bicicleta / Cicloergometro"] },
    { id: "lesiones", label: "Lesiones o limitaciones relevantes?", tipo: "texto", placeholder: "Ej: hombro derecho limitado, lumbar recurrente, o ninguna" },
    { id: "objetivo_detalle", label: "¿Qué quieres lograr en los próximos 3-6 meses?", tipo: "texto", placeholder: "Ej: aumentar peso muerto y correr 10K en menos de 50min..." },
  ],
  hibrido_ocr: [
    { id: "edad", label: "¿Cuántos años tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Más de 50"] },
    { id: "sexo", label: "¿Con qué género te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    { id: "nivel_ocr", label: "¿Cuál es tu experiencia en OCR?", tipo: "opciones", opciones: ["Nunca he competido", "1-2 carreras completadas", "3-5 carreras", "Competidor habitual"] },
    { id: "carrera_objetivo", label: "¿Qué tipo de carrera tienes en mente?", tipo: "opciones", opciones: ["Spartan Sprint (5K)", "Spartan Super (13K)", "Spartan Beast (21K+)", "Tough Mudder", "Otra OCR local"] },
    { id: "nivel_carrera", label: "¿Cómo es tu nivel de carrera?", tipo: "opciones", opciones: ["Principiante (nunca corro)", "Básico (corro ocasionalmente)", "Intermedio (corro regularmente)", "Avanzado (corro con frecuencia)"] },
    { id: "obstaculos_debiles", label: "¿Cuáles son tus obstáculos más débiles?", tipo: "multi", opciones: ["Escalada de cuerda", "Barras y monkey bars", "Arrastre y empuje de peso", "Natación / agua", "Lanzamiento (jabalina, saco)", "Muros altos", "Todos por igual"] },
    { id: "fuerza_agarre", label: "¿Cómo valoras tu fuerza de agarre y tracción?", tipo: "opciones", opciones: ["Muy débil (no puedo hacer dominadas)", "Básica (1-5 dominadas)", "Intermedia (5-15 dominadas)", "Fuerte (+15 dominadas)"] },
    { id: "dias", label: "¿Cuántos días por semana puedes entrenar?", tipo: "opciones", opciones: ["3 días", "4 días", "5 días", "6 días"] },
    { id: "duracion", label: "¿Cuánto tiempo por sesión?", tipo: "opciones", opciones: ["45 min", "1 hora", "1h 30min", "Más de 1h 30min"] },
    { id: "material", label: "¿Con qué equipamiento cuentas?", tipo: "multi", opciones: ["Barra de dominadas", "Anillas / TRX", "Kettlebells / sacos", "Cuerda de escalada", "Acceso a terreno trail", "Gimnasio completo", "Solo cuerpo y parque"] },
    { id: "proxima_carrera", label: "¿Tienes carrera próxima?", tipo: "opciones", opciones: ["Sí, en menos de 6 semanas", "Sí, en 6-12 semanas", "Sí, en más de 3 meses", "No tengo fecha aún"] },
    { id: "lesiones", label: "¿Lesiones o limitaciones actuales?", tipo: "texto", placeholder: "Ej: hombro, rodilla, muñeca... o ninguna" },
    { id: "objetivo_detalle", label: "¿Cuál es tu objetivo principal?", tipo: "texto", placeholder: "Ej: terminar mi primer Spartan Beast, mejorar en obstáculos de agarre..." },
  ],
  hibrido_triatlon: [
    { id: "edad", label: "¿Cuántos años tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Más de 50"] },
    { id: "sexo", label: "¿Con qué género te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    { id: "modalidad_tri", label: "¿Qué distancia te interesa?", tipo: "opciones", opciones: ["Sprint (750m/20K/5K)", "Olímpico (1.5K/40K/10K)", "Half (1.9K/90K/21K)", "Ironman (3.8K/180K/42K)", "Duatlón (carrera+bici)"] },
    { id: "nivel_natacion", label: "¿Cómo es tu nivel en natación?", tipo: "opciones", opciones: ["No sé nadar / muy básico", "Principiante (técnica en proceso)", "Intermedio (cómodo en agua)", "Avanzado (técnica sólida)"] },
    { id: "nivel_ciclismo", label: "¿Cómo es tu nivel en ciclismo?", tipo: "opciones", opciones: ["Muy ocasional", "Principiante", "Intermedio", "Avanzado"] },
    { id: "nivel_carrera", label: "¿Cómo es tu nivel en carrera a pie?", tipo: "opciones", opciones: ["Muy ocasional", "Principiante", "Intermedio", "Avanzado"] },
    { id: "punto_debil", label: "¿Cuál es tu disciplina más débil?", tipo: "opciones", opciones: ["Natación", "Ciclismo", "Carrera a pie", "Las tres por igual"] },
    { id: "dias", label: "¿Cuántos días por semana puedes entrenar?", tipo: "opciones", opciones: ["3 días", "4 días", "5 días", "6 días", "7 días"] },
    { id: "duracion", label: "¿Cuánto tiempo por sesión?", tipo: "opciones", opciones: ["45 min", "1 hora", "1h 30min", "Más de 1h 30min"] },
    { id: "material", label: "¿Con qué equipamiento cuentas?", tipo: "multi", opciones: ["Bicicleta de ruta / triatlón", "Bicicleta de montaña", "Rodillo / bici estática", "Acceso a piscina", "Material de natación (gafas, paletas)", "Zapatillas de running"] },
    { id: "proxima_carrera", label: "¿Tienes competición próxima?", tipo: "opciones", opciones: ["Sí, en menos de 8 semanas", "Sí, en 2-4 meses", "Sí, en más de 4 meses", "No tengo fecha aún"] },
    { id: "lesiones", label: "¿Lesiones o limitaciones actuales?", tipo: "texto", placeholder: "Ej: hombro de nadador, rodilla ciclismo, fascitis... o ninguna" },
    { id: "objetivo_detalle", label: "¿Cuál es tu objetivo principal?", tipo: "texto", placeholder: "Ej: terminar mi primer triatlón sprint, bajar de 5h en un Half..." },
  ],
  fuerza: [
    { id: "edad", label: "¿Cuántos anos tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Mas de 50"] },
    { id: "sexo", label: "¿Con qué genero te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    
    { id: "nivel", label: "¿Cuántos anos llevas entrenando fuerza?", tipo: "opciones", opciones: ["Menos de 1 ano", "1-2 anos", "2-4 anos", "Mas de 4 anos"] },
    { id: "marcas", label: "¿Cuáles son tus marcas actuales (1RM)?", tipo: "texto", placeholder: "Ej: SQ 120kg / BP 90kg / DL 150kg" },
    { id: "competicion", label: "¿Tienes competición o fecha objetivo?", tipo: "opciones", opciones: ["Si, en menos de 3 meses", "Si, en 3-6 meses", "Si, en mas de 6 meses", "No compito"] },
    { id: "dias", label: "¿Cuántos días puedes entrenar fuerza?", tipo: "opciones", opciones: ["3 dias", "4 dias", "5 dias", "6 dias"] },
    { id: "duracion", label: "¿Cuánto tiempo por sesión?", tipo: "opciones", opciones: ["1 hora", "1h 30min", "2 horas", "Mas de 2 horas"] },
    { id: "puntos_debiles", label: "¿Cuál es tu eslabón más débil?", tipo: "texto", placeholder: "Ej: cajon bajo en sentadilla, lockout en press banca..." },
    { id: "lesiones", label: "¿Lesiones o limitaciones?", tipo: "texto", placeholder: "Ej: muñecas limitadas, lumbar sensible, o ninguna" },
    { id: "objetivo_detalle", label: "¿Qué quieres lograr exactamente?", tipo: "texto", placeholder: "Ej: romper 1RM en sentadilla, clasificarme para campeonato..." },
  ],
};

const buildPrompt = (cat: {id: string; titulo: string}, perfil: Record<string, string | string[]>, marcas: {fecha: string; valor: string}[] = [], historialResumen: string = "") => {
  const perfilStr = Object.entries(perfil).map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("\n");
  const marcasStr = marcas.length > 0 ? marcas.map(m => `- ${m.fecha}: ${m.valor}`).join("\n") : "Sin registros aún";
  return `Eres el coach de Forge, sistema de asesoramiento de entrenamiento personalizado.
Tu filosofía: la programación se adapta al deportista, no al revés. Habla siempre en español correcto con tildes, ñ y todos los caracteres del idioma.

PERFIL:
${perfilStr}

PROGRESO REGISTRADO:
${marcasStr}

${historialResumen ? `SESIONES ANTERIORES:\n${historialResumen}` : ""}

PRINCIPIOS: Periodizacion cientifica (lineal/DUP/bloques segun nivel), sobrecarga progresiva, deload cada 3-4 semanas, especificidad al objetivo, adaptacion a lesiones y equipamiento.
- FECHA HOY: ${new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
- FORMATO: Max 400 palabras salvo rutina. Rutina: DIA/EJERCICIO/SERIES x REPS/DESCANSO. Ajusta cambios inmediatamente con justificacion.
${({carrera:`CARRERA: Ciclos 4sem, progresion vol max 10%/sem, zonas Z1-Z5, rodaje largo+series+fuerza complementaria.`,funcional:`FUNCIONAL: Bloques 4-6sem, movilidad+activacion+principal+finisher, patrones empuje/tiron/bisagra/sentadilla/core.`,hibrido:`HIBRIDO: Bloques, minimiza interferencia, fuerza 80-90% 1RM + resistencia Z2/umbral/VO2max.`,fuerza:`FUERZA: Lineal (principiantes), DUP/5-3-1 (intermedios), bloques acumulacion/intensificacion/realizacion (avanzados), % 1RM o RPE.`}[cat.id]||"")}`;
};

const ESPECIALIDADES: Record<string, string[]> = {
  carrera: ["Running (asfalto / ciudad)", "Trail Running / Montana", "Maraton / Media maraton", "Atletismo en pista"],
  funcional: ["Fitness general / Bienestar", "CrossFit / WOD", "Calistenia / Movimiento"],
  hibrido: ["Hibrido general (fuerza + cardio)", "Hyrox", "Triatlon / Duatlon", "OCR / Obstaculos"],
  fuerza: ["Powerlifting (SQ / BP / DL)", "Halterofilia (Arrancada / 2T)", "Strongman / Fuerza general"],
};

const ESPECIALIDAD_KEY: Record<string, Record<string, string>> = {
  carrera: {
    "Running (asfalto / ciudad)": "carrera",
    "Trail Running / Montana": "carrera",
    "Maraton / Media maraton": "carrera",
    "Atletismo en pista": "carrera",
  },
  funcional: {
    "Fitness general / Bienestar": "funcional_fitness",
    "CrossFit / WOD": "funcional_crossfit",
    "Calistenia / Movimiento": "funcional_calistenia",
  },
  hibrido: {
    "Hibrido general (fuerza + cardio)": "hibrido_general",
    "Hyrox": "hibrido_hyrox",
    "Triatlon / Duatlon": "hibrido_triatlon",
    "OCR / Obstaculos": "hibrido_ocr",
  },
  fuerza: {
    "Powerlifting (SQ / BP / DL)": "fuerza_powerlifting",
    "Halterofilia (Arrancada / 2T)": "fuerza_halterofilia",
    "Strongman / Fuerza general": "fuerza_strongman",
  },
};

const SUGERENCIAS: Record<string, string[]> = {
  carrera: ["Ajusta el volumen", "Registro nueva marca", "Tengo carrera en 3 semanas", "Me duele la rodilla"],
  funcional: ["Tengo menos tiempo", "Registro mi peso actual", "Cambia el entreno de hoy", "Estoy muy cansado"],
  hibrido: ["Prioriza mas fuerza", "Registro mis marcas", "Tengo competicion pronto", "Resumen de mi progreso"],
  fuerza: ["Sube la intensidad", "Registro nuevo 1RM", "Mi sentadilla esta estancada", "Resumen de progreso"],
};

const FREE_LIMIT = 20;
const generarCodigo = () => { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let r = "FP-"; for(let i=0;i<5;i++) r+=c[Math.floor(Math.random()*c.length)]; return r; };

type Categoria = typeof CATEGORIAS[0];
type Pregunta = {id: string; label: string; tipo: string; opciones?: string[]; placeholder?: string};
type Marca = {fecha: string; valor: string};
type UsuarioData = {codigo: string; categoria: string; especialidad: string; perfil: Record<string, string | string[]>; rutina: string; historial: {role: string; content: string}[]; marcas: Marca[]; email?: string; [key: string]: unknown};

const Progreso = ({actual,total,color}:{actual:number;total:number;color:string}) => (
  <div style={{width:"100%",height:3,background:C.border,borderRadius:10,marginBottom:28}}>
    <div style={{height:3,borderRadius:10,background:color,width:`${(actual/total)*100}%`,transition:"width 0.4s ease"}}/>
  </div>
);

const Chip = ({active,onClick,children,color}:{active:boolean;onClick:()=>void;children:React.ReactNode;color:string}) => (
  <button onClick={onClick} style={{padding:"9px 16px",borderRadius:100,fontSize:13.5,cursor:"pointer",border:active?`2px solid ${color}`:`2px solid ${C.border}`,background:active?color+"18":C.card,color:active?color:C.ink,fontWeight:active?600:400,transition:"all 0.15s",fontFamily:"inherit"}}>{children}</button>
);

const MensajeTexto = ({texto}:{texto:string}) => (
  <div style={{fontSize:14,lineHeight:1.8,color:C.ink}}>
    {texto.split("\n").map((l,i)=>{
      if(!l.trim()) return <div key={i} style={{height:6}}/>;
      const h=l.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>").replace(/\*(.*?)\*/g,"<em>$1</em>");
      if(l.startsWith("### ")) return <div key={i} style={{fontWeight:700,fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:1.5,marginTop:14}} dangerouslySetInnerHTML={{__html:h.replace(/^###\s*/,"")}} />;
      if(l.startsWith("## ")) return <div key={i} style={{fontWeight:700,fontSize:15,marginTop:16}} dangerouslySetInnerHTML={{__html:h.replace(/^##\s*/,"")}} />;
      if(l.match(/^[-]/)) return <div key={i} style={{paddingLeft:16,position:"relative",marginBottom:2}}><span style={{position:"absolute",left:4,color:C.muted}}>.</span><span dangerouslySetInnerHTML={{__html:h.replace(/^[-]\s*/,"")}} /></div>;
      return <div key={i} dangerouslySetInnerHTML={{__html:h}}/>;
    })}
  </div>
);

export default function Forge() {
  const [pantalla,setPantalla]=useState("inicio");
  const [categoria,setCategoria]=useState<string|null>(null);
  const [pregIdx,setPregIdx]=useState(0);
  const [respuestas,setRespuestas]=useState<Record<string,string|string[]>>({});
  const [selMulti,setSelMulti]=useState<string[]>([]);
  const [textoTemp,setTextoTemp]=useState("");
  const [mensajes,setMensajes]=useState<{role:string;content:string}[]>([]);
  const [historial,setHistorial]=useState<{role:string;content:string}[]>([]);
  const [input,setInput]=useState("");
  const [cargando,setCargando]=useState(false);
  const [generando,setGenerando]=useState(false);
  const [msgCount,setMsgCount]=useState(0);
  const [codigoUsuario,setCodigoUsuario]=useState("");
  const [codigoInput,setCodigoInput]=useState("");
  const [marcas,setMarcas]=useState<Marca[]>([]);
  const [mostrarMarcas,setMostrarMarcas]=useState(false);
  const [nuevaMarca,setNuevaMarca]=useState("");
  const [codigoGuardado,setCodigoGuardado]=useState("");
const [errorCodigo,setErrorCodigo]=useState("");
const [espLabel,setEspLabel]=useState<string|null>(null);
const [espKey,setEspKey]=useState<string|null>(null);
const [emailGuardado,setEmailGuardado]=useState(false);
const [esPremium,setEsPremium]=useState(false);
const [esAdmin,setEsAdmin]=useState(false);
const [emailBanner,setEmailBanner]=useState("");
const [bannerEnviado,setBannerEnviado]=useState(false);
const [mostrarPerfil,setMostrarPerfil]=useState(false);
const [nuevoCodigo,setNuevoCodigo]=useState("");
const [nuevoEmail,setNuevoEmail]=useState("");
const [mensajePerfil,setMensajePerfil]=useState("");
const [errorPerfil,setErrorPerfil]=useState("");
const [editandoPerfil,setEditandoPerfil]=useState(false);
const [perfilEdit,setPerfilEdit]=useState<Record<string,string>>({});
const [email,setEmail]=useState("");
const [codigoPersonal,setCodigoPersonal]=useState("");
const [errorCodigoPersonal,setErrorCodigoPersonal]=useState("");
const [emailInput,setEmailInput]=useState("");
const [mostrarRecuperar,setMostrarRecuperar]=useState(false);
const [mensajeRecuperar,setMensajeRecuperar]=useState("");
  const bottomRef=useRef<HTMLDivElement>(null);
  const inputRef=useRef<HTMLTextAreaElement>(null);

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[mensajes,cargando,generando]);

  const cat=categoria?CATEGORIAS.find((c:Categoria)=>c.id===categoria):null;
  const preguntas:Pregunta[]=(espKey?FORMULARIOS[espKey]:null)||(categoria?FORMULARIOS[categoria]:[])||[];
  const pregActual=preguntas[pregIdx];
  const bloqueado=!esPremium&&!esAdmin&&msgCount>=FREE_LIMIT;
  const accentColor=cat?.color||C.accent;

  const apiCall=async(body:Record<string,unknown>):Promise<any>=>{
    let intentos=0;
    while(intentos<3){
      try{
        const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
        if(res.ok) return res.json();
        intentos++;
        await new Promise(r=>setTimeout(r,1000));
      }catch{intentos++;}
    }
    return {error:"Error de conexion tras 3 intentos"};
  };

  const recuperarPorEmail=async()=>{
  if(!emailInput.trim()) return;
  setMensajeRecuperar("");
  const data=await apiCall({action:"recuperar_por_email",email:emailInput.trim().toLowerCase(),codigo:"",datos:{}});
  if(data.error||!data.data){setMensajeRecuperar("No encontramos ninguna cuenta con ese email.");return;}
  setMensajeRecuperar(`Tu código es: ${data.data.codigo}`);
};
  const recuperarUsuario=async()=>{
    if(!codigoInput.trim()) return;
    setErrorCodigo("");
    const data=await apiCall({action:"recuperar_usuario",codigo:codigoInput.trim().toUpperCase()});
    if(data.error){setErrorCodigo("Codigo no encontrado. Verifica e intentalo de nuevo.");return;}
    const u:UsuarioData=data.data;
    setCodigoUsuario(u.codigo);setCategoria(u.categoria);setRespuestas(u.perfil);
    setMarcas(u.marcas||[]);setHistorial(u.historial||[]);
    setMensajes(u.historial?.filter((m:{role:string})=>m.role==="assistant").slice(-1)||[]);
    const consultasUsadas=Math.floor((u.historial?.length||0)/2);
    setMsgCount(consultasUsadas);setPantalla("chat");
    setEmailGuardado(!!u.email);
    setEsPremium(!!(u as any).premium);
    setEsAdmin(!!(u as any).admin);
    setTimeout(()=>reanudarSesion(u),300);
  };

  const reanudarSesion=async(u:UsuarioData)=>{
    setGenerando(true);
    const catObj=CATEGORIAS.find((c:Categoria)=>c.id===u.categoria)!;
    const resumen=u.historial?.slice(-6).map((m:{role:string;content:string})=>`${m.role==="user"?"Usuario":"Coach"}: ${m.content.substring(0,150)}...`).join("\n")||"";
    const prompt="Hola de nuevo! Estoy de vuelta. Recuerdame brevemente en que punto estabamos, como va mi progreso y que toca esta semana.";
    const consultasActuales=Math.floor((u.historial?.length||0)/2);
    const nuevoHist=[...(u.historial||[]),{role:"user",content:prompt}];
    try{
      const data=await apiCall({model:"claude-sonnet-4-5",max_tokens:4000,system:buildPrompt(catObj,u.perfil,u.marcas||[],resumen),messages:nuevoHist});
      const texto=data.content?.map((b:{text?:string})=>b.text||"").join("")||"Error.";
      const hist=[...nuevoHist,{role:"assistant",content:texto}];
      setMensajes([{role:"assistant",content:texto}]);
      setHistorial(u.historial||[]);
      setMsgCount(consultasActuales);
    }catch{setMensajes([{role:"assistant",content:"Error al reanudar sesion."}]);}
    finally{setGenerando(false);}
  };

  const irACategoria=(catId:string)=>{setCategoria(catId);setEspKey(null);setEspLabel(null);setPregIdx(0);setRespuestas({});setSelMulti([]);setTextoTemp("");setPantalla("especialidad");};
const elegirEspecialidad=(label:string)=>{const key=ESPECIALIDAD_KEY[categoria!]?.[label]||categoria!;setEspKey(key);setEspLabel(label);setRespuestas({especialidad:label});setPregIdx(0);setPantalla("formulario");};

  const avanzar=()=>{
    const val=pregActual.tipo==="multi"?selMulti:pregActual.tipo==="texto"?textoTemp:respuestas[pregActual.id];
    if(!val||(Array.isArray(val)&&val.length===0)||(typeof val==="string"&&!val.trim())) return;
    const nuevas={...respuestas,[pregActual.id]:val};
    setRespuestas(nuevas);setSelMulti([]);setTextoTemp("");
    if(pregIdx<preguntas.length-1){setPregIdx(pregIdx+1);}else{setRespuestas(nuevas);setPantalla("final");}
  };

  const toggleMulti=(op:string)=>setSelMulti(prev=>prev.includes(op)?prev.filter(x=>x!==op):[...prev,op]);

  const iniciarChat=async(perfil:Record<string,string|string[]>)=>{
    setPantalla("chat");setGenerando(true);
    const catObj=CATEGORIAS.find((c:Categoria)=>c.id===categoria)!;
    let codigo=codigoPersonal.trim().length>=5?codigoPersonal.trim():generarCodigo();
    if(codigoPersonal.trim().length>=5){
      const dataVerify=await apiCall({action:"recuperar_usuario",codigo});
      if(!dataVerify.error){setErrorCodigoPersonal("Este código ya existe, elige otro.");setGenerando(false);setPantalla("final");return;}
    }
    setErrorCodigoPersonal("");setCodigoGuardado(codigo);
const prompt = "¡Hola! Acabo de completar mi perfil. Por favor: 1) Dame la bienvenida breve demostrando que entiendes mi situación, especialidad y objetivo concreto. 2) Explica en 3-4 líneas la metodología y periodización que vas a aplicar conmigo y por qué. 3) Muéstrame solo los primeros 2-3 días de entrenamiento con todos los detalles (ejercicios, series, reps, descansos). 4) Pregúntame si esto se ajusta a lo que busco o si quiero cambiar algo antes de que desarrolles el resto de la semana.";
    try{
      const data=await apiCall({model:"claude-sonnet-4-5",max_tokens:4000,system:buildPrompt(catObj,perfil),messages:[{role:"user",content:prompt}]});
      const texto=data.content?.map((b:{text?:string})=>b.text||"").join("")||"Error al conectar.";
      const hist=[{role:"user",content:prompt},{role:"assistant",content:texto}];
      setMensajes([{role:"assistant",content:texto}]);setHistorial(hist);setMsgCount(1);setCodigoUsuario(codigo);setEmailGuardado(!!email);
      console.log("Guardando usuario con email:", email);
await apiCall({action:"guardar_usuario",datos:{codigo,categoria,perfil,rutina:texto,historial:hist,marcas:[],email:email||null}});
    }catch{setMensajes([{role:"assistant",content:"Error de conexion. Por favor recarga."}]);}
    finally{setGenerando(false);setTimeout(()=>inputRef.current?.focus(),300);}
  };

  const enviar=async(texto:string=input)=>{
    if(!texto.trim()||cargando||bloqueado) return;
    const nuevoHist=[...historial,{role:"user",content:texto.trim()}];
    setMensajes(prev=>[...prev,{role:"user",content:texto.trim()}]);
    setInput("");setCargando(true);setMsgCount(c=>c+1);
    const catObj=CATEGORIAS.find((c:Categoria)=>c.id===categoria)!;
    try{
      const resumen=historial.slice(-6).map(m=>`${m.role==="user"?"Usuario":"Coach"}: ${m.content.substring(0,150)}...`).join("\n");
      const data=await apiCall({model:"claude-sonnet-4-5",max_tokens:4000,system:buildPrompt(catObj,respuestas,marcas,resumen),messages:nuevoHist});
      const respText=data.content?.map((b:{text?:string})=>b.text||"").join("")||"Error.";
      const hist=[...nuevoHist,{role:"assistant",content:respText}];
      setMensajes(prev=>[...prev,{role:"assistant",content:respText}]);setHistorial(hist);
      if(codigoUsuario) await apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{historial:hist}});
    }catch{setMensajes(prev=>[...prev,{role:"assistant",content:"Error. Intentalo de nuevo."}]);}
    finally{setCargando(false);}
  };

  const actualizarPerfil=async()=>{
    setMensajePerfil(""); setErrorPerfil("");
    if(nuevoCodigo.trim().length>0&&nuevoCodigo.trim().length<5){setErrorPerfil("El código debe tener al menos 5 caracteres.");return;}
    if(nuevoCodigo.trim().length>=5){
      const verify=await apiCall({action:"recuperar_usuario",codigo:nuevoCodigo.trim().toUpperCase()});
      if(!verify.error){setErrorPerfil("Ese código ya existe, elige otro.");return;}
    }
    const datos: Record<string,string>={};
    if(nuevoCodigo.trim().length>=5) datos.codigo=nuevoCodigo.trim().toUpperCase();
    if(nuevoEmail.trim()) datos.email=nuevoEmail.trim().toLowerCase();
    if(Object.keys(datos).length===0){setErrorPerfil("Introduce al menos un cambio.");return;}
    await apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos});
    if(datos.codigo){setCodigoUsuario(datos.codigo);setCodigoGuardado(datos.codigo);}
    if(datos.email) setEmailGuardado(true);
    setNuevoCodigo(""); setNuevoEmail("");
    setMensajePerfil("Perfil actualizado correctamente.");
    setTimeout(()=>setMensajePerfil(""),3000);
  };

const registrarMarca=async()=>{
    if(!nuevaMarca.trim()) return;
    const nueva:Marca={fecha:new Date().toLocaleDateString("es-ES"),valor:nuevaMarca.trim()};
    const nuevasMarcas=[...marcas,nueva];
    setMarcas(nuevasMarcas);setNuevaMarca("");setMostrarMarcas(false);
    if(codigoUsuario) await apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{marcas:nuevasMarcas}});
    enviar(`He registrado una nueva marca: ${nueva.valor}. Analiza este progreso y ajusta mi programacion si es necesario.`);
  };

  const handleKey=(e:React.KeyboardEvent)=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();enviar();}};
  const restantes=FREE_LIMIT-msgCount;

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'DM Sans', sans-serif",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 16px"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Playfair+Display:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        h1,h2,h3{font-family:'Playfair Display',Georgia,serif;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px;}
        .cat-card{transition:all 0.2s;cursor:pointer;}
        .cat-card:hover{transform:translateY(-3px);border-color:#999 !important;}
        .btn-main{transition:all 0.15s;}
        .btn-main:hover{filter:brightness(0.88);}
        .btn-main:active{transform:scale(0.97);}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .fade-up{animation:fadeUp 0.3s ease forwards;}
        @keyframes dotPulse{0%,80%,100%{opacity:0.25;transform:scale(0.8)}40%{opacity:1;transform:scale(1)}}
        .dot{width:7px;height:7px;border-radius:50%;animation:dotPulse 1.3s infinite;display:inline-block;}
        textarea,input{resize:none;font-family:inherit;}
        textarea:focus,input:focus{outline:none;}
        .sugg:hover{opacity:0.75;}
      `}</style>

      {pantalla==="inicio"&&(
        <div className="fade-up" style={{maxWidth:520,width:"100%",textAlign:"center"}}>
          <div style={{fontSize:44,marginBottom:16}}>🏅</div>
          <h1 style={{fontSize:"clamp(36px,8vw,54px)",color:C.ink,lineHeight:1.1,marginBottom:14}}>Forge</h1>
          <p style={{color:C.muted,fontSize:17,lineHeight:1.65,marginBottom:8}}>Coach de entrenamiento personal. Siempre disponible, seguimiento de progreso y adaptado a tu vida.</p>
          <p style={{color:C.muted,fontSize:14,marginBottom:32}}>Tu programa evoluciona contigo cada semana.</p>
          <button className="btn-main" onClick={()=>setPantalla("categoria")} style={{background:C.ink,color:"#fff",border:"none",borderRadius:14,padding:"16px 40px",fontSize:16,fontWeight:600,cursor:"pointer",width:"100%",maxWidth:360,marginBottom:20}}>
            Crear mi programa
          </button>
          <div style={{maxWidth:360,margin:"0 auto"}}>
            <p style={{color:C.muted,fontSize:13,marginBottom:10}}>Ya tienes un programa? Introduce tu codigo:</p>
            <div style={{display:"flex",gap:8}}>
              <input value={codigoInput} onChange={e=>setCodigoInput(e.target.value.toUpperCase())} placeholder="FP-XXXXX"
                style={{flex:1,border:`2px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.ink,background:C.card,letterSpacing:2,textAlign:"center"}}
                onKeyDown={e=>e.key==="Enter"&&recuperarUsuario()}
              />
              <button className="btn-main" onClick={recuperarUsuario} style={{background:C.accent,color:"#fff",border:"none",borderRadius:12,padding:"12px 18px",fontSize:14,fontWeight:600,cursor:"pointer"}}>
                Entrar
              </button>
            </div>
            {errorCodigo&&<p style={{color:C.warm,fontSize:12,marginTop:8}}>{errorCodigo}</p>}
<button onClick={(e)=>{e.stopPropagation();setMostrarRecuperar(!mostrarRecuperar);}} style={{background:"none",border:"none",color:C.muted,fontSize:12,cursor:"pointer",marginTop:8,textDecoration:"underline"}}>
  He perdido mi código
</button>
{mostrarRecuperar&&(
  <div style={{marginTop:12,padding:"16px",background:C.card,borderRadius:14,border:`1px solid ${C.border}`}}>
    <p style={{color:C.muted,fontSize:13,marginBottom:10}}>Introduce el email con el que te registraste:</p>
    <div style={{display:"flex",gap:8}}>
      <input value={emailInput} onChange={e=>setEmailInput(e.target.value)} placeholder="tu@email.com"
        style={{flex:1,border:`2px solid ${C.border}`,borderRadius:10,padding:"9px 12px",fontSize:13,color:C.ink,background:C.bg}}
        onKeyDown={e=>e.key==="Enter"&&recuperarPorEmail()}
      />
      <button onClick={(e)=>{e.stopPropagation();recuperarPorEmail();}} style={{background:C.accent,color:"#fff",border:"none",borderRadius:10,padding:"9px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
        Buscar
      </button>
    </div>
    {mensajeRecuperar&&<p style={{color:C.success,fontSize:13,marginTop:8,fontWeight:600}}>{mensajeRecuperar}</p>}
  </div>
)}
          </div>
          <p style={{color:C.muted,fontSize:12,marginTop:20}}>{FREE_LIMIT} consultas gratuitas - Sin registro</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center",marginTop:24}}>
            {["Basado en ciencia","Adaptado a tu día a día","Múltiples disciplinas","Recuerda tu progreso"].map(t=>(
              <span key={t} style={{background:C.tag,color:C.muted,borderRadius:100,padding:"5px 14px",fontSize:12}}>{t}</span>
            ))}
          </div>
        </div>
      )}

      {pantalla==="categoria"&&(
        <div className="fade-up" style={{maxWidth:580,width:"100%"}}>
          <button onClick={()=>setPantalla("inicio")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,marginBottom:28}}>Volver</button>
          <h2 style={{fontSize:"clamp(22px,5vw,30px)",color:C.ink,marginBottom:8}}>Cual es tu disciplina?</h2>
          <p style={{color:C.muted,fontSize:14,marginBottom:28}}>Tu programa se construira desde cero segun lo que elijas.</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(240px, 1fr))",gap:14}}>
            {CATEGORIAS.map((c:Categoria)=>(
              <div key={c.id} className="cat-card" onClick={()=>irACategoria(c.id)} style={{background:C.card,border:`2px solid ${C.border}`,borderRadius:20,padding:"24px 22px"}}>
                <div style={{fontSize:34,marginBottom:12}}>{c.emoji}</div>
                <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:18,color:C.ink,marginBottom:2}}>{c.titulo}</div>
                <div style={{color:c.color,fontSize:12,fontWeight:600,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>{c.subtitulo}</div>
                <div style={{color:C.muted,fontSize:13,lineHeight:1.55}}>{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pantalla==="especialidad"&&cat&&(
        <div className="fade-up" style={{maxWidth:500,width:"100%"}}>
          <button onClick={()=>setPantalla("categoria")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,marginBottom:28}}>Volver</button>
          <div style={{display:"inline-flex",alignItems:"center",gap:6,background:cat.colorLight,borderRadius:100,padding:"5px 14px",marginBottom:20}}>
            <span style={{fontSize:15}}>{cat.emoji}</span>
            <span style={{color:accentColor,fontSize:12,fontWeight:600}}>{cat.titulo}</span>
          </div>
          <h2 style={{fontSize:"clamp(20px,4vw,28px)",color:C.ink,marginBottom:8,lineHeight:1.3}}>Cual es tu especialidad?</h2>
          <p style={{color:C.muted,fontSize:14,marginBottom:24}}>Tu programa se adaptara especificamente a tu disciplina.</p>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {ESPECIALIDADES[cat.id]?.map(esp=>(
              <div key={esp} onClick={()=>elegirEspecialidad(esp)}
                style={{background:C.card,border:`2px solid ${C.border}`,borderRadius:14,padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",transition:"all 0.2s"}}
                onMouseEnter={e=>(e.currentTarget.style.borderColor=accentColor)}
                onMouseLeave={e=>(e.currentTarget.style.borderColor=C.border)}>
                <span style={{fontSize:15,color:C.ink,fontWeight:500}}>{esp}</span>
                <span style={{color:accentColor,fontSize:18}}>→</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {pantalla==="final"&&cat&&(
        <div className="fade-up" style={{maxWidth:500,width:"100%"}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:6,background:cat.colorLight,borderRadius:100,padding:"5px 14px",marginBottom:20}}>
            <span style={{fontSize:15}}>{cat.emoji}</span>
            <span style={{color:accentColor,fontSize:12,fontWeight:600}}>{espLabel||cat.titulo}</span>
          </div>
          <h2 style={{fontSize:"clamp(20px,4vw,28px)",color:C.ink,marginBottom:8,lineHeight:1.3}}>Casi listo</h2>
          <p style={{color:C.muted,fontSize:14,marginBottom:28}}>Personaliza tu acceso antes de generar tu programa.</p>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div>
              <p style={{color:C.ink,fontSize:14,fontWeight:600,marginBottom:6}}>Crea tu código de acceso</p>
              <p style={{color:C.muted,fontSize:12,marginBottom:8}}>Mínimo 5 caracteres. Elige algo que recuerdes fácilmente.</p>
              <input value={codigoPersonal} onChange={e=>setCodigoPersonal(e.target.value.toUpperCase().replace(/\s/g,""))}
                placeholder="Ej: MARIA2025, RUNNER10, CROSSFIT..."
                style={{width:"100%",border:`2px solid ${errorCodigoPersonal?C.warm:C.border}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.ink,background:C.card,letterSpacing:1,fontFamily:"inherit"}}
                onFocus={e=>(e.target.style.borderColor=accentColor)} onBlur={e=>(e.target.style.borderColor=C.border)}
              />
              {errorCodigoPersonal&&<p style={{color:C.warm,fontSize:12,marginTop:6}}>{errorCodigoPersonal}</p>}
            </div>
            <div>
              <p style={{color:C.ink,fontSize:14,fontWeight:600,marginBottom:6}}>Email opcional</p>
              <p style={{color:C.muted,fontSize:12,marginBottom:8}}>Para recuperar tu código si lo pierdes.</p>
              <input value={email} onChange={e=>setEmail(e.target.value)}
                placeholder="tu@email.com"
                style={{width:"100%",border:`2px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.ink,background:C.card,fontFamily:"inherit"}}
                onFocus={e=>(e.target.style.borderColor=accentColor)} onBlur={e=>(e.target.style.borderColor=C.border)}
              />
            </div>
          </div>
          <button className="btn-main" onClick={()=>{if(codigoPersonal.trim().length>0&&codigoPersonal.trim().length<5){setErrorCodigoPersonal("El código debe tener al menos 5 caracteres.");return;}iniciarChat(respuestas);}}
            style={{width:"100%",background:accentColor,color:"#fff",border:"none",borderRadius:14,padding:"15px",fontSize:15,fontWeight:600,cursor:"pointer",marginTop:24}}>
            Generar mi programa ✨
          </button>
          <button onClick={()=>{setPregIdx(preguntas.length-1);setPantalla("formulario");}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13,marginTop:12,width:"100%"}}>
            ← Volver al formulario
          </button>
        </div>
      )}

      {pantalla==="formulario"&&pregActual&&cat&&(
        <div className="fade-up" style={{maxWidth:500,width:"100%"}}>
          <div style={{display:"flex",alignItems:"center",marginBottom:20}}>
            <button onClick={()=>{if(pregIdx===0)setPantalla("especialidad");else{setPregIdx(pregIdx-1);setSelMulti([]);setTextoTemp("");}}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>Atras</button>
            <span style={{marginLeft:"auto",color:C.muted,fontSize:13}}>{pregIdx+1} / {preguntas.length}</span>
          </div>
          <Progreso actual={pregIdx+1} total={preguntas.length} color={accentColor}/>
          <div style={{display:"inline-flex",alignItems:"center",gap:6,background:cat.colorLight,borderRadius:100,padding:"5px 14px",marginBottom:20}}>
            <span style={{fontSize:15}}>{cat.emoji}</span>
            <span style={{color:accentColor,fontSize:12,fontWeight:600}}>{cat.titulo}</span>
          </div>
          <h2 style={{fontSize:"clamp(17px,4vw,23px)",color:C.ink,marginBottom:22,lineHeight:1.4}}>{pregActual.label}</h2>
          {pregActual.tipo==="opciones"&&(
            <div style={{display:"flex",flexWrap:"wrap",gap:9,marginBottom:28}}>
              {pregActual.opciones?.map(op=><Chip key={op} active={respuestas[pregActual.id]===op} color={accentColor} onClick={()=>setRespuestas(p=>({...p,[pregActual.id]:op}))}>{op}</Chip>)}
            </div>
          )}
          {pregActual.tipo==="multi"&&(
            <><p style={{color:C.muted,fontSize:12,marginBottom:10}}>Selecciona todos los que apliquen</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:9,marginBottom:28}}>
              {pregActual.opciones?.map(op=><Chip key={op} active={selMulti.includes(op)} color={accentColor} onClick={()=>toggleMulti(op)}>{op}</Chip>)}
            </div></>
          )}
          {pregActual.tipo==="texto"&&(
            <textarea value={textoTemp} onChange={e=>setTextoTemp(e.target.value)} rows={3} placeholder={pregActual.placeholder}
              style={{width:"100%",border:`2px solid ${C.border}`,borderRadius:14,padding:"13px 15px",fontSize:14,color:C.ink,background:C.card,lineHeight:1.65,marginBottom:28,transition:"border-color 0.15s"}}
              onFocus={e=>(e.target.style.borderColor=accentColor)} onBlur={e=>(e.target.style.borderColor=C.border)}
            />
          )}
          <button className="btn-main" onClick={avanzar}
            disabled={(pregActual.tipo==="opciones"&&!respuestas[pregActual.id])||(pregActual.tipo==="multi"&&selMulti.length===0)||(pregActual.tipo==="texto"&&!textoTemp.trim())}
            style={{width:"100%",background:accentColor,color:"#fff",border:"none",borderRadius:14,padding:"15px",fontSize:15,fontWeight:600,cursor:"pointer",opacity:((pregActual.tipo==="opciones"&&!respuestas[pregActual.id])||(pregActual.tipo==="multi"&&selMulti.length===0)||(pregActual.tipo==="texto"&&!textoTemp.trim()))?0.35:1}}>
           
{pregIdx<preguntas.length-1?"Siguiente":"Generar mi programa"}
          </button>
        </div>
      )}

      {pantalla==="chat"&&cat&&(
        <div style={{width:"100%",maxWidth:700,display:"flex",flexDirection:"column",height:"100dvh",maxHeight:"100dvh"}}>
          {codigoGuardado&&(
            <div style={{background:C.successLight,border:`1px solid ${C.success}33`,borderRadius:12,padding:"10px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:16}}>🔑</span>
              <div style={{flex:1}}>
                <span style={{color:C.success,fontSize:13,fontWeight:600}}>Tu codigo de acceso: </span>
                <span style={{color:C.ink,fontSize:15,fontWeight:700,letterSpacing:2}}>{codigoGuardado}</span>
              </div>
              <span style={{color:C.muted,fontSize:11}}>Guardalo para volver</span>
            </div>
          )}
          {!emailGuardado&&!bannerEnviado&&!email&&pantalla==="chat"&&(
  <div style={{background:"#FFF9E6",border:"1px solid #F0D060",borderRadius:12,padding:"10px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
    <span style={{fontSize:16}}>📧</span>
    <span style={{color:"#7A6000",fontSize:13,flex:1}}>Guarda tu email para no perder tu código</span>
    <input value={emailBanner} onChange={e=>setEmailBanner(e.target.value)} placeholder="tu@email.com"
      style={{border:"1px solid #F0D060",borderRadius:8,padding:"6px 10px",fontSize:13,color:"#1A1A1A",background:"#fff",fontFamily:"inherit",width:180}}
    />
    <button onClick={async()=>{
      if(!emailBanner.trim()) return;
      await apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{email:emailBanner.trim().toLowerCase()}});
      setEmailGuardado(true);setBannerEnviado(true);
    }} style={{background:"#7A6000",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
      Guardar
    </button>
  </div>
)}
{bannerEnviado&&(
  <div style={{background:"#D8F3DC",border:"1px solid #2D6A4F",borderRadius:12,padding:"10px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
    <span>✅</span>
    <span style={{color:"#1E5C3A",fontSize:13,fontWeight:600}}>Email guardado. Ya puedes recuperar tu código si lo pierdes.</span>
  </div>
)}

          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <button onClick={()=>{setPantalla("inicio");setMensajes([]);setHistorial([]);setMsgCount(0);setCodigoGuardado("");}} style={{background:C.card,border:`1px solid ${C.border}`,color:C.muted,cursor:"pointer",borderRadius:10,padding:"8px 14px",fontSize:13}}>Salir</button>
            <div style={{flex:1,display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:38,height:38,borderRadius:12,background:cat.colorLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{cat.emoji}</div>
              <div>
                <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:15,color:C.ink}}>Forge Coach</div>
                <div style={{color:accentColor,fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8}}>{cat.titulo} - {cat.subtitulo}</div>
              </div>
            </div>
            <button onClick={()=>{setMostrarMarcas(!mostrarMarcas);setMostrarPerfil(false);}} style={{background:cat.colorLight,border:"none",borderRadius:10,padding:"7px 12px",fontSize:12,color:accentColor,cursor:"pointer",fontWeight:600}}>📊 Progreso</button>
<button onClick={()=>{setMostrarPerfil(!mostrarPerfil);setMostrarMarcas(false);}} style={{background:cat.colorLight,border:"none",borderRadius:10,padding:"7px 12px",fontSize:12,color:accentColor,cursor:"pointer",fontWeight:600}}>👤 Perfil</button>
            <div style={{background:restantes<=5?"#FFF3CD":cat.colorLight,color:restantes<=5?"#856404":accentColor,borderRadius:100,padding:"5px 12px",fontSize:12,fontWeight:500}}>
              {restantes>0?`${restantes} libres`:"Limite"}
            </div>
          </div>

          {mostrarPerfil&&(
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"16px 18px",marginBottom:10,maxHeight:400,overflowY:"auto"}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:16,color:C.ink,marginBottom:16}}>Mi perfil</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>

            <div style={{background:C.bg,borderRadius:12,padding:"10px 14px"}}>
              <p style={{color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Código de acceso</p>
              <p style={{color:accentColor,fontSize:15,fontWeight:700,letterSpacing:2}}>{codigoUsuario}</p>
            </div>

            <div>
              <p style={{color:C.ink,fontSize:13,fontWeight:600,marginBottom:6}}>Cambiar código</p>
              <input value={nuevoCodigo} onChange={e=>setNuevoCodigo(e.target.value.toUpperCase().replace(/\s/g,""))}
                placeholder="Nuevo código (mínimo 5 caracteres)"
                style={{width:"100%",border:`2px solid ${C.border}`,borderRadius:10,padding:"9px 12px",fontSize:13,color:C.ink,background:C.bg,fontFamily:"inherit",letterSpacing:1}}
                onFocus={e=>(e.target.style.borderColor=accentColor)} onBlur={e=>(e.target.style.borderColor=C.border)}
              />
            </div>

            <div>
              <p style={{color:C.ink,fontSize:13,fontWeight:600,marginBottom:6}}>Actualizar email</p>
              <input value={nuevoEmail} onChange={e=>setNuevoEmail(e.target.value)}
                placeholder="tu@email.com"
                style={{width:"100%",border:`2px solid ${C.border}`,borderRadius:10,padding:"9px 12px",fontSize:13,color:C.ink,background:C.bg,fontFamily:"inherit"}}
                onFocus={e=>(e.target.style.borderColor=accentColor)} onBlur={e=>(e.target.style.borderColor=C.border)}
              />
            </div>

            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <p style={{color:C.ink,fontSize:13,fontWeight:600}}>Datos del perfil</p>
                <button onClick={()=>{setEditandoPerfil(!editandoPerfil);setPerfilEdit({...respuestas as Record<string,string>});}} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"4px 10px",fontSize:12,color:C.muted,cursor:"pointer"}}>
                  {editandoPerfil?"Cancelar":"Editar"}
                </button>
              </div>
              {!editandoPerfil?(
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {[["Edad",respuestas.edad],["Días disponibles",respuestas.dias],["Duración sesión",respuestas.duracion],["Lesiones",respuestas.lesiones],["Objetivo",respuestas.objetivo_detalle]].map(([label,val])=>val?(
                    <div key={label as string} style={{display:"flex",gap:8,fontSize:13}}>
                      <span style={{color:C.muted,minWidth:120}}>{label as string}:</span>
                      <span style={{color:C.ink,fontWeight:500}}>{val as string}</span>
                    </div>
                  ):null)}
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {[
                    {key:"dias",label:"Días disponibles",opciones:["2 días","3 días","4 días","5 días","6 días"]},
                    {key:"duracion",label:"Duración por sesión",opciones:["30 min","45 min","1 hora","1h 30min","Más de 1h 30min"]},
                  ].map(campo=>(
                    <div key={campo.key}>
                      <p style={{color:C.muted,fontSize:12,marginBottom:6}}>{campo.label}</p>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {campo.opciones.map(op=>(
                          <button key={op} onClick={()=>setPerfilEdit(p=>({...p,[campo.key]:op}))}
                            style={{padding:"6px 12px",borderRadius:100,fontSize:12,cursor:"pointer",border:`2px solid ${perfilEdit[campo.key]===op?accentColor:C.border}`,background:perfilEdit[campo.key]===op?accentColor+"18":C.card,color:perfilEdit[campo.key]===op?accentColor:C.ink,fontFamily:"inherit"}}>
                            {op}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div>
                    <p style={{color:C.muted,fontSize:12,marginBottom:6}}>Lesiones / limitaciones actuales</p>
                    <textarea value={perfilEdit.lesiones||""} onChange={e=>setPerfilEdit(p=>({...p,lesiones:e.target.value}))} rows={2}
                      placeholder="Ej: rodilla derecha, lumbar... o ninguna"
                      style={{width:"100%",border:`2px solid ${C.border}`,borderRadius:10,padding:"8px 12px",fontSize:13,color:C.ink,background:C.bg,fontFamily:"inherit",resize:"none"}}
                    />
                  </div>
                  <div>
                    <p style={{color:C.muted,fontSize:12,marginBottom:6}}>Objetivo actual</p>
                    <textarea value={perfilEdit.objetivo_detalle||""} onChange={e=>setPerfilEdit(p=>({...p,objetivo_detalle:e.target.value}))} rows={2}
                      placeholder="Ej: correr 10K en menos de 50 min..."
                      style={{width:"100%",border:`2px solid ${C.border}`,borderRadius:10,padding:"8px 12px",fontSize:13,color:C.ink,background:C.bg,fontFamily:"inherit",resize:"none"}}
                    />
                  </div>
                  <button onClick={async()=>{
                    const nuevosPerfil={...respuestas,...perfilEdit};
                    setRespuestas(nuevosPerfil);
                    await apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{perfil:nuevosPerfil}});
                    setEditandoPerfil(false);
                    setMensajePerfil("Perfil actualizado. El coach tendrá en cuenta los cambios.");
                    setTimeout(()=>setMensajePerfil(""),3000);
                  }} style={{background:accentColor,color:"#fff",border:"none",borderRadius:10,padding:"10px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                    Guardar cambios del perfil
                  </button>
                </div>
              )}
            </div>

            {errorPerfil&&<p style={{color:C.warm,fontSize:12}}>{errorPerfil}</p>}
            {mensajePerfil&&<p style={{color:C.success,fontSize:12,fontWeight:600}}>{mensajePerfil}</p>}

            <button onClick={actualizarPerfil} style={{background:accentColor,color:"#fff",border:"none",borderRadius:10,padding:"10px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
              Guardar código y email
            </button>
          </div>
        </div>
      )}

      {mostrarMarcas&&(
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"16px 18px",marginBottom:10}}>
              <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:16,color:C.ink,marginBottom:12}}>Registro de progreso</div>
              {marcas.length===0?(
                <p style={{color:C.muted,fontSize:13,marginBottom:12}}>Sin registros aun. Anade tu primera marca o tiempo.</p>
              ):(
                <div style={{marginBottom:12,maxHeight:120,overflowY:"auto"}}>
                  {marcas.map((m,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
                      <span style={{color:C.muted}}>{m.fecha}</span>
                      <span style={{color:C.ink,fontWeight:500}}>{m.valor}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{display:"flex",gap:8}}>
                <input value={nuevaMarca} onChange={e=>setNuevaMarca(e.target.value)} placeholder="Ej: 5K en 24:30, SQ 125kg, peso 78kg..."
                  style={{flex:1,border:`2px solid ${C.border}`,borderRadius:10,padding:"9px 12px",fontSize:13,color:C.ink,background:C.bg}}
                  onKeyDown={e=>e.key==="Enter"&&registrarMarca()}
                />
                <button onClick={registrarMarca} style={{background:accentColor,color:"#fff",border:"none",borderRadius:10,padding:"9px 16px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                  Guardar
                </button>
              </div>
            </div>
          )}

          <div style={{flex:1,overflowY:"auto",background:C.card,borderRadius:20,border:`1px solid ${C.border}`,padding:"20px 18px",display:"flex",flexDirection:"column",gap:18}}>
            {generando&&(
              <div style={{display:"flex",gap:12}}>
                <div style={{width:36,height:36,borderRadius:12,background:cat.colorLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.emoji}</div>
                <div style={{background:C.bg,borderRadius:"4px 16px 16px 16px",padding:"16px 18px"}}>
                  <p style={{color:C.muted,fontSize:13,marginBottom:10}}>Preparando tu sesion...</p>
                  <div style={{display:"flex",gap:5}}>{[0,1,2].map(j=><div key={j} className="dot" style={{background:accentColor,animationDelay:`${j*0.2}s`}}/>)}</div>
                </div>
              </div>
            )}
            {mensajes.map((msg,i)=>(
              <div key={i} className="fade-up" style={{display:"flex",justifyContent:msg.role==="user"?"flex-end":"flex-start",gap:10,alignItems:"flex-start"}}>
                {msg.role==="assistant"&&<div style={{width:36,height:36,borderRadius:12,background:cat.colorLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.emoji}</div>}
                <div style={{maxWidth:"80%",padding:"13px 17px",borderRadius:msg.role==="user"?"16px 4px 16px 16px":"4px 16px 16px 16px",background:msg.role==="user"?accentColor:C.bg,color:msg.role==="user"?"#fff":C.ink}}>
                  {msg.role==="assistant"?<MensajeTexto texto={msg.content}/>:<p style={{fontSize:14,lineHeight:1.6}}>{msg.content}</p>}
                </div>
              </div>
            ))}
            {cargando&&(
              <div style={{display:"flex",gap:12}}>
                <div style={{width:36,height:36,borderRadius:12,background:cat.colorLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.emoji}</div>
                <div style={{background:C.bg,borderRadius:"4px 16px 16px 16px",padding:"14px 18px",display:"flex",gap:5,alignItems:"center"}}>
                  {[0,1,2].map(j=><div key={j} className="dot" style={{background:accentColor,animationDelay:`${j*0.2}s`}}/>)}
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {bloqueado&&(
            <div style={{marginTop:12,background:C.warmLight,border:`1px solid #F5C2A0`,borderRadius:16,padding:"18px 22px"}}>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:C.ink,marginBottom:6}}>Consultas gratuitas agotadas</div>
              <p style={{color:C.muted,fontSize:13,marginBottom:14,lineHeight:1.6}}>Actualiza a Forge Premium para consultas ilimitadas y seguimiento continuo.</p>
              <button className="btn-main" onClick={async()=>{
                const res=await fetch("/api/stripe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"crear_sesion",email:"",codigo:codigoUsuario})});
                const data=await res.json();
                if(data.url) window.location.href=data.url;
              }} style={{background:C.warm,color:"#fff",border:"none",borderRadius:12,padding:"13px 26px",fontSize:15,fontWeight:600,cursor:"pointer"}}>
                Obtener Premium — 14€/mes
              </button>
            </div>
          )}

          {!bloqueado&&(
            <>
              <div style={{marginTop:10,display:"flex",gap:8,alignItems:"flex-end"}}>
                <div style={{flex:1,background:C.card,border:`2px solid ${C.border}`,borderRadius:16,padding:"11px 15px"}}>
                  <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey}
                    placeholder="Pregunta, pide ajustes o cuentame cambios..."
                    rows={1} disabled={cargando}
                    style={{width:"100%",background:"transparent",border:"none",color:C.ink,fontSize:14,lineHeight:1.6,maxHeight:100,overflow:"auto",padding:0}}
                    onInput={(e)=>{const t=e.target as HTMLTextAreaElement;t.style.height="auto";t.style.height=t.scrollHeight+"px";}}
                  />
                </div>
                <button onClick={()=>enviar()} disabled={cargando||!input.trim()}
                  style={{background:input.trim()&&!cargando?accentColor:C.border,border:"none",borderRadius:13,width:48,height:48,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.2s"}}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                    <path d="M22 2L11 13" stroke={input.trim()&&!cargando?"#fff":C.muted} strokeWidth="2.5" strokeLinecap="round"/>
                    <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke={input.trim()&&!cargando?"#fff":C.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
              {mensajes.length>0&&!cargando&&(
                <div style={{display:"flex",gap:7,marginTop:8,flexWrap:"wrap"}}>
                  {(SUGERENCIAS[categoria||""]||[]).map(s=>(
                    <button key={s} className="sugg" onClick={()=>enviar(s)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:100,padding:"5px 13px",fontSize:12,color:C.muted,cursor:"pointer",transition:"all 0.15s"}}>{s}</button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

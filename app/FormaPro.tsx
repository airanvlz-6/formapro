'use client';
import { useState, useRef, useEffect } from "react";
import { aplicarTodasLasReglas } from "@/lib/validators/scientificRules";
import { validarIntegridadSemana, validarBlueprintDisponibilidad, validateBlueprint } from "@/lib/validators/weekIntegrityValidator";
import ForgeCardsGenerator from "@/components/ForgeCardsGenerator";
import WorkoutShareCard from "@/components/WorkoutShareCard";

const C = {
  bg: "#0D0D0D", card: "#1A1A1A", ink: "#F0EDE8", muted: "#9A9590",
  border: "#2A2A2A", accent: "#FF6B00", accentLight: "#2A1A0D",
  warm: "#FF6B00", warmLight: "#2A1A0D", tag: "#222222", success: "#4CAF50", successLight: "#1A2A1A",
  orange: "#FF6B00", orangeLight: "#2A1A0D",
};

const CATEGORIAS = [
  { id: "funcional", emoji: "⚡", titulo: "Functional Training", subtitulo: "CrossFit · Hyrox · Fitness Funcional", desc: "Entrenamientos adaptados a tu nivel, estado fisiológico y puntos débiles para mejorar rendimiento, capacidad de trabajo y recuperación.", color: "#FF6B00", colorLight: "#FF6B0015", etiqueta: "Más popular" },
  { id: "carrera", emoji: "🏃", titulo: "Carrera", subtitulo: "Running & Trail", desc: "Planificación inteligente basada en ritmos, zonas de frecuencia cardíaca, volumen y objetivos. Forge adapta cada sesión según tu recuperación y evolución.", color: "#FF8C42", colorLight: "#FF8C4215", etiqueta: "Especialidad" },
  { id: "fuerza", emoji: "🏋️", titulo: "Fuerza", subtitulo: "Powerlifting · Halterofilia · Strongman", desc: "Desarrolla fuerza máxima mediante periodización, control de cargas, técnica y seguimiento continuo de tus marcas personales.", color: "#FF6B00", colorLight: "#FF6B0015", etiqueta: "Especialidad" },
  { id: "hibrido", emoji: "🔄", titulo: "Híbrido", subtitulo: "Resistencia + Fuerza", desc: "Equilibra ambas capacidades sin interferencias, combinando sesiones para progresar en las dos disciplinas al mismo tiempo.", color: "#FF8C42", colorLight: "#FF8C4215", etiqueta: "Avanzado" },
];

// FORGE MODE TRANSITION FLOW — definicion declarativa de COMO preguntar y DONDE guardar cada
// campo posible de missingFields. NUNCA decide si un campo es obligatorio (eso lo determina
// exclusivamente calcularEstadoOnboarding/CAMPOS_REQUERIDOS_POR_MODO en el backend) — solo mapea
// el ID del campo a su representacion de UI determinista, sin interpretacion del LLM.
const DEFINICION_CAMPOS_MODE_CHANGE: Record<string, {label:string; tipo:string; opciones?:string[]; storageKey:string; storageTarget:'perfil'|'distribucion'|'training_source_forge'|'training_source_external'}> = {
  edad: { label:"¿Cuántos años tienes?", tipo:"opciones", opciones:["Menos de 20","20-30","31-40","41-50","Mas de 50"], storageKey:"edad", storageTarget:"perfil" },
  nivel: { label:"¿Cuál es tu nivel de experiencia?", tipo:"opciones", opciones:["Principiante","Intermedio","Avanzado"], storageKey:"nivel", storageTarget:"perfil" },
  objetivo: { label:"¿Qué quieres conseguir exactamente?", tipo:"texto", storageKey:"objetivo_detalle", storageTarget:"perfil" },
  duracion_sesion: { label:"¿Cuánto tiempo disponible por sesión?", tipo:"opciones", opciones:["Hasta 30 min","Hasta 45 min","Hasta 1 hora","Hasta 1h 30min","Más de 1h 30min"], storageKey:"duracion", storageTarget:"perfil" },
  disponibilidad: { label:"¿Qué días de la semana puedes entrenar la disciplina que gestionará Forge?", tipo:"dias_semana", storageKey:"dias_disponibles_forge", storageTarget:"distribucion" },
  disciplina_externa: { label:"¿Qué disciplina entrenas con OTRO entrenador (que Forge no debe tocar)?", tipo:"texto", storageKey:"disciplina", storageTarget:"training_source_external" },
  dias_externos: { label:"¿Qué días entrenas esa disciplina externa?", tipo:"dias_semana", storageKey:"dias", storageTarget:"training_source_external" },
};

const FORMULARIOS: Record<string, Pregunta[]> = {
  carrera: [
    { id: "edad", label: "¿Cuántos años tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Mas de 50"] },
    { id: "sexo", label: "¿Con que género te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    { id: "nivel", label: "¿Cual es tu experiencia en carrera?", tipo: "opciones", opciones: ["Inicio ahora (0-3 meses)", "Principiante (3-12 meses)", "Intermedio (1-3 años)", "Avanzado (+3 años)"] },
    { id: "distancia_objetivo", label: "¿Cual es tu distancia objetivo?", tipo: "opciones", opciones: ["5K", "10K", "Media maratón (21K)", "Maratón (42K)", "Trail / Ultra", "Sin distancia fija"] },
    
    { id: "dias_disponibles", label: "¿Qué días de la semana puedes entrenar?", tipo: "dias_semana" },
    { id: "duracion", label: "¿Cuánto tiempo disponible por sesión?", tipo: "opciones", opciones: ["Hasta 30 min", "Hasta 45 min", "Hasta 1 hora", "Hasta 1h 30min", "Más de 1h 30min"] },
    { id: "superficie", label: "¿Donde sueles entrenar?", tipo: "multi", opciones: ["Asfalto / ciudad", "Pista de atletismo", "Trail / montaña", "Cinta de correr", "Campo de hierba"] },
    { id: "dispositivo", label: "¿Cuentas con reloj GPS o pulsómetro para tus sesiones?", tipo: "opciones", opciones: ["Sí, reloj GPS con pulsómetro", "Sí, solo pulsómetro (banda o reloj básico)", "No, entreno por sensación (RPE)"] },
    { id: "fc_max", label: "¿Conoces tu frecuencia cardíaca máxima real? (de un test o competición)", tipo: "texto", placeholder: "Ej: 190 — déjalo en blanco si no la conoces", condicionDe: "dispositivo", condicionValor: /pulsómetro/i },
    { id: "fc_reposo", label: "¿Conoces tu frecuencia cardíaca en reposo?", tipo: "texto", placeholder: "Ej: 55 — déjalo en blanco si no la conoces", condicionDe: "dispositivo", condicionValor: /pulsómetro/i },
    { id: "lesiones", label: "¿Tienes lesiones o molestias?", tipo: "texto", placeholder: "Ej: periostitis, fascitis, rodilla... o ninguna" },
    { id: "objetivo_detalle", label: "¿Qué quieres conseguir exactamente?", tipo: "texto", placeholder: "Ej: completar mi primer 10K en junio, bajar de 45 min..." },
  ],
  funcional: [
    { id: "edad", label: "¿Cuántos años tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Más de 50"] },
    { id: "sexo", label: "¿Con qué género te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    { id: "nivel", label: "¿Cuál es tu nivel de experiencia?", tipo: "opciones", opciones: ["Sedentario / Empiezo de cero", "Algo activo (ejercicio ocasional)", "Moderado (1-2 años)", "Avanzado (+2 años)"] },
    { id: "objetivo_principal", label: "¿Cuál es tu objetivo principal?", tipo: "opciones", opciones: ["Perder peso / reducir grasa", "Tonificar y definir", "Ganar energía y bienestar", "Mejorar movilidad", "Mantenerme en forma"] },
    { id: "dias", label: "¿Cuántos días por semana puedes entrenar?", tipo: "opciones", opciones: ["2 días", "3 días", "4 días", "5 días"] },
    { id: "duracion", label: "¿Cuánto tiempo por sesión?", tipo: "opciones", opciones: ["Hasta 30 min", "Hasta 45 min", "Hasta 1 hora", "Más de 1 hora"] },
    { id: "material", label: "¿Con qué equipamiento cuentas?", tipo: "multi", opciones: ["Solo mi cuerpo (casa / parque)", "Mancuernas", "Bandas elásticas", "Kettlebells", "Máquinas de gimnasio", "Barra de dominadas"] },
    { id: "lesiones", label: "¿Tienes alguna limitación física o lesión?", tipo: "texto", placeholder: "Ej: dolor lumbar, rodilla operada... o ninguna" },
    { id: "objetivo_detalle", label: "Cuéntame tu situación y objetivo", tipo: "texto", placeholder: "Ej: tengo 15 kg de más, entreno por las mañanas..." },
  ],
  funcional_crossfit: [
    { id: "edad", label: "¿Cuántos años tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Más de 50"] },
    { id: "sexo", label: "¿Con qué género te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    { id: "nivel_cf", label: "¿Cuál es tu nivel en CrossFit?", tipo: "opciones", opciones: ["Principiante (0-1 año)", "Intermedio (1-3 años)", "Avanzado (+3 años)", "Competidor"] },
    
    { id: "dias", label: "¿Cuántos días por semana puedes entrenar?", tipo: "opciones", opciones: ["3 días", "4 días", "5 días", "6 días"] },
    { id: "duracion", label: "¿Cuánto tiempo por sesión?", tipo: "opciones", opciones: ["Hasta 45 min", "Hasta 1 hora", "Hasta 1h 30min", "Más de 1h 30min"] },
    { id: "lugar_entreno", label: "¿Dónde entrenas habitualmente?", tipo: "opciones", opciones: ["Box CrossFit (equipamiento completo)", "Gimnasio convencional adaptado", "En casa con equipamiento básico", "Mixto (box + casa)"] },
    { id: "punto_debil", label: "¿Cuál es tu mayor punto débil?", tipo: "opciones", opciones: ["Cardio / resistencia metabólica", "Fuerza máxima", "Técnica olímpica", "Movimientos gimnásticos", "Todos por igual"] },
    { id: "dispositivo", label: "¿Cuentas con reloj GPS o pulsómetro para tus sesiones?", tipo: "opciones", opciones: ["Sí, reloj GPS con pulsómetro", "Sí, solo pulsómetro (banda o reloj básico)", "No, entreno por sensación (RPE)"] },
    { id: "fc_max", label: "¿Conoces tu frecuencia cardíaca máxima real? (de un test o competición)", tipo: "texto", placeholder: "Ej: 190 — déjalo en blanco si no la conoces", condicionDe: "dispositivo", condicionValor: /pulsómetro/i },
    { id: "fc_reposo", label: "¿Conoces tu frecuencia cardíaca en reposo?", tipo: "texto", placeholder: "Ej: 55 — déjalo en blanco si no la conoces", condicionDe: "dispositivo", condicionValor: /pulsómetro/i },
    { id: "lesiones", label: "¿Lesiones o limitaciones actuales?", tipo: "texto", placeholder: "Ej: hombro, muñecas, lumbar... o ninguna" },
    { id: "objetivo_detalle", label: "¿Qué quieres conseguir?", tipo: "texto", placeholder: "Ej: mejorar mi Fran, conseguir el muscle-up, competir en Open..." },
  ],
  funcional_calistenia: [
    { id: "edad", label: "¿Cuántos años tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Más de 50"] },
    { id: "sexo", label: "¿Con qué género te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    { id: "nivel", label: "¿Cuál es tu nivel en calistenia?", tipo: "opciones", opciones: ["Principiante (0-1 año)", "Intermedio (1-3 años)", "Avanzado (+3 años)"] },
    
    { id: "objetivo_skill", label: "¿Qué habilidad quieres conseguir o mejorar?", tipo: "texto", placeholder: "Ej: front lever, planche, muscle-up en anillas, handstand push-up..." },
    { id: "dias", label: "¿Cuántos días por semana puedes entrenar?", tipo: "opciones", opciones: ["2 días", "3 días", "4 días", "5 días"] },
    { id: "duracion", label: "¿Cuánto tiempo por sesión?", tipo: "opciones", opciones: ["Hasta 30 min", "Hasta 45 min", "Hasta 1 hora", "Más de 1 hora"] },
    { id: "material", label: "¿Con qué equipamiento cuentas?", tipo: "multi", opciones: ["Barra de dominadas", "Paralelas / dips", "Anillas", "Parque de calistenia", "Solo suelo"] },
    { id: "objetivo_fisico", label: "¿Tienes también un objetivo físico?", tipo: "opciones", opciones: ["Solo skills y fuerza relativa", "Ganar algo de músculo", "Perder grasa mientras gano fuerza", "Solo mantenimiento y skills"] },
    { id: "lesiones", label: "¿Lesiones o limitaciones actuales?", tipo: "texto", placeholder: "Ej: hombro, codo, muñeca, lumbar... o ninguna" },
    { id: "objetivo_detalle", label: "¿Qué quieres conseguir exactamente?", tipo: "texto", placeholder: "Ej: conseguir el front lever en 4 meses, dominar el handstand..." },
  ],
  hibrido_hyrox: [
    { id: "edad", label: "¿Cuántos años tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Más de 50"] },
    { id: "sexo", label: "¿Con qué género te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    { id: "nivel_hyrox", label: "¿Cuál es tu experiencia en Hyrox?", tipo: "opciones", opciones: ["Nunca he competido", "1 carrera completada", "2-4 carreras", "Competidor habitual"] },
    
    { id: "dias", label: "¿Cuántos días por semana puedes entrenar?", tipo: "opciones", opciones: ["3 días", "4 días", "5 días", "6 días"] },
    { id: "duracion", label: "¿Cuánto tiempo por sesión?", tipo: "opciones", opciones: ["Hasta 45 min", "Hasta 1 hora", "Hasta 1h 30min", "Más de 1h 30min"] },
    { id: "material", label: "¿Tienes acceso al material de Hyrox?", tipo: "multi", opciones: ["SkiErg", "Sled / trineo", "Remo / RowErg", "Kettlebells", "Wall balls", "Sandbag", "Solo equipamiento básico"] },
    { id: "proxima_carrera", label: "¿Tienes carrera próxima?", tipo: "opciones", opciones: ["Sí, en menos de 6 semanas", "Sí, en 6-12 semanas", "Sí, en más de 3 meses", "No tengo fecha aún"] },
    { id: "dispositivo", label: "¿Cuentas con reloj GPS o pulsómetro para tus sesiones?", tipo: "opciones", opciones: ["Sí, reloj GPS con pulsómetro", "Sí, solo pulsómetro (banda o reloj básico)", "No, entreno por sensación (RPE)"] },
    { id: "fc_max", label: "¿Conoces tu frecuencia cardíaca máxima real? (de un test o competición)", tipo: "texto", placeholder: "Ej: 190 — déjalo en blanco si no la conoces", condicionDe: "dispositivo", condicionValor: /pulsómetro/i },
    { id: "fc_reposo", label: "¿Conoces tu frecuencia cardíaca en reposo?", tipo: "texto", placeholder: "Ej: 55 — déjalo en blanco si no la conoces", condicionDe: "dispositivo", condicionValor: /pulsómetro/i },
    { id: "lesiones", label: "¿Lesiones o limitaciones?", tipo: "texto", placeholder: "Ej: rodilla, hombro, lumbar... o ninguna" },
    { id: "objetivo_detalle", label: "¿Cuál es tu objetivo principal?", tipo: "texto", placeholder: "Ej: terminar mi primer Hyrox, bajar de 1h30 en categoría Open..." },
  ],
  hibrido_general: [
    { id: "edad", label: "¿Cuántos años tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Más de 50"] },
    { id: "sexo", label: "¿Con qué género te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    { id: "experiencia_fuerza", label: "¿Cuánta experiencia tienes en fuerza?", tipo: "opciones", opciones: ["Poca o ninguna", "1-2 años", "2-4 años", "Más de 4 años"] },
    { id: "experiencia_cardio", label: "Y en resistencia / cardio?", tipo: "opciones", opciones: ["Poca o ninguna", "1-2 anos", "2-4 anos", "Mas de 4 anos"] },
    { id: "prioridad", label: "Que quieres priorizar?", tipo: "opciones", opciones: ["50/50 equilibrado", "Mas fuerza que resistencia", "Mas resistencia que fuerza", "Potencia explosiva"] },
    
    { id: "dias", label: "Cuantos dias por semana puedes entrenar?", tipo: "opciones", opciones: ["3 dias", "4 dias", "5 dias", "6 dias"] },
    { id: "duracion", label: "Cuanto tiempo por sesion?", tipo: "opciones", opciones: ["Hasta 45 min", "Hasta 1 hora", "Hasta 1h 30min", "Mas de 1h 30min"] },
    { id: "material", label: "Con que equipamiento cuentas?", tipo: "multi", opciones: ["Gimnasio completo", "Barras y discos", "Mancuernas", "Kettlebells", "Cinta / Pista", "Bicicleta / Cicloergometro"] },
    { id: "dispositivo", label: "¿Cuentas con reloj GPS o pulsómetro para tus sesiones?", tipo: "opciones", opciones: ["Sí, reloj GPS con pulsómetro", "Sí, solo pulsómetro (banda o reloj básico)", "No, entreno por sensación (RPE)"] },
    { id: "fc_max", label: "¿Conoces tu frecuencia cardíaca máxima real? (de un test o competición)", tipo: "texto", placeholder: "Ej: 190 — déjalo en blanco si no la conoces", condicionDe: "dispositivo", condicionValor: /pulsómetro/i },
    { id: "fc_reposo", label: "¿Conoces tu frecuencia cardíaca en reposo?", tipo: "texto", placeholder: "Ej: 55 — déjalo en blanco si no la conoces", condicionDe: "dispositivo", condicionValor: /pulsómetro/i },
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
    { id: "duracion", label: "¿Cuánto tiempo por sesión?", tipo: "opciones", opciones: ["Hasta 45 min", "Hasta 1 hora", "Hasta 1h 30min", "Más de 1h 30min"] },
    { id: "material", label: "¿Con qué equipamiento cuentas?", tipo: "multi", opciones: ["Barra de dominadas", "Anillas / TRX", "Kettlebells / sacos", "Cuerda de escalada", "Acceso a terreno trail", "Gimnasio completo", "Solo cuerpo y parque"] },
    { id: "proxima_carrera", label: "¿Tienes carrera próxima?", tipo: "opciones", opciones: ["Sí, en menos de 6 semanas", "Sí, en 6-12 semanas", "Sí, en más de 3 meses", "No tengo fecha aún"] },
    { id: "lesiones", label: "¿Lesiones o limitaciones actuales?", tipo: "texto", placeholder: "Ej: hombro, rodilla, muñeca... o ninguna" },
    { id: "objetivo_detalle", label: "¿Cuál es tu objetivo principal?", tipo: "texto", placeholder: "Ej: terminar mi primer Spartan Beast, mejorar en obstáculos de agarre..." },
  ],
  hibrido_triatlon: [
    { id: "edad", label: "¿Cuántos años tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Más de 50"] },
    { id: "sexo", label: "¿Con qué género te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    { id: "modalidad_tri", label: "¿Qué distancia te interesa?", tipo: "opciones", opciones: ["Sprint (750m/20K/5K)", "Olímpico (1.5K/40K/10K)", "Half (1.9K/90K/21K)", "Ironman (3.8K/180K/42K)", "Duatlón (carrera+bici)"] },
    
    { id: "punto_debil", label: "¿Cuál es tu disciplina más débil?", tipo: "opciones", opciones: ["Natación", "Ciclismo", "Carrera a pie", "Las tres por igual"] },
    { id: "dias", label: "¿Cuántos días por semana puedes entrenar?", tipo: "opciones", opciones: ["3 días", "4 días", "5 días", "6 días", "7 días"] },
    { id: "duracion", label: "¿Cuánto tiempo por sesión?", tipo: "opciones", opciones: ["Hasta 45 min", "Hasta 1 hora", "Hasta 1h 30min", "Más de 1h 30min"] },
    { id: "material", label: "¿Con qué equipamiento cuentas?", tipo: "multi", opciones: ["Bicicleta de ruta / triatlón", "Bicicleta de montaña", "Rodillo / bici estática", "Acceso a piscina", "Material de natación (gafas, paletas)", "Zapatillas de running"] },
    { id: "proxima_carrera", label: "¿Tienes competición próxima?", tipo: "opciones", opciones: ["Sí, en menos de 8 semanas", "Sí, en 2-4 meses", "Sí, en más de 4 meses", "No tengo fecha aún"] },
    { id: "dispositivo", label: "¿Cuentas con reloj GPS o pulsómetro para tus sesiones?", tipo: "opciones", opciones: ["Sí, reloj GPS con pulsómetro", "Sí, solo pulsómetro (banda o reloj básico)", "No, entreno por sensación (RPE)"] },
    { id: "fc_max", label: "¿Conoces tu frecuencia cardíaca máxima real? (de un test o competición)", tipo: "texto", placeholder: "Ej: 190 — déjalo en blanco si no la conoces", condicionDe: "dispositivo", condicionValor: /pulsómetro/i },
    { id: "fc_reposo", label: "¿Conoces tu frecuencia cardíaca en reposo?", tipo: "texto", placeholder: "Ej: 55 — déjalo en blanco si no la conoces", condicionDe: "dispositivo", condicionValor: /pulsómetro/i },
    { id: "lesiones", label: "¿Lesiones o limitaciones actuales?", tipo: "texto", placeholder: "Ej: hombro de nadador, rodilla ciclismo, fascitis... o ninguna" },
    { id: "objetivo_detalle", label: "¿Cuál es tu objetivo principal?", tipo: "texto", placeholder: "Ej: terminar mi primer triatlón sprint, bajar de 5h en un Half..." },
  ],
  fuerza: [
    { id: "edad", label: "¿Cuántos anos tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Mas de 50"] },
    { id: "sexo", label: "¿Con qué genero te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    
    { id: "nivel", label: "¿Cuántos anos llevas entrenando fuerza?", tipo: "opciones", opciones: ["Menos de 1 ano", "1-2 anos", "2-4 anos", "Mas de 4 anos"] },
    
    { id: "competicion", label: "¿Tienes competición o fecha objetivo?", tipo: "opciones", opciones: ["Si, en menos de 3 meses", "Si, en 3-6 meses", "Si, en mas de 6 meses", "No compito"] },
    { id: "dias", label: "¿Cuántos días puedes entrenar fuerza?", tipo: "opciones", opciones: ["3 dias", "4 dias", "5 dias", "6 dias"] },
    { id: "duracion", label: "¿Cuánto tiempo por sesión?", tipo: "opciones", opciones: ["Hasta 1 hora", "Hasta 1h 30min", "Hasta 2 horas", "Mas de 2 horas"] },
    { id: "puntos_debiles", label: "¿Cuál es tu eslabón más débil?", tipo: "texto", placeholder: "Ej: cajon bajo en sentadilla, lockout en press banca..." },
    { id: "lesiones", label: "¿Lesiones o limitaciones?", tipo: "texto", placeholder: "Ej: muñecas limitadas, lumbar sensible, o ninguna" },
    { id: "objetivo_detalle", label: "¿Qué quieres lograr exactamente?", tipo: "texto", placeholder: "Ej: romper 1RM en sentadilla, clasificarme para campeonato..." },
  ],
  grupos_crossfit: [
    { id: "nombre_box", label: "¿Cómo se llama tu box?", tipo: "texto", placeholder: "Ej: CrossFit Tenerife, Box Canarias..." },
    { id: "nivel_grupo", label: "¿Cuál es el nivel general de tu grupo?", tipo: "opciones", opciones: ["Mayoría principiantes", "Mayoría intermedios", "Mayoría avanzados", "Nivel mixto"] },
    { id: "num_personas", label: "¿Cuántas personas hay en las clases?", tipo: "opciones", opciones: ["Menos de 5", "5-10 personas", "10-20 personas", "Más de 20 personas"] },
    { id: "duracion_clase", label: "¿Cuánto dura cada clase?", tipo: "opciones", opciones: ["45 minutos", "1 hora", "1h 15min", "1h 30min"] },
    { id: "dias_semana", label: "¿Cuántos días a la semana programas?", tipo: "opciones", opciones: ["3 días", "4 días", "5 días", "6 días"] },
    { id: "material", label: "¿Con qué material cuenta el box?", tipo: "multi", opciones: ["Barras y discos olímpicos", "Kettlebells", "Remos / SkiErg", "Gymnastic rings", "Pull-up bars", "Assault bike", "Wall balls", "Jump rope"] },
    { id: "objetivo_programacion", label: "¿Qué quieres conseguir con la programación?", tipo: "opciones", opciones: ["Preparar Open / competición", "Mejorar rendimiento general", "Aumentar la adherencia y diversión", "Ciclo de fuerza + metcons"] },
    { id: "objetivo_detalle", label: "¿Algo más que el coach deba saber?", tipo: "texto", placeholder: "Ej: hay varios atletas con lesión de hombro, queremos un ciclo de sentadilla..." },
  ],
  grupos_fitness: [
    { id: "tipo_sala", label: "¿Qué tipo de sala o gimnasio tienes?", tipo: "opciones", opciones: ["Sala de pesas completa", "Sala funcional / tubo", "Sala mixta (pesas + cardio)", "Estudio boutique"] },
    { id: "nivel_grupo", label: "¿Cuál es el nivel general de tus clientes?", tipo: "opciones", opciones: ["Mayoría principiantes", "Mayoría intermedios", "Nivel mixto", "Todos los niveles"] },
    { id: "duracion_clase", label: "¿Cuánto dura cada sesión?", tipo: "opciones", opciones: ["30 minutos", "45 minutos", "1 hora", "Más de 1 hora"] },
    { id: "dias_semana", label: "¿Cuántos días a la semana programas?", tipo: "opciones", opciones: ["3 días", "4 días", "5 días", "6 días"] },
    { id: "material", label: "¿Con qué material cuentas?", tipo: "multi", opciones: ["Mancuernas", "Barras y discos", "Máquinas de gimnasio", "Kettlebells", "Bandas elásticas", "TRX / Suspensión", "Cardio (cintas, bikes)"] },
    { id: "objetivo_grupo", label: "¿Cuál es el objetivo principal de tus clientes?", tipo: "opciones", opciones: ["Pérdida de grasa", "Tonificación y definición", "Ganancia muscular", "Salud y bienestar general"] },
    { id: "objetivo_detalle", label: "¿Algo más que el coach deba saber?", tipo: "texto", placeholder: "Ej: clientela mayor de 50 años, muchos con problemas de rodilla..." },
  ],
  grupos_funcional: [
    { id: "tipo_clase", label: "¿Qué tipo de clases impartes?", tipo: "opciones", opciones: ["HIIT / Circuitos", "Functional Training", "GAP / Core", "TRX / Suspensión", "Bootcamp"] },
    { id: "nivel_grupo", label: "¿Cuál es el nivel general del grupo?", tipo: "opciones", opciones: ["Principiantes", "Intermedios", "Mixto", "Avanzados"] },
    { id: "num_personas", label: "¿Cuántas personas por clase?", tipo: "opciones", opciones: ["Menos de 5", "5-15 personas", "15-25 personas", "Más de 25 personas"] },
    { id: "duracion_clase", label: "¿Cuánto dura cada clase?", tipo: "opciones", opciones: ["30 minutos", "45 minutos", "1 hora"] },
    { id: "dias_semana", label: "¿Cuántos días programas por semana?", tipo: "opciones", opciones: ["3 días", "4 días", "5 días", "6 días"] },
    { id: "material", label: "¿Con qué material cuentas?", tipo: "multi", opciones: ["Solo peso corporal", "Mancuernas ligeras", "Kettlebells", "Bandas elásticas", "Step / cajón", "TRX", "Balón medicinal"] },
    { id: "objetivo_detalle", label: "¿Qué quieres conseguir con la programación?", tipo: "texto", placeholder: "Ej: clases dinámicas sin repetir, progresión mensual, evitar lesiones..." },
  ],
  grupos_deporte: [
    { id: "deporte", label: "¿Qué deporte practica el equipo?", tipo: "texto", placeholder: "Ej: fútbol, baloncesto, natación, atletismo..." },
    { id: "nivel_equipo", label: "¿Cuál es el nivel del equipo?", tipo: "opciones", opciones: ["Escuela / juvenil", "Amateur / recreativo", "Semiprofesional", "Profesional"] },
    { id: "num_jugadores", label: "¿Cuántos jugadores tiene el equipo?", tipo: "opciones", opciones: ["Menos de 10", "10-20 jugadores", "20-30 jugadores", "Más de 30 jugadores"] },
    { id: "fase_temporada", label: "¿En qué fase de temporada estáis?", tipo: "opciones", opciones: ["Pretemporada", "Temporada en competición", "Final de temporada", "Fuera de temporada"] },
    { id: "dias_entreno", label: "¿Cuántos días de entrenamiento físico a la semana?", tipo: "opciones", opciones: ["1-2 días", "3 días", "4 días", "5+ días"] },
    { id: "objetivo_fisico", label: "¿Cuál es el objetivo físico principal?", tipo: "opciones", opciones: ["Preparación física general", "Fuerza y potencia", "Resistencia específica", "Prevención de lesiones", "Recuperación y descarga"] },
    { id: "material", label: "¿Con qué material contáis?", tipo: "multi", opciones: ["Gimnasio completo", "Material básico (conos, petos)", "Sala de pesas", "Campo / pista", "Poco material"] },
    { id: "objetivo_detalle", label: "¿Algo específico que el coach deba saber?", tipo: "texto", placeholder: "Ej: varios jugadores lesionados, partido importante en 3 semanas..." },
  ],
  rehabilitacion_general: [
    { id: "edad", label: "¿Cuántos años tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Más de 50"] },
    { id: "sexo", label: "¿Con qué género te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    { id: "zona", label: "¿Qué zona te molesta o has lesionado?", tipo: "multi", opciones: ["Hombro", "Codo / muñeca", "Lumbar / espalda baja", "Cadera", "Rodilla", "Tobillo / pie", "Cervical / cuello", "Otra zona"] },
    { id: "tipo_molestia", label: "¿Qué tipo de molestia es?", tipo: "opciones", opciones: ["Dolor agudo reciente (días)", "Molestia crónica (semanas/meses)", "Sobrecarga por entrenamiento", "Post-cirugía / post-inmovilización", "Prevención (sin dolor actual)"] },
    { id: "diagnostico", label: "¿Tienes diagnóstico médico?", tipo: "texto", placeholder: "Ej: tendinopatía rotuliana, hernia discal L4-L5, o 'sin diagnóstico'" },
    { id: "fase", label: "¿En qué fase te encuentras?", tipo: "opciones", opciones: ["Dolor presente, evito moverlo", "El dolor ha mejorado, puedo moverlo con cuidado", "Sin dolor, quiero recuperar fuerza", "Sin dolor, quiero volver a entrenar normal"] },
    { id: "actividad_objetivo", label: "¿Qué actividad quieres recuperar?", tipo: "texto", placeholder: "Ej: volver a correr, levantar peso sin molestias, jugar al pádel..." },
    { id: "tratamiento_actual", label: "¿Estás en tratamiento con algún profesional?", tipo: "opciones", opciones: ["Sí, con fisioterapeuta", "Sí, con médico", "No, por mi cuenta", "Tratamiento finalizado"] },
    { id: "dias", label: "¿Cuántos días puedes dedicar a la rehabilitación?", tipo: "opciones", opciones: ["2-3 días", "4-5 días", "Diario"] },
    { id: "objetivo_detalle", label: "¿Algo más que el coach deba saber?", tipo: "texto", placeholder: "Ej: empeora por la noche, mejora con calor, me lesioné jugando..." },
  ],
};

const buildPrompt = (cat: {id: string; titulo: string}, perfil: Record<string, string | string[]>, marcas: {fecha: string; valor: string}[] = [], historialResumen: string = "", memoria?: {lesiones?:string; plan?:string; notas?:string}, ciclo?: {bloque?:string; semana?:number; totalSemanas?:number; objetivo?:string}, psicologia?: {arousal?:string; confianza?:string; estres?:string; motivacion?:string; notas_mentales?:string}, premium?: boolean, athleteState?: Record<string,any>, datosEntreno?: Record<string,any>, estadoFisio?: {fatiga_aguda?:number;fatiga_cronica?:number;tendencia?:string;hrv?:number;sueno?:number;rhr?:number;adherencia?:number}, histFisio?: {fecha:string;hrv?:number;sueno?:number;rhr?:number}[], distribucion?: string, objetivo?: {descripcion?:string;fecha?:string;tipo?:string}, planSemana?: any, debilidadesAtleta?: {ejercicio:string;descripcion:string;fecha:string}[], historialBloques?: any[], estadoCanonico?: any) => {
  const perfilStr = Object.entries(perfil).map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("\n");
  const bloquesLineas: string[] = [];
  if(historialBloques && historialBloques.length>0){
    for(const b of historialBloques){
      bloquesLineas.push("- " + b.tipo_bloque + " (" + b.duracion_semanas + " semanas): adherencia " + b.adherencia + "%, fatiga " + b.fatiga_media + ", " + b.pr_obtenidos + " PRs, resultado: " + b.resultado_global);
    }
  }
  const historialBloquesStr = bloquesLineas.join("\n");
  const marcasStr = marcas.length > 0 ? marcas.map(m => `- ${m.fecha}: ${m.valor}`).join("\n") : "Sin registros aún";
  const cicloStr = ciclo?.bloque ? `
CICLO DE ENTRENAMIENTO ACTUAL:
- Bloque: ${ciclo.bloque}
- Semana: ${ciclo.semana||1} de ${ciclo.totalSemanas||4}
- Objetivo del bloque: ${ciclo.objetivo||"No especificado"}
- IMPORTANTE: Mantén coherencia con este punto del ciclo. Progresión acorde a semana ${ciclo.semana||1}.` : `
CICLO DE ENTRENAMIENTO:
- No hay ciclo activo. En la primera programación define el bloque, semanas totales y objetivo, y actualiza el ciclo.`;

const athleteStateStr = `
ESTADO ACTUAL DEL ATLETA:
${athleteState && Object.keys(athleteState).length > 0 ? `
- Macrociclo: ${athleteState.macro_cycle||"No definido"}
- Mesociclo: ${athleteState.meso_cycle||"No definido"}
- Bloque: ${athleteState.block||"No definido"}
- Semana: ${athleteState.week||"?"} de ${athleteState.total_weeks||"?"}
- Día: ${athleteState.day||"?"}
- Fatiga: ${athleteState.fatigue||"No evaluada"}
- Última sesión: ${athleteState.last_session||"No registrada"}
- Próxima sesión: ${athleteState.next_session||"No planificada"}` : "Sin estado definido aún — debes crearlo ahora."}

⚠️ REGLA OBLIGATORIA SIN EXCEPCIÓN: En TODAS tus respuestas, incluye SIEMPRE al final este bloque exacto con los valores actualizados:
[STATE_UPDATE]{"macro_cycle":"nombre del macrociclo","meso_cycle":"nombre del mesociclo","block":"acumulacion|intensificacion|realizacion|deload","week":N,"total_weeks":N,"day":N,"fatigue":"baja|media|alta","last_session":"tipo de ultima sesion","next_session":"tipo de proxima sesion"}[/STATE_UPDATE]
Si no hay estado previo, créalo basándote en el perfil y el entreno actual. NUNCA omitas este bloque.`;

const psicologiaStr = `
PERFIL PSICOLÓGICO DEL ATLETA:
- Nivel de arousal habitual: ${psicologia?.arousal||"No evaluado"}
- Confianza actual: ${psicologia?.confianza||"No evaluada"}
- Gestión del estrés: ${psicologia?.estres||"No evaluada"}
- Motivación: ${psicologia?.motivacion||"No evaluada"}
- Notas mentales: ${psicologia?.notas_mentales||"Sin notas"}

MÓDULO PSICOLOGÍA DEL ALTO RENDIMIENTO (solo usuarios Premium):
Analiza cada mensaje del atleta buscando señales psicológicas. Aplica estas herramientas cuando sea necesario:
- Arousal elevado/nervios pre-competición → Ley de Yerkes-Dodson, técnicas de regulación, respiración
- Falta de confianza o autoeficacia baja → Reestructuración cognitiva, historial de éxitos, self-talk positivo
- Bloqueo mental en competición → Rutinas pre-competición, foco en el proceso no el resultado
- Visualización → Técnica PETTLEP (Physical, Environment, Task, Timing, Learning, Emotion, Perspective)
- Estrés crónico o fatiga mental → Ajusta volumen e intensidad, técnicas de recuperación mental
- Diálogo interno negativo → Modelo MAC (Mindfulness, Acceptance, Commitment), self-talk funcional
Si detectas señales psicológicas relevantes, integra las herramientas de forma natural en tu respuesta sin hacer diagnósticos clínicos. Actualiza el perfil psicológico del atleta con lo que observes.`;

const memoriaStr = memoria ? `
ESTADO ACTUAL DEL ATLETA:
- Lesiones/limitaciones actuales: ${memoria.lesiones||"Ninguna registrada"}
- Plan próxima semana: ${memoria.plan||"Sin planificar aún"}
- Notas del coach: ${memoria.notas||"Sin notas"}` : "";
  return `Eres el coach de Forge, sistema de asesoramiento de entrenamiento personalizado.
Tu filosofía: la programación se adapta al deportista, no al revés. Habla siempre en español correcto con tildes, ñ y todos los caracteres del idioma.

PERFIL:
${perfilStr}

PROGRESO REGISTRADO:
${marcasStr}

FORMATO ESTRICTO:
- Consultas simples: máximo 150 palabras. Directo al punto, sin repetir información que el cliente ya sabe.
- Rutinas y programaciones: máximo 600 palabras. Formato compacto por línea: "Ejercicio: series x reps — clave técnica". Sin introducción larga ni resumen final salvo que se pida.
- NUNCA repitas información del perfil, historial o sesiones anteriores salvo que el cliente lo pida explícitamente.
- NUNCA hagas resumen de lo que acaba de decir el cliente.
- Si el cliente reporta un entrenamiento realizado: responde SOLO con el siguiente entreno o ajuste en una frase breve de contexto + la sesión. Sin análisis salvo petición explícita.
ZONAS DE FRECUENCIA: Cuando calcules o presentes zonas de frecuencia cardíaca al atleta, al final de tu explicación pregunta siempre: "¿Confirmas estas zonas de frecuencia? Si es así, responde 'Confirmo mis zonas' para que queden registradas en tu perfil." Solo presenta esta pregunta cuando calcules zonas nuevas o las modifiques, no en cada mensaje.
DESARROLLO DEL ATLETA — REGLA TÉCNICA OBLIGATORIA SIN EXCEPCIÓN: Si en tu respuesta escribes o vas a escribir la frase "Registrado debilidad" o cualquier variante que indique que has guardado una debilidad, DEBES incluir literalmente en ese mismo mensaje el bloque de código [DEBILIDAD_DEV:{...}] — decir "registrado" SIN el tag es un ERROR GRAVE que hace que nada se guarde realmente. NUNCA digas "registrado" sin el tag. Formato exacto obligatorio: [DEBILIDAD_DEV:{"area":"Fuerza|Resistencia|Técnica|Movilidad|Velocidad","indicador":"identificador técnico corto en snake_case para base de datos","nombre_visible":"nombre humano y cercano para mostrar al atleta","diagnostico":"1-2 frases explicando qué has detectado en lenguaje cercano","estado":"activa","progreso":0,"confianza":número 0-100,"prioridad":"alta|media|baja","evidencias":["evidencia concreta 1"],"plan_accion":["acción específica"],"beneficio_esperado":["beneficio concreto"]}].
CONOCIMIENTO DEL ATLETA — DETECCIÓN DE PATRONES: Cuando detectes un patrón NUEVO y genuino sobre cómo responde el atleta al entrenamiento (no una debilidad, sino un aprendizaje: cómo recupera, cómo responde a cierto tipo de bloque, un patrón de sueño, una zona de ritmo confirmada, etc.), y sea la PRIMERA vez que lo mencionas, añade el tag [APRENDIZAJE:{"texto":"frase corta en primera persona desde Forge, ej: Recuperas mejor tras sesiones de fuerza que tras intervalos largos","puntos":2,"categoria":"recuperacion|ritmos|fuerza|tecnica|sueno|general"}]. NO generes este tag para cada mensaje — solo cuando sea un descubrimiento genuinamente nuevo, máximo 1 vez cada varios mensajes. NUNCA anuncies el aprendizaje en el texto visible de forma redundante — el sistema ya se encarga de mostrarlo, tú solo añade el tag de forma natural al final de tu respuesta normal.
FLUJO DE ESTADOS DE DESARROLLO — SEGUIMIENTO OBLIGATORIO: Cada área de desarrollo avanza por estados: activa (recién detectada, sin cambios aún) → en_intervencion (ya hay trabajo específico en el plan) → en_progreso (primeras mejoras detectadas) → validando (mejora sostenida 2-3 semanas, verificando que se mantiene) → resuelta (evidencia clara y sostenida de que la limitación ya no condiciona el rendimiento). NUNCA marques "resuelta" solo porque ha pasado tiempo — solo cuando las evidencias ORIGINALES ya no se repitan (ej: si la evidencia era "series 2-3 reps en Murph" y ahora reporta "8-10 reps", ahí sí hay evidencia de mejora real).
Cuando detectes avance en una debilidad ya registrada, añade: [ACTUALIZAR_DEBILIDAD:{"indicador":"nombre exacto ya registrado","estado":"en_intervencion|en_progreso|validando|resuelta","progreso":número 0-100 estimado según cuánto ha mejorado,"confianza":número actualizado,"nueva_evidencia":"qué demuestra el cambio de estado"}]. Sé conservador — es mejor progreso lento y real que optimista y falso. Genera este tag cuando detectes o el atleta mencione una debilidad, limitación técnica, o área a mejorar. 
Cuando detectes que una debilidad ya registrada ha MEJORADO significativamente (marca superada, mayor volumen tolerado, mejor técnica reportada), añade: [ACTUALIZAR_DEBILIDAD:{"indicador":"nombre exacto ya registrado","estado":"en_progreso|resuelta","confianza":número actualizado,"nueva_evidencia":"qué demuestra la mejora"}].
SIEMPRE que planifiques sesiones futuras, revisa las debilidades activas del atleta (verás "DEBILIDADES DEL ATLETA" en tu contexto) e incorpora trabajo específico coherente con el bloque actual — no las ignores tras varios mensajes.
BENCHMARKS CROSSFIT — DOBLE REGISTRO SEGÚN CORRESPONDA: Si el atleta reporta haber completado un benchmark conocido de CrossFit (Fran, Murph, Cindy, Grace, Helen, Diane, Jackie, Angie, Annie, DT, Eva, Chelsea, Nancy, Amanda, Elizabeth, Kelly, Karen, Isabel, Linda, Mary, Barbara, o cualquier WOD nombrado con mayúscula que sea benchmark reconocido): 1) SIEMPRE añade [SESION:] normal para que quede registrado como entrenamiento (aparecerá en el filtro "Entrenamientos"). 2) ADEMÁS, consulta el HISTORIAL DE MARCAS en tu contexto para ver si ya existe un resultado previo de ESE MISMO benchmark. SOLO SI es la PRIMERA vez que completa ese benchmark, O el nuevo resultado es una MEJORA clara (más rondas/reps, o menos tiempo), añade TAMBIÉN [EVENTO:{"date":"YYYY-MM-DD","type":"pr","title":"nombre benchmark: resultado (ej: Cindy: 22 rondas, mejora de X)","data":{"ejercicio":"benchmark_nombreminusculas","valor":"resultado con unidad"}}] — esto hará que también aparezca en el filtro "Récords". Si el resultado es IGUAL o PEOR que un intento anterior, NO generes el EVENTO tipo "pr", solo queda como entrenamiento normal.
GESTIÓN DE SESIONES — DETECCIÓN ESTRICTA: SOLO genera el tag [SESION:] cuando el atleta use frases de FINALIZACIÓN clara SOBRE UN ENTRENAMIENTO: "he terminado", "completé", "ya entrené", "acabo de hacer", "WOD completado", "entreno realizado", "hice el entreno". NUNCA lo generes si: (a) el atleta solo pregunta sobre una sesión futura, (b) pide detalles, (c) menciona la palabra "sesión" sin confirmar que la completó, (d) el mensaje es exclusivamente un reporte de MÉTRICAS DE SUEÑO/RECUPERACIÓN NOCTURNA sin mención de entrenamiento. Un mensaje que solo hable de sueño, HRV nocturna, FC reposo NUNCA debe generar [SESION:]. Formato: [SESION:{"tipo":"tipo de sesión","fecha":"YYYY-MM-DDThh:mm:ss.000Z — usa SIEMPRE la fecha de HOY (la indicada en [Fecha actual del sistema]) salvo que el atleta mencione explícitamente otra fecha","notas":"resumen breve","duracion":null,"sensacion":"buena|normal|mala","analisis":"UNA frase breve con tu análisis técnico"}].
RESPUESTA TRAS REPORTAR SESIÓN — FORMATO OBLIGATORIO BREVE: Cuando el atleta reporte una sesión completada, tu respuesta debe ser SOLO: 1) Una frase breve de feedback sobre lo reportado (máx 2 líneas). 2) Invita a revisar la sesión de mañana en Mi Plan, ejemplo: "Revisa mañana en Mi Plan — ¿tienes alguna duda?". NUNCA repitas el contenido completo de la siguiente sesión (calentamiento, bloque principal, etc.) — esa información ya vive en Mi Plan. Si el atleta pregunta específicamente por detalles de la sesión de mañana, ahí sí puedes explicarla.
CIERRE DE SEMANA — "FORGE INSIGHTS", FLUJO DIVIDIDO EN 2 PASOS — NUNCA generes el plan detallado de la semana siguiente en este mismo mensaje, eso ocurre en un paso separado después: Si la sesión que el atleta acaba de reportar es la ÚLTIMA sesión planificada de la semana Y NO has generado ya un resumen en esta conversación, haz SOLO esto: 1) Feedback breve. 2) RESUMEN CONECTADO (máximo 6-7 líneas) que incluya: sesiones completadas vs planificadas, tendencia fisiológica, Y OBLIGATORIO — si alguna de las "DEBILIDADES DEL ATLETA" mejoró o se resolvió esta semana, menciónalo explícitamente. Termina con el AJUSTE CONCRETO que aplicarás la semana siguiente en UNA frase (ej: "aumentaremos el volumen de halterofilia un 10%"), SIN listar día por día. 3) Tag [RESUMEN_SEMANA:{"week_start":"YYYY-MM-DD","resumen":"...","adherencia":"X/Y"}]. 4) Pregunta "¿Confirmas que generemos ya la semana siguiente con este enfoque?" NUNCA generes el tag [PLAN:] en este mismo mensaje — eso se hace en el siguiente turno cuando el usuario confirme, con una llamada dedicada solo a eso. NUNCA repitas el tag [RESUMEN_SEMANA:] para la misma semana si ya se generó antes en la conversación.
CIERRE DE BLOQUE — MEMORIA METODOLÓGICA: Cuando detectes que el bloque actual ha terminado (última semana del bloque completada, o el atleta confirma pasar a un nuevo bloque tipo acumulación/intensificación/realización/deload), además del resumen semanal normal, añade: [BLOCK_OUTCOME:{"tipo_bloque":"nombre del bloque que termina","duracion_semanas":número,"objetivo":"objetivo que tenía este bloque","adherencia":número 0-100,"fatiga_media":"baja|media|alta","sesiones_completadas":número,"pr_obtenidos":número de nuevos PRs durante el bloque,"debilidades_resueltas":número de áreas de desarrollo resueltas durante el bloque,"lesiones":true|false,"resultado_global":"excelente|bueno|regular|deficiente","fecha_inicio":"YYYY-MM-DD","fecha_fin":"YYYY-MM-DD"}].
ANTES de diseñar un nuevo bloque, SIEMPRE revisa la sección "HISTORIAL DE BLOQUES ANTERIORES" en tu contexto (si existe) y usa esa información para decidir parámetros como duración óptima, volumen, o tipo de estímulo — replica lo que funcionó bien (adherencia alta, resultado excelente, baja fatiga) y evita repetir lo que generó fatiga muy alta o resultado deficiente. Menciona brevemente este razonamiento al atleta cuando sea relevante (ej: "Los bloques de 4 semanas te han funcionado mejor que los de 5").
INTERVENCIONES ESPECÍFICAS: Cuando detectes un problema puntual (ej: fatiga alta un día concreto) y apliques una solución específica (ej: mover una sesión), y MÁS TARDE confirmes que esa solución funcionó (HRV recuperado, adherencia mejorada), añade: [INTERVENTION:{"problema":"descripción breve del problema detectado","accion":"qué hiciste para solucionarlo","resultado":"qué pasó después","efectividad":"alta|media|baja"}].
REGLA DE CAPAS — NUNCA VIOLAR: Los principios científicos fijos (periodización, sobrecarga progresiva, deload, zonas de entrenamiento, recuperación) NUNCA cambian por resultados de un solo atleta o bloque. Lo que SÍ puede adaptarse con la memoria metodológica es: duración de bloques, distribución semanal, volumen, tipo de WOD, orden de ejercicios, y qué intervenciones funcionan mejor para corregir debilidades específicas de este atleta.
Si el usuario reporta métricas fisiológicas pasadas con fecha (HRV, sueño, FC reposo de días anteriores), añade: [METRICA:{"fecha":"YYYY-MM-DD","hrv":null,"sueno":null,"rhr":null}]. Si el usuario pide borrar una sesión por fecha, añade: [BORRAR_SESION:{"fecha":"YYYY-MM-DD","tipo":"tipo mencionado"}].
HISTORIA DEPORTIVA — OBLIGATORIO: SIEMPRE que el atleta reporte un nuevo récord personal (RM, mejor tiempo, mejor marca en cualquier ejercicio), DEBES añadir AL FINAL de tu respuesta, sin excepción: [EVENTO:{"date":"YYYY-MM-DD","type":"pr","title":"Nombre del ejercicio + valor","data":{"ejercicio":"nombre_normalizado","valor":"valor con unidad"}}]. Esto aplica también a competiciones, lesiones, enfermedades, cambios de objetivo, viajes. NUNCA omitas este tag cuando confirmes haber "registrado" o "guardado" algo en el progreso del atleta.
PLAN SEMANAL — FLUJO OBLIGATORIO:
1. Cuando el usuario pida la planificación semanal, muestra PRIMERO un resumen breve de cada día (máx 2 líneas por sesión) y pregunta: "¿Confirmas esta distribución?"
2. REGLA TÉCNICA OBLIGATORIA — SIN ESTO EL SISTEMA FALLA: Cuando el usuario confirme el plan semanal, tu respuesta de confirmación DEBE contener el bloque de código [PLAN:{...}] con el JSON completo. NUNCA digas "guardado" o "confirmado" sin incluir literalmente ese bloque [PLAN:...] en el mismo mensaje — decir que está guardado sin el tag es un ERROR GRAVE que rompe la aplicación. El formato exacto que debes escribir, carácter por carácter, al INICIO de tu mensaje de confirmación es: [PLAN:{"week_start":"YYYY-MM-DD del lunes","week_number":X,"total_weeks_block":número total de semanas de este bloque,"block_name":"nombre bloque","week_objective":"UNA frase clara del objetivo de esta semana concreta, ej: Mejorar capacidad aeróbica sin comprometer recuperación","sessions":[{"dia":"lunes","tipo":"carrera|box|descanso|otro","titulo":"título breve","por_que":"UNA frase clara explicando el propósito de esta sesión concreta en el contexto del bloque y objetivo","descripcion":"SESIÓN COMPLETA: Calentamiento: X. Bloque principal: Y (series, reps, intensidad, zonas FC). Vuelta a la calma: Z. Notas técnicas: W.","debilidad_relacionada":"nombre_visible EXACTO de la debilidad activa del atleta si esta sesión específicamente la trabaja (mira DEBILIDADES DEL ATLETA en tu contexto), o null si no aplica"},...]}]. Incluye los 7 días con su tipo definido — pero "descanso" (sin entrenamiento, sin carga) es un tipo de sesión TAN VÁLIDO como cualquier otro. NUNCA rellenes un día con actividad solo para "completar la semana" — la planificación científica exige descanso real cuando corresponde según el volumen/intensidad del bloque, la disponibilidad real del atleta, o el número de días que el atleta pidió entrenar. Si el atleta indicó explícitamente cuántos días quiere entrenar (ej: "3 días"), los días restantes de la semana son SIEMPRE descanso — nunca propongas sesiones adicionales "porque el día estaba libre". IMPORTANTE INCLUSO CON DISPONIBILIDAD TOTAL (7 días): la periodización científica real exige descanso GENUINO (día sin ningún estímulo de entrenamiento), no solo alternar volumen/intensidad alto y bajo. Un atleta entrenando 7/7 sin ningún día de descanso real, semana tras semana, acumula fatiga de forma insostenible sin importar cuánto varíes la carga — esto es un error de programación grave, no una opción de estilo. Evalúa según el bloque (acumulación permite más densidad, intensificación y realización requieren más recuperación real) e incluye descanso genuino cuando la ciencia del entrenamiento lo exige, no solo cuando el atleta lo pide explícitamente. Después del tag confirma al usuario que el plan está guardado e invítale a verlo en Mi Plan. 🚨 COHERENCIA DE FECHAS OBLIGATORIA: El "week_start" de este plan SIEMPRE corresponde a la semana que contiene el día de HOY (lunes a domingo de la semana actual, según el ESTADO CANÓNICO). NUNCA digas frases como "la semana empieza el lunes que viene" o "arrancamos la próxima semana" — el plan que acabas de generar ES la semana actual, incluyendo los días que ya pasaron esta semana (que se consideran descanso o ya completados) y los que faltan por delante. Si hoy es jueves, el plan de lunes-domingo ya está en curso — los días miércoles/jueves anteriores a hoy dentro de esa semana no se prescriben retroactivamente, pero el resto de días SÍ se siguen tal cual desde hoy en adelante, no desde la semana siguiente.
FORGE PENDING ACTIONS — FLUJO DE MODIFICACION DE SESIONES: Cuando PROPONGAS un cambio de sesión (nunca cuando lo confirmes), incluye AL FINAL de esa misma respuesta el tag: [PROPONER_MODIFICACION:{"week_start":"YYYY-MM-DD del lunes de esa semana","dia":"nombre del día en minúsculas sin tildes","tipo":"tipo de sesión propuesta","titulo":"título breve","motivo":"por qué se propone el cambio","descripcion":"sesión completa propuesta con todos los detalles"}]. Este tag se genera SIEMPRE que propongas un cambio, independientemente de si el atleta lo confirma despues o no — el backend lo guarda como propuesta pendiente y gestiona la confirmacion automaticamente sin que tengas que hacer nada mas. Cuando el atleta confirme despues (di, confirmo, vale, adelante), simplemente responde de forma natural confirmando el cambio — NO necesitas generar ningun tag adicional en ese momento, el sistema ya se encarga de aplicarlo.
MODIFICACIÓN DE SESIONES — REGLA OBLIGATORIA:
- Cuando detectes que una sesión debe modificarse (por HRV bajo, mal sueño, fatiga acumulada, lesión, etc.) NUNCA la cambies sin avisar primero.
- Informa al atleta: "Basándome en [motivo concreto], propongo modificar [día] de [sesión original] a [sesión modificada]. ¿Confirmas?" — y en ESE MISMO mensaje de propuesta incluye el tag [PROPONER_MODIFICACION:] tal como se describe en FORGE PENDING ACTIONS más abajo.
- Jerarquía de modificación: 1 mal día → modifica solo la siguiente sesión. 2-3 días malos → modifica 2-3 sesiones. 5+ días malos → propón replantear la semana completa.
- NUNCA modifiques más sesiones de las necesarias.

COHERENCIA DE PLANIFICACIÓN — REGLA CRÍTICA:
- NUNCA cambies un entrenamiento ya programado sin motivo justificado. Si el atleta pide recordar la sesión del día, repite EXACTAMENTE la sesión programada sin modificaciones.
- Solo puedes modificar un entreno si el atleta reporta: lesión, molestia física, falta de material, falta de tiempo o cambio de disponibilidad.
- Si no hay motivo justificado, mantén el plan original. La coherencia del ciclo es prioritaria sobre cualquier improvisación.
- Ante cualquier duda, pregunta al atleta antes de cambiar algo.
- SESIÓN CONJUNTA — REGLA ABSOLUTA: Cuando generes una sesión para dos atletas, la sesión DEBE mantener el estímulo del bloque actual de cada atleta. Adapta las cargas, escalados y variantes pero NUNCA sustituyas el objetivo del bloque. Si un atleta está en semana de fuerza máxima, la sesión conjunta debe incluir fuerza máxima para ese atleta aunque el otro esté en otra fase. El entreno conjunto adapta, NUNCA sustituye.
- CICLO OBLIGATORIO: En cada respuesta donde generes o ajustes programación, incluye SIEMPRE al inicio de tu respuesta una línea con este formato exacto: "📅 CICLO: Bloque [nombre] · Semana [X] de [Y] · Objetivo: [objetivo]". Ejemplo: "📅 CICLO: Bloque acumulación · Semana 2 de 4 · Objetivo: aumentar volumen base". Si no hay ciclo definido aún, defínelo tú mismo según el perfil del atleta.
${memoriaStr}
${cicloStr}
${premium?psicologiaStr:""}
${datosEntreno&&Object.keys(datosEntreno).length>0?`
DATOS DE ENTRENAMIENTO ESPECÍFICOS:
${Object.entries(datosEntreno).map(([k,v])=>`- ${k}: ${v}`).join("\n")}
IMPORTANTE: Usa estos datos para programar con precisión. Son los valores reales del atleta y deben respetarse siempre.`:""}
${histFisio&&histFisio.length>=3?(()=>{
  const ultimos=histFisio.slice(-7);
  const hrvValues=ultimos.filter(e=>e.hrv).map(e=>e.hrv as number);
  const suenoValues=ultimos.filter(e=>e.sueno).map(e=>e.sueno as number);
  const tendenciaHrv=hrvValues.length>=3?(hrvValues[hrvValues.length-1]-hrvValues[0]>5?"ascendente":hrvValues[hrvValues.length-1]-hrvValues[0]<-5?"descendente":"estable"):"sin datos";
  const tendenciaSueno=suenoValues.length>=3?(suenoValues[suenoValues.length-1]-suenoValues[0]>5?"ascendente":suenoValues[suenoValues.length-1]-suenoValues[0]<-5?"descendente":"estable"):"sin datos";
  const diasNegativo=[tendenciaHrv,tendenciaSueno].filter(t=>t==="descendente").length;
  return `
TENDENCIAS FISIOLÓGICAS (últimos ${ultimos.length} días):
- HRV: ${hrvValues.length>0?`media ${Math.round(hrvValues.reduce((a,b)=>a+b,0)/hrvValues.length)}ms, tendencia ${tendenciaHrv}`:"sin datos"}
- Sueño: ${suenoValues.length>0?`media ${Math.round(suenoValues.reduce((a,b)=>a+b,0)/suenoValues.length)}/100, tendencia ${tendenciaSueno}`:"sin datos"}
${diasNegativo>=2?"⚠️ ALERTA: Tendencia negativa en múltiples métricas. Considera consolidar antes de aumentar carga.":"✅ Tendencia estable o positiva."}
IMPORTANTE: Si detectas patrón negativo sostenido (>5 días), intervén proactivamente antes de que el atleta lo mencione.`;
})():""}
${estadoFisio&&Object.keys(estadoFisio).length>0?`
ESTADO FISIOLÓGICO ACTUAL:
- Fatiga aguda (ATL): ${estadoFisio.fatiga_aguda??'no disponible'}/100
- Fatiga crónica (CTL): ${estadoFisio.fatiga_cronica??'no disponible'}/100
- Tendencia: ${estadoFisio.tendencia||'no disponible'}
- HRV: ${estadoFisio.hrv??'no disponible'} ms
- Calidad sueño: ${estadoFisio.sueno??'no disponible'}/100
- FC reposo: ${estadoFisio.rhr??'no disponible'} bpm
- Adherencia: ${estadoFisio.adherencia??'no disponible'}%
IMPORTANTE: Ajusta la intensidad y volumen de la sesión según este estado. HRV bajo (<50ms) o fatiga aguda alta (>80) = reduce intensidad. Sueño bajo (<60) = sesión de recuperación activa.`:""}
${athleteStateStr}

${estadoCanonico?`
🔒 ESTADO CANÓNICO — FUENTE ÚNICA DE VERDAD, PRECALCULADA POR EL SERVIDOR (nunca la contradigas ni recalcules):
Hoy es ${estadoCanonico.dia_semana_hoy} ${estadoCanonico.fecha_hoy}. Mañana es ${estadoCanonico.dia_semana_manana} ${estadoCanonico.fecha_manana}.
${estadoCanonico.sesion_hoy?`Sesión de HOY: "${estadoCanonico.sesion_hoy.titulo}"${estadoCanonico.sesion_hoy.completada?" [YA COMPLETADA]":" [PENDIENTE]"}`:"Sin sesión programada para hoy en el plan."}
${estadoCanonico.sesion_manana?`Sesión de MAÑANA: "${estadoCanonico.sesion_manana.titulo}"${estadoCanonico.sesion_manana.completada?" [YA COMPLETADA]":" [PENDIENTE]"}`:"Sin sesión programada para mañana en el plan."}
${estadoCanonico.ultimo_registro_fisiologico?`Último registro fisiológico guardado: ${estadoCanonico.ultimo_registro_fisiologico.fecha} (HRV ${estadoCanonico.ultimo_registro_fisiologico.hrv||'-'}, sueño ${estadoCanonico.ultimo_registro_fisiologico.sueno||'-'})`:""}
${estadoCanonico.tendencia_fisiologica?`Tendencia últimas noches — Sueño: ${estadoCanonico.tendencia_fisiologica.ultimas_noches_sueno.join(" → ")} (${estadoCanonico.tendencia_fisiologica.sueno_tendencia}). HRV: ${estadoCanonico.tendencia_fisiologica.ultimas_noches_hrv.join(" → ")} (${estadoCanonico.tendencia_fisiologica.hrv_tendencia}). Si detectas una tendencia clara de varios días (no un solo dato aislado), puedes mencionarla como análisis de tendencia (ej: "llevas 3 noches consecutivas con recuperación ascendente").`:""}
${estadoCanonico?.athlete_state?.estado&&estadoCanonico.athlete_state.estado!=="normal"?`
🔴 ESTADO DEL ATLETA — RESTRICCIÓN ACTIVA (${estadoCanonico.athlete_state.estado.toUpperCase()}): El atleta está en un periodo de restricción desde ${estadoCanonico.athlete_state.desde} por: ${estadoCanonico.athlete_state.motivo}. REGLA CRÍTICA: NO reacciones sesión a sesión a este mismo problema — la restricción ya gobierna toda la planificación mientras esté activa. Si el atleta menciona de nuevo el mismo problema (ej: "sigue la molestia"), NO propongas otra modificación puntual — responde reconociendo que sigue en periodo de restricción y que la planificación ya lo tiene en cuenta. Solo si el atleta confirma EXPLÍCITAMENTE que el problema se ha resuelto, indica que evaluaréis juntos cómo retomar progresivamente (nunca asumas retorno automático a la carga previa).`:""}
ESTAS FECHAS Y ESTADOS SON LA ÚNICA VERDAD. Nunca calcules fechas por tu cuenta cuando este bloque esté presente — solo interprétalo y explica.`:`
FECHA HOY: ${new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Europe/Madrid" })}`}
🚨 FECHA Y TIEMPO — REGLAS CRÍTICAS: Cada mensaje del usuario incluye un campo "[Contexto temporal del mensaje: ...]" que te dice EXACTAMENTE qué tipo de reporte es. Si dice "SUEÑO_NOCTURNO", ese sueño es de la NOCHE ANTERIOR — pero esto NO significa que "hoy" sea el día siguiente al que describes en el sueño. El día de HOY sigue siendo el mismo que indica "FECHA HOY" arriba, SIEMPRE, independientemente de qué noche de sueño estés analizando. Error común a EVITAR: tras analizar "sueño de la noche X→Y", NO saltes automáticamente a hablar del día "siguiente a Y" como si fuera hoy — HOY es la fecha exacta indicada en FECHA HOY, verifícala de nuevo antes de mencionar la sesión de entrenamiento en la misma respuesta.
DISPONIBILIDAD DEL ATLETA — REGLA CRÍTICA: Antes de programar cualquier sesión, consulta el perfil del atleta y respeta ESTRICTAMENTE sus días disponibles, horarios y lugar de entrenamiento. NUNCA programes una sesión en un día que el atleta no ha indicado como disponible. Si el perfil indica "lunes no disponible" o "solo box martes y jueves", respeta eso sin excepciones. La disponibilidad es una restricción inamovible, no una sugerencia.
${debilidadesAtleta&&debilidadesAtleta.length>0?`
🎯 DEBILIDADES DEL ATLETA — TENER EN CUENTA AL PLANIFICAR:
${debilidadesAtleta.map(d=>`- ${d.ejercicio}: ${d.descripcion}`).join("\n")}
Incorpora trabajo específico para estas debilidades cuando sea coherente con el bloque actual.`:""}
${historialBloques&&historialBloques.length>0?"📊 MEMORIA METODOLÓGICA — HISTORIAL DE BLOQUES ANTERIORES DE ESTE ATLETA:\n"+historialBloquesStr+"\nUSA esta información al diseñar nuevos bloques: repite duraciones y volúmenes que dieron resultado excelente o bueno con baja fatiga, evita repetir lo que generó fatiga muy alta o resultado deficiente. NUNCA violes principios científicos fijos por estos datos, solo ajusta parámetros adaptables.":""}
${planSemana&&planSemana.sessions?`
📅 PLAN SEMANAL — RESTO DE LA SEMANA (hoy y mañana ya están en el ESTADO CANÓNICO de arriba, no los repitas de aquí):
Bloque: ${planSemana.block_name} · Semana ${planSemana.week_number}${planSemana.total_weeks_block?` de ${planSemana.total_weeks_block}`:""}
Objetivo semana: ${planSemana.week_objective||"no definido"}
${planSemana.sessions.filter((s:any)=>{const dn=s.dia.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();return (estadoCanonico?dn!==estadoCanonico.dia_semana_hoy&&dn!==estadoCanonico.dia_semana_manana:true)&&!s.es_historica;}).map((s:any)=>`\n### ${s.dia.toUpperCase()} ###\nTítulo: ${s.titulo}\nContenido completo: ${s.descripcion||"no detallado"}\nPor qué: ${s.por_que||""}${s.completada?`\n[YA COMPLETADO — reportó: ${s.titulo_real||""}: ${s.descripcion_real||""}]`:""}${s.modificado?`\n[MODIFICADO: ${s.motivo_modificacion}]`:""}`).join("\n")}
REGLA: Si el atleta pregunta por hoy o mañana, usa el ESTADO CANÓNICO de arriba, no esta lista. Esta lista es solo para el resto de días de la semana.`:"⚠️ NO HAY PLAN SEMANAL GUARDADO EN MI PLAN."}

${distribucion?`DISPONIBILIDAD RÍGIDA POR DÍA — RESTRICCIÓN ABSOLUTA E INQUEBRANTABLE:
${distribucion}
REGLA CRÍTICA: Esta disponibilidad NO es una sugerencia, es una restricción física real (horarios de trabajo, ubicación). NUNCA asignes una sesión de "box" a un día marcado como "pista" o viceversa, salvo que el atleta lo autorice EXPLÍCITAMENTE para esa semana concreta en el mensaje actual. Puedes decidir libremente si un día es descanso, recuperación activa o sesión completa — pero el LUGAR/TIPO del día, si hay sesión, debe respetar siempre esta disponibilidad. Ignorar esta regla es un error grave que rompe la confianza del atleta.`:""}
${objetivo?.descripcion?`
OBJETIVO PRINCIPAL DEL ATLETA:
- Descripción: ${objetivo.descripcion}
- Fecha objetivo: ${objetivo.fecha||"sin fecha definida"}
- Tipo: ${objetivo.tipo||"rendimiento"}
- Semanas restantes: ${objetivo.fecha?Math.max(0,Math.round((new Date(objetivo.fecha).getTime()-new Date().getTime())/(7*24*60*60*1000))):"desconocido"}
IMPORTANTE: Toda la planificación debe orientarse hacia este objetivo. Si la fecha se acerca, ajusta la periodización (taper, realización). Si hay mucho tiempo, prioriza base y acumulación. Menciona el objetivo cuando sea relevante para motivar al atleta.`:""}
DISPOSITIVO DE MEDICIÓN DEL ATLETA — ADAPTA TU COMUNICACIÓN: Consulta el campo "dispositivo" en el perfil del atleta. Si indica que NO tiene reloj GPS ni pulsómetro (solo RPE/sensación), NUNCA prescribas zonas de FC en ppm ni ritmos exactos por km como referencia principal — usa RPE (escala 1-10 o descripción de sensación: "conversacional", "moderado", "duro") como referencia principal. Si tiene pulsómetro básico o reloj GPS, sí puedes usar zonas de FC/ritmo con confianza. Independientemente del dispositivo, cuando el atleta reporte una sesión, si mencionas que puede compartir capturas de pantalla de su reloj/app para un análisis más preciso, hazlo de forma natural y solo si aporta valor real, no en cada mensaje.
PRINCIPIOS Y METODOLOGÍA CIENTÍFICA:
- Periodización por bloques: acumulación (volumen alto, intensidad baja) → intensificación (volumen medio, intensidad alta) → realización (volumen bajo, intensidad máxima) → deload
- Sobrecarga progresiva: aumenta volumen o intensidad cada semana dentro del bloque, nunca ambos a la vez
- Periodización ondulante (DUP): varía estímulos diarios (fuerza, potencia, hipertrofia) para maximizar adaptación
- Zonas de entrenamiento: Z1 recuperación, Z2 base aeróbica, Z3 umbral aeróbico, Z4 umbral anaeróbico, Z5 VO2max
- RPE y % 1RM: usa RPE para sesiones técnicas y de potencia, % 1RM para fuerza máxima
- Pliometría y potencia: incluye trabajo explosivo (saltos, sprints, lanzamientos) en fases de intensificación
- Ejercicios accesorios: añade trabajo complementario específico para corregir desequilibrios y prevenir lesiones
- Movilidad y activación: incluye siempre calentamiento específico y vuelta a la calma adaptada
- Recuperación activa: programa sesiones de baja intensidad entre sesiones exigentes, respeta HRV si el atleta lo reporta
- Deload cada 3-4 semanas: reduce volumen 40-50% manteniendo intensidad para supercompensación
- Especificidad: cada sesión debe tener un estímulo principal claro y alineado con el objetivo del bloque
- Adaptación continua: ajusta la programación según los reportes del atleta — fatiga, sensaciones, métricas del reloj
FORMATO ESTRICTO: Máximo 300 palabras. Si es rutina completa máximo 500 palabras. NUNCA superes estos límites.
CUANDO EL CLIENTE REPORTA UN ENTRENAMIENTO REALIZADO: No hagas resumen del entreno reportado. Guarda internamente las métricas relevantes y responde directamente con la siguiente sesión o ajuste, usando una frase breve como "Basándome en lo que reportas, el siguiente entreno será..."
EXPLICACIÓN OBLIGATORIA: Cada vez que prescribas una sesión o ajuste la programación, incluye UNA frase corta explicando el porqué. Formato: "📌 Por qué hoy: [motivo concreto basado en datos reales del atleta — HRV, fatiga, ciclo, objetivo, lesión, etc.]". Ejemplos: "📌 Por qué hoy: Tu HRV lleva 3 días descendiendo, priorizamos Z2 sobre intervalos." / "📌 Por qué hoy: Semana 3 de acumulación, toca volumen alto antes del deload." / "📌 Por qué hoy: Añadimos pliometría porque tu objetivo trail requiere economía de carrera." Sé específico, usa los datos reales del atleta, no frases genéricas. Si el cliente pide explícitamente un análisis, entonces sí lo desarrollas. Rutina: DIA / BLOQUE / EJERCICIO / SERIES x REPS / DESCANSO. Usa negrita para encabezados. Ajusta cambios justificando el porque. Responde siempre en español correcto con tildes y ñ.
LENGUAJE CIENTÍFICO PRECISO: Evita afirmaciones categóricas de causalidad directa cuando la relación es solo de correlación o contribución (ej: entre sueño/HRV y rendimiento). NUNCA digas "esto explica tu rendimiento" — usa lenguaje más preciso: "estas métricas favorecen un buen rendimiento", "son compatibles con lo observado", "probablemente contribuyeron a...". Suena más profesional y evita afirmaciones que un entrenador científico real no haría con tanta certeza.
${({"carrera":`ESPECIALIDAD RUNNING: Ciclos 4sem (3 carga+1 descarga), progresion vol max 10%/sem, zonas Z1-Z5, rodaje largo+series+fuerza complementaria.`,"carrera_trail":`ESPECIALIDAD TRAIL: Trabajo de desnivel, tecnica bajada, fuerza excentrica, progresion desnivel acumulado.`,"funcional":`ESPECIALIDAD FITNESS: Bloques 4-6sem, movilidad+activacion+principal+finisher metabolico, patrones empuje/tiron/bisagra/sentadilla/core.`,"funcional_crossfit":`ESPECIALIDAD CROSSFIT: Halterofilia tecnica (60-80% 1RM) + WOD diario con escalados + accesorios gimnasticos con progresiones especificas + movilidad.`,"funcional_calistenia":`ESPECIALIDAD CALISTENIA: Progresiones por habilidad (planche, front lever, muscle-up, handstand), fuerza empuje/tiron, movilidad especifica.`,"hibrido_general":`ESPECIALIDAD HIBRIDO: Bloques minimizando interferencia, fuerza 80-90% 1RM + resistencia Z2/umbral/VO2max.`,"hibrido_hyrox":`ESPECIALIDAD HYROX: Running especifico + entrenamiento por estaciones (SkiErg, sled, burpees, wall balls, rowing, farmers, sandbag) + simulaciones + fuerza base.`,"hibrido_triatlon":`ESPECIALIDAD TRIATLON: Natacion+ciclismo+carrera equilibrados segun nivel y punto debil, brick workouts, fases base/desarrollo/especifico/taper.`,"hibrido_ocr":`ESPECIALIDAD OCR: Carrera en terreno irregular + obstaculos (agarre, escalada, arrastre) + fuerza funcional + grip especifico.`,"fuerza_powerlifting":`ESPECIALIDAD POWERLIFTING: SQ/BP/DL con progresion lineal (principiantes), DUP/5-3-1 (intermedios), bloques acumulacion/intensificacion/realizacion (avanzados), % 1RM o RPE.`,"fuerza_halterofilia":`ESPECIALIDAD HALTEROFILIA: Arrancada y 2T con trabajo tecnico submaximo (60-75%), series de potencia, fuerza base (sentadilla frontal, tiron, press).`,"fuerza_strongman":`ESPECIALIDAD STRONGMAN: Fuerza base + implementos disponibles (log, yoke, farmer, stones) + acondicionamiento eventos + grip.`,"grupos_crossfit":`ESPECIALIDAD BOX CROSSFIT: Eres coach de coaches. Genera programaciones de box completas con estructura: calentamiento + fuerza/halterofilia + WOD + vuelta a la calma. Incluye escalados para todos los niveles. Varía estímulos diarios evitando repetición. Usa terminología CrossFit.`,"grupos_fitness":`ESPECIALIDAD SALA FITNESS: Genera sesiones para grupos con estructura clara: calentamiento + bloque principal + vuelta a la calma. Adapta al nivel del grupo y material disponible. Incluye variantes para distintos niveles dentro del mismo grupo.`,"grupos_funcional":`ESPECIALIDAD CLASES GRUPALES: Genera clases dinámicas con variedad de estímulos. Estructura: activación + circuito principal + finisher. Proporciona variantes de cada ejercicio (fácil/difícil) para que el coach pueda adaptar en clase.`,"grupos_deporte":`ESPECIALIDAD EQUIPO DEPORTIVO: Genera programación de preparación física específica al deporte. Incluye fuerza, potencia, resistencia y prevención de lesiones según la fase de temporada. Adapta el volumen a los días disponibles sin interferir con los entrenamientos técnicos.`,"rehabilitacion_general":`ESPECIALIDAD REHABILITACIÓN: Genera protocolos de ejercicios de movilidad, activación y fortalecimiento progresivo basados en evidencia científica, adaptados a la zona, tipo de molestia y fase reportada. Estructura por fases: 1) Alivio y movilidad sin dolor, 2) Activación y control motor, 3) Fortalecimiento progresivo, 4) Retorno funcional a la actividad. Progresa solo cuando no hay dolor en la fase actual. Incluye criterios claros de progresión (ej: "si realizas esto sin dolor durante 3 días, pasa a la siguiente fase"). 
SEÑALES DE ALARMA: Si el usuario reporta dolor nocturno intenso, hormigueo/pérdida de sensibilidad, hinchazón súbita, fiebre, o dolor que no mejora en 2 semanas, recomienda firmemente acudir a un profesional sanitario.
DISCLAIMER OBLIGATORIO: En el primer mensaje y cuando sea relevante, incluye: "⚠️ Estas recomendaciones están basadas en evidencia científica con fines orientativos y no sustituyen el diagnóstico ni tratamiento de un médico o fisioterapeuta. Si el dolor empeora o no mejora, consulta con un profesional sanitario."`}[cat.id]||"")}

🔴 VERIFICACIÓN FINAL — revisa antes de responder: (1) ¿la fecha que voy a usar coincide con HOY indicado arriba? (2) si el mensaje es solo de sueño, ¿estoy evitando generar [SESION:]? (3) ¿el día de hoy ya está completado en el plan? Si es así, no lo repitas.`;
};

const ESPECIALIDADES: Record<string, string[]> = {
  carrera: ["Running (asfalto / ciudad)", "Trail Running / Montana", "Maraton / Media maraton", "Atletismo en pista"],
  funcional: ["Fitness general / Bienestar", "CrossFit / WOD", "Calistenia / Movimiento"],
  hibrido: ["Hibrido general (fuerza + cardio)", "Hyrox", "Triatlon / Duatlon", "OCR / Obstaculos"],
  fuerza: ["Powerlifting (SQ / BP / DL)", "Halterofilia (Arrancada / 2T)", "Strongman / Fuerza general"],
  grupos: ["Box CrossFit", "Sala de fitness / Gym", "Clases grupales funcionales", "Equipo deportivo"],
  rehabilitacion: ["Rehabilitación general"],
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
  grupos: {
    "Box CrossFit": "grupos_crossfit",
    "Sala de fitness / Gym": "grupos_fitness",
    "Clases grupales funcionales": "grupos_funcional",
    "Equipo deportivo": "grupos_deporte",
  },
  rehabilitacion: {
    "Rehabilitación general": "rehabilitacion_general",
  },
};

const CAMPOS_MARCAS: Record<string, {id:string; label:string; placeholder:string}[]> = {
  carrera: [{id:"5k",label:"5K",placeholder:"Ej: 24:30"},{id:"10k",label:"10K",placeholder:"Ej: 51:00"},{id:"21k",label:"Media maratón",placeholder:"Ej: 1:52:00"},{id:"42k",label:"Maratón",placeholder:"Ej: 4:10:00"}],
  carrera_trail: [{id:"trail_corto",label:"Trail corto (-21K)",placeholder:"Ej: 2:15:00"},{id:"trail_medio",label:"Trail medio (21-42K)",placeholder:"Ej: 4:30:00"},{id:"desnivel",label:"Desnivel máx sesión",placeholder:"Ej: 1200m"}],
  funcional_crossfit: [
    {id:"back_squat",label:"Back squat",placeholder:"Ej: 120kg"},
    {id:"front_squat",label:"Front squat",placeholder:"Ej: 100kg"},
    {id:"deadlift",label:"Peso muerto",placeholder:"Ej: 150kg"},
    {id:"snatch",label:"Arrancada",placeholder:"Ej: 70kg"},
    {id:"clean_jerk",label:"Dos tiempos",placeholder:"Ej: 90kg"},
    {id:"clean",label:"Clean",placeholder:"Ej: 95kg"},
    {id:"push_press",label:"Push press",placeholder:"Ej: 80kg"},
    {id:"bench",label:"Press banca",placeholder:"Ej: 90kg"},
    {id:"pullups",label:"Pull-ups máx",placeholder:"Ej: 20"},
    {id:"muscle_up_bar",label:"Muscle-up barra",placeholder:"Ej: 5"},
    {id:"muscle_up_rings",label:"Muscle-up anillas",placeholder:"Ej: 3"},
    {id:"hspu",label:"HSPU",placeholder:"Ej: 10"},
    {id:"double_unders",label:"Double unders",placeholder:"Ej: 50 seguidos"},
    {id:"fran",label:"Fran",placeholder:"Ej: 4:30"},
    {id:"grace",label:"Grace",placeholder:"Ej: 3:45"},
    {id:"helen",label:"Helen",placeholder:"Ej: 9:20"},
  ],
  funcional_calistenia: [{id:"pullups",label:"Pull-ups máx",placeholder:"Ej: 15"},{id:"muscle_up",label:"Muscle-ups",placeholder:"Ej: 5"},{id:"front_lever",label:"Front lever",placeholder:"Ej: 10 seg"},{id:"handstand",label:"Handstand",placeholder:"Ej: 30 seg"}],
  funcional_fitness: [{id:"peso",label:"Peso corporal",placeholder:"Ej: 78kg"},{id:"grasa",label:"% grasa",placeholder:"Ej: 22%"}],
  hibrido_hyrox: [{id:"hyrox_tiempo",label:"Tiempo Hyrox",placeholder:"Ej: 1:24:00"},{id:"ski_erg",label:"SkiErg 1000m",placeholder:"Ej: 4:10"},{id:"row",label:"Remo 1000m",placeholder:"Ej: 3:55"}],
  hibrido_triatlon: [{id:"natacion",label:"Natación 1500m",placeholder:"Ej: 28:00"},{id:"ciclismo",label:"Ciclismo 40K",placeholder:"Ej: 1:05:00"},{id:"carrera_tri",label:"Carrera 10K",placeholder:"Ej: 48:00"}],
  hibrido_ocr: [{id:"spartan_tiempo",label:"Tiempo OCR",placeholder:"Ej: 1:45:00"},{id:"pullups",label:"Pull-ups máx",placeholder:"Ej: 12"}],
  hibrido_general: [{id:"peso_muerto",label:"Peso muerto",placeholder:"Ej: 140kg"},{id:"5k",label:"5K",placeholder:"Ej: 26:00"}],
  fuerza_powerlifting: [{id:"squat",label:"Sentadilla",placeholder:"Ej: 140kg"},{id:"bench",label:"Press banca",placeholder:"Ej: 100kg"},{id:"deadlift",label:"Peso muerto",placeholder:"Ej: 180kg"},{id:"total",label:"Total",placeholder:"Ej: 420kg"}],
  fuerza_halterofilia: [{id:"snatch",label:"Arrancada",placeholder:"Ej: 80kg"},{id:"clean_jerk",label:"Dos tiempos",placeholder:"Ej: 100kg"},{id:"total",label:"Total",placeholder:"Ej: 180kg"}],
  fuerza_strongman: [{id:"peso_muerto",label:"Peso muerto",placeholder:"Ej: 220kg"},{id:"log_press",label:"Log press",placeholder:"Ej: 110kg"},{id:"farmer",label:"Farmer carry (x/mano)",placeholder:"Ej: 100kg"}],
};

const TEST_ATLETA: Record<string, {id:string; label:string; tipo:string; opciones?:string[]; placeholder?:string; unidad?:string}[]> = {
  carrera: [
    {id:"tiempo_5k", label:"¿Cuál es tu mejor tiempo reciente en 5K?", tipo:"texto", placeholder:"Ej: 24:30 — si no tienes, escribe 'sin marca'"},
    {id:"tiempo_10k", label:"¿Y en 10K?", tipo:"texto", placeholder:"Ej: 51:00 — si no tienes, escribe 'sin marca'"},
    {id:"km_semana", label:"¿Cuántos km semanales haces actualmente?", tipo:"opciones", opciones:["Menos de 20km","20-40km","40-60km","60-80km","Más de 80km"]},
    {id:"ritmo_suave", label:"¿Cuál es tu ritmo de rodaje cómodo (Z2)?", tipo:"texto", placeholder:"Ej: 5:30 min/km"},
    {id:"fc_suave", label:"¿Sabes tu frecuencia cardíaca en rodaje suave?", tipo:"texto", placeholder:"Ej: 140 ppm — si no sabes, escribe 'no sé'"},
    {id:"test_cooper", label:"Si no tienes marcas recientes, ¿quieres hacer el test de Cooper? (correr 12 min y anotar la distancia)", tipo:"opciones", opciones:["Sí, lo haré", "No es necesario, tengo marcas"]},
  ],
  funcional_crossfit: [
    {id:"back_squat", label:"Back Squat — ¿Cuál es tu 1RM?", tipo:"texto", placeholder:"Ej: 100kg — si no sabes, escribe 'sin dato'"},
    {id:"deadlift", label:"Peso muerto — ¿Cuál es tu 1RM?", tipo:"texto", placeholder:"Ej: 140kg"},
    {id:"clean_jerk", label:"Dos tiempos — ¿Cuál es tu 1RM?", tipo:"texto", placeholder:"Ej: 80kg"},
    {id:"snatch", label:"Arrancada — ¿Cuál es tu 1RM?", tipo:"texto", placeholder:"Ej: 60kg"},
    {id:"pullups_max", label:"¿Cuántas dominadas estrictas seguidas puedes hacer?", tipo:"opciones", opciones:["Ninguna aún","1-3","4-8","9-15","Más de 15"]},
    {id:"skills_gym", label:"¿Qué movimientos gimnásticos tienes?", tipo:"multi", opciones:["Kipping Pull-ups","Chest to Bar","Bar Muscle-up","Ring Muscle-up","HSPU","Handstand Walk","Double Unders","Toes to Bar","Ninguno aún"]},
    {id:"fran", label:"¿Tienes tiempo en Fran (21-15-9 Thrusters + Pull-ups)?", tipo:"texto", placeholder:"Ej: 4:30 — si no, escribe 'sin dato'"},
    {id:"row_2k", label:"¿Tienes tiempo en 2K remo?", tipo:"texto", placeholder:"Ej: 7:15 — si no, escribe 'sin dato'"},
  ],
  funcional_calistenia: [
    {id:"dominadas_max", label:"¿Cuántas dominadas estrictas seguidas puedes hacer?", tipo:"opciones", opciones:["Ninguna","1-3","4-8","9-15","Más de 15"]},
    {id:"fondos_max", label:"¿Cuántos fondos en paralelas seguidos?", tipo:"opciones", opciones:["Ninguno","1-5","6-15","Más de 15"]},
    {id:"skills_actuales", label:"¿Qué habilidades dominas actualmente?", tipo:"multi", opciones:["Dominadas","Dips","Muscle-up barra","Muscle-up anillas","Front lever","Back lever","Planche (cualquier progresión)","Handstand libre","Ninguna aún"]},
  ],
  hibrido_hyrox: [
    {id:"tiempo_hyrox", label:"¿Tienes tiempo en alguna carrera Hyrox?", tipo:"texto", placeholder:"Ej: 1:24:00 — si no, escribe 'sin dato'"},
    {id:"tiempo_5k", label:"¿Cuál es tu tiempo en 5K?", tipo:"texto", placeholder:"Ej: 24:00"},
    {id:"objetivo_tiempo", label:"¿Cuál es tu objetivo de tiempo en Hyrox?", tipo:"multi", opciones:["Sub 1h45","Sub 1h30","Sub 1h20","Sub 1h10","Terminar","Competir en élite"]},
    {id:"estacion_debil", label:"¿Qué estación te cuesta más?", tipo:"multi", opciones:["SkiErg","Sled Push","Sled Pull","Burpee Broad Jump","Row","Farmers Carry","Sandbag Lunges","Wall Balls"]},
    {id:"back_squat", label:"Back Squat — ¿Cuál es tu 1RM?", tipo:"texto", placeholder:"Ej: 100kg"},
    {id:"deadlift", label:"Peso muerto — ¿Cuál es tu 1RM?", tipo:"texto", placeholder:"Ej: 140kg"},
  ],
  hibrido_triatlon: [
    {id:"tiempo_natacion", label:"¿Cuál es tu tiempo en 750m natación?", tipo:"texto", placeholder:"Ej: 16:00 — si no tienes, escribe 'sin dato'"},
    {id:"tiempo_ciclismo", label:"¿Y en 20K ciclismo?", tipo:"texto", placeholder:"Ej: 38:00"},
    {id:"tiempo_carrera", label:"¿Y en 5K carrera?", tipo:"texto", placeholder:"Ej: 24:00"},
    {id:"distancia_objetivo", label:"¿Qué distancia es tu objetivo?", tipo:"opciones", opciones:["Sprint","Olímpico","Half","Ironman","Duatlón"]},
  ],
  fuerza_powerlifting: [
    {id:"peso_corporal", label:"¿Cuál es tu peso corporal?", tipo:"texto", placeholder:"Ej: 80kg"},
    {id:"squat_1rm", label:"Sentadilla — ¿Cuál es tu 1RM?", tipo:"texto", placeholder:"Ej: 140kg"},
    {id:"bench_1rm", label:"Press banca — ¿Cuál es tu 1RM?", tipo:"texto", placeholder:"Ej: 100kg"},
    {id:"deadlift_1rm", label:"Peso muerto — ¿Cuál es tu 1RM?", tipo:"texto", placeholder:"Ej: 180kg"},
    {id:"eslabon_debil", label:"¿Cuál es tu levantamiento más débil?", tipo:"opciones", opciones:["Sentadilla","Press banca","Peso muerto","Los tres por igual"]},
  ],
  fuerza_halterofilia: [
    {id:"snatch_1rm", label:"Arrancada — ¿Cuál es tu 1RM?", tipo:"texto", placeholder:"Ej: 70kg — si no tienes, escribe 'sin dato'"},
    {id:"clean_jerk_1rm", label:"Dos tiempos — ¿Cuál es tu 1RM?", tipo:"texto", placeholder:"Ej: 90kg"},
    {id:"front_squat", label:"Sentadilla frontal — ¿Cuál es tu 1RM?", tipo:"texto", placeholder:"Ej: 100kg"},
  ],
  fuerza_strongman: [
    {id:"peso_corporal", label:"¿Cuál es tu peso corporal?", tipo:"texto", placeholder:"Ej: 95kg"},
    {id:"deadlift_1rm", label:"Peso muerto — ¿Cuál es tu 1RM?", tipo:"texto", placeholder:"Ej: 220kg"},
    {id:"log_press", label:"Log press — ¿Cuál es tu 1RM?", tipo:"texto", placeholder:"Ej: 110kg"},
    {id:"farmer_carry", label:"Farmer carry — ¿Cuánto por mano?", tipo:"texto", placeholder:"Ej: 100kg/mano"},
  ],
  hibrido_general: [
    {id:"deadlift_1rm", label:"Peso muerto — ¿Cuál es tu 1RM?", tipo:"texto", placeholder:"Ej: 120kg — si no tienes, escribe 'sin dato'"},
    {id:"tiempo_5k", label:"¿Cuál es tu tiempo en 5K?", tipo:"texto", placeholder:"Ej: 26:00"},
    {id:"prioridad", label:"¿Qué priorizas en tu entrenamiento?", tipo:"opciones", opciones:["Más fuerza","Más resistencia","50/50 equilibrado"]},
  ],
  hibrido_ocr: [
    {id:"tiempo_5k", label:"¿Cuál es tu tiempo en 5K?", tipo:"texto", placeholder:"Ej: 26:00"},
    {id:"dominadas_max", label:"¿Cuántas dominadas seguidas puedes hacer?", tipo:"opciones", opciones:["Ninguna","1-5","6-10","Más de 10"]},
    {id:"obstaculos", label:"¿Qué obstáculos dominas?", tipo:"multi", opciones:["Escalada de cuerda","Barras / Monkey bars","Muros altos","Agua / natación","Arrastre de peso","Ninguno aún"]},
    {id:"tiempo_ocr", label:"¿Tienes tiempo en alguna carrera OCR?", tipo:"texto", placeholder:"Ej: Spartan Sprint 1:45:00 — si no, escribe 'sin dato'"},
  ],
};

const SUGERENCIAS: Record<string, string[]> = {
  carrera: ["¿Qué metodología estoy usando?", "Muéstrame mi evolución", "Tengo carrera en 3 semanas", "Me duele la rodilla"],
  funcional: ["¿Qué metodología estoy usando?", "Muéstrame mi evolución", "Cambia el entreno de hoy", "Ajusta mi programación"],
  hibrido: ["¿Qué metodología estoy usando?", "Muéstrame mi evolución", "Tengo competición pronto", "Ajusta mi programación"],
  fuerza: ["¿Qué metodología estoy usando?", "Muéstrame mi evolución", "Registro nuevo 1RM", "Mi punto débil"],
  grupos: ["¿Qué metodología estoy usando?", "Muéstrame la progresión del grupo", "Cambia el WOD de hoy", "Ajusta la dificultad"],
};

const FREE_LIMIT = 8;
const generarCodigo = () => { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let r = "FP-"; for(let i=0;i<5;i++) r+=c[Math.floor(Math.random()*c.length)]; return r; };

type Categoria = typeof CATEGORIAS[0];
type Pregunta = {id: string; label: string; tipo: string; opciones?: string[]; placeholder?: string; condicionDe?: string; condicionValor?: RegExp};
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
  // FORGE FOCUS ONBOARDING
  const [focusPaso,setFocusPaso]=useState(1);
  const [focusDisciplinaExterna,setFocusDisciplinaExterna]=useState("");
  const [focusDiasExternos,setFocusDiasExternos]=useState<string[]>([]);
  const [focusDuracionExterna,setFocusDuracionExterna]=useState("");
  const [focusIntensidadExterna,setFocusIntensidadExterna]=useState("");
  const [focusTipoTrabajoExterna,setFocusTipoTrabajoExterna]=useState<string[]>([]);
  const [focusVariable,setFocusVariable]=useState(false);
  const [focusDisciplinaForge,setFocusDisciplinaForge]=useState("");
  const [focusObjetivoForge,setFocusObjetivoForge]=useState("");
  const [focusPrioridad,setFocusPrioridad]=useState("importante");
  const [focusGuardando,setFocusGuardando]=useState(false);
  // FORGE ONBOARDING STATE MACHINE
  const [onboardingMissing,setOnboardingMissing]=useState<string[]>([]);
  const [onboardingFcMax,setOnboardingFcMax]=useState("");
  const [onboardingFcMin,setOnboardingFcMin]=useState("");
  const [onboardingFcConoce,setOnboardingFcConoce]=useState<boolean|null>(null);
  const [onboardingConfirmando,setOnboardingConfirmando]=useState(false);
  const [codigoFocusReservado,setCodigoFocusReservado]=useState<string|null>(null);
  // FORGE: pregunta explicita y determinista de si empezar hoy o desde el proximo dia disponible
  const [esperandoConfirmacionEmpezarHoy,setEsperandoConfirmacionEmpezarHoy]=useState(false);
  const [confirmandoEliminarCuenta,setConfirmandoEliminarCuenta]=useState(false);
  const [eliminandoCuenta,setEliminandoCuenta]=useState(false);
  // FORGE MODE CHANGE — recuerda si estamos en medio de un flujo de cambio de modo iniciado
  // desde Mi Perfil, para que el Safety Net sepa que debe intentar capturar/ejecutar el cambio.
  const [modeChangeEnCurso,setModeChangeEnCurso]=useState<string|null>(null);
  const [mensajes,setMensajes]=useState<{role:string;content:string}[]>([]);
  const [historial,setHistorial]=useState<{role:string;content:string}[]>([]);
  const [input,setInput]=useState("");
  const [cargando,setCargando]=useState(false);
  const [generando,setGenerando]=useState(false);
  const [msgCount,setMsgCount]=useState(0);
  const [codigoUsuario,setCodigoUsuario]=useState("");
  const [codigoInput,setCodigoInput]=useState("");
  const [pestanaBloqueada,setPestanaBloqueada]=useState(false);
  const [mostrarConflictoSesion,setMostrarConflictoSesion]=useState(false);
  const generarUUID=():string=>{
    if(typeof crypto!=="undefined"&&crypto.randomUUID) return crypto.randomUUID();
    // Fallback simple con formato UUID v4 valido para navegadores antiguos
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,(c)=>{
      const r=Math.random()*16|0;
      const v=c==="x"?r:(r&0x3|0x8);
      return v.toString(16);
    });
  };
  const obtenerOCrearSessionId=():string=>{
    if(typeof window==="undefined") return generarUUID();
    const existente=sessionStorage.getItem("forge_session_id");
    if(existente) return existente;
    const nuevo=generarUUID();
    sessionStorage.setItem("forge_session_id",nuevo);
    return nuevo;
  };
  const sessionIdRef=useRef<string>(obtenerOCrearSessionId());
  const yaVerificoSesionRef=useRef<boolean>(false);

  // SESSION LOCK MANAGER: el backend arbitra cual pestaña tiene el control real.
  // Al detectar el codigo de usuario, verificamos si hay otra sesion activa antes de tomar el control.
  useEffect(()=>{
    if(!codigoUsuario) return;

    if(yaVerificoSesionRef.current) return;
    yaVerificoSesionRef.current=true;

    // SOLO VERIFICA, NUNCA ADQUIERE. La adquisicion (acquireSession) es exclusivamente
    // voluntaria: al cargar por primera vez si no hay dueño registrado, o al pulsar "Continuar aqui".
    const verificarYSolicitarControl=async()=>{
      const res=await apiCall({action:"verificar_sesion_activa",codigo:codigoUsuario,datos:{sessionId:sessionIdRef.current}});
      if(res?.haySesionActiva){
        setMostrarConflictoSesion(true);
      } else if(res?.sinDueñoRegistrado){
        // Nadie es dueño aun (primera carga real de la app) — unica adquisicion automatica permitida
        await apiCall({action:"tomar_control_sesion",codigo:codigoUsuario,datos:{sessionId:sessionIdRef.current}});
      }
      // Si haySesionActiva=false porque el dueño soy YO, no hacer nada (ni adquirir ni bloquear)
    };
    verificarYSolicitarControl();

    // Heartbeat cada 25 segundos: si dejamos de ser propietarios, bloqueamos esta pestaña
    const interval=setInterval(async()=>{
      const res=await apiCall({action:"heartbeat_sesion",codigo:codigoUsuario,datos:{sessionId:sessionIdRef.current}});
      if(res?.ok===false){
        setPestanaBloqueada(true);
      }
    },25000);

    return ()=>clearInterval(interval);
  },[codigoUsuario]);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const codigoUrl=params.get("codigo");
    if(codigoUrl&&codigoUrl.length>=5){
      setCodigoInput(codigoUrl);
      setPantalla("cargando");
      setTimeout(async()=>{
        setErrorCodigo("");
        const data=await apiCall({action:"recuperar_usuario",codigo:codigoUrl.trim().toUpperCase()});
        if(data.error){setErrorCodigo("Codigo no encontrado.");return;}
        const u=data.data;
        setCodigoUsuario(u.codigo);setCategoria(u.categoria);
        const espKeyLoaded=(u as any).especialidad||u.categoria;
        setEspKey(espKeyLoaded);
        const espLabelLoaded=Object.entries(ESPECIALIDAD_KEY[u.categoria]||{}).find(([,v])=>v===espKeyLoaded)?.[0]||null;
        setEspLabel(espLabelLoaded);
        setRespuestas(u.perfil);
        setMarcas(u.marcas||[]);setHistorial(u.historial||[]);
        const historialLimpio=(u.historial?.slice(-6)||[]).map((m:any)=>typeof m.content==="string"?{...m,content:m.content.replace(/\n*\[Fecha actual del sistema:[\s\S]*?\]/,"").replace(/\n*\[Contexto temporal del mensaje:[\s\S]*?\]/,"").trim()}:m);
        setMensajes(historialLimpio);
        const consultasUsadas=Math.floor((u.historial?.length||0)/2);
        setMsgCount(consultasUsadas);
        const irATest=params.get("test")==="1";
        setPantalla(irATest?"test":"chat");
        if(params.get("ajustes")==="1"){
          // FIX: redirigir a la nueva pagina /perfil en vez de abrir el panel antiguo superpuesto
          window.location.href=`/perfil?codigo=${u.codigo}`;
          return;
        }
        // FORGE MODE CHANGE — si venimos de "Mi Perfil" con datos faltantes para cambiar de modo,
        // el Coach inicia la conversacion pidiendolos, en vez de esperar a que el usuario escriba
        // algo primero. La peticion la origina el sistema (parametro URL), nunca el LLM decide
        // por su cuenta iniciar este flujo.
        // FORGE MODE TRANSITION FLOW — tras completar el cambio de modo en Mi Perfil (todos los
        // datos ya confirmados de forma determinista), disparamos directamente la generacion real
        // de la primera semana via el Orchestrator — sin conversacion previa, ya no hace falta
        // preguntar disponibilidad porque ya se capturo explicitamente en el flujo de Mi Perfil.
        if(params.get("generar_semana_focus")==="1"){
          setCodigoUsuario(u.codigo);
          setTimeout(async()=>{
            console.log("🔍 DEBUG generar_semana_focus — codigoUsuario:",u.codigo);
            setMensajes([{role:"assistant",content:`¡Bienvenido a tu nuevo modo ${u.modo_entrada==="focus"?"Focus":"Coach"}! Ya tengo todos tus datos — voy a construir tu primera semana ahora mismo.`}]);
            setGenerandoSemana(true);
            setMensajes(prev=>[...prev,{role:"assistant",content:"🔧 Construyendo tu primera semana paso a paso — analizando bloque, distribuyendo días y diseñando cada sesión..."}]);
            const planFocusInicial=await orquestarGeneracionSemana(true);
            console.log("🔍 DEBUG resultado orquestarGeneracionSemana:",planFocusInicial);
            const respuestaFocusInicial=planFocusInicial
              ? `✅ **Semana generada y guardada.**\n\nBloque: ${planFocusInicial.block_name} — ${planFocusInicial.week_objective}\n\nRevisa el detalle completo en **Mi Plan**. ¿Alguna duda?`
              : "⚠️ Hubo un problema generando la semana. Puedes pedírmelo directamente en el chat: \"genera mi semana\".";
            setMensajes(prev=>[...prev,{role:"assistant",content:respuestaFocusInicial}]);
            setGenerandoSemana(false);
          },500);
        }
        const modeChangeTarget=params.get("mode_change_target");
        const modeChangeMissing=params.get("mode_change_missing");
        if(modeChangeTarget){
          setModeChangeEnCurso(modeChangeTarget);
          setTimeout(async()=>{
            setCargando(true);
            const preguntasCambioModo:Record<string,string>=modeChangeTarget==="focus"?{
      disponibilidad:"¿qué días de la semana puedes entrenar en total (sumando todo, incluida la disciplina externa)?",
      disciplina_externa:"¿qué disciplina entrenas con OTRO entrenador o por tu cuenta, que Forge NO debe tocar ni modificar (ej: CrossFit, running, natación)?",
      dias_externos:"¿qué días concretos entrenas esa disciplina externa?",
      duracion_sesion:"¿cuánto tiempo tienes disponible para la disciplina que gestionará Forge?",
    }:{
      disponibilidad:"¿qué días de la semana puedes entrenar?",
      duracion_sesion:"¿cuánto tiempo tienes disponible por sesión?",
    };
    const preguntasPendientesTexto=modeChangeMissing?.split(',').filter((f:string)=>preguntasCambioModo[f]).map((f:string)=>preguntasCambioModo[f]).join(" ")||"";
    const promptCambioModo=`El atleta quiere cambiar su modo de Forge a "${modeChangeTarget}". IMPORTANTE — modo Focus significa: Forge gestiona SOLO UNA disciplina, y el atleta tiene OTRA disciplina completamente distinta gestionada por un entrenador externo que Forge nunca debe tocar. Son dos cosas DIFERENTES, no la misma actividad en distintos sitios. Para completar el cambio necesitas preguntar esto de forma clara y explícita, EN ESTE PRIMER MENSAJE (no esperes a que el atleta escriba primero): ${preguntasPendientesTexto} Sé directo y estructurado, no ambiguo — deja claro que la disciplina externa es una actividad DISTINTA a la que gestionará Forge.`;
            const dataCambioModo=await apiCall({model:"claude-sonnet-4-5",max_tokens:1000,system:buildPrompt(CATEGORIAS.find((c:Categoria)=>c.id===u.categoria)!,u.perfil,(u.historial||[]).slice(-6),""),messages:[{role:"user",content:promptCambioModo}]});
            const textoCambioModoCrudo=(dataCambioModo.content?.map((b:{text?:string})=>b.text||"").join("")||"").trim();
            // FIX: limpiar el tag [STATE_UPDATE] antes de mostrar, mismo tratamiento que el resto
            // de respuestas del Coach que pasan por procesarTags — este mensaje se genera fuera
            // de ese flujo normal, asi que necesita la misma limpieza aplicada manualmente aqui.
            const textoCambioModo=textoCambioModoCrudo.replace(/\[STATE_UPDATE\][\s\S]*?\[\/STATE_UPDATE\]/g,"").trim();
            if(textoCambioModo){
              setMensajes(prev=>[...prev,{role:"assistant",content:textoCambioModo}]);
            }
            setCargando(false);
          },300);
        }
        setEmailGuardado(!!u.email);
        setEsPremium(!!(u as any).premium);
        setEsAdmin(!!(u as any).admin);
        setMemoriaCoach({lesiones:(u as any).lesiones_actuales||"",plan:(u as any).plan_proxima_semana||"",notas:(u as any).notas_coach||""});
        setMarcasEspecificas((u as any).marcas_especificas||{});
        setLimiteConsultas((u as any).limite_consultas||FREE_LIMIT);
        setCicloActual((u as any).ciclo_actual||{});
        setPerfilPsicologico((u as any).perfil_psicologico||{});
        setAthleteState((u as any).athlete_state||{});
        setDatosEntrenamiento((u as any).datos_entrenamiento||{});
        setEstadoFisiologico((u as any).estado_fisiologico||{});
        setHistorialFisiologico((u as any).historial_fisiologico||[]);
        setDistribucionSemanal((u as any).distribucion_semanal||"");
        setObjetivoPrincipal((u as any).objetivo_principal||{});
        setHistorialMarcas((u as any).historial_marcas||[]);
        setAnalisisBloques((u as any).analisis_bloques||[]);
        setDebilidades((u as any).debilidades||[]);
        setFechaRegistro((u as any).created_at||null);
        // FIX CRITICO: modo_entrada nunca se cargaba al recuperar un usuario existente, quedandose
        // siempre en el valor por defecto "planificacion" — rompiendo el Capability Guard para
        // usuarios en supervision/consulta que inician sesion (no solo los recien registrados).
        setModoEntrada((u as any).modo_entrada||"planificacion");
        cargarEquipos(u.codigo);
        cargarPlanSemanal(u.codigo);
        cargarBlockOutcomes(u.codigo);
        cargarEstadoCanonico(u.codigo);
        verificarDescubrimientoPendiente(u.codigo);
        verificarSaludoProactivo(u.codigo);
        // FORGE PENDING ACTION BANNER — restaurar el banner de confirmacion si quedo un pending_action
        // sin resolver de una sesion anterior (ej: el usuario cerro la app antes de confirmar/rechazar).
        apiCall({action:"obtener_estado_atleta_activo",codigo:u.codigo}).then((resEstado:any)=>{
          if(resEstado?.estado&&resEstado.estado!=="normal"){
            setEstadoAtletaActivo({estado:resEstado.estado,motivo:resEstado.motivo,desde:resEstado.desde});
          }
        });
        apiCall({action:"obtener_pending_action_activo",codigo:u.codigo}).then((resPending:any)=>{
          if(resPending?.hayPending){
            setModificacionPendienteConfirmar({pendingId:"restaurado",dia:resPending.dia,titulo:resPending.titulo,motivo:resPending.motivo});
          }
        });
        if((u as any).is_beta_founder){ apiCall({action:"verificar_renovacion_beta",codigo:u.codigo}); }
        apiCall({action:"actualizar_usuario",codigo:u.codigo,datos:{ultima_visita:new Date().toISOString(),total_visitas:((u as any).total_visitas||1)+1}});
      },500);
    }
  },[]);
  const [marcas,setMarcas]=useState<Marca[]>([]);
  const [mostrarMarcas,setMostrarMarcas]=useState(false);
  const [nuevaMarca,setNuevaMarca]=useState("");
const [marcasEspecificas,setMarcasEspecificas]=useState<Record<string,string>>({});
  const [codigoGuardado,setCodigoGuardado]=useState("");
const [errorCodigo,setErrorCodigo]=useState("");
const [espLabel,setEspLabel]=useState<string|null>(null);
const [espKey,setEspKey]=useState<string|null>(null);
const [emailGuardado,setEmailGuardado]=useState(false);
const [esPremium,setEsPremium]=useState(false);
const [esAdmin,setEsAdmin]=useState(false);
const [limiteConsultas,setLimiteConsultas]=useState(FREE_LIMIT);
const [fechaRegistro,setFechaRegistro]=useState<string|null>(null);
const [memoriaCoach,setMemoriaCoach]=useState<{lesiones?:string;plan?:string;notas?:string}>({});
const [perfilPsicologico,setPerfilPsicologico]=useState<{arousal?:string;confianza?:string;estres?:string;motivacion?:string;notas_mentales?:string}>({});
const [datosEntrenamiento,setDatosEntrenamiento]=useState<Record<string,any>>({});
const [estadoFisiologico,setEstadoFisiologico]=useState<{fatiga_aguda?:number;fatiga_cronica?:number;tendencia?:string;hrv?:number;sueno?:number;rhr?:number;adherencia?:number}>({});
const [historialFisiologico,setHistorialFisiologico]=useState<{fecha:string;hrv?:number;sueno?:number;rhr?:number}[]>([]);
const [distribucionSemanal,setDistribucionSemanal]=useState<string>("");
const [objetivoPrincipal,setObjetivoPrincipal]=useState<{descripcion?:string;fecha?:string;tipo?:string}>({});
const [planSemanal,setPlanSemanal]=useState<any>(null);
const [debilidades,setDebilidades]=useState<{ejercicio:string;descripcion:string;fecha:string}[]>([]);
const [blockOutcomes,setBlockOutcomes]=useState<any[]>([]);
const [estadoCanonico,setEstadoCanonico]=useState<any>(null);
const [mostrarBotonNuevaSemana,setMostrarBotonNuevaSemana]=useState(false);
const [generandoSemana,setGenerandoSemana]=useState(false);
const [nuevoAprendizaje,setNuevoAprendizaje]=useState<{texto:string;porcentaje:number}|null>(null);
const [progresoActualizado,setProgresoActualizado]=useState<{nombre:string;antes:number;despues:number}|null>(null);
const [descubrimientoPendiente,setDescubrimientoPendiente]=useState<{descubrimiento:string;categoria:string;confianza:number}|null>(null);
const [mostrarCodigoReal,setMostrarCodigoReal]=useState(false);
const [betaFounderInfo,setBetaFounderInfo]=useState<{numero:number;maxSlots:number;meses:number}|null>(null);
const [estadoFounder,setEstadoFounder]=useState<any>(null);
const [mostrarMasChat,setMostrarMasChat]=useState(false);
const [forgeCardData,setForgeCardData]=useState<any>(null);
const [prPendienteCompartir,setPrPendienteCompartir]=useState<{ejercicio:string;valor:string;mejora:string|null;progresion?:{valor:number;fecha:string}[]}|null>(null);
const [semanaPendienteCompartir,setSemanaPendienteCompartir]=useState<{sesionesCompletadas:number;sesionesTotales:number}|null>(null);
const [rachaPendienteCompartir,setRachaPendienteCompartir]=useState<number|null>(null);
const [modoEntrada,setModoEntrada]=useState<string>("planificacion");
const [esperandoConfirmacionDisponibilidad,setEsperandoConfirmacionDisponibilidad]=useState(false);
const [mostrarBannerCambioModo,setMostrarBannerCambioModo]=useState(false);
const [modificacionPendienteConfirmar,setModificacionPendienteConfirmar]=useState<{pendingId:string;dia:string;titulo:string;motivo:string}|null>(null);
const [estadoAtletaActivo,setEstadoAtletaActivo]=useState<{estado:string;motivo:string;desde:string}|null>(null);
const [alertaSesionFuturaIncompatible,setAlertaSesionFuturaIncompatible]=useState<{dia:string;tituloSesion:string;constraintViolada:string;issue:string}|null>(null);
const [sesionParaCompartir,setSesionParaCompartir]=useState<any>(null);
const [suenoConfirmado,setSuenoConfirmado]=useState<{fecha:string;valores:any}|null>(null);
const [objetivoPendienteCompartir,setObjetivoPendienteCompartir]=useState<{objetivo:string;resultado:string}|null>(null);
const [historialMarcas,setHistorialMarcas]=useState<{fecha:string;ejercicio:string;valor:string}[]>([]);
const [analisisBloques,setAnalisisBloques]=useState<any[]>([]);
const [athleteState,setAthleteState]=useState<Record<string,any>>({});
const [testAtleta,setTestAtleta]=useState<Record<string,string|string[]>>({});
const [testIdx,setTestIdx]=useState(0);
const [pantallTest,setPantallaTest]=useState(false);
const [resultadoTest,setResultadoTest]=useState<{nivel:string;puntuaciones:Record<string,number>;fortalezas:string[];debilidades:string[];resumen:string}|null>(null);
const [cicloActual,setCicloActual]=useState<{bloque?:string;semana?:number;totalSemanas?:number;objetivo?:string}>({});
const [imagenesAdjuntas,setImagenesAdjuntas]=useState<{base64:string;tipo:string;nombre:string}[]>([]);
const [imagenAdjunta,setImagenAdjunta]=useState<{base64:string;tipo:string;nombre:string}|null>(null);
const [imagenPreview,setImagenPreview]=useState<string|null>(null);
const [emailBanner,setEmailBanner]=useState("");
const [bannerEnviado,setBannerEnviado]=useState(false);
const [mostrarPerfil,setMostrarPerfil]=useState(false);
const [nuevoCodigo,setNuevoCodigo]=useState("");
const [nuevoEmail,setNuevoEmail]=useState("");
const [mensajePerfil,setMensajePerfil]=useState("");
const [errorPerfil,setErrorPerfil]=useState("");
const [editandoPerfil,setEditandoPerfil]=useState(false);
const [perfilEdit,setPerfilEdit]=useState<Record<string,string>>({});
const [editandoEspecialidad,setEditandoEspecialidad]=useState(false);
const [email,setEmail]=useState("");
const [codigoPersonal,setCodigoPersonal]=useState("");
const [errorCodigoPersonal,setErrorCodigoPersonal]=useState("");
const [emailInput,setEmailInput]=useState("");
const [mostrarRecuperar,setMostrarRecuperar]=useState(false);

  const cargarBlockOutcomes=async(cod:string)=>{
    const res=await apiCall({action:"obtener_block_outcomes",codigo:cod});
    if(res?.outcomes) setBlockOutcomes(res.outcomes);
  };

  const cargarPlanSemanal=async(cod:string)=>{
    const res=await apiCall({action:"obtener_plan_semana",codigo:cod});
    if(res?.plan) setPlanSemanal(res.plan);
  };

  const cargarEstadoCanonico=async(cod:string)=>{
    const res=await apiCall({action:"obtener_estado_canonico",codigo:cod});
    if(res?.estado) setEstadoCanonico(res.estado);
  };

  // FORGE DISCOVERY ENGINE — verifica si hay un descubrimiento pendiente de mostrar al abrir el chat
  const verificarDescubrimientoPendiente=async(cod:string)=>{
    const res=await apiCall({action:"obtener_descubrimiento_pendiente",codigo:cod});
    if(res?.descubrimiento){
      setDescubrimientoPendiente(res.descubrimiento);
    }
  };

  // FORGE COACH PROACTIVO — si han pasado varios dias, Forge inicia con algo relevante en vez de esperar
  const verificarSaludoProactivo=async(cod:string)=>{
    const res=await apiCall({action:"obtener_saludo_proactivo",codigo:cod});
    if(res?.saludo){
      setMensajes(prev=>[...prev,{role:"assistant",content:res.saludo}]);
    }
  };

  // FORGE ORCHESTRATOR — genera la semana completa en 3 pasos pequeños en vez de una llamada gigante
  const orquestarGeneracionSemana=async(empezarHoy:boolean=true):Promise<any>=>{
    if(!codigoUsuario) return null;
    console.log("=== FORGE ORCHESTRATOR: INICIO ===");

    // Paso 1: Block Analyzer
    console.log("ORCHESTRATOR Paso 1 — Block Analyzer: iniciando...");
    const analyzerRes=await apiCall({action:"analizar_bloque_semana",codigo:codigoUsuario});
    console.log("ORCHESTRATOR Paso 1 — Block Analyzer: resultado:", JSON.stringify(analyzerRes));
    if(!analyzerRes?.ok) { console.log("ORCHESTRATOR: FALLO en Block Analyzer, abortando"); return null; }
    const analisis=analyzerRes.analisis;

    // Paso 2: Week Planner — genera Strategy + Blueprint. Si el Blueprint Acceptance Validator lo
    // rechaza, se REGENERA COMPLETO (no se parchean dias sueltos) — maximo 2 reintentos.
    const distribucionParaValidar=(()=>{
      try{ return typeof distribucionSemanal==="string"?JSON.parse(distribucionSemanal):distribucionSemanal; }
      catch{ return null; }
    })();

    let estructura:any=null;
    let intentosBlueprint=0;
    const MAX_INTENTOS_BLUEPRINT=2;
    while(intentosBlueprint<MAX_INTENTOS_BLUEPRINT){
      intentosBlueprint++;
      console.log(`ORCHESTRATOR Paso 2 — Week Planner: intento ${intentosBlueprint} de generar Blueprint...`);
      const plannerRes=await apiCall({action:"planificar_semana",codigo:codigoUsuario,datos:{analisis}});
      console.log("ORCHESTRATOR Paso 2 — Week Planner: resultado:", JSON.stringify(plannerRes));
      if(!plannerRes?.ok) { console.log("ORCHESTRATOR: FALLO en Week Planner, abortando"); return null; }

      const candidato=plannerRes.estructura;
      // FORGE BLUEPRINT ACCEPTANCE VALIDATOR — evalua el Blueprint COMPLETO antes de construir nada
      const aceptacion=validateBlueprint(candidato.sessions||[], candidato.strategy||null, distribucionParaValidar);
      console.log("BLUEPRINT ACCEPTANCE:", JSON.stringify(aceptacion));

      if(aceptacion.aceptado){
        estructura=candidato;
        break;
      }
      console.log(`BLUEPRINT RECHAZADO (intento ${intentosBlueprint}):`, aceptacion.motivos.join(" | "));
      if(intentosBlueprint>=MAX_INTENTOS_BLUEPRINT){
        // Ultimo recurso: usar el candidato de todos modos pero corrigiendo disponibilidad puntualmente
        console.log("BLUEPRINT: maximo de reintentos alcanzado, usando ultimo candidato con correccion de disponibilidad");
        const validacionDisp=validarBlueprintDisponibilidad(candidato.sessions||[], distribucionParaValidar);
        validacionDisp.correcciones.forEach(({dia, tipoCorrecto}:{dia:string,tipoCorrecto:string})=>{
          const diaEnEstructura=(candidato.sessions||[]).find((d:any)=>d.dia===dia);
          if(diaEnEstructura) diaEnEstructura.tipo=tipoCorrecto;
        });
        estructura=candidato;
      }
    }

    // FIX CRITICO DE RAIZ: calcular el weekStart REAL (con la logica de "si la semana actual ya
    // se cerro, avanzar a la siguiente") AQUI AL PRINCIPIO — antes se calculaba solo al final,
    // y "dias ya completados" siempre miraba la semana de HOY, arrastrando por error el contenido
    // completo de una semana ya cerrada hacia la nueva semana que se estaba generando.
    const hoyOrch=new Date();
    const diaSemOrch=hoyOrch.getDay()||7;
    const lunesOrch=new Date(hoyOrch);
    lunesOrch.setDate(hoyOrch.getDate()-diaSemOrch+1);
    const weekStartSemanaActual=lunesOrch.toISOString().split('T')[0];

    // FIX CRITICO: usar la nueva accion check_week_closure (solo lectura) en vez de la antigua
    // verificar_semana_completa_sin_cierre, que dejo de existir en el backend hoy y siempre
    // devolvia undefined — causando que el Orchestrator SIEMPRE creyera que la semana seguia
    // abierta y regenerara la semana actual en vez de avanzar a la siguiente.
    const resVerificarCierreActual=await apiCall({action:"check_week_closure",codigo:codigoUsuario});
    const semanaActualYaCerrada=resVerificarCierreActual?.yaCerrada===true;

    const weekStartOrchestrator=semanaActualYaCerrada
      ? (()=>{ const lunesSig=new Date(lunesOrch); lunesSig.setDate(lunesOrch.getDate()+7); return lunesSig.toISOString().split('T')[0]; })()
      : weekStartSemanaActual;
    console.log("ORCHESTRATOR: semana actual ya cerrada =", semanaActualYaCerrada, "→ weekStart real:", weekStartOrchestrator);

    // Preservar dias que YA tienen sesion completada, pero SOLO dentro del weekStart REAL que se
    // esta generando — si es una semana nueva (recien empezada), esto correctamente sera vacio.
    const resPlanExistente=await apiCall({action:"obtener_plan_semana",codigo:codigoUsuario});
    const sessionsExistentes=(resPlanExistente?.plan?.week_start===weekStartOrchestrator ? resPlanExistente.plan.sessions : []) || [];
    const diasYaCompletados=sessionsExistentes.filter((s:any)=>s.completada===true);
    console.log("ORCHESTRATOR: dias ya completados en la semana que se esta generando, se preservan:", JSON.stringify(diasYaCompletados.map((s:any)=>s.dia)));

    // Paso 3: Session Builder, TODAS las llamadas en PARALELO (Promise.all) en vez de secuencial.
    // Reduce el tiempo total de ~7x30s (210s) a ~30-40s, sin cambiar la arquitectura.
    // FIX: solo se construyen dias DESDE HOY en adelante (nunca dias pasados de la semana actual que
    // no se llegaron a reportar) — cubre usuario nuevo a mitad de semana y regeneracion a mitad de semana.
    const ORDEN_DIAS=["lunes","martes","miercoles","jueves","viernes","sabado","domingo"];
    const normalizarDiaOrch=(d:string)=>(d||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    // FIX CRITICO: el filtro de "dias pasados sin reportar" SOLO tiene sentido si estamos generando
    // la semana ACTUAL (weekStartOrchestrator === weekStartSemanaActual). Si es una semana FUTURA
    // (porque la actual ya se cerro), NINGUN dia es "pasado" — todos son dias nuevos por construir.
    const esSemanaActualReal=weekStartOrchestrator===weekStartSemanaActual;
    // FIX: si el atleta eligio NO empezar hoy (pregunta explicita, nunca inferida), el indice de
    // corte avanza 1 dia, excluyendo "hoy" del rango de dias a construir — sin depender de la hora
    // ni de que el LLM decida esto, es una decision determinista basada en la respuesta real del usuario.
    const hoyOrchIdx=esSemanaActualReal?((new Date()).getDay()||7)-1+(empezarHoy?0:1):-1;
    const diasPasadosSinReportar=esSemanaActualReal?(estructura.sessions||[]).filter((d:any)=>{
      const idxDia=ORDEN_DIAS.indexOf(normalizarDiaOrch(d.dia));
      return idxDia<hoyOrchIdx && !diasYaCompletados.some((dc:any)=>normalizarDiaOrch(dc.dia)===normalizarDiaOrch(d.dia));
    }):[];
    console.log("ORCHESTRATOR Paso 3 — Session Builder: construyendo", (estructura.sessions||[]).length, "dias EN PARALELO. esSemanaActualReal=", esSemanaActualReal);
    const diasAConstruir=(estructura.sessions||[]).filter((d:any)=>{
      const idxDia=ORDEN_DIAS.indexOf(normalizarDiaOrch(d.dia));
      return d.tipo!=="descanso" && idxDia>=hoyOrchIdx && !diasYaCompletados.some((dc:any)=>normalizarDiaOrch(dc.dia)===normalizarDiaOrch(d.dia));
    });
    const diasDescanso=(estructura.sessions||[]).filter((d:any)=>{
      const idxDia=ORDEN_DIAS.indexOf(normalizarDiaOrch(d.dia));
      return d.tipo==="descanso" && idxDia>=hoyOrchIdx && !diasYaCompletados.some((dc:any)=>normalizarDiaOrch(dc.dia)===normalizarDiaOrch(d.dia));
    });

    const todasLasSesionesOrden=estructura.sessions||[];
    const resultadosParalelos=await Promise.all(
      diasAConstruir.map((diaEstructura:any)=>{
        const idxEnSemana=todasLasSesionesOrden.findIndex((d:any)=>d.dia===diaEstructura.dia);
        const diaAnterior=idxEnSemana>0?todasLasSesionesOrden[idxEnSemana-1]:null;
        const diaSiguiente=idxEnSemana<todasLasSesionesOrden.length-1?todasLasSesionesOrden[idxEnSemana+1]:null;
        return apiCall({action:"construir_sesion_dia",codigo:codigoUsuario,datos:{
          dia:diaEstructura.dia,
          tipo:diaEstructura.tipo,
          titulo_breve:diaEstructura.titulo_breve,
          focus:diaEstructura.focus,
          volume:diaEstructura.volume,
          intensity:diaEstructura.intensity,
          conditioning:diaEstructura.conditioning,
          analisis,
          debilidad_relacionada:analisis.debilidad_prioritaria,
          trabaja_debilidad:diaEstructura.trabaja_debilidad===true,
          diaAnterior,
          diaSiguiente
        }}).then((res:any)=>{
          console.log(`ORCHESTRATOR Paso 3 — ${diaEstructura.dia}: resultado:`, JSON.stringify(res));
          return res;
        });
      })
    );

    const sesionesCompletas:any[]=[
      ...diasYaCompletados,
      ...resultadosParalelos.filter((r:any)=>r?.ok).map((r:any)=>r.sesion),
      ...diasDescanso.map((d:any)=>({dia:d.dia,tipo:"descanso",titulo:"Descanso",por_que:"Recuperación programada",descripcion:"Día de descanso — prioriza sueño, hidratación y nutrición."})),
      // Dias pasados de esta semana sin reportar (ej: usuario nuevo que se registra un miercoles):
      // no se inventan, se marcan simplemente como no disponibles para ese periodo.
      ...diasPasadosSinReportar.map((d:any)=>({dia:d.dia,tipo:d.tipo,titulo:"Sin registrar",por_que:"Día anterior al inicio de esta planificación",descripcion:"No aplica — esta planificación comienza a partir de hoy.",completada:false}))
    ];
    console.log("ORCHESTRATOR: sesiones completas construidas:", sesionesCompletas.length, "de 7 esperadas");

    // FORGE SCIENTIFIC VALIDATOR — biblioteca de 10 reglas deterministas, corrige sesiones antes de guardar
    const esDeload=analisis.tipo_semana==="deload";
    const hayLesionLumbarActiva=/lumbar/i.test(memoriaCoach.lesiones||"") || debilidades.some(d=>/lumbar/i.test(d.descripcion||""));

    aplicarTodasLasReglas({
      sesiones:sesionesCompletas,
      analisis,
      estructura,
      esDeload,
      hayLesionLumbarActiva,
      estadoFisio:estadoFisiologico,
      debilidadesActivas:debilidades,
      historialFisiologico
    });

    // FORGE WEEK INTEGRITY VALIDATOR — verifica disponibilidad y variedad segun FORGE_SEMANA_CANONICA.md.
    // Si detecta violaciones, regenera los dias problematicos con instruccion explicita de corregirlas.
    console.log("WEEK INTEGRITY: verificando disponibilidad y variedad...");
    const resultadoIntegridad=validarIntegridadSemana(sesionesCompletas, distribucionSemanal);
    console.log("WEEK INTEGRITY: resultado:", JSON.stringify(resultadoIntegridad));

    if(!resultadoIntegridad.valido && resultadoIntegridad.diasCorregir.length>0){
      console.log("WEEK INTEGRITY: regenerando dias con violaciones:", resultadoIntegridad.diasCorregir);
      const diasARegenerar=resultadoIntegridad.diasCorregir.filter((diaCorregir:string)=>
        !diasYaCompletados.some((dc:any)=>dc.dia===diaCorregir)
      );
      const regeneraciones=await Promise.all(
        diasARegenerar.map(async(diaCorregir:string)=>{
          const estructuraDia=(estructura.sessions||[]).find((d:any)=>d.dia===diaCorregir);
          if(!estructuraDia) return null;
          // Determinar el tipo correcto segun distribucion_semanal para forzar la correccion
          let tipoForzado=estructuraDia.tipo;
          try{
            const distParsed=typeof distribucionSemanal==="string"?JSON.parse(distribucionSemanal):distribucionSemanal;
            const normalizar=(d:string)=>(d||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
            Object.entries(distParsed||{}).forEach(([clave,dias]:[string,any])=>{
              if(clave==="observaciones"||!Array.isArray(dias)) return;
              if(dias.some((d:string)=>normalizar(d)===normalizar(diaCorregir))){
                tipoForzado=clave==="box"?"box":clave==="pista"?"carrera":clave;
              }
            });
          }catch{}
          // FORGE RECOVERY PIPELINE — accion especializada con contexto aislado del analisis contaminado
          const idxEnSemanaCorregir=(estructura.sessions||[]).findIndex((d:any)=>d.dia===diaCorregir);
          const diaAnteriorCorregir=idxEnSemanaCorregir>0?(estructura.sessions||[])[idxEnSemanaCorregir-1]:null;
          const diaSiguienteCorregir=idxEnSemanaCorregir<(estructura.sessions||[]).length-1?(estructura.sessions||[])[idxEnSemanaCorregir+1]:null;
          const res=await apiCall({action:"regenerar_sesion_disciplina_forzada",codigo:codigoUsuario,datos:{
            dia:diaCorregir,
            disciplinaForzada:tipoForzado,
            tituloBreve:estructuraDia.titulo_breve,
            cicloActual,
            diaAnterior:diaAnteriorCorregir,
            diaSiguiente:diaSiguienteCorregir
          }});
          return res?.ok ? res.sesion : null;
        })
      );
      regeneraciones.forEach((sesionRegenerada:any)=>{
        if(!sesionRegenerada) return;
        const idx=sesionesCompletas.findIndex((s:any)=>s.dia===sesionRegenerada.dia);
        if(idx>=0) sesionesCompletas[idx]=sesionRegenerada;
      });
      console.log("WEEK INTEGRITY: dias regenerados:", regeneraciones.filter(Boolean).length);
    }

    // weekStart ya se calculo al principio de la funcion (weekStartOrchestrator) — se reutiliza aqui.
    const weekStart=weekStartOrchestrator;

    // FIX: week_number debe ser SIEMPRE cicloActual.semana (la fuente real del Estado Canonico),
    // nunca "+1" ciego — sumar +1 solo tenia sentido en el modelo antiguo donde se generaba siempre
    // la semana SIGUIENTE. Ahora que el Orchestrator puede regenerar la semana ACTUAL, sumar +1
    // duplicaba el incremento cada vez que se corregia/regeneraba la misma semana.
    const planCompleto={
      week_start:weekStart,
      week_number:cicloActual.semana||1,
      total_weeks_block:cicloActual.totalSemanas||null,
      block_name:cicloActual.bloque||analisis.tipo_semana,
      week_objective:analisis.objetivo,
      sessions:sesionesCompletas
    };

    // Guardar el plan completo
    console.log("ORCHESTRATOR: guardando plan completo:", JSON.stringify(planCompleto));
    await apiCall({action:"guardar_plan_semana",codigo:codigoUsuario,datos:{plan:planCompleto}});

    // FORGE PERSISTENCE VALIDATOR — verificar que realmente se guardo correctamente antes de confirmar exito
    console.log("ORCHESTRATOR: verificando persistencia para week_start:", planCompleto.week_start);
    const validacion=await apiCall({action:"verificar_persistencia_plan",codigo:codigoUsuario,datos:{weekStart:planCompleto.week_start}});
    console.log("ORCHESTRATOR: resultado verificacion persistencia:", JSON.stringify(validacion));
    if(!validacion?.valido){
      console.log("ORCHESTRATOR: validacion fallo, motivo:", validacion?.motivo, "— reintentando guardado...");
      await apiCall({action:"guardar_plan_semana",codigo:codigoUsuario,datos:{plan:planCompleto}});
      const segundaValidacion=await apiCall({action:"verificar_persistencia_plan",codigo:codigoUsuario,datos:{weekStart:planCompleto.week_start}});
      console.log("ORCHESTRATOR: resultado segunda verificacion:", JSON.stringify(segundaValidacion));
      if(!segundaValidacion?.valido){
        console.log("=== ORCHESTRATOR: FALLO DEFINITIVO tras reintento ===");
        cargarPlanSemanal(codigoUsuario);
        return null;
      }
    }
    console.log("=== FORGE ORCHESTRATOR: EXITO COMPLETO ===");
    cargarPlanSemanal(codigoUsuario);
    return planCompleto;
  };

  const cargarEquipos=async(cod:string)=>{
    const res=await apiCall({action:"mis_equipos",codigo:cod});
    if(res?.equipos) setMisEquipos(res.equipos);
  };

  const crearEquipo=async()=>{
    if(!crearEquipoNombre) return;
    const res=await apiCall({action:"crear_equipo",codigo:codigoUsuario,datos:{nombre:crearEquipoNombre,tipo:crearEquipoTipo}});
    if(res?.equipo){
      setMisEquipos(prev=>[...prev,res.equipo]);
      setCrearEquipoNombre("");
    } else {
      alert(res?.error||"Error al crear equipo");
    }
  };

  const generarSesionEquipo=async(equipo:any)=>{
    const res=await apiCall({action:"generar_sesion_equipo",codigo:codigoUsuario,datos:{team_id:equipo.id}});
    if(res?.perfiles){
      const {perfiles, memoria, usarRatios} = res;
      const atletaA=perfiles[0];
      const atletaB=perfiles[1];
      const ratiosStr=usarRatios&&memoria.length>0?`\nRATIOS APRENDIDOS:\n${memoria.map((m:any)=>`- ${m.movement}: ratio ${m.ratio} (${m.sessions_count} sesiones)`).join("\n")}`:"(Sesión de observación — aún sin ratios establecidos)";
      const prompt=`Genera una sesión conjunta para el equipo "${equipo.name}" (tipo: ${equipo.team_type}).\n\nATLETA A:\nPerfil: ${JSON.stringify(atletaA.perfil)}\nCiclo: ${JSON.stringify(atletaA.ciclo_actual)}\nLesiones: ${atletaA.lesiones_actuales||"ninguna"}\nMarcas: ${JSON.stringify(atletaA.marcas_especificas)}\n\nATLETA B:\nPerfil: ${JSON.stringify(atletaB.perfil)}\nCiclo: ${JSON.stringify(atletaB.ciclo_actual)}\nLesiones: ${atletaB.lesiones_actuales||"ninguna"}\nMarcas: ${JSON.stringify(atletaB.marcas_especificas)}\n\n${ratiosStr}\n\nREGLAS:\n1. La sesión respeta el bloque actual de CADA atleta\n2. Mismo estímulo, cargas y escalados individualizados\n3. Indica claramente qué hace cada atleta cuando difieren\n4. El plan individual de cada uno NO se rompe`;
      setMostrarEquipos(false);
      setMostrarMenu(false);
      setMensajes(prev=>[...prev,{role:"assistant",content:`🔍 Analizando el equipo "${equipo.name}"...\n\n👤 Ciclo actual de cada atleta\n👤 Marcas y niveles individuales\n👤 Lesiones o limitaciones activas\n${usarRatios&&memoria.length>0?`📊 Ratios aprendidos de sesiones anteriores (${memoria.length})`:"📊 Primera sesión conjunta — sin ratios previos"}\n\nGenerando sesión personalizada para ambos...`}]);
      enviarSilencioso(prompt);
      await apiCall({action:"guardar_sesion_equipo",codigo:codigoUsuario,datos:{team_id:equipo.id,workout:prompt}});
    }
  };

  const generarCodigoConjunto=async()=>{
    setModoConjunto("generando");
    const res=await apiCall({action:"crear_codigo_conjunto",codigo:codigoUsuario});
    if(res?.codigoTemp){
      setCodigoTempGenerado(res.codigoTemp);
      setModoConjunto("esperando");
    } else {
      setModoConjunto("idle");
    }
  };

  const usarCodigoConjunto=async()=>{
    if(!codigoConjuntoInput) return;
    const res=await apiCall({action:"usar_codigo_conjunto",codigo:codigoUsuario,codigoConjunto:codigoConjuntoInput});
    if(res?.data){
      setPerfilAmigo(res.data);
      setModoConjunto("listo");
    } else {
      alert("Código inválido o expirado");
    }
  };
const [mensajeRecuperar,setMensajeRecuperar]=useState("");
  const bottomRef=useRef<HTMLDivElement>(null);
const abortControllerRef=useRef<AbortController|null>(null);
  const inputRef=useRef<HTMLTextAreaElement>(null);
  const [alturaViewport,setAlturaViewport]=useState<number>(0);
const [mostrarSugerencias,setMostrarSugerencias]=useState(false);
const [mostrarMenu,setMostrarMenu]=useState(false);
const [sesionPendiente,setSesionPendiente]=useState<any>(null);
const [mostrarConjunto,setMostrarConjunto]=useState(false);
const [codigoConjuntoInput,setCodigoConjuntoInput]=useState("");
const [codigoTempGenerado,setCodigoTempGenerado]=useState("");
const [perfilAmigo,setPerfilAmigo]=useState<any>(null);
const [modoConjunto,setModoConjunto]=useState<"idle"|"generando"|"esperando"|"introducir"|"listo">("idle");
const [copiadoConjunto,setCopiadoConjunto]=useState(false);
const [misEquipos,setMisEquipos]=useState<any[]>([]);
const [mostrarEquipos,setMostrarEquipos]=useState(false);
const [crearEquipoNombre,setCrearEquipoNombre]=useState("");
const [crearEquipoTipo,setCrearEquipoTipo]=useState("generic");
const [unirseCodigo,setUnirseCodigo]=useState("");
const [equipoSeleccionado,setEquipoSeleccionado]=useState<any>(null);

  useEffect(()=>{
    const actualizarAltura=()=>{
      if(window.visualViewport){
        setAlturaViewport(window.visualViewport.height);
      } else {
        setAlturaViewport(window.innerHeight);
      }
    };
    actualizarAltura();
    window.visualViewport?.addEventListener('resize',actualizarAltura);
    window.addEventListener('resize',actualizarAltura);
    return()=>{
      window.visualViewport?.removeEventListener('resize',actualizarAltura);
      window.removeEventListener('resize',actualizarAltura);
    };
  },[]);

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[mensajes,cargando,generando,pantalla]);

  const cat=categoria?CATEGORIAS.find((c:Categoria)=>c.id===categoria):null;
  const preguntasBase:Pregunta[]=(espKey?FORMULARIOS[espKey]:null)||(categoria?FORMULARIOS[categoria]:[])||[];
  // FIX: preguntas condicionales (ej: FC max/reposo, solo si el usuario indico que tiene
  // pulsometro) se filtran dinamicamente segun la respuesta REAL ya dada a la pregunta de la
  // que dependen — nunca se muestran si la condicion no se cumple, evitando preguntas irrelevantes.
  // FIX: Supervision/Consulta capturan un perfil BASE minimo (edad, nivel, objetivo) en vez de
  // saltar directamente a "final" sin ningun dato — necesario para que calcularEstadoOnboarding
  // pueda evaluar correctamente un futuro cambio de modo hacia Focus/Coach sin preguntar de nuevo
  // datos que el atleta ya deberia tener guardados desde el principio, sin importar su modo.
  // FIX ARQUITECTONICO: un unico cuestionario base para TODOS los modos, sin bifurcacion por
  // modoEntrada. Todos los usuarios completan el mismo onboarding — el modo determina el
  // comportamiento posterior de Forge, no que datos basicos se recogen. Esto elimina la necesidad
  // de gestionar 3 variantes de onboarding y sus transiciones futuras entre modos.
  const preguntas:Pregunta[]=preguntasBase.filter(p=>{
    if(!p.condicionDe) return true;
    const valorCondicion=respuestas[p.condicionDe];
    if(typeof valorCondicion!=="string") return false;
    return p.condicionValor?p.condicionValor.test(valorCondicion):true;
  });
  const pregActual=preguntas[pregIdx];
  const diasPrueba=10;
  const diasUsados=fechaRegistro?Math.floor((new Date().getTime()-new Date(fechaRegistro).getTime())/(1000*60*60*24)):0;
  const bloqueado=!esPremium&&!esAdmin&&fechaRegistro!==null&&diasUsados>=diasPrueba;
  const accentColor=cat?.color||C.accent;

const apiCall=async(body:Record<string,unknown>,useAbort=false):Promise<any>=>{
    let intentos=0;
    while(intentos<3){
      try{
        const controller=useAbort?abortControllerRef.current:null;
        const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:controller?.signal});
        if(res.ok) return res.json();
        intentos++;
        await new Promise(r=>setTimeout(r,1000));
      }catch(e:any){
        if(e.name==="AbortError") return {aborted:true};
        intentos++;
      }
    }
    return {error:"Error de conexion"};
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
    setCodigoUsuario(u.codigo);setCategoria(u.categoria);
    const espKeyLoaded=(u as any).especialidad||u.categoria;
    setEspKey(espKeyLoaded);
    const espLabelLoaded=Object.entries(ESPECIALIDAD_KEY[u.categoria]||{}).find(([,v])=>v===espKeyLoaded)?.[0]||null;
    setEspLabel(espLabelLoaded);
    setRespuestas(u.perfil);
    setMarcas(u.marcas||[]);setHistorial(u.historial||[]);
    const historialLimpio2=(u.historial?.slice(-6)||[]).map((m:any)=>typeof m.content==="string"?{...m,content:m.content.replace(/\n*\[Fecha actual del sistema:[\s\S]*?\]/,"").replace(/\n*\[Contexto temporal del mensaje:[\s\S]*?\]/,"").trim()}:m);
    setMensajes(historialLimpio2);
    const consultasUsadas=Math.floor((u.historial?.length||0)/2);
    setMsgCount(consultasUsadas);
    setEmailGuardado(!!u.email);
    setEsPremium(!!(u as any).premium);
    setEsAdmin(!!(u as any).admin);
    setMemoriaCoach({
      lesiones:(u as any).lesiones_actuales||"",
      plan:(u as any).plan_proxima_semana||"",
      notas:(u as any).notas_coach||""
    });
    setModoEntrada((u as any).modo_entrada||"planificacion");
    setMarcasEspecificas((u as any).marcas_especificas||{});
    setCicloActual((u as any).ciclo_actual||{});
    setPerfilPsicologico((u as any).perfil_psicologico||{});
    setAthleteState((u as any).athlete_state||{});
    setDatosEntrenamiento((u as any).datos_entrenamiento||{});
    setEstadoFisiologico((u as any).estado_fisiologico||{});
    setHistorialFisiologico((u as any).historial_fisiologico||[]);
    setDistribucionSemanal((u as any).distribucion_semanal||"");
    setObjetivoPrincipal((u as any).objetivo_principal||{});
    setHistorialMarcas((u as any).historial_marcas||[]);
    setAnalisisBloques((u as any).analisis_bloques||[]);
    setDebilidades((u as any).debilidades||[]);
    setFechaRegistro((u as any).created_at||null);
    cargarEquipos(u.codigo);
    cargarPlanSemanal(u.codigo);
    cargarBlockOutcomes(u.codigo);
    cargarEstadoCanonico(u.codigo);
    verificarDescubrimientoPendiente(u.codigo);
        verificarSaludoProactivo(u.codigo);
    if((u as any).is_beta_founder){ apiCall({action:"verificar_renovacion_beta",codigo:u.codigo}); }
    apiCall({action:"actualizar_usuario",codigo:u.codigo,datos:{ultima_visita:new Date().toISOString(),total_visitas:((u as any).total_visitas||1)+1}});
    // Punto de entrada principal: la pantalla "Hoy" (Daily Briefing) en vez del chat directo
    window.location.href=`/hoy?codigo=${u.codigo}`;
    // reanudarSesion eliminada para reducir consumo de tokens
  };

  const reanudarSesion=async(u:UsuarioData)=>{
    setGenerando(true);
    const catObj=CATEGORIAS.find((c:Categoria)=>c.id===u.categoria)!;
    const resumen=u.historial?.slice(-6).map((m:{role:string;content:any})=>`${m.role==="user"?"Usuario":"Coach"}: ${typeof m.content==="string"?m.content.substring(0,150):"[imagen/archivo]"}...`).join("\n")||"";
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
const elegirEspecialidad=(label:string)=>{
    const key=ESPECIALIDAD_KEY[categoria!]?.[label]||categoria!;
    setEspKey(key);setEspLabel(label);setRespuestas({especialidad:label});setPregIdx(0);
    // ONBOARDING DIFERENCIADO: los modos "supervision" y "consulta" saltan el cuestionario largo
    // de objetivos/disponibilidad (que asume que Forge va a generar el plan) — solo necesitan
    // el minimo para identificar al atleta, el resto lo descubre Forge conversando.
    // FIX: Supervision/Consulta ya no saltan directo a "final" sin ningun dato — pasan por el
    // formulario (ahora filtrado a solo 3 preguntas base: edad, nivel, objetivo) antes de continuar.
    setPantalla("formulario");
  };

  const avanzar=()=>{
    const val=(pregActual.tipo==="multi"||pregActual.tipo==="dias_semana")?selMulti:pregActual.tipo==="texto"?textoTemp:respuestas[pregActual.id];
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
const esRehab=(espKey||categoria)==="rehabilitacion_general";
    const promptSupervision="¡Hola! Ya tengo mi propia planificación o entrenador — no necesito que Forge me genere un plan. Preséntate brevemente explicando cómo me vas a ayudar en este modo: puedo registrar mis entrenos y métricas para que los organices, preguntarte dudas técnicas, pedirte opinión sobre sesiones concretas, y avisarte si necesito adaptar algo por fatiga o molestias. Deja claro que nunca vas a sustituir ni modificar mi planificación existente sin que yo lo pida explícitamente.";
    const promptConsulta="¡Hola! Todavía no quiero una planificación completa, solo quiero ir contándote mis entrenos y que me vayas conociendo poco a poco, y poder preguntarte dudas cuando las tenga. Preséntate brevemente explicando esto.";
    const promptFocus=`¡Hola! Acabo de completar mi perfil. Tengo un entrenador externo para ${focusDisciplinaExterna || "otra disciplina"} (entreno eso ${focusDiasExternos.length>0?focusDiasExternos.join(", "):"varios días"}), y quiero que TÚ te encargues específicamente de mi ${focusDisciplinaForge || "disciplina principal"}. Por favor sigue esta secuencia: 1) Bienvenida breve confirmando que entiendes esta configuración — que gestionarás mi ${focusDisciplinaForge} pero NUNCA prescribirás ni modificarás mi entrenamiento de ${focusDisciplinaExterna}, solo lo tendrás en cuenta como carga externa al planificar. 2) Explica brevemente que si les cuento cómo van esas sesiones externas (duración, intensidad, cómo me sentí), eso te ayuda a ajustar mejor mis sesiones — pero que no es obligatorio, funcionas igual sin ese detalle. 3) Demuestra que conoces mi objetivo y perfil. 4) Explica tu metodología para mi disciplina. 5) Pregunta si estoy de acuerdo antes de empezar.`;
    const prompt = modoEntrada==="focus" ? promptFocus
      : modoEntrada==="supervision" ? promptSupervision
      : modoEntrada==="consulta" ? promptConsulta
      : esRehab
      ? "¡Hola! Acabo de completar mi perfil de rehabilitación. Por favor: 1) Incluye PRIMERO el disclaimer obligatorio completo. 2) Da la bienvenida breve demostrando que entiendes mi zona afectada, tipo de molestia y fase actual. 3) Explica el enfoque y las fases de rehabilitación que vas a aplicar y por qué. 4) Termina preguntando si estoy de acuerdo, indicando explícitamente que al confirmar para empezar la Fase 1 confirmo que he comprendido la información, que esto no sustituye valoración profesional, y que asumo la responsabilidad de detener cualquier ejercicio que cause dolor y consultar con un profesional si es necesario."
      : "¡Hola! Acabo de completar mi perfil. Por favor sigue exactamente esta secuencia: 1) Empieza con una declaración breve de compromiso, en el estilo de: 'Bienvenido a Forge. Ya he terminado de estudiar tu perfil. A partir de hoy me ocuparé de: adaptar cada sesión, analizar tu recuperación, detectar cuándo progresas, y cambiar el plan cuando sea necesario. Tú solo tienes que entrenar y contarme qué ocurre.' — adapta el tono a mi perfil concreto, no lo copies literal. 2) Demuestra que has leído mi perfil completo — especialidad, nivel, objetivo y limitaciones — en una frase breve y personalizada. 3) Explica qué metodología de periodización vas a aplicar conmigo y POR QUÉ es la más adecuada para mi situación concreta — sé específico, no genérico. 4) Pregúntame si estoy de acuerdo con esta metodología o si quiero explorar alguna alternativa antes de empezar. NO generes ningún entrenamiento todavía — espera mi confirmación.";
    try{
      const esp=espKey||categoria!;
      const data=await apiCall({model:"claude-sonnet-4-5",max_tokens:3000,system:buildPrompt(catObj,perfil,[],""),messages:[{role:"user",content:prompt}]});
      const texto=(data.content?.map((b:{text?:string})=>b.text||"").join("")||"Error al conectar.").replace(/\[STATE_UPDATE\][\s\S]*?\[\/STATE_UPDATE\]/g,"").trim();
      // FIX: el prompt interno (usado solo para generar la bienvenida) nunca debe guardarse como
      // mensaje visible del usuario en el historial — se sustituye por un texto neutro discreto.
      const hist=[{role:"user",content:"[Inicio de conversación]"},{role:"assistant",content:texto}];
      setMensajes([{role:"assistant",content:texto}]);setHistorial(hist);setMsgCount(1);setEmailGuardado(!!email);setFechaRegistro(new Date().toISOString());
      // FIX FORGE FOCUS: si el atleta ya nos dio los dias de su disciplina externa (onboarding) y
      // cuantos dias puede entrenar la disciplina Forge (formulario general), ya tenemos informacion
      // suficiente para DEDUCIR sus dias libres reales — nunca dejar distribucion_semanal vacia
      // cuando el dato es matematicamente derivable, evita que el Coach pregunte algo que ya sabemos.
      let distribucionAutoFocus="";
      if(modoEntrada==="focus"&&focusDiasExternos.length>0){
        // FIX ARQUITECTONICO: eliminada toda inferencia numerica ("3 dias" -> deducir cuales).
        // dias_disponibles ahora es SELECCION EXPLICITA del usuario (array real de dias concretos,
        // capturado en el formulario). Cruzamos directamente con los dias externos ya conocidos —
        // sin interpretacion de texto, sin LLM, sin ambiguedad posible.
        const diasDisponiblesReales=(perfil.dias_disponibles as string[])||[];
        const diasForgeReales=diasDisponiblesReales.filter(d=>!focusDiasExternos.includes(d));
        const distribucionObj:Record<string,string>={
          [focusDisciplinaForge]: diasForgeReales.length>0?diasForgeReales.join(", "):"sin días asignados aún",
          [focusDisciplinaExterna]: focusDiasExternos.join(", ")+" (entrenador externo, Forge NUNCA prescribe estos días)",
          observaciones: `Días exactos seleccionados por el atleta para ${focusDisciplinaForge}: ${diasForgeReales.join(", ")||"ninguno"}. Estos son los ÚNICOS días donde Forge puede prescribir contenido — cualquier otro día (incluidos los de ${focusDisciplinaExterna}) debe quedar sin sesión de Forge.`
        };
        distribucionAutoFocus=JSON.stringify(distribucionObj);
      }
      await apiCall({action:"guardar_usuario",datos:{codigo,categoria,especialidad:espKey||categoria,perfil,rutina:texto,historial:hist,marcas:[],email:email||null,admin:false,premium:false,modo_entrada:modoEntrada,distribucion_semanal:distribucionAutoFocus||undefined}});
      // FIX: actualizar el estado de React inmediatamente tras guardar — antes se guardaba
      // correctamente en Supabase pero el frontend seguia con el valor vacio original en memoria,
      // causando que guardar_plan_semana preguntara "no tengo tu disponibilidad" aunque ya existiera.
      if(distribucionAutoFocus) setDistribucionSemanal(distribucionAutoFocus);
      setCodigoUsuario(codigo);
      // FIX ARQUITECTONICO DEFINITIVO: guardar athlete_training_sources AQUI, con el "codigo" real
      // ya resuelto (personal o generado), nunca antes — este es el UNICO punto del flujo donde el
      // codigo definitivo existe con certeza total. Resuelve de raiz el bug real (confirmado con
      // varios perfiles de prueba) de disciplinas guardadas bajo codigos fantasma nunca usados.
      if(modoEntrada==="focus"&&focusDisciplinaExterna){
        await apiCall({action:"guardar_training_sources",codigo,datos:{disciplinas:[
          {disciplina:focusDisciplinaExterna,owner:"external",dias:focusDiasExternos,duracion_habitual:focusDuracionExterna,intensidad_habitual:focusIntensidadExterna,tipo_trabajo:focusTipoTrabajoExterna,variable:focusVariable},
          {disciplina:focusDisciplinaForge,owner:"forge",objetivo:focusObjetivoForge,prioridad:focusPrioridad}
        ]}});
      }
      // FORGE ONBOARDING STATE MACHINE — el formulario ya cubre todos los campos requeridos (incluida
      // FC condicional). Confirmamos el onboarding en SILENCIO, sin pantalla intermedia — si por algun
      // motivo faltara algo real, el usuario simplemente sigue en modo "in_progress" sin bloquear el
      // chat, y puede completarse mas adelante desde Mi Atleta.
      apiCall({action:"confirmar_onboarding",codigo,datos:{mode:modoEntrada}});
    }catch{setMensajes([{role:"assistant",content:"Error de conexion. Por favor recarga."}]);}
    finally{setGenerando(false);setTimeout(()=>inputRef.current?.focus(),300);}
  };

  // FORGE VALIDATOR — capa de verificación determinista entre el LLM y el usuario.
// El backend conoce la verdad (fecha, plan, estado); esta función corrige cualquier
// afirmación del modelo que contradiga esa verdad, sin depender de que el LLM razone bien.
// v2: regex flexible que tolera variaciones naturales del lenguaje ("de hoy", "para mañana",
// "hoy es", puntuacion intermedia) en vez de exigir "hoy [dia]" pegado literalmente.
const forgeValidator=(texto:string):string=>{
    if(!estadoCanonico) return texto;
    const diaHoyReal=estadoCanonico.dia_semana_hoy;
    const diaMananaReal=estadoCanonico.dia_semana_manana;
    const DIAS_SEMANA=["lunes","martes","miércoles","miercoles","jueves","viernes","sábado","sabado","domingo"];
    let textoCorregido=texto;
    const normalizarDia=(d:string)=>d.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();

    DIAS_SEMANA.forEach(dia=>{
      if(normalizarDia(dia)!==normalizarDia(diaHoyReal)){
        // Tolera hasta 2 palabras cortas entre "hoy" y el dia (ej: "hoy es", "de hoy", "hoy miercoles 29/7")
        const regexHoy=new RegExp(`(\\bhoy\\b(?:\\s+\\w{1,4}){0,2}\\s+)${dia}\\b`,"gi");
        textoCorregido=textoCorregido.replace(regexHoy,(match,p1)=>p1+diaHoyReal);
      }
      if(normalizarDia(dia)!==normalizarDia(diaMananaReal)){
        const regexManana=new RegExp(`(\\bma[nñ]ana\\b(?:\\s+\\w{1,4}){0,2}\\s+)${dia}\\b`,"gi");
        textoCorregido=textoCorregido.replace(regexManana,(match,p1)=>p1+diaMananaReal);
      }
    });

    return textoCorregido;
  };

  const procesarTags=async(textoOriginal:string, esMensajeDeSueno:boolean=false, mensajeUsuarioOriginal:string=""):Promise<string>=>{
    // Limpieza de residuos de markdown/JSON que el modelo a veces genera antes del tag real (ej: "```json" suelto)
    let texto=textoOriginal.replace(/\[STATE_UPDATE\][\s\S]*?\[\/STATE_UPDATE\]/g,"").replace(/```json|```/gi,"").trim();

    const extraerJSON=(str:string, tagStart:number, prefixLen:number):{json:string|null,endIdx:number}=>{
      const jsonStart=tagStart+prefixLen;
      let depth=0, endIdx=-1;
      let dentroString=false;
      let escapando=false;
      for(let i=jsonStart;i<str.length;i++){
        const ch=str[i];
        if(escapando){ escapando=false; continue; }
        if(ch==='\\'){ escapando=true; continue; }
        if(ch==='"'){ dentroString=!dentroString; continue; }
        if(dentroString) continue; // ignorar llaves/corchetes que son solo texto dentro de un string
        if(ch==='{') depth++;
        else if(ch==='}'){ depth--; if(depth===0){ endIdx=i; break; } }
      }
      if(endIdx<0) return {json:null,endIdx:-1};
      return {json:str.substring(jsonStart,endIdx+1),endIdx};
    };

    const procesarTag=async(tag:string,prefixLen:number,callback:(data:any)=>Promise<void>)=>{
      // Procesa TODAS las ocurrencias del mismo tag en el mensaje, no solo la primera
      // (necesario cuando el modelo genera varios tags iguales seguidos, ej: modificar 2 sesiones distintas)
      let seguirBuscando=true;
      let intentos=0;
      while(seguirBuscando && intentos<10){ // limite de seguridad para evitar bucle infinito
        intentos++;
        const tagStart=texto.indexOf(tag);
        if(tagStart<0){ seguirBuscando=false; break; }
        const {json,endIdx}=extraerJSON(texto,tagStart,prefixLen);
        if(json){
          try{
            const data=JSON.parse(json);
            await callback(data);
          }catch{}
        }
        let tagEndBracket=-1;
        if(endIdx>=0){
          let i=endIdx+1;
          while(i<texto.length&&texto[i]===' ') i++;
          if(texto[i]===']') tagEndBracket=i;
        }
        if(tagEndBracket<0) tagEndBracket=texto.indexOf("]",tagStart);
        const antes=texto.substring(0,tagStart).trim();
        const despues=tagEndBracket>=0?texto.substring(tagEndBracket+1).trim():"";
        texto=(antes+(despues?" "+despues:"")).trim();
      }
    };

    await procesarTag("[RESUMEN_SEMANA:",16,async(data)=>{
      await apiCall({action:"guardar_resumen_semana",codigo:codigoUsuario,datos:data});
      setMostrarBotonNuevaSemana(true);
    });
    await procesarTag("[BLOCK_OUTCOME:",15,async(data)=>{
      await apiCall({action:"guardar_block_outcome",codigo:codigoUsuario,datos:data});
      cargarBlockOutcomes(codigoUsuario);
    });
    await procesarTag("[INTERVENTION:",14,async(data)=>{
      await apiCall({action:"guardar_intervention",codigo:codigoUsuario,datos:data});
    });
    await procesarTag("[PLAN:",6,async(data)=>{
      await apiCall({action:"guardar_plan_semana",codigo:codigoUsuario,datos:{plan:data}});
      cargarPlanSemanal(codigoUsuario);
    });
    await procesarTag("[MODIFICAR_SESION:",18,async(data)=>{
      await apiCall({action:"actualizar_sesion_plan",codigo:codigoUsuario,datos:data});
      cargarPlanSemanal(codigoUsuario);
    });
    // FORGE PENDING ACTIONS — el Coach propone un cambio, se guarda como pending. La confirmacion
    // se detecta deterministicamente (regex), NUNCA dependiendo de que el LLM genere otro tag despues.
    await procesarTag("[PROPONER_MODIFICACION:",24,async(data)=>{
      await apiCall({action:"guardar_pending_action",codigo:codigoUsuario,datos:{tipo:"modificar_sesion",accion:data}});
    });
    // FORGE MODIFICATION SAFETY NET — se ejecuta SIEMPRE tras procesar los tags normales, sin
    // bloquear la respuesta al usuario (fire-and-forget). Si el LLM anuncio un cambio de sesion
    // SIN generar el tag tecnico, esta verificacion determinista lo detecta y crea el pending_action
    // de todos modos — nunca dejamos que el LLM decida silenciosamente si algo importante se registra.
    if(codigoUsuario){
      apiCall({action:"verificar_modificacion_sesion_deterministico",codigo:codigoUsuario,datos:{respuestaCoach:texto,mensajeUsuario:mensajeUsuarioOriginal}}).then((resSafety:any)=>{
        if(resSafety?.detectado){
          console.log("🛡️ Safety net: modificacion detectada y registrada automaticamente");
          setModificacionPendienteConfirmar({pendingId:resSafety.pendingId,dia:resSafety.dia,titulo:resSafety.titulo,motivo:resSafety.motivo});
        }
      });
      // FORGE FUTURE SESSION SAFETY — verifica si el Coach menciono espontaneamente una sesion futura
      // incompatible con una restriccion activa (vector de fallo real confirmado: el Coach dijo
      // "mantén la sesión Z2 de carrera" mientras el atleta tenia restriccion activa de rodilla).
      apiCall({action:"verificar_referencia_sesion_futura",codigo:codigoUsuario,datos:{respuestaCoach:texto}}).then((resFuturo:any)=>{
        if(resFuturo?.alerta){
          console.log("🛡️ Future session safety: sesion incompatible mencionada, mostrando alerta");
          setAlertaSesionFuturaIncompatible(resFuturo.alerta);
        }
      });
    }
    await procesarTag("[DEBILIDAD_DEV:",15,async(data)=>{
      await apiCall({action:"registrar_debilidad_dev",codigo:codigoUsuario,datos:data});
    });
    await procesarTag("[APRENDIZAJE:",13,async(data)=>{
      const res=await apiCall({action:"registrar_aprendizaje",codigo:codigoUsuario,datos:data});
      if(res?.ok && !res?.duplicado){
        setNuevoAprendizaje({texto:data.texto,porcentaje:res.porcentajeTotal});
      }
    });
    await procesarTag("[ACTUALIZAR_DEBILIDAD:",22,async(data)=>{
      const res=await apiCall({action:"actualizar_debilidad_dev",codigo:codigoUsuario,datos:data});
      if(res?.ok && res?.progresoNuevo!==undefined && res?.progresoAnterior!==undefined && res.progresoNuevo>res.progresoAnterior){
        setProgresoActualizado({nombre:res.nombreVisible,antes:res.progresoAnterior,despues:res.progresoNuevo});
      }
    });
    await procesarTag("[EVENTO:",8,async(data)=>{
      const resEvento=await apiCall({action:"registrar_evento",codigo:codigoUsuario,datos:{evento:data}});
      // FORGE CARDS — fuente FIABLE de PR: el tag [EVENTO:] del Coach, no el extractor Haiku posterior
      if(resEvento?.nuevoPrDetectado){
        setPrPendienteCompartir(resEvento.nuevoPrDetectado);
      }
    });
    await procesarTag("[METRICA:",9,async(data)=>{
      await apiCall({action:"registrar_metrica_pasada",codigo:codigoUsuario,datos:data});
    });
    await procesarTag("[BORRAR_SESION:",15,async(data)=>{
      await apiCall({action:"borrar_sesion_fecha",codigo:codigoUsuario,datos:data});
    });

    // SESION es especial: no se guarda automáticamente, se muestra el banner
    // FORGE VALIDATOR: si el mensaje del usuario fue clasificado como sueño, NUNCA mostrar el banner de sesión aunque el modelo lo haya generado por error
    const sesionStart=texto.indexOf("[SESION:");
    if(sesionStart>=0){
      const {json,endIdx}=extraerJSON(texto,sesionStart,8);
      if(json && !esMensajeDeSueno){
        try{
          const sesionParsed=JSON.parse(json);
          const fechaSesionCheck=new Date(sesionParsed.fecha);
          const diaSemCheck=fechaSesionCheck.getDay()||7;
          const lunesSemCheck=new Date(fechaSesionCheck);
          lunesSemCheck.setDate(fechaSesionCheck.getDate()-diaSemCheck+1);
          const weekStartCheck=lunesSemCheck.toISOString().split('T')[0];
          const DIAS_CHECK=["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
          const diaCheck=DIAS_CHECK[fechaSesionCheck.getDay()].normalize("NFD").replace(/[\u0300-\u036f]/g,"");
          const workoutIdCheck=`${weekStartCheck}_${diaCheck}`;
          const yaExisteCheck=planSemanal?.sessions?.find((s:any)=>s.dia.normalize("NFD").replace(/[\u0300-\u036f]/g,"")===diaCheck)?.completada;
          setSesionPendiente({...sesionParsed,workout_id:workoutIdCheck,yaExiste:!!yaExisteCheck});
        }catch{}
      }
      const tagEndBracket=texto.indexOf("]",endIdx>=0?endIdx:sesionStart);
      const antes=texto.substring(0,sesionStart).trim();
      const despues=tagEndBracket>=0?texto.substring(tagEndBracket+1).trim():"";
      texto=(antes+(despues?" "+despues:"")).trim();
    }

    // RED DE SEGURIDAD GENERICA: elimina cualquier tag con formato [NOMBRE_EN_MAYUSCULAS:{...}] que el
    // modelo haya podido inventar y que no exista en nuestra lista de tags conocidos y procesados arriba.
    // Esto evita que tags inventados (ej: [MODIFICAR_DISPONIBILIDAD:...]) queden visibles como texto roto.
    texto = texto.replace(/\[[A-Z_]+:\s*\{[\s\S]*?\}\s*\]/g, "").trim();

    if(!texto) texto="✅ Hecho. Puedes ver los detalles en las secciones correspondientes.";
    return texto;
  };

  const enviarSilencioso=async(texto:string)=>{
    console.log("=== ENTRA A FUNCION enviarSilencioso() ===");
    if(!texto.trim()||cargando) return;
    const fechaHoyStrSilencioso=new Date().toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Europe/Madrid"});
    const textoConFecha=texto.trim()+`\n\n[Fecha actual del sistema: ${fechaHoyStrSilencioso}]\n[Contexto temporal del mensaje: CONSULTA_GENERAL — este mensaje puede incluir ajustes de planificación, respeta siempre la fecha de HOY indicada arriba y en el ESTADO CANÓNICO, el plan generado corresponde a la semana ACTUAL que contiene HOY, nunca la próxima semana.]`;
    const nuevoHist=[...historial,{role:"user",content:textoConFecha}];
    // CONTEXT ISOLATION: solo los ultimos 3 mensajes reales como contexto conversacional
    const mensajesParaAPI=nuevoHist.slice(-3);
    setCargando(true);setMsgCount(c=>c+1);
    const catObj=CATEGORIAS.find((c:Categoria)=>c.id===categoria)!;
    const esp=espKey||categoria!;
    const esSuenoSilencioso=/métricas de sueño|dormí|puntuación de sueño|durante la noche|sueño profundo|sueño rem/i.test(texto.toLowerCase()) && !/entren|wod|sesion realizada|serie|repeticion/i.test(texto.toLowerCase());
    try{
      const resumen=historial.slice(-4).map(m=>`${m.role==="user"?"Usuario":"Coach"}: ${typeof m.content==="string"?m.content.substring(0,150):"[archivo]"}...`).join("\n");
      const resContextoSilencioso=await apiCall({action:"procesar_mensaje_contexto",codigo:codigoUsuario,datos:{mensaje:textoConFecha}});
      const contextoConstruidoSilencioso=resContextoSilencioso?.contexto||"";
      const mensajesParaAPI=contextoConstruidoSilencioso
        ? [{role:"user" as const,content:`[CONTEXTO DE EVENTOS RECIENTES]\n${contextoConstruidoSilencioso}`},{role:"assistant" as const,content:"Entendido, tengo el contexto."},{role:"user" as const,content:textoConFecha}]
        : nuevoHist.slice(-3);
      const data=await apiCall({model:"claude-sonnet-4-5",max_tokens:4000,system:buildPrompt(catObj,respuestas,marcas as any,resumen,memoriaCoach,cicloActual,perfilPsicologico,esPremium||esAdmin,athleteState,datosEntrenamiento,estadoFisiologico,historialFisiologico,distribucionSemanal,objetivoPrincipal,planSemanal,debilidades,blockOutcomes,estadoCanonico)+(perfilAmigo?`\n\nSESIÓN CONJUNTA — PERFIL DEL COMPAÑERO:\nEspecialidad: ${perfilAmigo.especialidad||perfilAmigo.categoria}\nPerfil: ${JSON.stringify(perfilAmigo.perfil)}\nCiclo: ${JSON.stringify(perfilAmigo.ciclo_actual)}\nLesiones: ${perfilAmigo.lesiones_actuales||"ninguna"}\nMarcas: ${JSON.stringify(perfilAmigo.marcas_especificas)}\nIMPORTANTE: Genera una sesión que beneficie a AMBOS atletas simultáneamente. Respeta las limitaciones y fases de cada uno. Indica qué hace cada atleta si hay diferencias de nivel o fase.`:""),messages:mensajesParaAPI},true);
      if(data.aborted) return;
      const respTextRaw=(data.content?.map((b:{text?:string})=>b.text||"").join("")||"Error.");
      const respTextValidado=forgeValidator(respTextRaw);
      const respText=await procesarTags(respTextValidado, esSuenoSilencioso, texto.trim());
      const histLimpio=[...historial,{role:"user",content:texto.trim()},{role:"assistant",content:respText}];
      setMensajes(prev=>[...prev,{role:"assistant",content:respText}]);
      setHistorial(histLimpio);
      if(codigoUsuario){
        apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{historial:histLimpio}});
        console.log("FRONTEND: mostrarBotonNuevaSemana actual=", mostrarBotonNuevaSemana);
        if(!mostrarBotonNuevaSemana){
          console.log("FRONTEND: llamando a check_week_closure");
          apiCall({action:"check_week_closure",codigo:codigoUsuario}).then((resCierre:any)=>{
            console.log("FRONTEND: respuesta de check_week_closure:", JSON.stringify(resCierre));
            if(resCierre?.ready && resCierre?.canGenerateNextWeek){
              setMostrarBotonNuevaSemana(true);
            }
          });
        }
      }
    }catch{}
    finally{setCargando(false);}
  };

  const enviar=async(texto:string=input)=>{
    console.log("=== ENTRA A FUNCION enviar() ===");
    if((!texto.trim()&&imagenesAdjuntas.length===0)||cargando||bloqueado) return;
    const fechaHoyStr=new Date().toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Europe/Madrid"});
    const textoLower=texto.toLowerCase();
    const esMensajeSueno=/métricas de sueño|dormí|puntuación de sueño|durante la noche|sueño profundo|sueño rem/i.test(textoLower) && !/entren|wod|sesion realizada|serie|repeticion/i.test(textoLower);
    const esMensajeEntreno=/entren|wod|sesion realizada|completé|terminé/i.test(textoLower);
    // NOTA: la deteccion de "consulta de dato existente" (plan hoy/mañana, objetivo, debilidades) ya no
    // usa regex — el Forge Intent Classifier (Haiku) lo determina en procesar_mensaje_contexto, mas abajo.
    const contextoTemporal=esMensajeSueno?"SUEÑO_NOCTURNO — este dato es de la noche ANTERIOR a hoy, ocurrió ANTES de cualquier entreno de hoy. NUNCA lo relaciones como consecuencia de un entreno de hoy mismo.":esMensajeEntreno?"REPORTE_ENTRENO — el atleta acaba de completar una sesión de hoy.":"CONSULTA_GENERAL";
    const textoEnvio=(texto.trim()||"Analiza esta imagen o archivo y dame feedback en base a mi programacion.")+`\n\n[Fecha actual del sistema: ${fechaHoyStr}]\n[Contexto temporal del mensaje: ${contextoTemporal}]`;
    let contenidoUsuario:any=textoEnvio;
    if(imagenesAdjuntas.length>0){
      const contenido:any[]=imagenesAdjuntas.map(img=>{
        const base64Data=img.base64.split(",")[1];
        if(img.tipo==="application/pdf"){
          return {type:"document",source:{type:"base64",media_type:"application/pdf",data:base64Data}};
        }else{
          return {type:"image",source:{type:"base64",media_type:img.tipo,data:base64Data}};
        }
      });
      contenido.push({type:"text",text:textoEnvio});
      contenidoUsuario=contenido;

      // FORGE VISION EXTRACTION PIPELINE — si la imagen puede ser una captura de metricas fisiologicas
      // (Garmin, Apple Health, etc.), la analizamos en paralelo. El modelo EXTRAE con confianza,
      // el backend decide que guardar automaticamente y que dejar pendiente de confirmacion.
      const primeraImagen=imagenesAdjuntas.find(img=>img.tipo!=="application/pdf");
      if(primeraImagen && codigoUsuario){
        const base64Solo=primeraImagen.base64.split(",")[1];
        apiCall({action:"extraer_metricas_imagen",codigo:codigoUsuario,datos:{imagenBase64:base64Solo,tipoImagen:primeraImagen.tipo}}).then((resVision:any)=>{
          if(resVision?.extraido && resVision?.guardadoAutomatico && Object.keys(resVision.guardadoAutomatico).length>0){
            setSuenoConfirmado({fecha:new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Madrid'}),valores:resVision.guardadoAutomatico});
          }
          if(resVision?.pendienteConfirmacion && Object.keys(resVision.pendienteConfirmacion).length>0){
            console.log("Datos de imagen con baja confianza, pendientes de confirmacion:",resVision.pendienteConfirmacion);
            // TODO siguiente iteracion: banner de confirmacion explicita para estos campos
          }
        });

        // FORGE SESSION VISION EXTRACTION — en paralelo, verificar si la imagen es un entreno
        // completado. Nunca depende de que el Coach genere [SESION:] al ver la imagen — elimina
        // la vulnerabilidad confirmada hoy (Coach interpreta correctamente pero no genera el tag).
        apiCall({action:"extraer_sesion_imagen",codigo:codigoUsuario,datos:{imagenBase64:base64Solo,tipoImagen:primeraImagen.tipo}}).then((resSesionImg:any)=>{
          if(resSesionImg?.esEntreno && resSesionImg?.sesion && !sesionPendiente){
            setSesionPendiente(resSesionImg.sesion);
          }
        });
      }
    }
    const nuevoHist=[...historial,{role:"user",content:contenidoUsuario}];
    // CONTEXT ISOLATION: el Coach solo ve los ultimos 3 mensajes reales como conversacion inmediata.
    // Toda la memoria real (Estado Canonico, athlete_development, historial_fisiologico, workout_history)
    // ya viaja por su cuenta en el system prompt — el historial de chat NO debe ser la fuente de memoria.
    const mensajesParaAPI=nuevoHist.slice(-3);
    const textoSinFecha=textoEnvio.replace(/\n*\[Fecha actual del sistema:[\s\S]*?\]/,"").replace(/\n*\[Contexto temporal del mensaje:[\s\S]*?\]/,"").trim();
    const mensajeDisplay=imagenesAdjuntas.length>0?`📎 ${imagenesAdjuntas.length} archivo${imagenesAdjuntas.length>1?"s":""} adjunto${imagenesAdjuntas.length>1?"s":""}\n${textoSinFecha}`:textoSinFecha;
    setMensajes(prev=>[...prev,{role:"user",content:mensajeDisplay}]);
    setInput("");setImagenAdjunta(null);setImagenPreview(null);setImagenesAdjuntas([]);
    if(inputRef.current){inputRef.current.style.height="auto";}
    abortControllerRef.current=new AbortController();
    setCargando(true);setMsgCount(c=>{
      const nuevo=c+1;
      if(codigoUsuario) apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{consultas_usadas:nuevo}});
      return nuevo;
    });
    const catObj=CATEGORIAS.find((c:Categoria)=>c.id===categoria)!;
    const esp=espKey||categoria!;
    try{
      
      const esSuenoParaResumen=/métricas de sueño|dormí|puntuación de sueño|durante la noche|sueño profundo|sueño rem/i.test(texto.toLowerCase()) && !/entren|wod|sesion realizada|serie|repeticion/i.test(texto.toLowerCase());
      const resumen=esSuenoParaResumen
        ? `[Mensaje de tipo SUEÑO_NOCTURNO — se omite deliberadamente el historial conversacional reciente para evitar asociaciones incorrectas entre este sueño y cualquier entreno mencionado en mensajes anteriores. Usa SOLO el Estado Canónico y los datos estructurados del atleta para responder.]`
        : historial.slice(-10).map(m=>`${m.role==="user"?"Usuario":"Coach"}: ${typeof m.content==="string"?m.content.substring(0,150):"[imagen/archivo]"}...`).join("\n");
      // FORGE CONVERSATIONAL CONTEXT — aumentado de 4/6 a 10 mensajes (prueba A/B, empezando por el
      // limite superior). REGLA ARQUITECTONICA: este historial ayuda a Forge a ENTENDER la conversacion
      // (referencias, continuidad, tono), pero NUNCA es fuente de verdad para planificacion — eso sigue
      // viniendo exclusivamente de Canonical Truth (ciclo_actual, weekly_plan, workout_history, etc.)
      // y Athlete Knowledge (patrones con evidencia). El aumento de contexto no otorga al historial
      // conversacional ninguna autoridad nueva sobre decisiones estructuradas.
      const esPlanificacionSemanal=texto.toLowerCase().includes("semana completa")||texto.toLowerCase().includes("planificacion semanal")||texto.toLowerCase().includes("plan semanal")||texto.toLowerCase().includes("toda la semana")||texto.toLowerCase().includes("generar semana");
      const esProgramacion=esPlanificacionSemanal||texto.toLowerCase().includes("programacion")||texto.toLowerCase().includes("rutina")||texto.toLowerCase().includes("semana")||texto.toLowerCase().includes("plan")||texto.toLowerCase().includes("sesion")||texto.toLowerCase().includes("entreno")||texto.toLowerCase().includes("wod")||texto.toLowerCase().includes("ejercicio")||texto.toLowerCase().includes("bloque")||texto.toLowerCase().includes("rehabilitacion")||texto.toLowerCase().includes("protocolo")||texto.toLowerCase().includes("fase");
      const mensajesContexto=-10;
      // FORGE STRENGTH RECORD PARSER — Nivel 1, deteccion deterministica ANTES de llamar al LLM.
      // Nunca depende de que el Coach recuerde generar un tag [EVENTO:] correctamente.
      apiCall({action:"verificar_pr_deterministico",codigo:codigoUsuario,datos:{mensaje:texto}}).then((resPrDeterministico:any)=>{
        if(resPrDeterministico?.esPr && resPrDeterministico?.nuevoPrDetectado){
          setPrPendienteCompartir(resPrDeterministico.nuevoPrDetectado);
        }
      });
      // FORGE SLEEP METRICS PARSER — Nivel 1, deteccion deterministica ANTES de llamar al LLM.
      // Corrige el fallo intermitente del extractor Haiku (varios dias sin guardar pese a reporte real).
      if(codigoUsuario){
        apiCall({action:"verificar_metricas_sueno_deterministico",codigo:codigoUsuario,datos:{mensaje:texto}}).then((resSuenoDet:any)=>{
          if(resSuenoDet?.detectado && resSuenoDet?.guardado){
            setSuenoConfirmado({fecha:resSuenoDet.fecha,valores:resSuenoDet.valores});
          }
          // FIX: alerta explicita cuando se descarta un valor por estar fuera de rango fisiologico
          // razonable (bug real: HRV "888ms" se perdio silenciosamente sin avisar al usuario).
          if(resSuenoDet?.valoresSospechosos){
            const vs=resSuenoDet.valoresSospechosos;
            const partesSospechosas=[vs.hrv!==null?`HRV ${vs.hrv}ms`:null,vs.sueno!==null?`sueño ${vs.sueno}`:null,vs.rhr!==null?`FC ${vs.rhr}`:null].filter(Boolean).join(", ");
            setMensajes(prev=>[...prev,{role:"assistant",content:`⚠️ No he podido registrar este valor porque parece fuera de rango: ${partesSospechosas}. ¿Puedes confirmarme el dato correcto?`}]);
          }
        });
      }
      // FORGE COACHING NOTES — detecta observaciones tecnicas/debilidades en la conversacion y las
      // registra para el proximo cierre de semana. NUNCA modifica la sesion actual — solo registra.
      if(codigoUsuario && texto.trim().length>=15){
        apiCall({action:"detectar_coaching_note",codigo:codigoUsuario,datos:{mensaje:texto}}).then((resNote:any)=>{
          if(resNote?.detectado){
            console.log("Coaching note registrada:",resNote.issue,resNote.actualizado?"(actualizada, mencion repetida)":"(nueva)");
          }
        });
      }
      // FORGE SESSION COMPLETION SAFETY NET — mismo patron robusto que modificaciones/PRs/sueno.
      // Nunca depende del tag [SESION:] generado por el Coach — analiza el mensaje del usuario
      // directamente y guarda el reporte de entreno de forma determinista.
      if(codigoUsuario && texto.trim().length>=10){
        apiCall({action:"verificar_sesion_completada_deterministico",codigo:codigoUsuario,datos:{mensaje:texto}}).then((resSesionDet:any)=>{
          if(resSesionDet?.detectado){
            console.log("🛡️ Session safety net: entreno detectado y registrado automaticamente");
          }
        });
        // FORGE FOCUS — detecta reportes de carga externa (disciplina que Forge NO gestiona) y los
        // guarda deterministicamente. Solo actua si el atleta esta en modo Focus.
        apiCall({action:"verificar_carga_externa_deterministico",codigo:codigoUsuario,datos:{mensaje:texto}}).then((resCargaExt:any)=>{
          if(resCargaExt?.detectado&&resCargaExt?.guardado){
            console.log("🛡️ Focus external load: carga externa registrada -",resCargaExt.disciplina);
          }
        });
        // FORGE MODE CHANGE — si estamos en medio de un flujo de cambio de modo, intenta capturar
        // los datos que el usuario acaba de dar y ejecutar el cambio real si ya esta todo completo.
        if(modeChangeEnCurso){
          apiCall({action:"verificar_datos_cambio_modo_deterministico",codigo:codigoUsuario,datos:{targetMode:modeChangeEnCurso,mensajeUsuario:texto,respuestaCoach:""}}).then((resModeChange:any)=>{
            if(resModeChange?.cambioEjecutado){
              console.log("🔄 Mode change ejecutado automaticamente");
              setModeChangeEnCurso(null);
              setMensajes(prev=>[...prev,{role:"assistant",content:`✅ Listo — tu perfil ya está configurado en modo ${modeChangeEnCurso}. Puedes ver los detalles en Mi Perfil.`}]);
            }
          });
        }
      }

      // FORGE PENDING ACTIONS — deteccion 100% deterministica de confirmacion (regex simple), nunca
      // depende de que el LLM recuerde generar un tag tras la confirmacion del usuario.
      // FIX FINAL: en vez de exigir que TODAS las palabras del mensaje coincidan con una lista exhaustiva
// (fragil, siempre habra huecos como "ajuste"/"cambio"/"plan"), verificamos que el mensaje CONTENGA
// una palabra clara de confirmacion Y sea corto (<8 palabras) — sugiere respuesta afirmativa breve,
// no un mensaje nuevo con contenido propio que casualmente contenga la palabra "si" en otro contexto.
const CONTIENE_CONFIRMACION = /\b(s[ií]|confirmo|confirmado|vale|adelante|ok|okay|de\s*acuerdo|perfecto|correcto|hazlo|claro|dale)\b/i;
      const palabrasTexto = texto.trim().split(/\s+/).filter(Boolean);
      const esConfirmacionSimple = palabrasTexto.length>0 && palabrasTexto.length<=8 && CONTIENE_CONFIRMACION.test(texto.trim());

      // FIX: si estamos esperando confirmacion de disponibilidad tras cerrar semana, priorizamos ese
      // flujo. Confirmacion simple → genera directamente. Cualquier otra cosa → el mensaje probablemente
      // describe un cambio de disponibilidad, se procesa normalmente (el extractor lo guardara) y
      // DESPUES generamos con los datos ya actualizados.
      if(esperandoConfirmacionDisponibilidad && codigoUsuario){
        setEsperandoConfirmacionDisponibilidad(false);
        // FIX: pregunta EXPLICITA y determinista (nunca inferida por hora ni decidida por el LLM)
        // de si el atleta quiere empezar hoy mismo o desde el proximo dia disponible — evita
        // prescribir una sesion de hoy cuando genera la semana ya entrada la noche.
        const hoyEmpezarStr=new Date().toLocaleDateString("es-ES",{weekday:"long",timeZone:"Europe/Madrid"});
        setMensajes(prev=>[...prev,{role:"assistant",content:`Perfecto. Una última cosa: hoy es ${hoyEmpezarStr} — ¿quieres empezar tu planificación hoy mismo, o prefieres arrancar desde el próximo día disponible?`}]);
        setEsperandoConfirmacionEmpezarHoy(true);
        setCargando(false);
        return;
      }
      if(esperandoConfirmacionEmpezarHoy && codigoUsuario){
        setEsperandoConfirmacionEmpezarHoy(false);
        const mensajeDisplayConfirmacion=texto.trim();
        const empezarHoyReal=/^(s[ií]|hoy|empezamos hoy|claro|vale|de acuerdo)/i.test(mensajeDisplayConfirmacion);
        const dispararGeneracion=async()=>{
          setGenerandoSemana(true);
          setMensajes(prev=>[...prev,{role:"assistant",content:"🔧 Construyendo tu próxima semana paso a paso — analizando bloque, distribuyendo días y diseñando cada sesión..."}]);
          const plan=await orquestarGeneracionSemana(empezarHoyReal);
          const respuestaFinalGen=plan
            ? `✅ **Semana generada y guardada.**\n\nBloque: ${plan.block_name} — ${plan.week_objective}\n\nRevisa el detalle completo en **Mi Plan**. ¿Alguna duda?`
            : "⚠️ Hubo un problema generando la semana. Inténtalo de nuevo o dímelo directamente en el chat.";
          setMensajes(prev=>[...prev,{role:"assistant",content:respuestaFinalGen}]);
          setGenerandoSemana(false);
          // FIX: persistir el mensaje final en el historial real, no solo en el estado visual —
          // sin esto, el mensaje desaparecia al navegar y volver al chat.
          const histConGeneracion=[...historial,{role:"user",content:mensajeDisplayConfirmacion},{role:"assistant",content:respuestaFinalGen}];
          setHistorial(histConGeneracion);
          if(codigoUsuario) apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{historial:histConGeneracion}});
        };
        setCargando(false);
        if(esConfirmacionSimple){
          dispararGeneracion();
        } else {
          setTimeout(dispararGeneracion, 2500);
        }
        return;
      } else if(esConfirmacionSimple && codigoUsuario){
        apiCall({action:"confirmar_pending_action",codigo:codigoUsuario}).then((resPending:any)=>{
          if(resPending?.ejecutado){
            cargarPlanSemanal(codigoUsuario);
          }
        });
      }

      // FORGE CONTEXT BUILDER: en vez de "ultimos N mensajes" ciegos, el backend construye el contexto
      // real (evento activo + evento anterior relevante) y lo inyectamos como un mensaje de contexto,
      // seguido solo del mensaje actual del usuario — evita perder el hilo de eventos importantes.
      const resContexto=await apiCall({action:"procesar_mensaje_contexto",codigo:codigoUsuario,datos:{mensaje:textoEnvio}});

      // FORGE ORCHESTRATOR OWNERSHIP — la planificacion semanal completa es propiedad exclusiva del
      // Orchestrator, nunca del Coach conversacional. Si el intent lo detecta, disparamos el mismo
      // flujo que usa el boton oficial, de forma transparente — el usuario nunca nota la diferencia.
      if(resContexto?.debeDispararOrchestrator){
        // FORGE CAPABILITY GUARD (temprano) — comprobar ANTES de preguntar disponibilidad ni gastar
        // ninguna llamada. Un usuario en supervision/consulta no puede iniciar el flujo de planificacion
        // en absoluto — ni siquiera la pregunta de confirmacion, que ya implicaria estar planificando.
        if(modoEntrada==="supervision"||modoEntrada==="consulta"){
          const mensajeDisplaySinPermiso=texto.trim();
          const respuestaSinPermiso=`Ahora mismo estás en modo Supervisión. En este modo no genero ni gestiono tu planificación — tu entrenador o tu plan actual siguen teniendo el control.\n\nSí puedo ayudarte a analizar tus sesiones, registrar tus entrenamientos, interpretar tus métricas y proponerte ajustes puntuales cuando tú me los pidas.`;
          setMensajes(prev=>[...prev,{role:"assistant",content:respuestaSinPermiso}]);
          setCargando(false);
          // FIX: banner interactivo con botones reales, en vez de esperar texto libre ambiguo
          // ("Cambiamos a modo COACH" no coincidia con ningun detector de confirmacion simple).
          setMostrarBannerCambioModo(true);
          const histSinPermiso=[...historial,{role:"user",content:mensajeDisplaySinPermiso},{role:"assistant",content:respuestaSinPermiso}];
          setHistorial(histSinPermiso);
          if(codigoUsuario) apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{historial:histSinPermiso}});
          return;
        }
        // FIX: mismo comportamiento que el boton oficial — preguntar disponibilidad ANTES de generar,
        // en vez de disparar el Orchestrator directamente sin confirmar.
        const mensajeDisplayUsuario=texto.trim();
        let distTextoOrch="No tengo tu disponibilidad guardada todavia.";
        try{
          const distParsedOrch=typeof distribucionSemanal==="string"?JSON.parse(distribucionSemanal):distribucionSemanal;
          if(distParsedOrch && typeof distParsedOrch==="object"){
            distTextoOrch=Object.entries(distParsedOrch).filter(([k])=>k!=="observaciones").map(([k,v]:[string,any])=>`${k}: ${Array.isArray(v)?v.join(", "):v}`).join(" — ");
          }
        }catch{}
        const respuestaConfirmacion=`Antes de generar tu próxima semana, confirmemos tu disponibilidad actual:\n\n📅 ${distTextoOrch}\n\n¿Sigue siendo así, o ha cambiado algo?`;
        setMensajes(prev=>[...prev,{role:"assistant",content:respuestaConfirmacion}]);
        setEsperandoConfirmacionDisponibilidad(true);
        setCargando(false);
        const histConPregunta=[...historial,{role:"user",content:mensajeDisplayUsuario},{role:"assistant",content:respuestaConfirmacion}];
        setHistorial(histConPregunta);
        if(codigoUsuario) apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{historial:histConPregunta}});
        return;
      }

      // FORGE RESPONSE ENGINE — si el backend ya compuso una respuesta STATIC (sin LLM), la mostramos
      // directamente y terminamos aqui, sin llamar al Coach en absoluto. Cero coste, cero latencia, cero riesgo.
      if(resContexto?.modoRespuesta==="STATIC" && resContexto?.respuestaEstatica){
        const mensajeDisplayEstatico=texto.trim();
        // Prefijo interno [FORGE_STATIC] para que el render lo muestre con diseño distintivo (dato verificado)
        const respuestaConMarcador=`[FORGE_STATIC]${resContexto.respuestaEstatica}`;
        setMensajes(prev=>[...prev,{role:"user",content:mensajeDisplayEstatico}]);
        setMensajes(prev=>[...prev,{role:"assistant",content:respuestaConMarcador}]);
        setInput("");
        if(inputRef.current){inputRef.current.style.height="auto";}
        const histConEstatico=[...historial,{role:"user",content:texto.trim()},{role:"assistant",content:resContexto.respuestaEstatica}];
        setHistorial(histConEstatico);
        if(codigoUsuario) apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{historial:histConEstatico}}).then((resActualizarEstatico:any)=>{
          // FORGE CARDS — la rama STATIC tambien puede disparar deteccion de PR/racha/objetivo
          // (ej: el usuario reporta un PR y el mensaje se clasifica como BENCHMARK/READ).
          if(resActualizarEstatico?.nuevoPrDetectado){
            setPrPendienteCompartir(resActualizarEstatico.nuevoPrDetectado);
          }
          if(resActualizarEstatico?.rachaDetectada){
            setRachaPendienteCompartir(resActualizarEstatico.rachaDetectada);
          }
          if(resActualizarEstatico?.objetivoConseguidoDetectado){
            setObjetivoPendienteCompartir(resActualizarEstatico.objetivoConseguidoDetectado);
          }
        });
        setCargando(false);
        return;
      }

      const contextoConstruido=resContexto?.contexto||"";
      // FORGE INTENT CLASSIFIER: si detecta una consulta de dato existente (familia READ) con confianza alta,
      // el dato inmutable exacto se antepone al mensaje del usuario para que el Coach lo reproduzca fielmente.
      const datoInmutableRecibido=resContexto?.datoInmutable;
      // FORGE CAPABILITY INJECTION — Principio 7: el Coach solo puede mencionar lo que su intent autoriza.
      // Se inyecta SIEMPRE, incluso cuando no hay dato inmutable (ej: COACHING no puede mencionar nada estructurado).
      const instruccionCapacidadesRecibida=resContexto?.instruccionCapacidades||"";
      // FIX CRITICO: cuando hay imagenes/PDFs adjuntos, contenidoUsuario es un ARRAY, no un string.
      // Si lo metemos dentro de un template string se convierte en "[object Object]" y se pierde la imagen.
      // Debemos preservar el array, anteponiendo el texto de instrucciones como un bloque de texto adicional.
      const prefijoInstrucciones=datoInmutableRecibido
        ? `[DATO INMUTABLE — ${datoInmutableRecibido.tipo}: ${JSON.stringify(datoInmutableRecibido.valor)}]\n[INSTRUCCIÓN: Esto es una consulta de un dato ya existente, no una petición de planificación. Reproduce el dato anterior fielmente, sin modificar ningún número ni ejercicio.]\n[REGLA CRÍTICA SI EL ATLETA ESTÁ EN ESTADO RESTRICTED: aunque reproduzcas el dato fielmente, DEBES añadir DESPUÉS una nota clara señalando que esa sesión puede necesitar revisión dado el estado de restricción activo — nunca dejes pasar en silencio una sesión con carga/impacto potencialmente incompatible con la restricción. No modifiques el dato, solo alerta explícitamente.]\n\n${instruccionCapacidadesRecibida}`
        : instruccionCapacidadesRecibida;
      let contenidoConDato:any;
      if(Array.isArray(contenidoUsuario)){
        // Preservar el array (imagenes/PDF) y anteponer las instrucciones como texto al bloque de texto existente
        contenidoConDato=contenidoUsuario.map((bloque:any)=>
          bloque.type==="text" ? {...bloque,text:`${prefijoInstrucciones}\n\n${bloque.text}`} : bloque
        );
      } else {
        contenidoConDato=`${prefijoInstrucciones}\n\n${contenidoUsuario}`;
      }
      const mensajesParaAPI2=contextoConstruido
        ? [{role:"user" as const,content:`[CONTEXTO DE EVENTOS RECIENTES]\n${contextoConstruido}`},{role:"assistant" as const,content:"Entendido, tengo el contexto."},{role:"user" as const,content:contenidoConDato}]
        : [{role:"user" as const,content:contenidoConDato}];
const data=await apiCall({model:"claude-sonnet-4-5",max_tokens:4000,system:buildPrompt(catObj,respuestas,marcas as any,resumen,memoriaCoach,cicloActual,perfilPsicologico,esPremium||esAdmin,athleteState,datosEntrenamiento,estadoFisiologico,historialFisiologico,distribucionSemanal,objetivoPrincipal,planSemanal,debilidades,blockOutcomes,estadoCanonico)+(perfilAmigo?`\n\nSESIÓN CONJUNTA — PERFIL DEL COMPAÑERO:\nEspecialidad: ${perfilAmigo.especialidad||perfilAmigo.categoria}\nPerfil: ${JSON.stringify(perfilAmigo.perfil)}\nCiclo: ${JSON.stringify(perfilAmigo.ciclo_actual)}\nLesiones: ${perfilAmigo.lesiones_actuales||"ninguna"}\nMarcas: ${JSON.stringify(perfilAmigo.marcas_especificas)}\nIMPORTANTE: Genera una sesión que beneficie a AMBOS atletas simultáneamente. Respeta las limitaciones y fases de cada uno. Indica qué hace cada atleta si hay diferencias de nivel o fase.`:""),messages:mensajesParaAPI2},true);
      if(data.aborted) return;
      const respTextRaw2Original=(data.content?.map((b:{text?:string})=>b.text||"").join("")||"Error.");
      const respTextRaw2=forgeValidator(respTextRaw2Original);
      
      // Extraer STATE_UPDATE primero (formato distinto, con cierre [/STATE_UPDATE])
      const stateMatch=respTextRaw2.match(/\[STATE_UPDATE\]([\s\S]*?)\[\/STATE_UPDATE\]/);
      if(stateMatch){
        try{
          const newState=JSON.parse(stateMatch[1].trim());
          const updatedState={...newState,updated_at:new Date().toISOString()};
          setAthleteState(updatedState);
          if(codigoUsuario) apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{athlete_state:updatedState}});
        }catch{}
      }

      const respText=await procesarTags(respTextRaw2, esSuenoParaResumen, texto);
      const hist=[...nuevoHist,{role:"assistant",content:respText}];
      setMensajes(prev=>[...prev,{role:"assistant",content:respText}]);
      // FORGE PROPOSAL PARSER — Nivel 1 deterministico: detecta si el Coach acaba de proponer un
      // cambio de sesion, sin depender de ningun tag. Se ejecuta en cada respuesta, en segundo plano.
      if(codigoUsuario && typeof texto==="string"){
        apiCall({action:"detectar_propuesta_sesion",codigo:codigoUsuario,datos:{mensajeUsuario:texto,respuestaCoach:respText}});
      }
      const histFinal=hist.length>=20?hist.slice(-10):hist;
      setHistorial(histFinal);
      if(hist.length>=20) compactarHistorial(hist);
      if(codigoUsuario){
        apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{historial:histFinal}}).then((resActualizar:any)=>{
          // FORGE CARDS — si se detecto un nuevo PR o hito de racha en esta actualizacion, ofrecer compartirlo
          if(resActualizar?.nuevoPrDetectado){
            setPrPendienteCompartir(resActualizar.nuevoPrDetectado);
          }
          if(resActualizar?.rachaDetectada){
            setRachaPendienteCompartir(resActualizar.rachaDetectada);
          }
          if(resActualizar?.objetivoConseguidoDetectado){
            setObjetivoPendienteCompartir(resActualizar.objetivoConseguidoDetectado);
          }
        });
        // FIX CRITICO: esta verificacion solo existia en enviarSilencioso, nunca en enviar() (la funcion
        // principal usada en el 99% de los mensajes). Por eso el cierre de semana nunca se disparaba.
        if(!mostrarBotonNuevaSemana){
          // FORGE CHECK_WEEK_CLOSURE — solo lectura, nunca genera nada por si sola. Si la semana
          // esta lista pero aun NO cerrada, mostramos el banner "Semana completada" para que el
          // usuario confirme explicitamente el cierre real (accion CLOSE_WEEK separada).
          apiCall({action:"check_week_closure",codigo:codigoUsuario}).then((resCheck:any)=>{
            // FIX: el banner debe aparecer TANTO si la semana esta lista para cerrar (yaCerrada=false)
            // COMO si ya se cerro pero aun no existe plan para la semana siguiente (yaCerrada=true +
            // sin plan futuro) — antes solo cubriamos el primer caso, dejando el segundo paso sin CTA.
            if(resCheck?.ready && resCheck?.canGenerateNextWeek){
              setMostrarBotonNuevaSemana(true);
            }
          });
        }
        const extractarMemoria=async()=>{
          const cicloStr=cicloActual.bloque?`Ciclo en memoria: Bloque ${cicloActual.bloque}, Semana ${cicloActual.semana||"?"} de ${cicloActual.totalSemanas||"?"}, Objetivo: ${cicloActual.objetivo||"?"}`:"Sin ciclo definido aún";
          const extractPrompt=`Analiza esta conversación entre un atleta y su coach de entrenamiento y extrae datos en JSON.

CONTEXTO ACTUAL:
${cicloStr}
Notas previas: ${memoriaCoach.notas||"ninguna"}

ÚLTIMOS MENSAJES:
${hist.slice(-6).map((m:{role:string;content:any})=>`${m.role==="user"?"ATLETA":"COACH"}: ${typeof m.content==="string"?m.content.substring(0,300):"[archivo]"}`).join("\n\n")}

Extrae SOLO lo que puedas determinar con certeza. Responde SOLO con este JSON:
{
  "lesiones": "lesiones/molestias mencionadas o vacío",
  "plan": "sesiones planificadas próximos 7 días o vacío",
  "notas": "decisiones importantes del coach máx 80 palabras o vacío",
  "nueva_marca": "nueva marca en formato ejercicio:valor o vacío",
  "ciclo": {
    "bloque": "acumulación|intensificación|realización|deload según el tipo de entrenos — si son de volumen bajo intensidad=acumulación, alta intensidad=intensificación, competición=realización, descanso=deload. Mantén el ciclo actual si no hay cambio claro: ${cicloActual.bloque||"vacío"}",
    "semana": ${cicloActual.semana||"null"},
    "totalSemanas": ${cicloActual.totalSemanas||"null"},
    "objetivo": "${cicloActual.objetivo||"vacío"}"
  },
  "psicologia": {
    "arousal": "bajo|medio|alto|muy alto o vacío",
    "confianza": "baja|media|alta o vacío",
    "estres": "bajo|medio|alto o vacío",
    "motivacion": "baja|media|alta o vacío",
    "notas_mentales": "observación psicológica relevante o vacío"
  },
  "datos_entrenamiento": "si se mencionan métricas del atleta (zonas FC, umbrales, ritmos, cargas, potencia) extráelos usando SIEMPRE estas claves estándar: fc_maxima, fc_reposo, umbral_fc, z1_fc, z2_fc, z3_fc, z4_fc, z5_fc, ritmo_z2, ritmo_umbral, squat_1rm, bench_1rm, deadlift_1rm, snatch_1rm, clean_jerk_1rm, ftp, vo2max, peso_corporal. Usa solo estas claves, nunca inventes nombres nuevos. null si no hay métricas nuevas",
  "estado_fisiologico": "si el atleta menciona cualquier métrica de recuperación o sueño extrae: {\"hrv\":número en ms — busca HRV, VFC, variabilidad frecuencia cardiaca (en tu reporte era 68ms) o null,\"sueno\":puntuación sueño 0-100 — busca 'puntuación sueño', 'calidad sueño', score (en tu reporte era 90) o null,\"rhr\":FC reposo o mínima nocturna en bpm — busca 'frecuencia mínima', 'FC reposo', 'pulsaciones reposo' (en tu reporte era 46bpm) o null,\"fatiga_aguda\":número 0-100 estimado según sensaciones reportadas o null,\"tendencia\":\"ascendente|estable|descendente según evolución o null\"}. Sé muy liberal detectando estos datos — cualquier métrica de sueño o recuperación cuenta.",
  "sesion_completada": "SOLO si el atleta reporta explícitamente haber COMPLETADO o TERMINADO una sesión de entrenamiento HOY o AYER. NO registres sesión si solo menciona métricas, datos de reloj, zonas de FC, o información técnica sin confirmar que completó un entreno. Extrae: {\"tipo\":\"tipo de actividad\",\"duracion\":\"duración en minutos o null\",\"sensacion\":\"buena/normal/mala\",\"notas\":\"resumen breve\"}. null en caso de duda"
}`;
          const res=await apiCall({model:"claude-sonnet-4-5",max_tokens:500,system:"Eres un extractor de datos deportivos. Responde SOLO con JSON válido sin markdown ni texto adicional.",messages:[{role:"user",content:extractPrompt}]});
          try{
            const texto=res.content?.map((b:{text?:string})=>b.text||"").join("")||"{}";
            const clean=texto.replace(/```json|```/g,"").trim();
            const datos=JSON.parse(clean);
            console.log("EXTRACCION:", JSON.stringify(datos.estado_fisiologico));
            
            const nuevaMemoria:any={};
            if(datos.lesiones) nuevaMemoria.lesiones_actuales=datos.lesiones;
            if(datos.plan) nuevaMemoria.plan_proxima_semana=datos.plan;
            if(datos.notas) nuevaMemoria.notas_coach=datos.notas;
            // FORGE ESTADO CANONICO — ciclo_actual (bloque/semana/objetivo) es un dato CRITICO INMUTABLE.
            // El extractor Haiku conversacional NUNCA tiene autoridad para escribirlo — solo un flujo
            // determinista de "Cerrar Bloque" (accion explicita y validada) puede modificarlo.
            // Esto elimina el mismo tipo de fallo ya resuelto con PRs y modificacion de sesiones:
            // un LLM secundario "creyendo" haber detectado un cambio de ciclo y sobrescribiendo el estado real.
            if(datos.psicologia&&Object.values(datos.psicologia).some(v=>v)){
              const nuevoPsico={...perfilPsicologico,...datos.psicologia};
              setPerfilPsicologico(nuevoPsico);
              nuevaMemoria.perfil_psicologico=nuevoPsico;
            }
            if(datos.sesion_completada&&datos.sesion_completada!=="null"){
              try{
                // Registro de sesiones por acción explícita del usuario
              }catch{}
            }
            if(datos.estado_fisiologico&&datos.estado_fisiologico!=="null"){
              try{
                const estadoExtra=typeof datos.estado_fisiologico==="string"?JSON.parse(datos.estado_fisiologico):datos.estado_fisiologico;
                if(typeof estadoExtra==="object"&&estadoExtra!==null){
                  const nuevoEstado={...estadoFisiologico,...Object.fromEntries(Object.entries(estadoExtra).filter(([,v])=>v!==null))};
                  setEstadoFisiologico(nuevoEstado);
                  nuevaMemoria.estado_fisiologico=nuevoEstado;
                }
              }catch{}
            }
            if(datos.datos_entrenamiento&&datos.datos_entrenamiento!=="null"&&datos.datos_entrenamiento!==""){
              const datosExtra=typeof datos.datos_entrenamiento==="string"?JSON.parse(datos.datos_entrenamiento):datos.datos_entrenamiento;
              if(typeof datosExtra==="object"&&datosExtra!==null){
                // Filtrar solo claves estándar
                const CLAVES_VALIDAS=['fc_maxima','fc_reposo','umbral_fc','z1_fc','z2_fc','z3_fc','z4_fc','z5_fc','ritmo_z2','ritmo_umbral','squat_1rm','bench_1rm','deadlift_1rm','snatch_1rm','clean_jerk_1rm','ftp','vo2max','peso_corporal','umbral_potencia','ritmo_row_suave','row_ritmo'];
                const datosLimpios=Object.fromEntries(Object.entries(datosExtra).filter(([k,v])=>v!==null&&v!==""&&v!=="null"&&CLAVES_VALIDAS.some(c=>k.toLowerCase().includes(c.toLowerCase()))));
                if(Object.keys(datosLimpios).length>0){
                  const nuevosDatos={...datosEntrenamiento,...datosLimpios};
                  setDatosEntrenamiento(nuevosDatos);
                  nuevaMemoria.datos_entrenamiento=nuevosDatos;
                }
              }
            }
            if(datos.nueva_marca){
              const nuevaMarcaAuto:Marca={fecha:new Date().toLocaleDateString("es-ES"),valor:datos.nueva_marca};
              const marcasActualizadas=[...marcas,nuevaMarcaAuto];
              setMarcas(marcasActualizadas);
              nuevaMemoria.marcas=marcasActualizadas;
            }
            if(Object.keys(nuevaMemoria).length>0){
              apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{...nuevaMemoria}});
              setMemoriaCoach(prev=>({...prev,lesiones:datos.lesiones||prev.lesiones,plan:datos.plan||prev.plan,notas:datos.notas||prev.notas}));
            }
          }catch{}
        };
        extractarMemoria();
      }
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

  const handleKey=(e:React.KeyboardEvent)=>{if(e.key==="Enter"&&e.shiftKey){e.preventDefault();enviar();}};
  const stopEnvio=()=>{
    abortControllerRef.current?.abort();
    setCargando(false);
  };

  const generarInformeTest=async()=>{
    setPantalla("informe_test");
    setGenerando(true);
    const catObj=CATEGORIAS.find((c:Categoria)=>c.id===categoria)!;
    const esp=espKey||categoria!;
    const testStr=Object.entries(testAtleta).map(([k,v])=>`${k}: ${Array.isArray(v)?v.join(", "):v}`).join("\n");
    try{
      const data=await apiCall({model:"claude-sonnet-4-5",max_tokens:1500,
        system:`Eres un analizador de rendimiento deportivo. Analiza los datos del test de atleta y genera un informe JSON estructurado. Responde SOLO con JSON válido sin markdown.
Disciplina: ${esp}
Perfil: ${JSON.stringify(respuestas)}`,
        messages:[{role:"user",content:`Analiza estos datos del test y genera un informe con este formato JSON exacto:
{
  "nivel": "Principiante|Intermedio|Avanzado|Élite",
  "puntuaciones": {
    "resistencia": 0-100,
    "fuerza": 0-100,
    "tecnica": 0-100,
    "recuperacion": 0-100,
    "mental": 0-100
  },
  "fortalezas": ["fortaleza1", "fortaleza2"],
  "debilidades": ["debilidad1", "debilidad2"],
  "resumen": "Resumen en 2-3 frases del perfil del atleta y su potencial"
}

Datos del test:
${testStr}`}]});
      const texto=data.content?.map((b:{text?:string})=>b.text||"").join("")||"{}";
      const clean=texto.replace(/```json|```/g,"").trim();
      const informe=JSON.parse(clean);
      setResultadoTest(informe);
      if(codigoUsuario){
        apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{
          test_atleta:{...testAtleta,informe,fecha:new Date().toISOString()},
          test_atleta_fecha:new Date().toISOString()
        }});
        const betaRes=await apiCall({action:"verificar_activar_beta",codigo:codigoUsuario});
        if(betaRes?.activado){
          setBetaFounderInfo({numero:betaRes.beta_number,maxSlots:betaRes.max_slots,meses:betaRes.meses_premium});
          setEsPremium(true);
        }
      }
    }catch{setResultadoTest({nivel:"Intermedio",puntuaciones:{resistencia:50,fuerza:50,tecnica:50,recuperacion:50,mental:50},fortalezas:["Constancia"],debilidades:["Datos insuficientes"],resumen:"No se pudo generar el informe completo."});}
    finally{setGenerando(false);}
  };

  const compactarHistorial=async(hist:{role:string;content:any}[])=>{
    if(hist.length<10) return;
    try{
      const textoHistorial=hist.slice(0,-6).map(m=>`${m.role==="user"?"Usuario":"Coach"}: ${typeof m.content==="string"?m.content.substring(0,300):"[archivo]"}`).join("\n");
      const res=await apiCall({model:"claude-sonnet-4-5",max_tokens:300,system:"Eres un asistente que resume conversaciones de entrenamiento. Responde SOLO con un resumen comprimido en máximo 150 palabras que incluya: progreso del atleta, decisiones de programación tomadas, marcas conseguidas y contexto relevante para continuar el entrenamiento.",messages:[{role:"user",content:`Resume esta conversación de entrenamiento:\n${textoHistorial}`}]});
      const resumen=res.content?.map((b:{text?:string})=>b.text||"").join("")||"";
      if(resumen&&codigoUsuario){
        const histCompactado=hist.slice(-10);
        setHistorial(histCompactado);
        const notasActualizadas=`[Resumen sesiones anteriores - ${new Date().toLocaleDateString("es-ES")}]\n${resumen}`;
        setMemoriaCoach(prev=>({...prev,notas:notasActualizadas}));
        await apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{historial:histCompactado,notas_coach:notasActualizadas}});
      }
    }catch{}
  };
  const restantes=FREE_LIMIT-msgCount;

  return (
    <div style={{minHeight:"100dvh",background:C.bg,fontFamily:"'DM Sans', sans-serif",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 16px",paddingTop:"max(24px, env(safe-area-inset-top))",paddingBottom:"max(24px, env(safe-area-inset-bottom))"}}>
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
        @keyframes msgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .msg-in{animation:msgIn 0.25s ease forwards;}
        @keyframes dotPulse{0%,80%,100%{opacity:0.25;transform:scale(0.8)}40%{opacity:1;transform:scale(1)}}
        .dot{width:8px;height:8px;border-radius:50%;animation:dotPulse 1.3s infinite;display:inline-block;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        .sending{animation:pulse 1s infinite;}
        textarea,input{resize:none;font-family:inherit;}
        textarea:focus,input:focus{outline:none;}
        .sugg:hover{opacity:0.75;}
      `}</style>

      {mostrarConflictoSesion&&(
        <div className="fade-up" style={{maxWidth:420,width:"100%",textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:16}}>🔒</div>
          <h2 style={{fontSize:20,color:C.ink,marginBottom:12}}>Forge ya está abierto en otra pestaña</h2>
          <p style={{color:C.muted,fontSize:14,lineHeight:1.6,marginBottom:24}}>Para evitar incoherencias en tu planificación, solo una pestaña puede estar activa a la vez.</p>
          <button onClick={async()=>{
            await apiCall({action:"tomar_control_sesion",codigo:codigoUsuario,datos:{sessionId:sessionIdRef.current}});
            setMostrarConflictoSesion(false);
          }} style={{background:"#FF6B00",color:"#fff",border:"none",borderRadius:14,padding:"14px 32px",fontSize:15,fontWeight:600,cursor:"pointer",width:"100%",maxWidth:300,marginBottom:12}}>
            Continuar aquí
          </button>
          <p style={{color:C.muted,fontSize:12}}>La otra pestaña pasará a modo bloqueado</p>
        </div>
      )}

      {pestanaBloqueada&&(
        <div className="fade-up" style={{maxWidth:420,width:"100%",textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:16}}>🔒</div>
          <h2 style={{fontSize:20,color:C.ink,marginBottom:12}}>Se ha abierto Forge en otra pestaña</h2>
          <p style={{color:C.muted,fontSize:14,lineHeight:1.6,marginBottom:24}}>Esta pestaña ha pasado a modo bloqueado para proteger la coherencia de tu planificación.</p>
        </div>
      )}

      {!pestanaBloqueada&&pantalla==="cargando"&&(
        <div className="fade-up" style={{textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:16}}>⚡</div>
          <p style={{color:C.muted,fontSize:15}}>Cargando tu sesion...</p>
        </div>
      )}

      {!pestanaBloqueada&&pantalla==="inicio"&&(
        <div className="fade-up" style={{maxWidth:520,width:"100%",textAlign:"center"}}>
          <div style={{marginBottom:16,display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
            <img src="/logo-forge.png" alt="Forge" style={{width:80,height:80,objectFit:"contain"}}/>
            <div style={{textAlign:"left"}}>
              <div style={{fontSize:"clamp(28px,6vw,42px)",fontWeight:900,color:"#F0EDE8",fontFamily:"'DM Sans',sans-serif",letterSpacing:"-1px",lineHeight:1}}>FORGE</div>
              <div style={{fontSize:"clamp(10px,2vw,13px)",fontWeight:500,color:"#FF6B00",fontFamily:"'DM Sans',sans-serif",letterSpacing:"3px",textTransform:"uppercase"}}>Supervisión inteligente</div>
            </div>
          </div>
          <p style={{color:C.muted,fontSize:17,lineHeight:1.65,marginBottom:4,fontWeight:600}}>Tu plan dice qué hacer. Forge te ayuda a decidir cómo hacerlo hoy.</p>
          <p style={{color:C.muted,fontSize:15,lineHeight:1.65,marginBottom:8}}>Forge utiliza tu entrenamiento, recuperación, historial y objetivos para ayudarte a tomar mejores decisiones cada día.</p>
          <button className="btn-main" onClick={()=>setPantalla("bifurcacion")} style={{background:"#FF6B00",color:"#fff",border:"none",borderRadius:14,padding:"16px 40px",fontSize:16,fontWeight:600,cursor:"pointer",width:"100%",maxWidth:360,marginTop:16,marginBottom:8}}>
            Empezar con Forge
          </button>
          <p style={{color:C.muted,fontSize:12,marginBottom:24}}>Empieza en menos de 3 minutos.</p>
          <div style={{maxWidth:360,margin:"0 auto"}}>
            <p style={{color:C.muted,fontSize:13,marginBottom:10}}>¿Ya tienes una cuenta Forge?</p>
            <div style={{display:"flex",gap:8}}>
              <input value={codigoInput} onChange={e=>setCodigoInput(e.target.value.toUpperCase())} placeholder="Código Forge"
                style={{flex:1,border:"2px solid #FF6B00",borderRadius:12,padding:"12px 14px",fontSize:15,color:"#F0EDE8",background:"#1A1A1A",letterSpacing:2,textAlign:"center"}}
                onKeyDown={e=>e.key==="Enter"&&recuperarUsuario()}
              />
              <button id="btn-entrar" className="btn-main" onClick={recuperarUsuario} style={{background:C.accent,color:"#fff",border:"none",borderRadius:12,padding:"12px 18px",fontSize:14,fontWeight:600,cursor:"pointer"}}>
                Acceder
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
          <p style={{color:C.muted,fontSize:13,marginTop:20,fontWeight:500}}>¿Ya tienes entrenador o plan? Perfecto. Forge lo complementa, no lo sustituye.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,maxWidth:400,margin:"20px auto 0",textAlign:"left"}}>
            {["Recomendaciones diarias explicadas","Seguimiento del progreso","Diario del atleta","Estado fisiológico y HRV","Detección de patrones","Planificación completa (opcional)"].map(t=>(
              <span key={t} style={{color:C.muted,fontSize:13,display:"flex",alignItems:"center",gap:6}}><span style={{color:C.accent}}>✓</span>{t}</span>
            ))}
          </div>
        </div>
      )}

      {pantalla==="bifurcacion"&&(
        <div className="fade-up" style={{maxWidth:560,width:"100%"}}>
          <button onClick={()=>setPantalla("inicio")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,marginBottom:28}}>Volver</button>
          <h2 style={{fontSize:"clamp(24px,5vw,32px)",color:C.ink,marginBottom:10,fontFamily:"'Playfair Display',serif",fontWeight:700}}>¿Qué papel quieres que tenga Forge en tu entrenamiento?</h2>
          <p style={{color:C.muted,fontSize:14,marginBottom:6}}>Elige cómo quieres empezar. Forge se adaptará a tu forma de entrenar — puedes cambiarlo más adelante.</p>
          <p style={{color:C.muted,fontSize:13,marginBottom:28,lineHeight:1.5}}>Forge puede tener distintos papeles en tu entrenamiento. Para darte recomendaciones coherentes, primero necesitamos saber cuánto quieres que intervenga en tu planificación.</p>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {[
              {modo:"supervision",etiqueta:"SUPERVISIÓN",emoji:"👥",titulo:"Ya tengo mi entrenamiento",desc:"Tú decides el entrenamiento. Forge analiza tu estado y contexto para ayudarte a decidir cómo afrontar la sesión de hoy.",recomendado:"Recomendado si ya tienes entrenador o planificación"},
              {modo:"focus",etiqueta:"COORDINACIÓN",emoji:"🎯",titulo:"Tengo entrenador para una parte",desc:"Combina tu planificación externa con Forge. Tú mantienes tu entrenamiento principal y Forge planifica y adapta la disciplina que le delegues."},
              {modo:"planificacion",etiqueta:"PLANIFICACIÓN",emoji:"📅",titulo:"Quiero que Forge planifique mi entrenamiento",desc:"Forge diseña tu planificación, la adapta a tus objetivos y evolución, y te acompaña en las decisiones del día a día."},
            ].map(op=>(
              <div key={op.modo} onClick={()=>{if(op.modo==="focus"){setPantalla("focus_onboarding");}else{setModoEntrada(op.modo);setPantalla("categoria");}}} className="cat-card" style={{background:C.card,border:op.recomendado?`2px solid ${C.accent}`:`2px solid ${C.border}`,borderRadius:16,padding:"18px 20px",cursor:"pointer",display:"flex",alignItems:"flex-start",gap:16}}>
                <span style={{fontSize:28}}>{op.emoji}</span>
                <div style={{textAlign:"left"}}>
                  <p style={{color:C.accent,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>{op.etiqueta}</p>
                  <p style={{color:C.ink,fontSize:15,fontWeight:700,marginBottom:4}}>{op.titulo}</p>
                  <p style={{color:C.muted,fontSize:12.5,lineHeight:1.5,marginBottom:op.recomendado?6:0}}>{op.desc}</p>
                  {op.recomendado&&<p style={{color:C.accent,fontSize:11,fontWeight:600}}>{op.recomendado}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pantalla==="focus_onboarding"&&(
        <div className="fade-up" style={{maxWidth:560,width:"100%"}}>
          <button onClick={()=>focusPaso>1?setFocusPaso(focusPaso-1):setPantalla("bifurcacion")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,marginBottom:20}}>Atrás</button>
          <div style={{width:"100%",height:3,background:C.border,borderRadius:10,marginBottom:24}}>
            <div style={{height:3,borderRadius:10,background:C.accent,width:`${(focusPaso/4)*100}%`,transition:"width 0.4s ease"}}/>
          </div>

          {focusPaso===1&&(
            <>
              <h2 style={{fontSize:"clamp(22px,5vw,28px)",color:C.ink,marginBottom:8,fontFamily:"'Playfair Display',serif",fontWeight:700}}>¿Qué entrenamiento haces con otro entrenador?</h2>
              <p style={{color:C.muted,fontSize:14,marginBottom:24}}>No necesitas contarnos el detalle de cada sesión — solo lo básico para que Forge coordine alrededor.</p>
              <input value={focusDisciplinaExterna} onChange={e=>setFocusDisciplinaExterna(e.target.value)} placeholder="Ej: CrossFit, Fuerza, Fútbol, Natación..." style={{width:"100%",border:`2px solid ${C.border}`,borderRadius:12,padding:"14px 16px",fontSize:15,color:C.ink,background:C.card,marginBottom:20,fontFamily:"inherit"}}/>
              <p style={{color:C.ink,fontSize:13,fontWeight:600,marginBottom:10}}>¿Qué días entrenas eso normalmente?</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:24}}>
                {["lunes","martes","miercoles","jueves","viernes","sabado","domingo"].map(d=>(
                  <button key={d} onClick={()=>setFocusDiasExternos(prev=>prev.includes(d)?prev.filter(x=>x!==d):[...prev,d])} style={{padding:"8px 14px",borderRadius:100,border:`2px solid ${focusDiasExternos.includes(d)?C.accent:C.border}`,background:focusDiasExternos.includes(d)?C.accent:"transparent",color:focusDiasExternos.includes(d)?"#fff":C.ink,fontSize:12.5,fontWeight:600,cursor:"pointer",textTransform:"capitalize"}}>{d}</button>
                ))}
              </div>
              <button onClick={()=>focusDisciplinaExterna.trim()&&focusDiasExternos.length>0&&setFocusPaso(2)} disabled={!focusDisciplinaExterna.trim()||focusDiasExternos.length===0} style={{width:"100%",background:C.accent,color:"#fff",border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:(!focusDisciplinaExterna.trim()||focusDiasExternos.length===0)?0.4:1}}>Continuar</button>
            </>
          )}

          {focusPaso===2&&(
            <>
              <h2 style={{fontSize:"clamp(22px,5vw,28px)",color:C.ink,marginBottom:8,fontFamily:"'Playfair Display',serif",fontWeight:700}}>Cuéntanos un poco más</h2>
              <p style={{color:C.muted,fontSize:14,marginBottom:24}}>Esto ayuda a Forge a estimar el impacto en tu recuperación, sin necesitar el detalle de cada sesión.</p>
              <p style={{color:C.ink,fontSize:13,fontWeight:600,marginBottom:8}}>Duración habitual</p>
              <div style={{display:"flex",gap:8,marginBottom:20}}>
                {["<45 min","45-60","60-90","90+"].map(d=>(
                  <button key={d} onClick={()=>setFocusDuracionExterna(d)} style={{flex:1,padding:"10px 8px",borderRadius:10,border:`2px solid ${focusDuracionExterna===d?C.accent:C.border}`,background:focusDuracionExterna===d?C.accent:"transparent",color:focusDuracionExterna===d?"#fff":C.ink,fontSize:12,fontWeight:600,cursor:"pointer"}}>{d}</button>
                ))}
              </div>
              <p style={{color:C.ink,fontSize:13,fontWeight:600,marginBottom:8}}>Intensidad habitual</p>
              <div style={{display:"flex",gap:8,marginBottom:20}}>
                {["Baja","Moderada","Alta","Muy variable"].map(d=>(
                  <button key={d} onClick={()=>setFocusIntensidadExterna(d)} style={{flex:1,padding:"10px 6px",borderRadius:10,border:`2px solid ${focusIntensidadExterna===d?C.accent:C.border}`,background:focusIntensidadExterna===d?C.accent:"transparent",color:focusIntensidadExterna===d?"#fff":C.ink,fontSize:11.5,fontWeight:600,cursor:"pointer"}}>{d}</button>
                ))}
              </div>
              <p style={{color:C.ink,fontSize:13,fontWeight:600,marginBottom:8}}>Tipo de trabajo (puedes elegir varios)</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:20}}>
                {["Fuerza","Técnica","Metcon","Intervalos","Competición","Mixto"].map(d=>(
                  <button key={d} onClick={()=>setFocusTipoTrabajoExterna(prev=>prev.includes(d)?prev.filter(x=>x!==d):[...prev,d])} style={{padding:"8px 14px",borderRadius:100,border:`2px solid ${focusTipoTrabajoExterna.includes(d)?C.accent:C.border}`,background:focusTipoTrabajoExterna.includes(d)?C.accent:"transparent",color:focusTipoTrabajoExterna.includes(d)?"#fff":C.ink,fontSize:12.5,fontWeight:600,cursor:"pointer"}}>{d}</button>
                ))}
              </div>
              <label style={{display:"flex",alignItems:"center",gap:10,marginBottom:24,cursor:"pointer"}}>
                <input type="checkbox" checked={focusVariable} onChange={e=>setFocusVariable(e.target.checked)} style={{width:18,height:18}}/>
                <span style={{color:C.ink,fontSize:13}}>Puede cambiar bastante de un día para otro</span>
              </label>
              <button onClick={()=>setFocusPaso(3)} style={{width:"100%",background:C.accent,color:"#fff",border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Continuar</button>
            </>
          )}

          {focusPaso===3&&(
            <>
              <h2 style={{fontSize:"clamp(22px,5vw,28px)",color:C.ink,marginBottom:8,fontFamily:"'Playfair Display',serif",fontWeight:700}}>¿Qué quieres que gestione Forge?</h2>
              <p style={{color:C.muted,fontSize:14,marginBottom:24}}>La disciplina que Forge va a planificar y supervisar por ti.</p>
              <input value={focusDisciplinaForge} onChange={e=>setFocusDisciplinaForge(e.target.value)} placeholder="Ej: Running, Ciclismo, Natación..." style={{width:"100%",border:`2px solid ${C.border}`,borderRadius:12,padding:"14px 16px",fontSize:15,color:C.ink,background:C.card,marginBottom:24,fontFamily:"inherit"}}/>
              <button onClick={()=>focusDisciplinaForge.trim()&&setFocusPaso(4)} disabled={!focusDisciplinaForge.trim()} style={{width:"100%",background:C.accent,color:"#fff",border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:!focusDisciplinaForge.trim()?0.4:1}}>Continuar</button>
            </>
          )}

          {focusPaso===4&&(
            <>
              <h2 style={{fontSize:"clamp(22px,5vw,28px)",color:C.ink,marginBottom:8,fontFamily:"'Playfair Display',serif",fontWeight:700}}>Última pregunta</h2>
              <p style={{color:C.muted,fontSize:14,marginBottom:24}}>¿Qué importancia tiene este objetivo respecto a tu entrenamiento con {focusDisciplinaExterna || "tu otro entrenador"}?</p>
              <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:28}}>
                {[{v:"complementario",l:"Complementario",d:"Es un extra, no quiero que reste recuperación a lo principal"},{v:"importante",l:"Importante",d:"Me importa progresar, pero sin comprometer lo demás"},{v:"prioridad_alta",l:"Prioridad alta",d:"Es mi objetivo principal ahora mismo"}].map(op=>(
                  <div key={op.v} onClick={()=>setFocusPrioridad(op.v)} style={{padding:"14px 16px",borderRadius:12,border:`2px solid ${focusPrioridad===op.v?C.accent:C.border}`,background:focusPrioridad===op.v?`${C.accent}10`:"transparent",cursor:"pointer"}}>
                    <p style={{color:C.ink,fontSize:14,fontWeight:700,marginBottom:2}}>{op.l}</p>
                    <p style={{color:C.muted,fontSize:12}}>{op.d}</p>
                  </div>
                ))}
              </div>
              <button onClick={async()=>{
                setFocusGuardando(true);
                // FIX ARQUITECTONICO DEFINITIVO: confirmado con evidencia total — el codigo personal
                // (codigoPersonal) se escribe en la ULTIMA pantalla del flujo completo (justo antes
                // de iniciarChat), mucho DESPUES de este boton (paso 4 de 4 del onboarding de Focus).
                // En este punto codigoPersonal SIEMPRE esta vacio, sin importar cuantas veces
                // "arreglemos" la logica de fallback aqui. La solucion real: NO guardar nada todavia,
                // solo dejar los datos en estado de React — el guardado real ocurre en iniciarChat,
                // cuando el codigo definitivo ya existe con certeza.
                setModoEntrada("focus");
                // FIX: en vez de ir a "categoria" (que preguntaria de nuevo que tipo de atleta eres,
                // sobrescribiendo lo ya configurado en Focus), mapeamos la disciplina que escribio el
                // usuario a una categoria real y vamos DIRECTO al formulario general (edad, disponibilidad,
                // duracion por sesion) — ese cuestionario SI es necesario, nunca redundante con Focus.
                const disciplinaLower=focusDisciplinaForge.toLowerCase();
                const categoriaInferida=
                  /correr|running|carrera|maraton|trail/.test(disciplinaLower)?"carrera":
                  /fuerza|powerlifting|halterofilia|strongman/.test(disciplinaLower)?"fuerza":
                  /hibrido|hyrox|triatlon|ocr/.test(disciplinaLower)?"hibrido":
                  "funcional";
                setCategoria(categoriaInferida);
                setEspLabel(focusDisciplinaForge);
                setRespuestas({especialidad:focusDisciplinaForge});
                setPregIdx(0);
                setFocusGuardando(false);
                setPantalla("formulario");
              }} disabled={focusGuardando} style={{width:"100%",background:C.accent,color:"#fff",border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:focusGuardando?0.6:1}}>{focusGuardando?"Guardando...":"Continuar con mi perfil"}</button>
            </>
          )}
        </div>
      )}

      {pantalla==="onboarding_gaps"&&(
        <div className="fade-up" style={{maxWidth:560,width:"100%"}}>
          <h2 style={{fontSize:"clamp(22px,5vw,28px)",color:C.ink,marginBottom:8,fontFamily:"'Playfair Display',serif",fontWeight:700}}>Últimos datos</h2>
          <p style={{color:C.muted,fontSize:14,marginBottom:28}}>Antes de empezar, necesito confirmar esto para que tu plan sea preciso desde el primer día.</p>

          {onboardingMissing.includes("fc_max_o_metodo")&&(
            <div style={{marginBottom:28}}>
              <p style={{color:C.ink,fontSize:14,fontWeight:600,marginBottom:12}}>¿Conoces tu frecuencia cardíaca máxima y mínima real?</p>
              <div style={{display:"flex",gap:10,marginBottom:16}}>
                <button onClick={()=>setOnboardingFcConoce(true)} style={{flex:1,padding:"12px",borderRadius:12,border:`2px solid ${onboardingFcConoce===true?C.accent:C.border}`,background:onboardingFcConoce===true?C.accent:"transparent",color:onboardingFcConoce===true?"#fff":C.ink,fontSize:13,fontWeight:600,cursor:"pointer"}}>Sí, las conozco</button>
                <button onClick={()=>setOnboardingFcConoce(false)} style={{flex:1,padding:"12px",borderRadius:12,border:`2px solid ${onboardingFcConoce===false?C.accent:C.border}`,background:onboardingFcConoce===false?C.accent:"transparent",color:onboardingFcConoce===false?"#fff":C.ink,fontSize:13,fontWeight:600,cursor:"pointer"}}>No, calcúlalas</button>
              </div>
              {onboardingFcConoce===true&&(
                <div style={{display:"flex",gap:10}}>
                  <input value={onboardingFcMax} onChange={e=>setOnboardingFcMax(e.target.value.replace(/\D/g,""))} placeholder="FC máxima" style={{flex:1,border:`2px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.ink,background:C.card,fontFamily:"inherit"}}/>
                  <input value={onboardingFcMin} onChange={e=>setOnboardingFcMin(e.target.value.replace(/\D/g,""))} placeholder="FC reposo" style={{flex:1,border:`2px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.ink,background:C.card,fontFamily:"inherit"}}/>
                </div>
              )}
              {onboardingFcConoce===false&&(
                <p style={{color:C.muted,fontSize:12.5,fontStyle:"italic"}}>Sin problema — usaremos la fórmula estándar (220 - edad) para calcular tus zonas.</p>
              )}
            </div>
          )}

          <button
            disabled={onboardingConfirmando||onboardingFcConoce===null||(onboardingFcConoce===true&&(!onboardingFcMax.trim()||!onboardingFcMin.trim()))}
            onClick={async()=>{
              setOnboardingConfirmando(true);
              console.log("🔍 DEBUG onboarding_gaps — codigoUsuario:",codigoUsuario,"onboardingMissing:",JSON.stringify(onboardingMissing));
              const perfilActualizado={...respuestas,fc_max:onboardingFcConoce?onboardingFcMax:null,fc_max_metodo:onboardingFcConoce?"real":"formula_edad"};
              await apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{perfil:perfilActualizado}});
              const resConfirmar=await apiCall({action:"confirmar_onboarding",codigo:codigoUsuario,datos:{mode:modoEntrada}});
              setOnboardingConfirmando(false);
              if(resConfirmar?.ok){
                setPantalla("chat");
              }
            }}
            style={{width:"100%",background:C.accent,color:"#fff",border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:(onboardingConfirmando||onboardingFcConoce===null||(onboardingFcConoce===true&&(!onboardingFcMax.trim()||!onboardingFcMin.trim())))?0.4:1}}>
            {onboardingConfirmando?"Guardando...":"Confirmar y empezar"}
          </button>
        </div>
      )}

      {pantalla==="categoria"&&(
        <div className="fade-up" style={{maxWidth:580,width:"100%"}}>
          <button onClick={()=>setPantalla("bifurcacion")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,marginBottom:28}}>Volver</button>
          <h2 style={{fontSize:"clamp(22px,5vw,30px)",color:C.ink,marginBottom:8}}>{modoEntrada==="supervision"?"¿Qué entrenas?":modoEntrada==="consulta"?"¿Sobre qué entrenas habitualmente?":"¿Qué tipo de atleta eres?"}</h2>
          <p style={{color:C.muted,fontSize:14,marginBottom:6}}>{modoEntrada==="supervision"?"Forge adaptará sus recomendaciones y análisis a tu disciplina y a la forma en que entrenas.":modoEntrada==="consulta"?"Así Forge podrá contextualizar mejor tus consultas desde el principio.":"Forge utilizará tu disciplina, objetivos y disponibilidad para construir tu planificación."}</p>
          <p style={{color:C.muted,fontSize:12,marginBottom:28,fontStyle:"italic"}}>Podrás cambiar esta especialidad más adelante desde Mi Atleta.</p>
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

      {pantalla==="informe_test"&&cat&&!resultadoTest&&(
        <div className="fade-up" style={{maxWidth:500,width:"100%",textAlign:"center",padding:"60px 24px"}}>
          <div style={{fontSize:48,marginBottom:16}}>⚡</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,color:C.ink,marginBottom:8}}>Analizando tu perfil...</div>
          <p style={{color:C.muted,fontSize:14,marginBottom:24}}>El coach está generando tu informe de atleta personalizado</p>
          <div style={{display:"flex",gap:5,justifyContent:"center"}}>{[0,1,2].map(j=><div key={j} className="dot" style={{background:accentColor,animationDelay:`${j*0.2}s`}}/>)}</div>
        </div>
      )}

      {betaFounderInfo&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:24}} onClick={()=>setBetaFounderInfo(null)}>
          <div style={{background:"#1A1A1A",borderRadius:24,padding:"32px 28px",maxWidth:400,width:"100%",textAlign:"center",border:"2px solid #FF6B00"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:48,marginBottom:12}}>🎉</div>
            <p style={{color:"#F0EDE8",fontSize:20,fontWeight:700,marginBottom:8}}>¡Enhorabuena!</p>
            <p style={{color:"#9A9590",fontSize:14,lineHeight:1.6,marginBottom:6}}>Ya formas parte de los {betaFounderInfo.maxSlots} Atletas Fundadores de Forge.</p>
            <p style={{color:"#FF6B00",fontSize:18,fontWeight:800,marginBottom:16}}>Tu plaza es la #{betaFounderInfo.numero}</p>
            <p style={{color:"#9A9590",fontSize:14,lineHeight:1.6,marginBottom:16}}>Como agradecimiento por confiar en Forge desde sus inicios, disfrutarás de <strong>Premium gratuito durante 3 meses</strong>.</p>
            <div style={{background:"#FF6B0015",borderRadius:12,padding:"12px 14px",marginBottom:16,textAlign:"left"}}>
              <p style={{color:"#FF6B00",fontSize:12,fontWeight:700,marginBottom:6}}>🏅 Tu condición de Atleta Fundador</p>
              <p style={{color:"#9A9590",fontSize:12,lineHeight:1.6,marginBottom:8}}>Tu insignia de <strong>Atleta Fundador</strong> será tuya para siempre. Cada mes revisamos tu actividad (como referencia, unas 6 sesiones o uso regular del coach) para mantener el Premium activo.</p>
              <p style={{color:"#9A9590",fontSize:12,lineHeight:1.6}}>Si completas los 3 meses con actividad, desbloqueas un <strong style={{color:"#FF6B00"}}>precio especial de por vida: 9,99€/mes</strong> (frente a los 14€/mes estándar).</p>
            </div>
            <div style={{background:"#1E5C3A20",border:"1px solid #1E5C3A60",borderRadius:12,padding:"14px",marginBottom:24,textAlign:"left"}}>
              <p style={{color:"#4CAF50",fontSize:12,fontWeight:700,marginBottom:6}}>🧪 Tu siguiente paso</p>
              <p style={{color:"#9A9590",fontSize:12,lineHeight:1.6,marginBottom:10}}>Únete a <strong style={{color:"#F0EDE8"}}>Forge Labs</strong>, el club privado donde los Atletas Fundadores hablan directamente conmigo, proponen mejoras y ven las novedades antes que nadie.</p>
              <a href="https://t.me/forgeapp_es" target="_blank" rel="noopener noreferrer" style={{display:"block",background:"#1E5C3A",color:"#fff",border:"none",borderRadius:10,padding:"10px",fontSize:13,fontWeight:600,textDecoration:"none",textAlign:"center"}}>
                Unirme a Forge Labs
              </a>
            </div>
            <button onClick={()=>setBetaFounderInfo(null)} style={{background:"#FF6B00",color:"#fff",border:"none",borderRadius:12,padding:"12px 32px",fontSize:14,fontWeight:600,cursor:"pointer"}}>
              Empezar mi entrenamiento
            </button>
          </div>
        </div>
      )}

      {pantalla==="informe_test"&&cat&&resultadoTest&&(
        <div className="fade-up" style={{width:"100%",maxWidth:"100%",overflowY:"auto"}}>
          <div id="informe-test" style={{background:C.bg,padding:"16px",borderRadius:20,width:"100%"}}>
          <div style={{textAlign:"center",marginBottom:24}}>
            <div style={{fontSize:36,marginBottom:10}}>🧠</div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:C.ink,marginBottom:6}}>Hemos analizado tu perfil de atleta</div>
            <div style={{background:accentColor,color:"#fff",borderRadius:100,padding:"5px 18px",fontSize:13,fontWeight:700,display:"inline-block"}}>
              {resultadoTest.nivel}
            </div>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
            <div style={{background:"#1A2A1A",border:"1px solid #4CAF5040",borderRadius:16,padding:"16px 18px"}}>
              <p style={{color:"#4CAF50",fontSize:12,fontWeight:700,marginBottom:6}}>💪 Tu punto fuerte</p>
              <p style={{color:C.ink,fontSize:15,fontWeight:600}}>{resultadoTest.fortalezas?.[0]||"Constancia"}</p>
            </div>
            <div style={{background:C.accentLight,border:`1px solid ${accentColor}40`,borderRadius:16,padding:"16px 18px"}}>
              <p style={{color:accentColor,fontSize:12,fontWeight:700,marginBottom:6}}>🎯 Lo primero que vamos a mejorar</p>
              <p style={{color:C.ink,fontSize:15,fontWeight:600}}>{resultadoTest.debilidades?.[0]||"Datos insuficientes"}</p>
            </div>
            {resultadoTest.debilidades?.[1] && (
              <div style={{background:"#2A1A1A",border:"1px solid #ff444440",borderRadius:16,padding:"16px 18px"}}>
                <p style={{color:"#ff6b6b",fontSize:12,fontWeight:700,marginBottom:6}}>⚠️ Lo que vigilaremos</p>
                <p style={{color:C.ink,fontSize:15,fontWeight:600}}>{resultadoTest.debilidades[1]}</p>
              </div>
            )}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"16px 18px"}}>
              <p style={{color:C.muted,fontSize:12,fontWeight:700,marginBottom:6}}>📅 Primer bloque</p>
              <p style={{color:C.ink,fontSize:15,fontWeight:600}}>Acumulación · 4 semanas</p>
            </div>
          </div>

          <p style={{color:C.muted,fontSize:13,lineHeight:1.7,textAlign:"center",marginBottom:20,padding:"0 8px"}}>
            Forge ya ha tomado cientos de decisiones para construir un plan específico para ti. A partir de ahora solo tienes que entrenar y reportar.
          </p>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <button className="btn-main" onClick={()=>{
              setPantalla("chat");
              setTimeout(()=>enviarSilencioso("Test completado. Nivel: "+resultadoTest?.nivel+". Puntuaciones: "+Object.entries(resultadoTest?.puntuaciones||{}).map(([k,v])=>k+": "+v+"%").join(", ")+". Fortalezas: "+resultadoTest?.fortalezas?.join(", ")+". A mejorar: "+resultadoTest?.debilidades?.join(", ")+". "+resultadoTest?.resumen+". Ajusta mi programación con estos datos."),500);
            }} style={{background:accentColor,color:"#fff",border:"none",borderRadius:14,padding:"14px",fontSize:15,fontWeight:600,cursor:"pointer"}}>
              Ver mi primera semana →
            </button>
            <button onClick={async()=>{
              const html2canvas=(await import("html2canvas")).default;
              const el=document.getElementById("informe-test");
              if(!el) return;
              const canvas=await html2canvas(el,{backgroundColor:"#F6F4F0",scale:2,width:el.offsetWidth,height:el.offsetHeight,windowWidth:el.offsetWidth});
              const link=document.createElement("a");
              link.download=`forge-informe-${codigoUsuario}.png`;
              link.href=canvas.toDataURL("image/png");
              link.click();
            }} style={{background:"#1A1A1A",color:"#fff",border:"none",borderRadius:14,padding:"12px",fontSize:14,fontWeight:600,cursor:"pointer"}}>
              📥 Descargar informe
            </button>
            <button onClick={()=>setPantalla("chat")} style={{background:C.card,border:`1px solid ${C.border}`,color:C.muted,borderRadius:14,padding:"12px",fontSize:14,cursor:"pointer"}}>
              Volver al chat
            </button>
          </div>
        </div>
      )}

      {pantalla==="test"&&cat&&(
        <div className="fade-up" style={{maxWidth:500,width:"100%"}}>
          <div style={{display:"flex",alignItems:"center",marginBottom:20}}>
            <button onClick={()=>setPantalla("chat")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>← Volver al chat</button>
            <span style={{marginLeft:"auto",color:C.muted,fontSize:13}}>{testIdx+1} / {(TEST_ATLETA[espKey||""]||[]).length}</span>
          </div>
          <Progreso actual={testIdx+1} total={(TEST_ATLETA[espKey||""]||[]).length} color={accentColor}/>
          <div style={{display:"inline-flex",alignItems:"center",gap:6,background:cat.colorLight,borderRadius:100,padding:"5px 14px",marginBottom:20}}>
            <span style={{fontSize:15}}>{cat.emoji}</span>
            <span style={{color:accentColor,fontSize:12,fontWeight:600}}>Test de Atleta</span>
          </div>
          {(TEST_ATLETA[espKey||""]||[]).length>0&&(()=>{
            const pregTest=(TEST_ATLETA[espKey||""]||[])[testIdx];
            return pregTest?(
              <>
                <h2 style={{fontSize:"clamp(17px,4vw,23px)",color:C.ink,marginBottom:22,lineHeight:1.4}}>{pregTest.label}</h2>
                {pregTest.tipo==="opciones"&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:9,marginBottom:28}}>
                    {pregTest.opciones?.map(op=><Chip key={op} active={testAtleta[pregTest.id]===op} color={accentColor} onClick={()=>setTestAtleta(p=>({...p,[pregTest.id]:op}))}>{op}</Chip>)}
                  </div>
                )}
                {pregTest.tipo==="multi"&&(
                  <><p style={{color:C.muted,fontSize:12,marginBottom:10}}>Selecciona todos los que apliquen</p>
                  <div style={{display:"flex",flexWrap:"wrap",gap:9,marginBottom:28}}>
                    {pregTest.opciones?.map(op=>{
                      const sel=Array.isArray(testAtleta[pregTest.id])?testAtleta[pregTest.id] as string[]:[];
                      return <Chip key={op} active={sel.includes(op)} color={accentColor} onClick={()=>{
                        const curr=Array.isArray(testAtleta[pregTest.id])?[...testAtleta[pregTest.id] as string[]]:[];
                        setTestAtleta(p=>({...p,[pregTest.id]:curr.includes(op)?curr.filter(x=>x!==op):[...curr,op]}));
                      }}>{op}</Chip>;
                    })}
                  </div></>
                )}
                {pregTest.tipo==="texto"&&(
                  <textarea value={testAtleta[pregTest.id] as string||""} onChange={e=>setTestAtleta(p=>({...p,[pregTest.id]:e.target.value}))} rows={2}
                    placeholder={pregTest.placeholder}
                    style={{width:"100%",border:`2px solid ${C.border}`,borderRadius:14,padding:"13px 15px",fontSize:14,color:C.ink,background:C.card,lineHeight:1.65,marginBottom:28}}
                    onFocus={e=>(e.target.style.borderColor=accentColor)} onBlur={e=>(e.target.style.borderColor=C.border)}/>
                )}
                <p style={{color:C.muted,fontSize:12,marginBottom:16}}>💡 Si no tienes este dato puedes escribir "sin dato" y continuar — el diagnóstico se adaptará a la información disponible.</p>
                <button className="btn-main" onClick={()=>{
                  if(testIdx<(TEST_ATLETA[espKey||""]||[]).length-1){
                    setTestIdx(testIdx+1);
                  } else {
                    generarInformeTest();
                  }
                }} style={{width:"100%",background:accentColor,color:"#fff",border:"none",borderRadius:14,padding:"15px",fontSize:15,fontWeight:600,cursor:"pointer"}}>
                  {testIdx<(TEST_ATLETA[espKey||""]||[]).length-1?"Siguiente":"Generar mi informe ⚡"}
                </button>
              </>
            ):null;
          })()}
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
          {pregActual.tipo==="dias_semana"&&(
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:28}}>
              {["lunes","martes","miercoles","jueves","viernes","sabado","domingo"].map(d=>(
                <button key={d} onClick={()=>setSelMulti(prev=>prev.includes(d)?prev.filter(x=>x!==d):[...prev,d])} style={{padding:"10px 16px",borderRadius:100,border:`2px solid ${selMulti.includes(d)?accentColor:C.border}`,background:selMulti.includes(d)?accentColor:"transparent",color:selMulti.includes(d)?"#fff":C.ink,fontSize:13,fontWeight:600,cursor:"pointer",textTransform:"capitalize"}}>{d}</button>
              ))}
            </div>
          )}
          <button className="btn-main" onClick={avanzar}
            disabled={(pregActual.tipo==="opciones"&&!respuestas[pregActual.id])||((pregActual.tipo==="multi"||pregActual.tipo==="dias_semana")&&selMulti.length===0)||(pregActual.tipo==="texto"&&!textoTemp.trim())}
            style={{width:"100%",background:accentColor,color:"#fff",border:"none",borderRadius:14,padding:"15px",fontSize:15,fontWeight:600,cursor:"pointer",opacity:((pregActual.tipo==="opciones"&&!respuestas[pregActual.id])||((pregActual.tipo==="multi"||pregActual.tipo==="dias_semana")&&selMulti.length===0)||(pregActual.tipo==="texto"&&!textoTemp.trim()))?0.35:1}}>
           
{pregIdx<preguntas.length-1?"Siguiente":"Generar mi programa"}
          </button>
        </div>
      )}

      {!mostrarConflictoSesion&&pantalla==="chat"&&cat&&(
        <div style={{width:"100%",maxWidth:700,display:"flex",flexDirection:"column",height:"100dvh",maxHeight:"100dvh",paddingTop:"max(50px, env(safe-area-inset-top))",paddingBottom:"max(16px, env(safe-area-inset-bottom))"}}>
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

          <div style={{marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,padding:"6px 8px",background:"#1A1A1A",borderRadius:12,border:"1px solid #FF6B00"}}>
              <img src="/logo-forge.png" alt="Forge" style={{width:28,height:28,objectFit:"contain",flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:13,color:C.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>Forge Coach — {espLabel||cat.titulo}</div>
              </div>
              <div style={{background:C.card,color:accentColor,borderRadius:100,padding:"3px 8px",fontSize:11,fontWeight:600,flexShrink:0,whiteSpace:"nowrap"}}>
                {esAdmin?"👑 Admin":esPremium?"⭐ Premium":fechaRegistro?`${Math.max(0,diasPrueba-diasUsados)}d prueba`:"Prueba"}
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>{setPantalla("inicio");setMensajes([]);setHistorial([]);setMsgCount(0);setCodigoGuardado("");}} style={{background:C.card,border:`1px solid ${C.border}`,color:C.muted,cursor:"pointer",borderRadius:10,padding:"6px 10px",fontSize:12}}>←</button>
                {(esPremium||esAdmin)&&<a href="https://t.me/forgeapp_es" target="_blank" rel="noopener noreferrer" style={{background:"#1E5C3A",border:"none",color:"#fff",cursor:"pointer",borderRadius:10,padding:"6px 9px",fontSize:12,textDecoration:"none"}}>👨‍💻</a>}
                {!esPremium&&!esAdmin&&<a href={`mailto:coachforgeapp@gmail.com?subject=Consulta Forge - ${codigoUsuario}&body=Hola, tengo una consulta sobre mi programación en Forge.`} style={{background:C.card,border:`1px solid ${C.border}`,color:C.muted,cursor:"pointer",borderRadius:10,padding:"6px 9px",fontSize:12,textDecoration:"none"}}>✉️</a>}
              </div>
              <div style={{position:"relative"}}>
                </div>
            </div>
          </div>

          {mostrarEquipos&&(
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"16px 18px",marginBottom:10,maxHeight:450,overflowY:"auto"}}>
              <p style={{color:C.ink,fontSize:14,fontWeight:700,marginBottom:12}}>👥 Forge Duo</p>

              {/* Equipos existentes */}
              {misEquipos.map((eq:any)=>(
                <div key={eq.id} style={{background:C.bg,borderRadius:12,padding:"12px",marginBottom:10,border:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div>
                      <p style={{color:C.ink,fontSize:13,fontWeight:700}}>{eq.name}</p>
                      <p style={{color:C.muted,fontSize:11,textTransform:"capitalize"}}>{eq.team_type} · {eq.team_metrics?.[0]?.sessions_completed||0} sesiones</p>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    {eq.created_by===codigoUsuario?(
                    <button onClick={()=>generarSesionEquipo(eq)} style={{flex:1,background:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"6px",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                      🏋️ Entrenar
                    </button>
                  ):(
                    <div style={{flex:1,background:C.border,borderRadius:8,padding:"6px",fontSize:11,color:C.muted,textAlign:"center"}}>
                      El creador genera la sesión
                    </div>
                  )}
                    <button onClick={async()=>{
                      if(!confirm(`¿Salir de este equipo? Esta acción disuelve el equipo para ambos integrantes. ¿Confirmas?`)) return;
                      const res=await apiCall({action:"disolver_equipo",codigo:codigoUsuario,datos:{team_id:eq.id}});
                      if(res?.error){
                        alert(res.error);
                        return;
                      }
                      setMisEquipos(prev=>prev.filter((e:any)=>e.id!==eq.id));
                    }} style={{background:"#ff444420",color:"#ff4444",border:"1px solid #ff444440",borderRadius:8,padding:"6px",fontSize:11,cursor:"pointer"}}>
                      🗑️
                    </button>
                    <button onClick={async()=>{
                      const res=await apiCall({action:"crear_invitacion_equipo",codigo:codigoUsuario,datos:{team_id:eq.id}});
                      if(res?.codigoTemp){
                        setEquipoSeleccionado({...eq,codigoInvitacion:res.codigoTemp});
                      } else {
                        alert(res?.error||"Error al generar invitación");
                      }
                    }} style={{flex:1,background:C.card,color:C.ink,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px",fontSize:11,cursor:"pointer"}}>
                      📨 Invitar
                    </button>
                  </div>
                  {equipoSeleccionado?.id===eq.id&&equipoSeleccionado?.codigoInvitacion&&(
                    <div style={{marginTop:8,background:C.bg,borderRadius:8,padding:"10px",textAlign:"center"}}>
                      <p style={{color:C.muted,fontSize:11,marginBottom:4}}>Comparte este código — válido 10 min:</p>
                      <p style={{color:C.accent,fontSize:20,fontWeight:900,letterSpacing:3,marginBottom:6}}>{equipoSeleccionado.codigoInvitacion}</p>
                      <button onClick={()=>{navigator.clipboard.writeText(equipoSeleccionado.codigoInvitacion);setEquipoSeleccionado((prev:any)=>({...prev,copiado:true}));setTimeout(()=>setEquipoSeleccionado((prev:any)=>({...prev,copiado:false})),2000);}} style={{background:equipoSeleccionado?.copiado?"#4CAF50":C.border,color:equipoSeleccionado?.copiado?"#fff":C.ink,border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer",transition:"all 0.2s"}}>
                        {equipoSeleccionado?.copiado?"✅ Copiado":"📋 Copiar"}
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* Unirse con codigo */}
              <div style={{borderTop:`1px solid ${C.border}`,paddingTop:10,marginTop:4}}>
                <p style={{color:C.muted,fontSize:12,marginBottom:6}}>¿Tienes un código de invitación?</p>
                <div style={{display:"flex",gap:6}}>
                  <input value={unirseCodigo} onChange={e=>setUnirseCodigo(e.target.value.toUpperCase())}
                    placeholder="Código (XXXXXX)"
                    style={{flex:1,border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 10px",fontSize:12,color:C.ink,background:C.bg,fontFamily:"inherit",letterSpacing:2}}/>
                  <button onClick={async()=>{
                    const res=await apiCall({action:"unirse_con_codigo",codigo:codigoUsuario,datos:{codigoInvitacion:unirseCodigo}});
                    if(res?.equipo){
                      setMisEquipos(prev=>[...prev,res.equipo]);
                      setUnirseCodigo("");
                    } else {
                      alert(res?.error||"Código inválido o expirado");
                    }
                  }} style={{background:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                    Unirse
                  </button>
                </div>
              </div>

              {/* Crear equipo */}
              {misEquipos.length < 2 && (
                <div style={{borderTop:`1px solid ${C.border}`,paddingTop:12,marginTop:4}}>
                  <p style={{color:C.muted,fontSize:12,marginBottom:8}}>Crear nuevo equipo:</p>
                  <input value={crearEquipoNombre} onChange={e=>setCrearEquipoNombre(e.target.value)}
                    placeholder="Nombre del equipo (ej: Box con Pedro)"
                    style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",fontSize:12,color:C.ink,background:C.bg,marginBottom:8,fontFamily:"inherit"}}/>
                  <select value={crearEquipoTipo} onChange={e=>setCrearEquipoTipo(e.target.value)}
                    style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",fontSize:12,color:C.ink,background:C.bg,marginBottom:8,fontFamily:"inherit"}}>
                    <option value="generic">General</option>
                    <option value="crossfit">CrossFit</option>
                    <option value="running">Running</option>
                    <option value="hyrox">Hyrox</option>
                    <option value="functional">Funcional</option>
                  </select>
                  <button onClick={crearEquipo} style={{width:"100%",background:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"8px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                    Crear equipo
                  </button>
                </div>
              )}

              {misEquipos.length === 0 && (
                <p style={{color:C.muted,fontSize:12,textAlign:"center",padding:"12px 0"}}>No tienes equipos aún. ¡Crea uno e invita a tu compañero!</p>
              )}
            </div>
          )}

          {mostrarPerfil&&(
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"16px 18px",marginBottom:10,maxHeight:400,overflowY:"auto"}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:16,color:C.ink,marginBottom:16}}>Ajustes de cuenta</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>

            {estadoFounder?.esFounder&&(
              <div style={{background:"#FF6B0015",border:`1px solid ${accentColor}40`,borderRadius:12,padding:"14px"}}>
                <p style={{color:accentColor,fontSize:12,fontWeight:700,marginBottom:8}}>🏅 Estado Fundador #{estadoFounder.betaNumber}</p>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted,marginBottom:4}}>
                  <span>Actividad este mes</span>
                  <span>{estadoFounder.actividadTotal}/{estadoFounder.objetivoActividad}</span>
                </div>
                <div style={{height:6,background:C.border,borderRadius:100,marginBottom:8}}>
                  <div style={{height:6,borderRadius:100,background:estadoFounder.renovacionAsegurada?"#4CAF50":accentColor,width:`${Math.min(100,(estadoFounder.actividadTotal/estadoFounder.objetivoActividad)*100)}%`,transition:"width 0.6s ease"}}/>
                </div>
                <p style={{color:estadoFounder.renovacionAsegurada?"#4CAF50":C.muted,fontSize:11,fontWeight:600}}>
                  {estadoFounder.renovacionAsegurada?"✓ Renovación asegurada":`Quedan ${estadoFounder.diasRestantes} días para la revisión`}
                </p>
              </div>
            )}

            <div style={{background:C.bg,borderRadius:12,padding:"10px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <p style={{color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Código de acceso</p>
                  <p style={{color:accentColor,fontSize:15,fontWeight:700,letterSpacing:2}}>{mostrarCodigoReal?codigoUsuario:"••••••"}</p>
                </div>
                <button onClick={()=>setMostrarCodigoReal(!mostrarCodigoReal)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 10px",fontSize:11,color:C.muted,cursor:"pointer"}}>
                  {mostrarCodigoReal?"Ocultar":"Ver"}
                </button>
              </div>
            </div>
            <div style={{background:C.bg,borderRadius:12,padding:"10px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <p style={{color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:1}}>Especialidad</p>
                <button onClick={()=>setEditandoEspecialidad(!editandoEspecialidad)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"3px 8px",fontSize:11,color:C.muted,cursor:"pointer"}}>
                  {editandoEspecialidad?"Cancelar":"Cambiar"}
                </button>
              </div>
              <p style={{color:C.ink,fontSize:13,fontWeight:500}}>{espLabel||categoria}</p>
              {editandoEspecialidad&&categoria&&(
                <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:6}}>
                  {ESPECIALIDADES[categoria]?.map(esp=>(
                    <button key={esp} onClick={async()=>{
                      const key=ESPECIALIDAD_KEY[categoria]?.[esp]||categoria;
                      setEspKey(key);
                      setEspLabel(esp);
                      setEditandoEspecialidad(false);
                      if(codigoUsuario) await apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{especialidad:key}});
                      setMensajePerfil("Especialidad actualizada correctamente.");
                      setTimeout(()=>setMensajePerfil(""),3000);
                    }} style={{background:espKey===ESPECIALIDAD_KEY[categoria]?.[esp]?accentColor+"18":C.card,border:`1px solid ${espKey===ESPECIALIDAD_KEY[categoria]?.[esp]?accentColor:C.border}`,borderRadius:8,padding:"7px 12px",fontSize:13,color:espKey===ESPECIALIDAD_KEY[categoria]?.[esp]?accentColor:C.ink,cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
                      {esp}
                    </button>
                  ))}
                </div>
              )}
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

            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,marginTop:4}}>
              {!confirmandoEliminarCuenta?(
                <button onClick={()=>setConfirmandoEliminarCuenta(true)} style={{width:"100%",background:"none",border:"1px solid #ff444460",borderRadius:10,padding:"10px",fontSize:13,fontWeight:600,cursor:"pointer",color:"#ff4444",fontFamily:"inherit"}}>
                  Eliminar cuenta
                </button>
              ):(
                <div style={{background:"#ff444410",border:"1px solid #ff444440",borderRadius:12,padding:"14px"}}>
                  <p style={{color:"#ff4444",fontSize:13,fontWeight:700,marginBottom:6}}>¿Seguro que quieres eliminar tu cuenta?</p>
                  <p style={{color:C.muted,fontSize:12,marginBottom:12,lineHeight:1.5}}>Se eliminará toda tu planificación, historial y datos. Esta acción no se puede deshacer.</p>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={async()=>{
                      setEliminandoCuenta(true);
                      const res=await apiCall({action:"eliminar_cuenta",codigo:codigoUsuario});
                      if(res?.ok){
                        window.location.href="/";
                      }else{
                        setEliminandoCuenta(false);
                        setConfirmandoEliminarCuenta(false);
                      }
                    }} disabled={eliminandoCuenta} style={{flex:1,background:"#ff4444",color:"#fff",border:"none",borderRadius:10,padding:"10px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:eliminandoCuenta?0.6:1}}>
                      {eliminandoCuenta?"Eliminando...":"Sí, eliminar"}
                    </button>
                    <button onClick={()=>setConfirmandoEliminarCuenta(false)} disabled={eliminandoCuenta} style={{flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:10,padding:"10px",fontSize:13,fontWeight:600,cursor:"pointer",color:C.ink,fontFamily:"inherit"}}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {mostrarMarcas&&(
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"16px 18px",marginBottom:10,maxHeight:420,overflowY:"auto"}}>
              <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:16,color:C.ink,marginBottom:4}}>Progreso y contexto</div>
              <p style={{color:C.muted,fontSize:11,marginBottom:12}}>💡 Cuéntale al coach tus nuevas marcas y las añadirá automáticamente.</p>
              <button onClick={async()=>{
                if(codigoUsuario){
                  await apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{marcas_especificas:marcasEspecificas,lesiones_actuales:memoriaCoach.lesiones,plan_proxima_semana:memoriaCoach.plan,notas_coach:memoriaCoach.notas}});
                  setMensajePerfil("Progreso guardado correctamente.");
                  setTimeout(()=>setMensajePerfil(""),3000);
                }
              }} style={{background:accentColor,color:"#fff",border:"none",borderRadius:10,padding:"10px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",width:"100%",marginTop:12}}>
                💾 Guardar todo
              </button>
              {mensajePerfil&&<p style={{color:C.success,fontSize:12,fontWeight:600,marginTop:6}}>{mensajePerfil}</p>}
              <div style={{marginTop:16,borderTop:`1px solid ${C.border}`,paddingTop:12,display:"flex",flexDirection:"column",gap:10}}>
                <p style={{color:C.ink,fontSize:13,fontWeight:600,marginBottom:4}}>Contexto para el coach</p>
                <div>
                  <p style={{color:C.muted,fontSize:11,marginBottom:4}}>🤕 Lesiones o molestias actuales</p>
                  <textarea value={memoriaCoach.lesiones||""} onChange={e=>setMemoriaCoach(prev=>({...prev,lesiones:e.target.value}))}
                    onBlur={async()=>{if(codigoUsuario) await apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{lesiones_actuales:memoriaCoach.lesiones}});}}
                    placeholder="Ej: rodilla derecha molesta, hombro limitado... o ninguna"
                    rows={2} style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 10px",fontSize:12,color:C.ink,background:C.bg,fontFamily:"inherit",resize:"none"}}/>
                </div>
                <div>
                  <p style={{color:C.muted,fontSize:11,marginBottom:4}}>📅 Disponibilidad esta semana</p>
                  <textarea value={memoriaCoach.plan||""} onChange={e=>setMemoriaCoach(prev=>({...prev,plan:e.target.value}))}
                    onBlur={async()=>{if(codigoUsuario) await apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{plan_proxima_semana:memoriaCoach.plan}});}}
                    placeholder="Ej: esta semana solo puedo lunes, miércoles y viernes por la tarde"
                    rows={2} style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 10px",fontSize:12,color:C.ink,background:C.bg,fontFamily:"inherit",resize:"none"}}/>
                </div>
                <div>
                  <p style={{color:C.muted,fontSize:11,marginBottom:4}}>📝 Notas para el coach</p>
                  <textarea value={memoriaCoach.notas||""} onChange={e=>setMemoriaCoach(prev=>({...prev,notas:e.target.value}))}
                    onBlur={async()=>{if(codigoUsuario) await apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{notas_coach:memoriaCoach.notas}});}}
                    placeholder="Ej: tengo competición el 15 de junio, prefiero entrenar por las mañanas..."
                    rows={2} style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 10px",fontSize:12,color:C.ink,background:C.bg,fontFamily:"inherit",resize:"none"}}/>
                </div>
              </div>
              {(CAMPOS_MARCAS[espKey||""]||CAMPOS_MARCAS[categoria||""])&&(
                <div style={{marginTop:16,borderTop:`1px solid ${C.border}`,paddingTop:12}}>
                  <p style={{color:C.ink,fontSize:13,fontWeight:600,marginBottom:10}}>Marcas por disciplina</p>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {(CAMPOS_MARCAS[espKey||""]||CAMPOS_MARCAS[categoria||""]).map(campo=>(
                      <div key={campo.id} style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{color:C.muted,fontSize:12,minWidth:100,flexShrink:0}}>{campo.label}</span>
                        <input value={marcasEspecificas[campo.id]||""} onChange={e=>{
                          const nuevo={...marcasEspecificas,[campo.id]:e.target.value};
                          setMarcasEspecificas(nuevo);
                        }}
                        onBlur={async()=>{
                          if(codigoUsuario) await apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{marcas_especificas:marcasEspecificas}});
                        }}
                        placeholder={campo.placeholder}
                        style={{flex:1,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 10px",fontSize:13,color:C.ink,background:C.bg,fontFamily:"inherit"}}/>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{flex:1,overflowY:"auto",background:C.card,borderRadius:20,border:`1px solid ${C.border}`,padding:"20px 18px",display:"flex",flexDirection:"column",gap:18}}>
            {descubrimientoPendiente&&(
              <div className="fade-up" style={{display:"flex",justifyContent:"center",marginBottom:4}}>
                <div onClick={()=>setDescubrimientoPendiente(null)} style={{cursor:"pointer",background:"linear-gradient(135deg, #1A2A1A, #1A1A2A)",border:"1px solid #4CAF5080",borderRadius:16,padding:"18px 20px",maxWidth:"90%",textAlign:"center",boxShadow:"0 4px 20px rgba(76,175,80,0.15)"}}>
                  <p style={{fontSize:24,marginBottom:8}}>✨</p>
                  <p style={{color:"#4CAF50",fontSize:12,fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>Forge ha hecho un descubrimiento</p>
                  <p style={{color:C.ink,fontSize:14,lineHeight:1.6}}>{descubrimientoPendiente.descubrimiento}</p>
                  <p style={{color:C.muted,fontSize:11,marginTop:10}}>Toca para continuar</p>
                </div>
              </div>
            )}
            {generando&&(
              <div style={{display:"flex",gap:12}}>
                <div style={{width:36,height:36,borderRadius:12,background:cat.colorLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.emoji}</div>
                <div style={{background:C.bg,borderRadius:"4px 16px 16px 16px",padding:"16px 18px"}}>
                  <p style={{color:C.muted,fontSize:13,marginBottom:10}}>Preparando tu sesion...</p>
                  <div style={{display:"flex",gap:5}}>{[0,1,2].map(j=><div key={j} className="dot" style={{background:accentColor,animationDelay:`${j*0.2}s`}}/>)}</div>
                </div>
              </div>
            )}
            {mensajes.map((msg,i)=>{
              const esRespuestaEstatica=msg.role==="assistant"&&typeof msg.content==="string"&&msg.content.startsWith("[FORGE_STATIC]");
              const contenidoLimpio=esRespuestaEstatica?msg.content.replace("[FORGE_STATIC]",""):msg.content;
              return (
              <div key={i} className="msg-in" style={{display:"flex",justifyContent:msg.role==="user"?"flex-end":"flex-start",gap:10,alignItems:"flex-start",animationDelay:`${Math.min(i*0.05,0.3)}s`}}>
                {msg.role==="assistant"&&(
                  <div style={{width:32,height:32,borderRadius:10,overflow:"hidden",flexShrink:0}}>
                    <img src="/logo-forge.png" alt="Forge" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  </div>
                )}
                <div style={{maxWidth:"80%",padding:"13px 17px",borderRadius:msg.role==="user"?"16px 4px 16px 16px":"4px 16px 16px 16px",background:msg.role==="user"?"#FF6B00":esRespuestaEstatica?"#0D1F1A":C.card,color:msg.role==="user"?"#fff":C.ink,border:msg.role==="assistant"?(esRespuestaEstatica?"1px solid #4CAF5060":`1px solid ${C.border}`):"none"}}>
                  {esRespuestaEstatica&&(
                    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8}}>
                      <span style={{fontSize:12}}>✓</span>
                      <span style={{color:"#4CAF50",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>Dato verificado de Mi Plan</span>
                    </div>
                  )}
                  {msg.role==="assistant"?<MensajeTexto texto={contenidoLimpio}/>:<p style={{fontSize:14,lineHeight:1.6}}>{msg.content}</p>}
                </div>
              </div>
              );
            })}
            {nuevoAprendizaje&&(
              <div className="msg-in" style={{display:"flex",justifyContent:"center",marginTop:4,marginBottom:4}}>
                <div style={{background:"#1E5C3A20",border:"1px solid #1E5C3A60",borderRadius:14,padding:"12px 16px",maxWidth:"85%",textAlign:"center"}}>
                  <p style={{color:"#4CAF50",fontSize:12,fontWeight:700,marginBottom:4}}>🧠 Forge ha actualizado tu perfil</p>
                  <p style={{color:C.ink,fontSize:13,lineHeight:1.5,marginBottom:8}}>{nuevoAprendizaje.texto}</p>
                  <a href={`/atleta?codigo=${codigoUsuario}`} onClick={()=>setNuevoAprendizaje(null)} style={{color:"#4CAF50",fontSize:12,fontWeight:600,textDecoration:"underline"}}>
                    Ver en Mi Atleta →
                  </a>
                </div>
              </div>
            )}
            {progresoActualizado&&(
              <div className="msg-in" style={{display:"flex",justifyContent:"center",marginTop:4,marginBottom:4}}>
                <div style={{background:`${accentColor}15`,border:`1px solid ${accentColor}60`,borderRadius:14,padding:"12px 16px",maxWidth:"85%",textAlign:"center"}}>
                  <p style={{color:accentColor,fontSize:12,fontWeight:700,marginBottom:6}}>📈 Progreso actualizado</p>
                  <p style={{color:C.ink,fontSize:13,fontWeight:600,marginBottom:8}}>{progresoActualizado.nombre}</p>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:8}}>
                    <span style={{color:C.muted,fontSize:16,fontWeight:700}}>{progresoActualizado.antes}%</span>
                    <span style={{color:accentColor,fontSize:14}}>→</span>
                    <span style={{color:accentColor,fontSize:18,fontWeight:800}}>{progresoActualizado.despues}%</span>
                  </div>
                  <a href={`/atleta?codigo=${codigoUsuario}`} onClick={()=>setProgresoActualizado(null)} style={{color:accentColor,fontSize:12,fontWeight:600,textDecoration:"underline"}}>
                    Ver en Mi Atleta →
                  </a>
                </div>
              </div>
            )}
            {estadoAtletaActivo&&(
              <div style={{background:"linear-gradient(135deg,#8B0000,#5C0000)",borderRadius:16,padding:"16px 18px",marginBottom:10}}>
                <p style={{color:"#fff",fontSize:14,fontWeight:700,marginBottom:4}}>🔴 Entrenamiento restringido</p>
                <p style={{color:"#fff",fontSize:12.5,opacity:0.9,marginBottom:12}}>Forge está adaptando tu planificación debido a una restricción activa.</p>
                <a href={`/atleta?codigo=${codigoUsuario}`} style={{display:"block",width:"100%",background:"#fff",color:"#8B0000",border:"none",borderRadius:100,padding:"10px 16px",fontSize:13,fontWeight:700,textAlign:"center",textDecoration:"none"}}>
                  Ver estado y restricciones →
                </a>
              </div>
            )}
            {alertaSesionFuturaIncompatible&&(
              <div style={{background:"linear-gradient(135deg,#8B0000,#5C0000)",borderRadius:16,padding:"16px 18px",marginBottom:10}}>
                <p style={{color:"#fff",fontSize:14,fontWeight:700,marginBottom:4}}>⚠️ Sesión futura requiere revisión</p>
                <p style={{color:"#fff",fontSize:12.5,opacity:0.95,marginBottom:4}}>{alertaSesionFuturaIncompatible.dia?.charAt(0).toUpperCase()+alertaSesionFuturaIncompatible.dia?.slice(1)}: <strong>{alertaSesionFuturaIncompatible.tituloSesion}</strong></p>
                <p style={{color:"#fff",fontSize:11.5,opacity:0.85,marginBottom:12}}>Esta sesión puede ser incompatible con tu restricción activa ({alertaSesionFuturaIncompatible.issue}). No la realices sin confirmar tolerancia primero.</p>
                <button onClick={()=>setAlertaSesionFuturaIncompatible(null)} style={{width:"100%",background:"#fff",color:"#8B0000",border:"none",borderRadius:100,padding:"10px 16px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                  Entendido
                </button>
              </div>
            )}
            {modificacionPendienteConfirmar&&(
              <div style={{background:"linear-gradient(135deg,#FF6B00,#CC5500)",borderRadius:16,padding:"16px 18px",marginBottom:10}}>
                <p style={{color:"#fff",fontSize:14,fontWeight:700,marginBottom:4}}>⚠️ Cambio de sesión detectado</p>
                <p style={{color:"#fff",fontSize:12.5,opacity:0.95,marginBottom:4}}>{modificacionPendienteConfirmar.dia?.charAt(0).toUpperCase()+modificacionPendienteConfirmar.dia?.slice(1)}: <strong>{modificacionPendienteConfirmar.titulo}</strong></p>
                <p style={{color:"#fff",fontSize:11.5,opacity:0.85,marginBottom:12}}>{modificacionPendienteConfirmar.motivo}</p>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={async()=>{
                    const res=await apiCall({action:"confirmar_pending_action",codigo:codigoUsuario});
                    if(res?.ejecutado){
                      setMensajes(prev=>[...prev,{role:"assistant",content:"✅ Sesión actualizada correctamente en Mi Plan."}]);
                      cargarPlanSemanal(codigoUsuario);
                    }
                    setModificacionPendienteConfirmar(null);
                  }} style={{flex:1,background:"#fff",color:"#CC5500",border:"none",borderRadius:100,padding:"10px 16px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                    Sí, confirmar cambio
                  </button>
                  <button onClick={async()=>{
                    await apiCall({action:"rechazar_pending_action",codigo:codigoUsuario});
                    setModificacionPendienteConfirmar(null);
                  }} style={{flex:1,background:"transparent",color:"#fff",border:"1px solid rgba(255,255,255,0.5)",borderRadius:100,padding:"10px 16px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                    No, mantener plan
                  </button>
                </div>
              </div>
            )}
            {mostrarBannerCambioModo&&(
              <div style={{display:"flex",justifyContent:"center",marginTop:4,gap:10}}>
                <button onClick={async()=>{
                  setMostrarBannerCambioModo(false);
                  const resCambioModo=await apiCall({action:"cambiar_modo_entrada",codigo:codigoUsuario,datos:{nuevoModo:"planificacion"}});
                  // FIX: solo confirmar el cambio al usuario si el backend REALMENTE lo persistio —
                  // nunca decir "hemos cambiado" basandose en la intencion, siempre en el resultado real.
                  const verificacion=await apiCall({action:"recuperar_usuario",codigo:codigoUsuario});
                  const modoRealPersistido=verificacion?.data?.modo_entrada;
                  if(resCambioModo?.ok && modoRealPersistido==="planificacion"){
                    setModoEntrada("planificacion");
                    setMensajes(prev=>[...prev,{role:"assistant",content:"¡Perfecto! A partir de ahora Forge se encarga de tu planificación. Cuéntame tu disponibilidad y objetivo para diseñar tu primera semana, o dime \"genera mi próxima semana\" si ya los tengo guardados."}]);
                  } else {
                    setMensajes(prev=>[...prev,{role:"assistant",content:"⚠️ Hubo un problema cambiando tu modo. Inténtalo de nuevo en unos segundos."}]);
                  }
                }} style={{background:accentColor,color:"#fff",border:"none",borderRadius:100,padding:"10px 20px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                  Pasar a modo Coach
                </button>
                <button onClick={()=>setMostrarBannerCambioModo(false)} style={{background:"transparent",color:C.muted,border:`1px solid ${C.muted}`,borderRadius:100,padding:"10px 20px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                  Seguir en Supervisión
                </button>
              </div>
            )}
            {mostrarBotonNuevaSemana&&!generandoSemana&&(
              <div style={{background:"linear-gradient(135deg,#4CAF50,#2E7D32)",borderRadius:16,padding:"16px 18px",marginBottom:10,textAlign:"center"}}>
                <p style={{color:"#fff",fontSize:14,fontWeight:700,marginBottom:4}}>✅ Semana completada</p>
                <p style={{color:"#fff",fontSize:12.5,opacity:0.9,marginBottom:12}}>Has terminado esta semana. Forge ya tiene tus resultados y los tendrá en cuenta para preparar la siguiente.</p>
                <button onClick={async()=>{
                  setMostrarBotonNuevaSemana(false);
                  // FORGE CAPABILITY GUARD (temprano) — defensa en profundidad, aunque este boton
                  // teoricamente solo deberia mostrarse en modo planificacion.
                  if(modoEntrada==="supervision"||modoEntrada==="consulta"){
                    setMensajes(prev=>[...prev,{role:"assistant",content:"Ahora mismo estás en modo Supervisión — no genero planificaciones en este modo. Si quieres que Forge se encargue de tu entrenamiento, dímelo y cambiamos al modo Coach."}]);
                    return;
                  }
                  // FORGE CLOSE_WEEK — ejecucion real del cierre (Insight, Summary, Weakness Exposure,
                  // Celebrations), SOLO ahora tras confirmacion explicita del usuario. Idempotente:
                  // si ya estaba cerrada (doble clic, race condition), simplemente no repite el trabajo.
                  const resClose=await apiCall({action:"close_week",codigo:codigoUsuario});
                  if(!resClose?.ok && !resClose?.semanaCompleta){
                    setMensajes(prev=>[...prev,{role:"assistant",content:"⚠️ Hubo un problema cerrando la semana. Inténtalo de nuevo en unos segundos."}]);
                    return;
                  }
                  // FIX: preguntar disponibilidad ANTES de generar, en vez de asumir silenciosamente
                  // la misma distribucion de semanas anteriores. El usuario puede confirmar o corregir.
                  const distActual=distribucionSemanal;
                  let distTexto="No tengo tu disponibilidad guardada todavia.";
                  try{
                    const distParsed=typeof distActual==="string"?JSON.parse(distActual):distActual;
                    if(distParsed && typeof distParsed==="object"){
                      distTexto=Object.entries(distParsed).filter(([k])=>k!=="observaciones").map(([k,v]:[string,any])=>`${k}: ${Array.isArray(v)?v.join(", "):v}`).join(" — ");
                    }
                  }catch{}
                  setMensajes(prev=>[...prev,{role:"assistant",content:`Antes de generar tu próxima semana, confirmemos tu disponibilidad actual:\n\n📅 ${distTexto}\n\n¿Sigue siendo así, o ha cambiado algo?`}]);
                  setEsperandoConfirmacionDisponibilidad(true);
                }} style={{background:accentColor,color:"#fff",border:"none",borderRadius:100,padding:"12px 28px",fontSize:14,fontWeight:600,cursor:"pointer"}}>
                  🚀 Generar mi próxima semana
                </button>
              </div>
            )}
            {(cargando||generandoSemana)&&(
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
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:C.ink,marginBottom:8}}>Tu período de prueba ha terminado</div>
              <p style={{color:C.muted,fontSize:13,marginBottom:12,lineHeight:1.6}}>¿Te ha sido útil Forge estos 10 días? Tu opinión nos ayuda a seguir mejorando. 🙏</p>
              <a href={`mailto:coachforgeapp@gmail.com?subject=Feedback Forge - ${codigoUsuario}&body=Hola, quiero compartir mi experiencia con Forge:%0D%0A%0D%0A¿Qué me ha gustado:%0D%0A%0D%0A¿Qué mejoraría:%0D%0A%0D%0A¿Continuaría con Premium? ¿Por qué?`}
                style={{display:"block",textAlign:"center",color:"#1E5C3A",fontSize:13,textDecoration:"none",padding:"10px",border:"1px solid #1E5C3A",borderRadius:12,background:"#D8F3DC",marginBottom:12,fontWeight:600}}>
                ✉️ Enviar mi feedback
              </a>
              <p style={{color:C.muted,fontSize:12,marginBottom:6,lineHeight:1.6}}>Si consideras que Forge es una herramienta válida para tu entrenamiento, continúa con Premium:</p>
              <ul style={{color:C.muted,fontSize:12,marginBottom:12,paddingLeft:16,lineHeight:2}}>
                <li>Consultas ilimitadas con el coach</li>
                <li>Memoria persistente y consciencia de ciclo</li>
                <li>Acceso directo al grupo Telegram de la comunidad</li>
                <li>Supervisado por entrenador con certificación europea</li>
                <li>Sin permanencia — cancela cuando quieras</li>
              </ul>
              <p style={{color:C.muted,fontSize:12,marginBottom:6,lineHeight:1.6}}>Usa el código <strong style={{color:C.warm}}>FUNDADOR</strong> al pagar para obtener un descuento especial de lanzamiento.</p>
<p style={{color:C.muted,fontSize:12,marginBottom:16,lineHeight:1.6}}>Sin permanencia — cancela cuando quieras.</p>
              <button className="btn-main" onClick={()=>{window.location.href="https://buy.stripe.com/bJe6oHa7w0l95CS6Dh0VO01";}}
                style={{width:"100%",background:C.warm,color:"#fff",border:"none",borderRadius:12,padding:"14px",fontSize:15,fontWeight:600,cursor:"pointer",marginBottom:10}}>
                Obtener Premium — 14€/mes
              </button>
              <a href="https://t.me/forgeapp_es" target="_blank" rel="noopener noreferrer"
                style={{display:"block",textAlign:"center",color:C.muted,fontSize:13,textDecoration:"none",padding:"10px",border:`1px solid ${C.border}`,borderRadius:12,background:C.card}}>
                💬 Únete a la comunidad en Telegram
              </a>
            </div>
          )}

          {!bloqueado&&(
            <>
              <div style={{marginTop:10,display:"flex",gap:8,alignItems:"flex-end"}}>
                <div style={{flex:1,background:C.card,border:`2px solid ${C.border}`,borderRadius:16,padding:"11px 15px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:imagenPreview?8:0}}>
                    <label style={{cursor:"pointer",color:C.muted,fontSize:18,flexShrink:0}} title="Subir imagen o PDF">
                      📎
                      <input type="file" accept="image/*,.pdf" multiple style={{display:"none"}} onChange={async(e)=>{
                        const file=e.target.files?.[0];
                        if(!file) return;
                        const reader=new FileReader();
                        reader.onload=()=>{
                          const base64=reader.result as string;
                          setImagenesAdjuntas(prev=>[...prev,{base64,tipo:file.type,nombre:file.name}]);
                          setImagenAdjunta({base64,tipo:file.type,nombre:file.name});
                          setImagenPreview(base64);
                        };
                        reader.readAsDataURL(file);
                        const files=e.target.files;
                        if(files&&files.length>1){
                          Array.from(files).slice(1).forEach(f=>{
                            const r=new FileReader();
                            r.onload=()=>{
                              const b64=r.result as string;
                              setImagenesAdjuntas(prev=>[...prev,{base64:b64,tipo:f.type,nombre:f.name}]);
                            };
                            r.readAsDataURL(f);
                          });
                        }
                      }}/>
                    </label>
                    {imagenesAdjuntas.length>0&&(
                      <div style={{display:"flex",alignItems:"center",gap:6,background:C.bg,borderRadius:8,padding:"4px 10px"}}>
                        <span style={{fontSize:13}}>📎</span>
                        <span style={{fontSize:12,color:accentColor,fontWeight:600}}>{imagenesAdjuntas.length} archivo{imagenesAdjuntas.length>1?"s":""} adjunto{imagenesAdjuntas.length>1?"s":""}</span>
                        <button onClick={()=>{setImagenesAdjuntas([]);setImagenAdjunta(null);setImagenPreview(null);}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,lineHeight:1}}>×</button>
                      </div>
                    )}
                  </div>
                  <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey}
                    placeholder="Pregunta, pide ajustes o cuentame cambios..."
                    rows={1} disabled={cargando}
                    style={{width:"100%",background:"transparent",border:"none",color:C.ink,fontSize:14,lineHeight:1.6,maxHeight:100,overflow:"auto",padding:0}}
                    onInput={(e)=>{const t=e.target as HTMLTextAreaElement;t.style.height="auto";t.style.height=t.scrollHeight+"px";}}
                  />
                </div>
                <button onClick={cargando?stopEnvio:()=>enviar()} 
                  disabled={!cargando&&!input.trim()&&imagenesAdjuntas.length===0}
                  style={{background:cargando?C.warm:input.trim()&&!cargando?accentColor:C.border,border:"none",borderRadius:13,width:48,height:48,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.2s"}}>
                  {cargando?(
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
                      <rect x="4" y="4" width="16" height="16" rx="2"/>
                    </svg>
                  ):(
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                      <path d="M22 2L11 13" stroke={input.trim()?"#fff":C.muted} strokeWidth="2.5" strokeLinecap="round"/>
                      <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke={input.trim()?"#fff":C.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              </div>
              {sesionPendiente&&(
                <div style={{background:"#1A2A1A",border:"1px solid #4CAF50",borderRadius:12,padding:"12px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                  <div>
                    <p style={{color:"#4CAF50",fontSize:12,fontWeight:700,marginBottom:2}}>✅ Sesión detectada</p>
                    <p style={{color:"#9A9590",fontSize:11}}>{sesionPendiente.tipo} · {new Date(sesionPendiente.fecha).toLocaleDateString("es-ES")}</p>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={async()=>{
                      const res=await apiCall({action:"registrar_sesion",codigo:codigoUsuario,datos:{sesion:sesionPendiente}});
                      await apiCall({action:"marcar_sesion_completada",codigo:codigoUsuario,datos:{fecha:sesionPendiente.fecha,sesion:sesionPendiente}});
                      cargarPlanSemanal(codigoUsuario);
                      // FORGE SHARE CARDS — tras registrar con exito, ofrecer compartir. Los datos
                      // numericos (distancia/tiempo/ritmo/resultado) no siempre vienen estructurados
                      // del extractor todavia — el usuario puede completarlos en la propia Card si faltan.
                      setSesionParaCompartir(sesionPendiente);
                      setSesionPendiente(null);
                      if(res?.esPrimeraSesion){
                        setMensajes(prev=>[...prev,{role:"assistant",content:"🎉 **¡Primer entrenamiento registrado!**\n\nYa has empezado a construir tu historial. A partir de ahora Forge aprenderá de cada sesión para adaptar las siguientes.\n\nRevisa tu evolución en **Mi Historia** cuando quieras."}]);
                      } else {
                        // FORGE DISCOVERY ENGINE — se ejecuta en segundo plano tras cada entreno reportado
                        // (no bloquea al usuario, no espera respuesta). Con suficientes datos, puede
                        // generar un descubrimiento que se mostrara la proxima vez que abra el chat.
                        apiCall({action:"ejecutar_discovery_engine",codigo:codigoUsuario});
                      }
                    }} style={{background:"#4CAF50",color:"#fff",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                      {sesionPendiente.yaExiste ? "Actualizar" : "Registrar"}
                    </button>
                    {sesionPendiente.yaExiste && (
                      <button onClick={async()=>{
                        const sesionSegunda={...sesionPendiente,workout_id:`${sesionPendiente.workout_id}_2`};
                        await apiCall({action:"registrar_sesion",codigo:codigoUsuario,datos:{sesion:sesionSegunda}});
                        setSesionPendiente(null);
                      }} style={{background:"none",color:"#4CAF50",border:"1px solid #4CAF50",borderRadius:8,padding:"6px 10px",fontSize:11,cursor:"pointer"}}>
                        2ª sesión
                      </button>
                    )}
                    <button onClick={()=>setSesionPendiente(null)} style={{background:"none",color:"#9A9590",border:"1px solid #2A2A2A",borderRadius:8,padding:"6px 10px",fontSize:12,cursor:"pointer"}}>
                      Ignorar
                    </button>
                  </div>
                </div>
              )}

              {mensajes.length>0&&!cargando&&(
                <div style={{marginTop:8}}>
                  <button onClick={()=>setMostrarSugerencias(p=>!p)} style={{background:"none",border:"none",color:C.muted,fontSize:11,cursor:"pointer",padding:"4px 0",display:"flex",alignItems:"center",gap:4}}>
                    {mostrarSugerencias?"▲":"▼"} Mensajes rápidos
                  </button>
                  {mostrarSugerencias&&(
                    <div style={{display:"flex",gap:7,marginTop:6,flexWrap:"wrap"}}>
                      {(SUGERENCIAS[categoria||""]||[]).map(s=>(
                        <button key={s} className="sugg" onClick={()=>{enviar(s);setMostrarSugerencias(false);}} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:100,padding:"5px 13px",fontSize:12,color:C.muted,cursor:"pointer",transition:"all 0.15s"}}>{s}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* FORGE CARDS — banner para compartir un PR recien detectado */}
      {prPendienteCompartir&&(
        <div style={{position:"fixed",bottom:90,left:16,right:16,maxWidth:600,margin:"0 auto",background:"linear-gradient(135deg,#FF6B00,#c94f00)",borderRadius:16,padding:"14px 18px",zIndex:150,display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 8px 24px rgba(255,107,0,0.35)"}}>
          <div>
            <p style={{color:"#fff",fontSize:13,fontWeight:700}}>🏆 ¡Nuevo PR detectado!</p>
            <p style={{color:"#fff",fontSize:12,opacity:0.9}}>{prPendienteCompartir.ejercicio.replace(/_/g," ")}: {prPendienteCompartir.valor}</p>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={async()=>{
              const nombreEjercicio=prPendienteCompartir.ejercicio.replace(/_/g," ").toUpperCase();
              const resContexto=await apiCall({action:"generar_contexto_forge_card",codigo:codigoUsuario,datos:{tipoCard:"nuevo_pr",datosCard:{ejercicio:nombreEjercicio,valor:prPendienteCompartir.valor,mejora:prPendienteCompartir.mejora}}});
              // FORGE CARDS — detectar disciplina segun el ejercicio, para el glyph de fondo correcto
              const ejercicioLower=prPendienteCompartir.ejercicio.toLowerCase();
              const disciplinaDetectada=
                /snatch|clean|jerk|arrancada|cargada/.test(ejercicioLower) ? "halterofilia" :
                /squat|deadlift|bench|press|sentadilla|peso_muerto/.test(ejercicioLower) ? "fuerza" :
                /run|carrera|km|correr/.test(ejercicioLower) ? "carrera" :
                /bici|ciclismo|watt|ftp/.test(ejercicioLower) ? "ciclismo" : "crossfit";
              // Separar el numero de la unidad (ej: "158kg" -> "158" + "kg")
              const matchValorUnidad=prPendienteCompartir.valor.match(/^([\d.,]+)\s*([a-zA-Z]*)$/);
              const numeroSolo=matchValorUnidad?matchValorUnidad[1]:prPendienteCompartir.valor;
              const unidadSola=matchValorUnidad?matchValorUnidad[2]:"";
              setForgeCardData({
                achievementType:"pr",
                titulo:nombreEjercicio,
                valorPrincipal:numeroSolo,
                unidad:unidadSola||undefined,
                badge:prPendienteCompartir.mejora?`+${prPendienteCompartir.mejora} vs anterior`:undefined,
                fecha:new Date().toLocaleDateString("es-ES",{day:"2-digit",month:"short",year:"numeric"}).toUpperCase(),
                contexto:resContexto?.contexto||undefined,
                disciplina:disciplinaDetectada,
                progresion:prPendienteCompartir.progresion&&prPendienteCompartir.progresion.length>=2?prPendienteCompartir.progresion:undefined
              });
              setPrPendienteCompartir(null);
            }} style={{background:"#fff",color:C.accent,border:"none",borderRadius:10,padding:"8px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              Compartir
            </button>
            <button onClick={()=>setPrPendienteCompartir(null)} style={{background:"rgba(255,255,255,0.2)",color:"#fff",border:"none",borderRadius:10,padding:"8px 10px",fontSize:12,cursor:"pointer"}}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* FORGE CARDS — banner para compartir una semana completada al 100% */}
      {semanaPendienteCompartir&&(
        <div style={{position:"fixed",bottom:prPendienteCompartir?170:90,left:16,right:16,maxWidth:600,margin:"0 auto",background:"linear-gradient(135deg,#4CAF50,#2E7D32)",borderRadius:16,padding:"14px 18px",zIndex:150,display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 8px 24px rgba(76,175,80,0.35)"}}>
          <div>
            <p style={{color:"#fff",fontSize:13,fontWeight:700}}>✅ ¡Semana completada al 100%!</p>
            <p style={{color:"#fff",fontSize:12,opacity:0.9}}>{semanaPendienteCompartir.sesionesCompletadas}/{semanaPendienteCompartir.sesionesTotales} sesiones</p>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={async()=>{
              const resContexto=await apiCall({action:"generar_contexto_forge_card",codigo:codigoUsuario,datos:{tipoCard:"semana_completada",datosCard:{sesionesCompletadas:semanaPendienteCompartir.sesionesCompletadas,sesionesTotales:semanaPendienteCompartir.sesionesTotales}}});
              setForgeCardData({
                achievementType:"week",
                titulo:"SEMANA COMPLETADA",
                valorPrincipal:`${semanaPendienteCompartir.sesionesCompletadas}/${semanaPendienteCompartir.sesionesTotales}`,
                subtitulo:"100% de adherencia esta semana",
                fecha:new Date().toLocaleDateString("es-ES",{day:"2-digit",month:"short",year:"numeric"}).toUpperCase(),
                contexto:resContexto?.contexto||undefined
              });
              setSemanaPendienteCompartir(null);
            }} style={{background:"#fff",color:"#2E7D32",border:"none",borderRadius:10,padding:"8px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              Compartir
            </button>
            <button onClick={()=>setSemanaPendienteCompartir(null)} style={{background:"rgba(255,255,255,0.2)",color:"#fff",border:"none",borderRadius:10,padding:"8px 10px",fontSize:12,cursor:"pointer"}}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* FORGE CARDS — banner para compartir un hito de racha */}
      {rachaPendienteCompartir&&(
        <div style={{position:"fixed",bottom:(prPendienteCompartir?80:0)+(semanaPendienteCompartir?80:0)+90,left:16,right:16,maxWidth:600,margin:"0 auto",background:"linear-gradient(135deg,#FF6B00,#c94f00)",borderRadius:16,padding:"14px 18px",zIndex:150,display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 8px 24px rgba(255,107,0,0.35)"}}>
          <div>
            <p style={{color:"#fff",fontSize:13,fontWeight:700}}>🔥 ¡{rachaPendienteCompartir} días de racha!</p>
            <p style={{color:"#fff",fontSize:12,opacity:0.9}}>Constancia sin interrupciones</p>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={async()=>{
              const resContexto=await apiCall({action:"generar_contexto_forge_card",codigo:codigoUsuario,datos:{tipoCard:"racha",datosCard:{dias:rachaPendienteCompartir}}});
              setForgeCardData({
                achievementType:"streak",
                titulo:"RACHA",
                valorPrincipal:`${rachaPendienteCompartir}`,
                subtitulo:"días consecutivos entrenando",
                fecha:new Date().toLocaleDateString("es-ES",{day:"2-digit",month:"short",year:"numeric"}).toUpperCase(),
                contexto:resContexto?.contexto||undefined
              });
              setRachaPendienteCompartir(null);
            }} style={{background:"#fff",color:C.accent,border:"none",borderRadius:10,padding:"8px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              Compartir
            </button>
            <button onClick={()=>setRachaPendienteCompartir(null)} style={{background:"rgba(255,255,255,0.2)",color:"#fff",border:"none",borderRadius:10,padding:"8px 10px",fontSize:12,cursor:"pointer"}}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* FORGE CARDS — banner para compartir un objetivo conseguido */}
      {objetivoPendienteCompartir&&(
        <div style={{position:"fixed",bottom:(prPendienteCompartir?80:0)+(semanaPendienteCompartir?80:0)+(rachaPendienteCompartir?80:0)+90,left:16,right:16,maxWidth:600,margin:"0 auto",background:"linear-gradient(135deg,#4CAF50,#2E7D32)",borderRadius:16,padding:"14px 18px",zIndex:150,display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 8px 24px rgba(76,175,80,0.35)"}}>
          <div>
            <p style={{color:"#fff",fontSize:13,fontWeight:700}}>🎯 ¡Objetivo conseguido!</p>
            <p style={{color:"#fff",fontSize:12,opacity:0.9}}>{objetivoPendienteCompartir.objetivo}</p>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={async()=>{
              const resContexto=await apiCall({action:"generar_contexto_forge_card",codigo:codigoUsuario,datos:{tipoCard:"objetivo_conseguido",datosCard:{objetivo:objetivoPendienteCompartir.objetivo}}});
              setForgeCardData({
                achievementType:"goal",
                titulo:"OBJETIVO CONSEGUIDO",
                valorPrincipal:objetivoPendienteCompartir.resultado,
                subtitulo:objetivoPendienteCompartir.objetivo,
                fecha:new Date().toLocaleDateString("es-ES",{day:"2-digit",month:"short",year:"numeric"}).toUpperCase(),
                contexto:resContexto?.contexto||undefined
              });
              setObjetivoPendienteCompartir(null);
            }} style={{background:"#fff",color:"#2E7D32",border:"none",borderRadius:10,padding:"8px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              Compartir
            </button>
            <button onClick={()=>setObjetivoPendienteCompartir(null)} style={{background:"rgba(255,255,255,0.2)",color:"#fff",border:"none",borderRadius:10,padding:"8px 10px",fontSize:12,cursor:"pointer"}}>
              ✕
            </button>
          </div>
        </div>
      )}

      {forgeCardData&&(
        <ForgeCardsGenerator initialData={forgeCardData} onClose={()=>setForgeCardData(null)} />
      )}

      {suenoConfirmado&&(
        <div style={{position:"fixed",bottom:90,left:16,right:16,maxWidth:600,margin:"0 auto",background:"linear-gradient(135deg,#4CAF50,#2E7D32)",borderRadius:16,padding:"12px 16px",zIndex:150,display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 8px 24px rgba(76,175,80,0.35)"}}>
          <div>
            <p style={{color:"#fff",fontSize:12,fontWeight:700}}>✅ Métricas de sueño guardadas</p>
            <p style={{color:"#fff",fontSize:11,opacity:0.9}}>{Object.entries(suenoConfirmado.valores).map(([k,v])=>`${k.toUpperCase()}: ${v}`).join(" · ")}</p>
          </div>
          <button onClick={()=>setSuenoConfirmado(null)} style={{background:"rgba(255,255,255,0.2)",color:"#fff",border:"none",borderRadius:10,padding:"6px 10px",fontSize:12,cursor:"pointer"}}>
            ✕
          </button>
        </div>
      )}

      {sesionParaCompartir&&(()=>{
        // FORGE SHARE CARDS PARSER — determinista, sin LLM. Extrae distancia/tiempo/ritmo/FC del
        // texto libre de "notas" o "analisis" cuando el formato es reconocible. Si no encuentra
        // nada, la Card simplemente muestra los campos vacios y el usuario puede completarlos.
        const textoFuente=`${sesionParaCompartir.notas||""} ${sesionParaCompartir.analisis||""}`;
        // FIX: ampliar deteccion de disciplina "carrera" para reconocer tipos especificos de sesion que
// el Coach genera habitualmente (fartlek, intervalos, series, rodaje, tempo, umbral) y que antes
// caian por defecto en CrossFit, perdiendo los datos de distancia/ritmo/FC ya extraidos.
const esCarrera=/carrera|running|correr|fartlek|intervalos|series|rodaje|tempo|umbral|trote|pista|maraton|10k|5k/i.test(sesionParaCompartir.tipo||"");
        const fechaFormateada=new Date(sesionParaCompartir.fecha).toLocaleDateString("es-ES",{day:"2-digit",month:"short",year:"numeric"}).toUpperCase();

        const matchDistancia=textoFuente.match(/(\d+(?:[.,]\d+)?)\s*(?:km|kilometros)/i);
        const matchIntervalos=textoFuente.match(/(\d+\s*x\s*\d+)\s*m(?:etros)?/i);
        const matchTiempo=textoFuente.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:min|minutos|h)?/);
        const matchRitmo=textoFuente.match(/(\d{1,2}:\d{2})\s*\/\s*km/i);
        const matchFcMedia=textoFuente.match(/fc\s*media\s*(\d{2,3})/i)||textoFuente.match(/(\d{2,3})\s*(?:ppm|bpm)\s*media/i);
        const matchFcMax=textoFuente.match(/fc\s*m[aá]x(?:ima)?\s*(\d{2,3})/i)||textoFuente.match(/(\d{2,3})\s*(?:ppm|bpm)\s*m[aá]x/i);
        const matchDesnivel=textoFuente.match(/(\d+)\s*m?\s*(?:de\s*)?(?:desnivel|d\+)/i);

        const matchResultadoTiempo=textoFuente.match(/(?:en|resultado)\s*(\d{1,2}:\d{2})/i);
        const matchResultadoReps=textoFuente.match(/(\d+)\s*(?:rondas|rounds|reps)/i);

        return (
          <WorkoutShareCard
            disciplina={esCarrera?"carrera":"crossfit"}
            fecha={fechaFormateada}
            running={esCarrera?{
              distancia:matchDistancia?.[1]?.replace(",",".")||undefined,
              intervalos:matchIntervalos?.[1]?.replace(/\s+/g,"")||undefined,
              tiempo:matchTiempo?.[1]||undefined,
              ritmo:matchRitmo?.[1]||undefined,
              fcMedia:matchFcMedia?.[1]||undefined,
              fcMax:matchFcMax?.[1]||undefined,
              desnivel:matchDesnivel?.[1]||undefined,
            }:undefined}
            crossfit={!esCarrera?{
              nombreWod:sesionParaCompartir.tipo,
              resultado:matchResultadoTiempo?.[1]||(matchResultadoReps?`${matchResultadoReps[1]} rondas`:undefined),
              movimientos:sesionParaCompartir.notas?.substring(0,90),
            }:undefined}
            onClose={()=>setSesionParaCompartir(null)}
          />
        );
      })()}

      {/* Navegacion inferior fija, consistente con el resto de la app */}
      {pantalla==="chat"&&codigoUsuario&&(
        <>
          {mostrarMasChat&&(
            <div onClick={()=>setMostrarMasChat(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:200}}>
              <div onClick={e=>e.stopPropagation()} style={{position:"absolute",bottom:74,left:16,right:16,maxWidth:600,margin:"0 auto",background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:8}}>
                <a href={`/historia?codigo=${codigoUsuario}`} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",textDecoration:"none",borderRadius:10}}>
                  <span style={{fontSize:18}}>📖</span>
                  <span style={{fontSize:14,fontWeight:600,color:C.ink}}>Mi Historia</span>
                </a>
                <a href="https://t.me/forgeapp_es" target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",textDecoration:"none",borderRadius:10}}>
                  <span style={{fontSize:18}}>🧪</span>
                  <span style={{fontSize:14,fontWeight:600,color:C.ink}}>Forge Labs</span>
                </a>
                <a href={`/perfil?codigo=${codigoUsuario}`} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:"none",border:"none",cursor:"pointer",borderRadius:10,textAlign:"left",textDecoration:"none"}}>
                  <span style={{fontSize:18}}>⚙️</span>
                  <span style={{fontSize:14,fontWeight:600,color:C.ink}}>Mi Perfil</span>
                </a>
              </div>
            </div>
          )}
          <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#141414",borderTop:`1px solid ${C.border}`,padding:"10px 16px calc(10px + env(safe-area-inset-bottom))",display:"flex",justifyContent:"space-around",maxWidth:600,margin:"0 auto",zIndex:201}}>
            {[
              {href:`/hoy?codigo=${codigoUsuario}`,icon:"🏠",label:"Hoy",active:false},
              {href:`/progreso?codigo=${codigoUsuario}`,icon:"📈",label:"Progreso",active:false},
              {href:`/plan?codigo=${codigoUsuario}`,icon:"📅",label:"Plan",active:false},
              {href:`/atleta?codigo=${codigoUsuario}`,icon:"👤",label:"Atleta",active:false},
            ].map(item=>(
              <a key={item.label} href={item.href} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,textDecoration:"none",opacity:0.5}}>
                <span style={{fontSize:20}}>{item.icon}</span>
                <span style={{fontSize:10,fontWeight:600,color:C.muted}}>{item.label}</span>
              </a>
            ))}
            <button onClick={()=>setMostrarMasChat(true)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",opacity:1}}>
              <span style={{fontSize:20}}>☰</span>
              <span style={{fontSize:10,fontWeight:600,color:C.accent}}>Más</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

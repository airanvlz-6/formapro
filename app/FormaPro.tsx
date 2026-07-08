'use client';
import { useState, useRef, useEffect } from "react";

const C = {
  bg: "#0D0D0D", card: "#1A1A1A", ink: "#F0EDE8", muted: "#9A9590",
  border: "#2A2A2A", accent: "#FF6B00", accentLight: "#2A1A0D",
  warm: "#FF6B00", warmLight: "#2A1A0D", tag: "#222222", success: "#4CAF50", successLight: "#1A2A1A",
  orange: "#FF6B00", orangeLight: "#2A1A0D",
};

const CATEGORIAS = [
  { id: "funcional", emoji: "⚡", titulo: "Functional Training", subtitulo: "CrossFit · Hyrox · Fitness Funcional", desc: "Entrenamientos adaptados a tu nivel, estado fisiológico y puntos débiles para mejorar rendimiento, capacidad de trabajo y recuperación.", color: "#2D6A4F", colorLight: "#D8F3DC", etiqueta: "Más popular" },
  { id: "carrera", emoji: "🏃", titulo: "Carrera", subtitulo: "Running & Trail", desc: "Planificación inteligente basada en ritmos, zonas de frecuencia cardíaca, volumen y objetivos. Forge adapta cada sesión según tu recuperación y evolución.", color: "#1A3C5E", colorLight: "#E8EEF4", etiqueta: "Especialidad" },
  { id: "fuerza", emoji: "🏋️", titulo: "Fuerza", subtitulo: "Powerlifting · Halterofilia · Strongman", desc: "Desarrolla fuerza máxima mediante periodización, control de cargas, técnica y seguimiento continuo de tus marcas personales.", color: "#B5300B", colorLight: "#FDECEA", etiqueta: "Especialidad" },
  { id: "hibrido", emoji: "🔄", titulo: "Híbrido", subtitulo: "Resistencia + Fuerza", desc: "Equilibra ambas capacidades sin interferencias, combinando sesiones para progresar en las dos disciplinas al mismo tiempo.", color: "#6B3FA0", colorLight: "#EDE7F6", etiqueta: "Avanzado" },
];

const FORMULARIOS: Record<string, Array<{id: string; label: string; tipo: string; opciones?: string[]; placeholder?: string}>> = {
  carrera: [
    { id: "edad", label: "¿Cuántos años tienes?", tipo: "opciones", opciones: ["Menos de 20", "20-30", "31-40", "41-50", "Mas de 50"] },
    { id: "sexo", label: "¿Con que género te identificas?", tipo: "opciones", opciones: ["Hombre", "Mujer", "Prefiero no decirlo"] },
    { id: "nivel", label: "¿Cual es tu experiencia en carrera?", tipo: "opciones", opciones: ["Inicio ahora (0-3 meses)", "Principiante (3-12 meses)", "Intermedio (1-3 años)", "Avanzado (+3 años)"] },
    { id: "distancia_objetivo", label: "¿Cual es tu distancia objetivo?", tipo: "opciones", opciones: ["5K", "10K", "Media maratón (21K)", "Maratón (42K)", "Trail / Ultra", "Sin distancia fija"] },
    
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
    
    { id: "competicion", label: "¿Tienes competición o fecha objetivo?", tipo: "opciones", opciones: ["Si, en menos de 3 meses", "Si, en 3-6 meses", "Si, en mas de 6 meses", "No compito"] },
    { id: "dias", label: "¿Cuántos días puedes entrenar fuerza?", tipo: "opciones", opciones: ["3 dias", "4 dias", "5 dias", "6 dias"] },
    { id: "duracion", label: "¿Cuánto tiempo por sesión?", tipo: "opciones", opciones: ["1 hora", "1h 30min", "2 horas", "Mas de 2 horas"] },
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

const buildPrompt = (cat: {id: string; titulo: string}, perfil: Record<string, string | string[]>, marcas: {fecha: string; valor: string}[] = [], historialResumen: string = "", memoria?: {lesiones?:string; plan?:string; notas?:string}, ciclo?: {bloque?:string; semana?:number; totalSemanas?:number; objetivo?:string}, psicologia?: {arousal?:string; confianza?:string; estres?:string; motivacion?:string; notas_mentales?:string}, premium?: boolean, athleteState?: Record<string,any>, datosEntreno?: Record<string,any>, estadoFisio?: {fatiga_aguda?:number;fatiga_cronica?:number;tendencia?:string;hrv?:number;sueno?:number;rhr?:number;adherencia?:number}, histFisio?: {fecha:string;hrv?:number;sueno?:number;rhr?:number}[], distribucion?: string, objetivo?: {descripcion?:string;fecha?:string;tipo?:string}, planSemana?: any, debilidadesAtleta?: {ejercicio:string;descripcion:string;fecha:string}[], historialBloques?: any[]) => {
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
FLUJO DE ESTADOS DE DESARROLLO — SEGUIMIENTO OBLIGATORIO: Cada área de desarrollo avanza por estados: activa (recién detectada, sin cambios aún) → en_intervencion (ya hay trabajo específico en el plan) → en_progreso (primeras mejoras detectadas) → validando (mejora sostenida 2-3 semanas, verificando que se mantiene) → resuelta (evidencia clara y sostenida de que la limitación ya no condiciona el rendimiento). NUNCA marques "resuelta" solo porque ha pasado tiempo — solo cuando las evidencias ORIGINALES ya no se repitan (ej: si la evidencia era "series 2-3 reps en Murph" y ahora reporta "8-10 reps", ahí sí hay evidencia de mejora real).
Cuando detectes avance en una debilidad ya registrada, añade: [ACTUALIZAR_DEBILIDAD:{"indicador":"nombre exacto ya registrado","estado":"en_intervencion|en_progreso|validando|resuelta","progreso":número 0-100 estimado según cuánto ha mejorado,"confianza":número actualizado,"nueva_evidencia":"qué demuestra el cambio de estado"}]. Sé conservador — es mejor progreso lento y real que optimista y falso. Genera este tag cuando detectes o el atleta mencione una debilidad, limitación técnica, o área a mejorar. 
Cuando detectes que una debilidad ya registrada ha MEJORADO significativamente (marca superada, mayor volumen tolerado, mejor técnica reportada), añade: [ACTUALIZAR_DEBILIDAD:{"indicador":"nombre exacto ya registrado","estado":"en_progreso|resuelta","confianza":número actualizado,"nueva_evidencia":"qué demuestra la mejora"}].
SIEMPRE que planifiques sesiones futuras, revisa las debilidades activas del atleta (verás "DEBILIDADES DEL ATLETA" en tu contexto) e incorpora trabajo específico coherente con el bloque actual — no las ignores tras varios mensajes.
BENCHMARKS CROSSFIT — REGISTRO OBLIGATORIO: Si el atleta reporta haber completado un benchmark conocido de CrossFit (Fran, Murph, Cindy, Grace, Helen, Diane, Jackie, Angie, Annie, DT, Eva, Chelsea, Nancy, Amanda, Elizabeth, Kelly, Karen, Isabel, Linda, Mary, Barbara, o cualquier WOD nombrado con mayúscula que sea benchmark reconocido), además de [SESION:] añade también: [EVENTO:{"date":"YYYY-MM-DD","type":"pr","title":"nombre benchmark: resultado (ej: Cindy: 22 rondas)","data":{"ejercicio":"benchmark_nombreminusculas","valor":"resultado con unidad (rondas, tiempo, reps)"}}]. Esto permite comparar el progreso del atleta en ese benchmark específico con el tiempo.
GESTIÓN DE SESIONES — DETECCIÓN ESTRICTA: SOLO genera el tag [SESION:] cuando el atleta use frases de FINALIZACIÓN clara SOBRE UN ENTRENAMIENTO: "he terminado", "completé", "ya entrené", "acabo de hacer", "WOD completado", "entreno realizado", "hice el entreno". NUNCA lo generes si: (a) el atleta solo pregunta sobre una sesión futura, (b) pide detalles, (c) menciona la palabra "sesión" sin confirmar que la completó, (d) el mensaje es exclusivamente un reporte de MÉTRICAS DE SUEÑO/RECUPERACIÓN NOCTURNA sin mención de entrenamiento. Un mensaje que solo hable de sueño, HRV nocturna, FC reposo NUNCA debe generar [SESION:]. Formato: [SESION:{"tipo":"tipo de sesión","fecha":"YYYY-MM-DDThh:mm:ss.000Z — usa SIEMPRE la fecha de HOY (la indicada en [Fecha actual del sistema]) salvo que el atleta mencione explícitamente otra fecha","notas":"resumen breve","duracion":null,"sensacion":"buena|normal|mala","analisis":"UNA frase breve con tu análisis técnico"}].
RESPUESTA TRAS REPORTAR SESIÓN — FORMATO OBLIGATORIO BREVE: Cuando el atleta reporte una sesión completada, tu respuesta debe ser SOLO: 1) Una frase breve de feedback sobre lo reportado (máx 2 líneas). 2) Invita a revisar la sesión de mañana en Mi Plan, ejemplo: "Revisa mañana en Mi Plan — ¿tienes alguna duda?". NUNCA repitas el contenido completo de la siguiente sesión (calentamiento, bloque principal, etc.) — esa información ya vive en Mi Plan. Si el atleta pregunta específicamente por detalles de la sesión de mañana, ahí sí puedes explicarla.
CIERRE DE SEMANA — FLUJO OBLIGATORIO: Si la sesión que el atleta acaba de reportar es la ÚLTIMA sesión planificada de la semana actual en el plan (revisa "PLAN SEMANAL ACTUAL EN MI PLAN" — si todos los días con sesión ya están marcados como completados tras este reporte), en vez de la respuesta breve habitual, haz esto: 1) Da el feedback breve de la sesión. 2) Genera un RESUMEN DE LA SEMANA: sesiones completadas vs planificadas, tendencia fisiológica general, qué se consiguió, en qué hay que seguir trabajando (máximo 5-6 líneas). 3) Añade el tag: [RESUMEN_SEMANA:{"week_start":"YYYY-MM-DD","resumen":"el resumen completo","adherencia":"X/Y sesiones"}]. 4) Propón brevemente la distribución de la semana siguiente y pregunta "¿Confirmas esta distribución para la próxima semana?". Cuando el atleta confirme, sigue el flujo normal de PLAN SEMANAL para generar el tag [PLAN:] de la nueva semana.
CIERRE DE BLOQUE — MEMORIA METODOLÓGICA: Cuando detectes que el bloque actual ha terminado (última semana del bloque completada, o el atleta confirma pasar a un nuevo bloque tipo acumulación/intensificación/realización/deload), además del resumen semanal normal, añade: [BLOCK_OUTCOME:{"tipo_bloque":"nombre del bloque que termina","duracion_semanas":número,"objetivo":"objetivo que tenía este bloque","adherencia":número 0-100,"fatiga_media":"baja|media|alta","sesiones_completadas":número,"pr_obtenidos":número de nuevos PRs durante el bloque,"debilidades_resueltas":número de áreas de desarrollo resueltas durante el bloque,"lesiones":true|false,"resultado_global":"excelente|bueno|regular|deficiente","fecha_inicio":"YYYY-MM-DD","fecha_fin":"YYYY-MM-DD"}].
ANTES de diseñar un nuevo bloque, SIEMPRE revisa la sección "HISTORIAL DE BLOQUES ANTERIORES" en tu contexto (si existe) y usa esa información para decidir parámetros como duración óptima, volumen, o tipo de estímulo — replica lo que funcionó bien (adherencia alta, resultado excelente, baja fatiga) y evita repetir lo que generó fatiga muy alta o resultado deficiente. Menciona brevemente este razonamiento al atleta cuando sea relevante (ej: "Los bloques de 4 semanas te han funcionado mejor que los de 5").
INTERVENCIONES ESPECÍFICAS: Cuando detectes un problema puntual (ej: fatiga alta un día concreto) y apliques una solución específica (ej: mover una sesión), y MÁS TARDE confirmes que esa solución funcionó (HRV recuperado, adherencia mejorada), añade: [INTERVENTION:{"problema":"descripción breve del problema detectado","accion":"qué hiciste para solucionarlo","resultado":"qué pasó después","efectividad":"alta|media|baja"}].
REGLA DE CAPAS — NUNCA VIOLAR: Los principios científicos fijos (periodización, sobrecarga progresiva, deload, zonas de entrenamiento, recuperación) NUNCA cambian por resultados de un solo atleta o bloque. Lo que SÍ puede adaptarse con la memoria metodológica es: duración de bloques, distribución semanal, volumen, tipo de WOD, orden de ejercicios, y qué intervenciones funcionan mejor para corregir debilidades específicas de este atleta.
Si el usuario reporta métricas fisiológicas pasadas con fecha (HRV, sueño, FC reposo de días anteriores), añade: [METRICA:{"fecha":"YYYY-MM-DD","hrv":null,"sueno":null,"rhr":null}]. Si el usuario pide borrar una sesión por fecha, añade: [BORRAR_SESION:{"fecha":"YYYY-MM-DD","tipo":"tipo mencionado"}].
HISTORIA DEPORTIVA — OBLIGATORIO: SIEMPRE que el atleta reporte un nuevo récord personal (RM, mejor tiempo, mejor marca en cualquier ejercicio), DEBES añadir AL FINAL de tu respuesta, sin excepción: [EVENTO:{"date":"YYYY-MM-DD","type":"pr","title":"Nombre del ejercicio + valor","data":{"ejercicio":"nombre_normalizado","valor":"valor con unidad"}}]. Esto aplica también a competiciones, lesiones, enfermedades, cambios de objetivo, viajes. NUNCA omitas este tag cuando confirmes haber "registrado" o "guardado" algo en el progreso del atleta.
PLAN SEMANAL — FLUJO OBLIGATORIO:
1. Cuando el usuario pida la planificación semanal, muestra PRIMERO un resumen breve de cada día (máx 2 líneas por sesión) y pregunta: "¿Confirmas esta distribución?"
2. REGLA TÉCNICA OBLIGATORIA — SIN ESTO EL SISTEMA FALLA: Cuando el usuario confirme el plan semanal, tu respuesta de confirmación DEBE contener el bloque de código [PLAN:{...}] con el JSON completo. NUNCA digas "guardado" o "confirmado" sin incluir literalmente ese bloque [PLAN:...] en el mismo mensaje — decir que está guardado sin el tag es un ERROR GRAVE que rompe la aplicación. El formato exacto que debes escribir, carácter por carácter, al INICIO de tu mensaje de confirmación es: [PLAN:{"week_start":"YYYY-MM-DD del lunes","week_number":X,"total_weeks_block":número total de semanas de este bloque,"block_name":"nombre bloque","week_objective":"UNA frase clara del objetivo de esta semana concreta, ej: Mejorar capacidad aeróbica sin comprometer recuperación","sessions":[{"dia":"lunes","tipo":"carrera|box|descanso|otro","titulo":"título breve","por_que":"UNA frase clara explicando el propósito de esta sesión concreta en el contexto del bloque y objetivo","descripcion":"SESIÓN COMPLETA: Calentamiento: X. Bloque principal: Y (series, reps, intensidad, zonas FC). Vuelta a la calma: Z. Notas técnicas: W."},...]}]. Incluye los 7 días con sesión completa. Después del tag confirma al usuario que el plan está guardado e invítale a verlo en Mi Plan.
REGLA CRÍTICA OBLIGATORIA: Cada vez que el atleta CONFIRME un cambio de sesión respecto a lo ya planificado en Mi Plan (eligiendo una opción A/B, diciendo "sí", "confirmo", "vale" tras tu propuesta de ajuste), DEBES incluir SIN EXCEPCIÓN al final de tu respuesta: [MODIFICAR_SESION:{"week_start":"YYYY-MM-DD del lunes de esa semana","dia":"nombre del día en minúsculas sin tildes (miercoles no miércoles)","tipo":"tipo de sesión","titulo":"título breve","motivo":"por qué se modificó","descripcion":"sesión completa con todos los detalles","confidence":número 0-100 según magnitud del cambio}]. NUNCA olvides este tag tras una confirmación de cambio. Sin este tag el cambio NO se guarda y el atleta verá información incorrecta en Mi Plan.
MODIFICACIÓN DE SESIONES — REGLA OBLIGATORIA:
- Cuando detectes que una sesión debe modificarse (por HRV bajo, mal sueño, fatiga acumulada, lesión, etc.) NUNCA la cambies sin avisar primero.
- Informa al atleta: "Basándome en [motivo concreto], propongo modificar [día] de [sesión original] a [sesión modificada]. ¿Confirmas?"
- Solo tras confirmación explícita del atleta añade: [MODIFICAR_SESION:{"week_start":"YYYY-MM-DD","dia":"lunes","tipo":"nuevo tipo","titulo":"nuevo título","motivo":"razón clara","descripcion":"sesión completa modificada"}]
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

FECHA HOY: ${new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Europe/Madrid" })}
PROXIMOS 14 DIAS: ${Array.from({length:14},(_,i)=>{const d=new Date();d.setDate(d.getDate()+i+1);return d.toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long",timeZone:"Europe/Madrid"});}).join(" | ")}
🚨 FECHA ACTUAL — VERIFICACIÓN OBLIGATORIA: HOY es ${new Date().toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Europe/Madrid"})}. Antes de mencionar cualquier día de la semana (hoy, mañana, ayer, el próximo día X), verifica mentalmente contra esta fecha exacta. NUNCA calcules qué día es por tu cuenta ni asumas basándote en mensajes anteriores de la conversación — usa SIEMPRE esta fecha como única referencia. Si vas a decir "mañana es viernes", primero confirma: ¿hoy es realmente jueves según la fecha de arriba? La semana natural empieza el LUNES y termina el DOMINGO. Esta semana: lunes ${new Date(new Date().setDate(new Date().getDate()-(new Date().getDay()||7)+1)).toLocaleDateString("es-ES",{day:"numeric",month:"long",timeZone:"Europe/Madrid"})} a domingo ${new Date(new Date().setDate(new Date().getDate()-(new Date().getDay()||7)+7)).toLocaleDateString("es-ES",{day:"numeric",month:"long",timeZone:"Europe/Madrid"})}.
🚨 SECUENCIA TEMPORAL — REGLA CRÍTICA CON EJEMPLO EXACTO DEL ERROR A EVITAR:
El sueño reportado SIEMPRE ocurrió ANTES de cualquier entrenamiento del día actual. Es IMPOSIBLE que un entrenamiento de HOY afecte al sueño que ya pasó ANTES de ese entrenamiento.
❌ ERROR QUE HAS COMETIDO Y DEBES DEJAR DE COMETER: decir frases como "tu HRV bajó debido a la carga de la [actividad de hoy]" o "recuperación tras [entreno de hoy]" cuando el sueño reportado es de ANOCHE — esto es cronológicamente IMPOSIBLE porque anoche aún no había pasado el entreno de hoy.
✅ CORRECTO: si el atleta reporta sueño de anoche Y también reportó un entreno hoy, di algo como "tu sueño de anoche refleja cómo llegaste a la sesión de hoy" o simplemente analiza el sueño de forma aislada sin conectarlo con actividad del mismo día.
✅ La ÚNICA causa válida para explicar un HRV/sueño bajo es: actividad de DÍAS ANTERIORES (ayer o antes), estrés, enfermedad, alcohol, mala alimentación — NUNCA la actividad del día en curso que aún no ha terminado o que ocurrió DESPUÉS del sueño.
ANTES de escribir cualquier frase que relacione sueño con entrenamiento, verifica: ¿el entrenamiento que menciono ocurrió ANTES o DESPUÉS de la noche de este sueño? Si ocurrió el mismo día o después, esa relación causal es IMPOSIBLE y no debes escribirla.
DISPONIBILIDAD DEL ATLETA — REGLA CRÍTICA: Antes de programar cualquier sesión, consulta el perfil del atleta y respeta ESTRICTAMENTE sus días disponibles, horarios y lugar de entrenamiento. NUNCA programes una sesión en un día que el atleta no ha indicado como disponible. Si el perfil indica "lunes no disponible" o "solo box martes y jueves", respeta eso sin excepciones. La disponibilidad es una restricción inamovible, no una sugerencia.
${debilidadesAtleta&&debilidadesAtleta.length>0?`
🎯 DEBILIDADES DEL ATLETA — TENER EN CUENTA AL PLANIFICAR:
${debilidadesAtleta.map(d=>`- ${d.ejercicio}: ${d.descripcion}`).join("\n")}
Incorpora trabajo específico para estas debilidades cuando sea coherente con el bloque actual.`:""}
${historialBloques&&historialBloques.length>0?"📊 MEMORIA METODOLÓGICA — HISTORIAL DE BLOQUES ANTERIORES DE ESTE ATLETA:\n"+historialBloquesStr+"\nUSA esta información al diseñar nuevos bloques: repite duraciones y volúmenes que dieron resultado excelente o bueno con baja fatiga, evita repetir lo que generó fatiga muy alta o resultado deficiente. NUNCA violes principios científicos fijos por estos datos, solo ajusta parámetros adaptables.":""}
${planSemana&&planSemana.sessions?`
📅 PLAN SEMANAL ACTUAL EN "MI PLAN" — ESTA ES LA ÚNICA FUENTE DE VERDAD:
Bloque: ${planSemana.block_name} · Semana ${planSemana.week_number}${planSemana.total_weeks_block?` de ${planSemana.total_weeks_block}`:""}
Objetivo semana: ${planSemana.week_objective||"no definido"}
${planSemana.sessions.map((s:any)=>`\n### ${s.dia.toUpperCase()} ###\nTítulo: ${s.titulo}\nContenido completo: ${s.descripcion||"no detallado"}\nPor qué: ${s.por_que||""}${s.completada?`\n[YA COMPLETADO — reportó: ${s.titulo_real||""}: ${s.descripcion_real||""}]`:""}${s.modificado?`\n[MODIFICADO: ${s.motivo_modificacion}]`:""}`).join("\n")}
REGLA CRÍTICA ABSOLUTA: Esta es la planificación REAL y VIGENTE. Cuando el atleta pregunte por la sesión de cualquier día, SIEMPRE responde basándote EXACTAMENTE en esta lista, nunca inventes ni generes una sesión diferente. Si un día ya está marcado como completado, NO lo vuelvas a prescribir — pregunta si necesita algo más o pasa al siguiente día pendiente. Si no existe plan para un día futuro lejano, dilo claramente en vez de inventar contenido. VERIFICACIÓN OBLIGATORIA: antes de hablar de la sesión de hoy, revisa si el día de hoy en la lista anterior tiene la marca YA COMPLETADO junto a él. Si la tiene, el atleta ya terminó esa sesión — nunca la vuelvas a proponer como pendiente ni digas 'sin cambios' para hoy. Cualquier análisis de sueño posterior debe hablar de la sesión de MAÑANA, no repetir la de hoy que ya se completó.`:"⚠️ NO HAY PLAN SEMANAL GUARDADO EN MI PLAN. Si el atleta pregunta por una sesión, indícale que no tienes un plan guardado para esta semana y sugiere generarlo."}

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
${({"carrera":`ESPECIALIDAD RUNNING: Ciclos 4sem (3 carga+1 descarga), progresion vol max 10%/sem, zonas Z1-Z5, rodaje largo+series+fuerza complementaria.`,"carrera_trail":`ESPECIALIDAD TRAIL: Trabajo de desnivel, tecnica bajada, fuerza excentrica, progresion desnivel acumulado.`,"funcional":`ESPECIALIDAD FITNESS: Bloques 4-6sem, movilidad+activacion+principal+finisher metabolico, patrones empuje/tiron/bisagra/sentadilla/core.`,"funcional_crossfit":`ESPECIALIDAD CROSSFIT: Halterofilia tecnica (60-80% 1RM) + WOD diario con escalados + accesorios gimnasticos con progresiones especificas + movilidad.`,"funcional_calistenia":`ESPECIALIDAD CALISTENIA: Progresiones por habilidad (planche, front lever, muscle-up, handstand), fuerza empuje/tiron, movilidad especifica.`,"hibrido_general":`ESPECIALIDAD HIBRIDO: Bloques minimizando interferencia, fuerza 80-90% 1RM + resistencia Z2/umbral/VO2max.`,"hibrido_hyrox":`ESPECIALIDAD HYROX: Running especifico + entrenamiento por estaciones (SkiErg, sled, burpees, wall balls, rowing, farmers, sandbag) + simulaciones + fuerza base.`,"hibrido_triatlon":`ESPECIALIDAD TRIATLON: Natacion+ciclismo+carrera equilibrados segun nivel y punto debil, brick workouts, fases base/desarrollo/especifico/taper.`,"hibrido_ocr":`ESPECIALIDAD OCR: Carrera en terreno irregular + obstaculos (agarre, escalada, arrastre) + fuerza funcional + grip especifico.`,"fuerza_powerlifting":`ESPECIALIDAD POWERLIFTING: SQ/BP/DL con progresion lineal (principiantes), DUP/5-3-1 (intermedios), bloques acumulacion/intensificacion/realizacion (avanzados), % 1RM o RPE.`,"fuerza_halterofilia":`ESPECIALIDAD HALTEROFILIA: Arrancada y 2T con trabajo tecnico submaximo (60-75%), series de potencia, fuerza base (sentadilla frontal, tiron, press).`,"fuerza_strongman":`ESPECIALIDAD STRONGMAN: Fuerza base + implementos disponibles (log, yoke, farmer, stones) + acondicionamiento eventos + grip.`,"grupos_crossfit":`ESPECIALIDAD BOX CROSSFIT: Eres coach de coaches. Genera programaciones de box completas con estructura: calentamiento + fuerza/halterofilia + WOD + vuelta a la calma. Incluye escalados para todos los niveles. Varía estímulos diarios evitando repetición. Usa terminología CrossFit.`,"grupos_fitness":`ESPECIALIDAD SALA FITNESS: Genera sesiones para grupos con estructura clara: calentamiento + bloque principal + vuelta a la calma. Adapta al nivel del grupo y material disponible. Incluye variantes para distintos niveles dentro del mismo grupo.`,"grupos_funcional":`ESPECIALIDAD CLASES GRUPALES: Genera clases dinámicas con variedad de estímulos. Estructura: activación + circuito principal + finisher. Proporciona variantes de cada ejercicio (fácil/difícil) para que el coach pueda adaptar en clase.`,"grupos_deporte":`ESPECIALIDAD EQUIPO DEPORTIVO: Genera programación de preparación física específica al deporte. Incluye fuerza, potencia, resistencia y prevención de lesiones según la fase de temporada. Adapta el volumen a los días disponibles sin interferir con los entrenamientos técnicos.`,"rehabilitacion_general":`ESPECIALIDAD REHABILITACIÓN: Genera protocolos de ejercicios de movilidad, activación y fortalecimiento progresivo basados en evidencia científica, adaptados a la zona, tipo de molestia y fase reportada. Estructura por fases: 1) Alivio y movilidad sin dolor, 2) Activación y control motor, 3) Fortalecimiento progresivo, 4) Retorno funcional a la actividad. Progresa solo cuando no hay dolor en la fase actual. Incluye criterios claros de progresión (ej: "si realizas esto sin dolor durante 3 días, pasa a la siguiente fase"). 
SEÑALES DE ALARMA: Si el usuario reporta dolor nocturno intenso, hormigueo/pérdida de sensibilidad, hinchazón súbita, fiebre, o dolor que no mejora en 2 semanas, recomienda firmemente acudir a un profesional sanitario.
DISCLAIMER OBLIGATORIO: En el primer mensaje y cuando sea relevante, incluye: "⚠️ Estas recomendaciones están basadas en evidencia científica con fines orientativos y no sustituyen el diagnóstico ni tratamiento de un médico o fisioterapeuta. Si el dolor empeora o no mejora, consulta con un profesional sanitario."`}[cat.id]||"")}`;
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
        const historialLimpio=(u.historial?.slice(-6)||[]).map((m:any)=>typeof m.content==="string"?{...m,content:m.content.replace(/\n\n\[Fecha actual del sistema:.*?\]/,"")}:m);
        setMensajes(historialLimpio);
        const consultasUsadas=Math.floor((u.historial?.length||0)/2);
        setMsgCount(consultasUsadas);setPantalla("chat");
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
        cargarEquipos(u.codigo);
        cargarPlanSemanal(u.codigo);
        cargarBlockOutcomes(u.codigo);
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
const [mostrarCodigoReal,setMostrarCodigoReal]=useState(false);
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

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[mensajes,cargando,generando]);

  const cat=categoria?CATEGORIAS.find((c:Categoria)=>c.id===categoria):null;
  const preguntas:Pregunta[]=(espKey?FORMULARIOS[espKey]:null)||(categoria?FORMULARIOS[categoria]:[])||[];
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
    const historialLimpio2=(u.historial?.slice(-6)||[]).map((m:any)=>typeof m.content==="string"?{...m,content:m.content.replace(/\n\n\[Fecha actual del sistema:.*?\]/,"")}:m);
    setMensajes(historialLimpio2);
    const consultasUsadas=Math.floor((u.historial?.length||0)/2);
    setMsgCount(consultasUsadas);setPantalla("chat");
    setEmailGuardado(!!u.email);
    setEsPremium(!!(u as any).premium);
    setEsAdmin(!!(u as any).admin);
    setMemoriaCoach({
      lesiones:(u as any).lesiones_actuales||"",
      plan:(u as any).plan_proxima_semana||"",
      notas:(u as any).notas_coach||""
    });
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
    apiCall({action:"actualizar_usuario",codigo:u.codigo,datos:{ultima_visita:new Date().toISOString(),total_visitas:((u as any).total_visitas||1)+1}});
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
const esRehab=(espKey||categoria)==="rehabilitacion_general";
    const prompt = esRehab
      ? "¡Hola! Acabo de completar mi perfil de rehabilitación. Por favor: 1) Incluye PRIMERO el disclaimer obligatorio completo. 2) Da la bienvenida breve demostrando que entiendes mi zona afectada, tipo de molestia y fase actual. 3) Explica el enfoque y las fases de rehabilitación que vas a aplicar y por qué. 4) Termina preguntando si estoy de acuerdo, indicando explícitamente que al confirmar para empezar la Fase 1 confirmo que he comprendido la información, que esto no sustituye valoración profesional, y que asumo la responsabilidad de detener cualquier ejercicio que cause dolor y consultar con un profesional si es necesario."
      : "¡Hola! Acabo de completar mi perfil. Por favor sigue exactamente esta secuencia: 1) Dame la bienvenida breve y personalizada demostrando que has leído y entendido mi perfil completo — especialidad, nivel, objetivo y limitaciones. 2) Explica qué metodología de periodización vas a aplicar conmigo y POR QUÉ es la más adecuada para mi situación concreta — sé específico, no genérico. 3) Pregúntame si estoy de acuerdo con esta metodología o si quiero explorar alguna alternativa antes de empezar. NO generes ningún entrenamiento todavía — espera mi confirmación.";
    try{
      const esp=espKey||categoria!;
      const data=await apiCall({model:"claude-sonnet-4-5",max_tokens:3000,system:buildPrompt(catObj,perfil,[],""),messages:[{role:"user",content:prompt}]});
      const texto=(data.content?.map((b:{text?:string})=>b.text||"").join("")||"Error al conectar.").replace(/\[STATE_UPDATE\][\s\S]*?\[\/STATE_UPDATE\]/g,"").trim();
      const hist=[{role:"user",content:prompt},{role:"assistant",content:texto}];
      setMensajes([{role:"assistant",content:texto}]);setHistorial(hist);setMsgCount(1);setCodigoUsuario(codigo);setEmailGuardado(!!email);setFechaRegistro(new Date().toISOString());
      console.log("Guardando usuario con email:", email);
await apiCall({action:"guardar_usuario",datos:{codigo,categoria,especialidad:espKey||categoria,perfil,rutina:texto,historial:hist,marcas:[],email:email||null,admin:false,premium:false}});
    }catch{setMensajes([{role:"assistant",content:"Error de conexion. Por favor recarga."}]);}
    finally{setGenerando(false);setTimeout(()=>inputRef.current?.focus(),300);}
  };

  const procesarTags=async(textoOriginal:string):Promise<string>=>{
    let texto=textoOriginal.replace(/\[STATE_UPDATE\][\s\S]*?\[\/STATE_UPDATE\]/g,"").trim();

    const extraerJSON=(str:string, tagStart:number, prefixLen:number):{json:string|null,endIdx:number}=>{
      const jsonStart=tagStart+prefixLen;
      let depth=0, endIdx=-1;
      for(let i=jsonStart;i<str.length;i++){
        if(str[i]==='{') depth++;
        else if(str[i]==='}'){ depth--; if(depth===0){ endIdx=i; break; } }
      }
      if(endIdx<0) return {json:null,endIdx:-1};
      return {json:str.substring(jsonStart,endIdx+1),endIdx};
    };

    const procesarTag=async(tag:string,prefixLen:number,callback:(data:any)=>Promise<void>)=>{
      const tagStart=texto.indexOf(tag);
      if(tagStart<0) return;
      const {json,endIdx}=extraerJSON(texto,tagStart,prefixLen);
      if(json){
        try{
          const data=JSON.parse(json);
          await callback(data);
        }catch{}
      }
      // Eliminar el tag completo del texto, dejando lo que venga antes y después
      const tagEndBracket=texto.indexOf("]",endIdx>=0?endIdx:tagStart);
      const antes=texto.substring(0,tagStart).trim();
      const despues=tagEndBracket>=0?texto.substring(tagEndBracket+1).trim():"";
      texto=(antes+(despues?" "+despues:"")).trim();
    };

    await procesarTag("[RESUMEN_SEMANA:",16,async(data)=>{
      await apiCall({action:"guardar_resumen_semana",codigo:codigoUsuario,datos:data});
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
    await procesarTag("[DEBILIDAD_DEV:",15,async(data)=>{
      await apiCall({action:"registrar_debilidad_dev",codigo:codigoUsuario,datos:data});
    });
    await procesarTag("[ACTUALIZAR_DEBILIDAD:",22,async(data)=>{
      await apiCall({action:"actualizar_debilidad_dev",codigo:codigoUsuario,datos:data});
    });
    await procesarTag("[EVENTO:",8,async(data)=>{
      await apiCall({action:"registrar_evento",codigo:codigoUsuario,datos:{evento:data}});
    });
    await procesarTag("[METRICA:",9,async(data)=>{
      await apiCall({action:"registrar_metrica_pasada",codigo:codigoUsuario,datos:data});
    });
    await procesarTag("[BORRAR_SESION:",15,async(data)=>{
      await apiCall({action:"borrar_sesion_fecha",codigo:codigoUsuario,datos:data});
    });

    // SESION es especial: no se guarda automáticamente, se muestra el banner
    const sesionStart=texto.indexOf("[SESION:");
    if(sesionStart>=0){
      const {json,endIdx}=extraerJSON(texto,sesionStart,8);
      if(json){
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

    if(!texto) texto="✅ Hecho. Puedes ver los detalles en las secciones correspondientes.";
    return texto;
  };

  const enviarSilencioso=async(texto:string)=>{
    if(!texto.trim()||cargando) return;
    const nuevoHist=[...historial,{role:"user",content:texto.trim()}];
    setCargando(true);setMsgCount(c=>c+1);
    const catObj=CATEGORIAS.find((c:Categoria)=>c.id===categoria)!;
    const esp=espKey||categoria!;
    try{
      const resumen=historial.slice(-4).map(m=>`${m.role==="user"?"Usuario":"Coach"}: ${typeof m.content==="string"?m.content.substring(0,150):"[archivo]"}...`).join("\n");
      const data=await apiCall({model:"claude-sonnet-4-5",max_tokens:4000,system:buildPrompt(catObj,respuestas,marcas as any,resumen,memoriaCoach,cicloActual,perfilPsicologico,esPremium||esAdmin,athleteState,datosEntrenamiento,estadoFisiologico,historialFisiologico,distribucionSemanal,objetivoPrincipal,planSemanal)+(perfilAmigo?`\n\nSESIÓN CONJUNTA — PERFIL DEL COMPAÑERO:\nEspecialidad: ${perfilAmigo.especialidad||perfilAmigo.categoria}\nPerfil: ${JSON.stringify(perfilAmigo.perfil)}\nCiclo: ${JSON.stringify(perfilAmigo.ciclo_actual)}\nLesiones: ${perfilAmigo.lesiones_actuales||"ninguna"}\nMarcas: ${JSON.stringify(perfilAmigo.marcas_especificas)}\nIMPORTANTE: Genera una sesión que beneficie a AMBOS atletas simultáneamente. Respeta las limitaciones y fases de cada uno. Indica qué hace cada atleta si hay diferencias de nivel o fase.`:""),messages:nuevoHist},true);
      if(data.aborted) return;
      const respTextRaw=(data.content?.map((b:{text?:string})=>b.text||"").join("")||"Error.");
      const respText=await procesarTags(respTextRaw);
      const hist=[...nuevoHist,{role:"assistant",content:respText}];
      setMensajes(prev=>[...prev,{role:"assistant",content:respText}]);
      setHistorial(hist);
      if(codigoUsuario) apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{historial:hist}});
    }catch{}
    finally{setCargando(false);}
  };

  const enviar=async(texto:string=input)=>{
    if((!texto.trim()&&imagenesAdjuntas.length===0)||cargando||bloqueado) return;
    const fechaHoyStr=new Date().toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Europe/Madrid"});
    const textoEnvio=(texto.trim()||"Analiza esta imagen o archivo y dame feedback en base a mi programacion.")+`\n\n[Fecha actual del sistema: ${fechaHoyStr}]`;
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
    }
    const nuevoHist=[...historial,{role:"user",content:contenidoUsuario}];
    const textoSinFecha=textoEnvio.replace(/\n\n\[Fecha actual del sistema:.*?\]/,"");
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
      
      const resumen=historial.slice(-4).map(m=>`${m.role==="user"?"Usuario":"Coach"}: ${typeof m.content==="string"?m.content.substring(0,150):"[imagen/archivo]"}...`).join("\n");
      const esPlanificacionSemanal=texto.toLowerCase().includes("semana completa")||texto.toLowerCase().includes("planificacion semanal")||texto.toLowerCase().includes("plan semanal")||texto.toLowerCase().includes("toda la semana")||texto.toLowerCase().includes("generar semana");
      const esProgramacion=esPlanificacionSemanal||texto.toLowerCase().includes("programacion")||texto.toLowerCase().includes("rutina")||texto.toLowerCase().includes("semana")||texto.toLowerCase().includes("plan")||texto.toLowerCase().includes("sesion")||texto.toLowerCase().includes("entreno")||texto.toLowerCase().includes("wod")||texto.toLowerCase().includes("ejercicio")||texto.toLowerCase().includes("bloque")||texto.toLowerCase().includes("rehabilitacion")||texto.toLowerCase().includes("protocolo")||texto.toLowerCase().includes("fase");
      const mensajesContexto=esProgramacion?-6:-4;
const data=await apiCall({model:"claude-sonnet-4-5",max_tokens:4000,system:buildPrompt(catObj,respuestas,marcas as any,resumen,memoriaCoach,cicloActual,perfilPsicologico,esPremium||esAdmin,athleteState,datosEntrenamiento,estadoFisiologico,historialFisiologico,distribucionSemanal,objetivoPrincipal,planSemanal,debilidades,blockOutcomes)+(perfilAmigo?`\n\nSESIÓN CONJUNTA — PERFIL DEL COMPAÑERO:\nEspecialidad: ${perfilAmigo.especialidad||perfilAmigo.categoria}\nPerfil: ${JSON.stringify(perfilAmigo.perfil)}\nCiclo: ${JSON.stringify(perfilAmigo.ciclo_actual)}\nLesiones: ${perfilAmigo.lesiones_actuales||"ninguna"}\nMarcas: ${JSON.stringify(perfilAmigo.marcas_especificas)}\nIMPORTANTE: Genera una sesión que beneficie a AMBOS atletas simultáneamente. Respeta las limitaciones y fases de cada uno. Indica qué hace cada atleta si hay diferencias de nivel o fase.`:""),messages:nuevoHist},true);
      if(data.aborted) return;
      const respTextRaw2=(data.content?.map((b:{text?:string})=>b.text||"").join("")||"Error.");
      
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

      const respText=await procesarTags(respTextRaw2);
      const hist=[...nuevoHist,{role:"assistant",content:respText}];
      setMensajes(prev=>[...prev,{role:"assistant",content:respText}]);
      const histFinal=hist.length>=20?hist.slice(-10):hist;
      setHistorial(histFinal);
      if(hist.length>=20) compactarHistorial(hist);
      if(codigoUsuario){
        apiCall({action:"actualizar_usuario",codigo:codigoUsuario,datos:{historial:histFinal}});
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
            if(datos.ciclo){
              const nuevoCiclo={
                bloque: datos.ciclo.bloque||cicloActual.bloque||"",
                semana: datos.ciclo.semana||cicloActual.semana||null,
                totalSemanas: datos.ciclo.totalSemanas||cicloActual.totalSemanas||null,
                objetivo: datos.ciclo.objetivo||cicloActual.objetivo||""
              };
              if(nuevoCiclo.bloque||nuevoCiclo.semana){
                setCicloActual(nuevoCiclo);
                nuevaMemoria.ciclo_actual=nuevoCiclo;
              }
            }
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

      {pantalla==="cargando"&&(
        <div className="fade-up" style={{textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:16}}>⚡</div>
          <p style={{color:C.muted,fontSize:15}}>Cargando tu sesion...</p>
        </div>
      )}

      {pantalla==="inicio"&&(
        <div className="fade-up" style={{maxWidth:520,width:"100%",textAlign:"center"}}>
          <div style={{marginBottom:16,display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
            <img src="/logo-forge.png" alt="Forge" style={{width:80,height:80,objectFit:"contain"}}/>
            <div style={{textAlign:"left"}}>
              <div style={{fontSize:"clamp(28px,6vw,42px)",fontWeight:900,color:"#F0EDE8",fontFamily:"'DM Sans',sans-serif",letterSpacing:"-1px",lineHeight:1}}>FORGE</div>
              <div style={{fontSize:"clamp(10px,2vw,13px)",fontWeight:500,color:"#FF6B00",fontFamily:"'DM Sans',sans-serif",letterSpacing:"3px",textTransform:"uppercase"}}>AI Training Coach</div>
            </div>
          </div>
          <p style={{color:C.muted,fontSize:17,lineHeight:1.65,marginBottom:4,fontWeight:600}}>No generamos entrenamientos. Construimos atletas.</p>
          <p style={{color:C.muted,fontSize:15,lineHeight:1.65,marginBottom:8}}>Forge aprende quién eres, planifica cada semana según tu evolución y adapta tu entrenamiento utilizando tu historial, estado fisiológico y objetivos deportivos.</p>
          <button className="btn-main" onClick={()=>setPantalla("categoria")} style={{background:"#FF6B00",color:"#fff",border:"none",borderRadius:14,padding:"16px 40px",fontSize:16,fontWeight:600,cursor:"pointer",width:"100%",maxWidth:360,marginTop:16,marginBottom:8}}>
            Crear mi atleta
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
          <p style={{color:C.muted,fontSize:13,marginTop:20,fontWeight:500}}>Comienza gratis y deja que Forge aprenda de ti desde la primera sesión.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,maxWidth:400,margin:"20px auto 0",textAlign:"left"}}>
            {["Plan semanal personalizado","Seguimiento del progreso","Diario del atleta","Adaptación automática","Historial fisiológico","Coaching correctivo"].map(t=>(
              <span key={t} style={{color:C.muted,fontSize:13,display:"flex",alignItems:"center",gap:6}}><span style={{color:C.accent}}>✓</span>{t}</span>
            ))}
          </div>
        </div>
      )}

      {pantalla==="categoria"&&(
        <div className="fade-up" style={{maxWidth:580,width:"100%"}}>
          <button onClick={()=>setPantalla("inicio")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,marginBottom:28}}>Volver</button>
          <h2 style={{fontSize:"clamp(22px,5vw,30px)",color:C.ink,marginBottom:8}}>¿Qué tipo de atleta eres?</h2>
          <p style={{color:C.muted,fontSize:14,marginBottom:6}}>Forge adaptará tu planificación, tus métricas y tu seguimiento según el deporte que practiques.</p>
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

      {pantalla==="informe_test"&&cat&&resultadoTest&&(
        <div className="fade-up" style={{width:"100%",maxWidth:"100%",overflowY:"auto"}}>
          <div id="informe-test" style={{background:C.bg,padding:"16px",borderRadius:20,width:"100%"}}>
          <div style={{background:cat.colorLight,borderRadius:20,padding:"24px 20px",marginBottom:16,textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:8}}>{cat.emoji}</div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:700,color:C.ink,marginBottom:4}}>Informe de Atleta</div>
            <div style={{background:accentColor,color:"#fff",borderRadius:100,padding:"6px 20px",fontSize:14,fontWeight:700,display:"inline-block",marginBottom:8}}>
              {resultadoTest.nivel}
            </div>
            <p style={{color:C.muted,fontSize:13,lineHeight:1.6}}>{resultadoTest.resumen}</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16,alignItems:"start"}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"16px",gridColumn:"1 / -1"}}>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:700,color:C.ink,marginBottom:14}}>Análisis de rendimiento</div>
              {Object.entries(resultadoTest.puntuaciones).map(([key,val])=>(
                <div key={key} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:14,color:C.ink,fontWeight:500,textTransform:"capitalize"}}>{key}</span>
                    <span style={{fontSize:14,color:accentColor,fontWeight:700}}>{val}%</span>
                  </div>
                  <div style={{height:8,background:C.border,borderRadius:100}}>
                    <div style={{height:8,borderRadius:100,background:accentColor,width:`${val}%`,transition:"width 0.8s ease"}}/>
                  </div>
                </div>
              ))}
            </div>
            <div style={{background:"#D8F3DC",borderRadius:14,padding:"16px"}}>
              <div style={{fontSize:14,fontWeight:700,color:"#2D6A4F",marginBottom:10}}>💪 Fortalezas</div>
              {resultadoTest.fortalezas.map((f,i)=><div key={i} style={{fontSize:13,color:"#2D6A4F",marginBottom:6,lineHeight:1.4}}>✓ {f}</div>)}
            </div>
            <div style={{background:"#FDF0EB",borderRadius:14,padding:"16px"}}>
              <div style={{fontSize:14,fontWeight:700,color:C.warm,marginBottom:10}}>🎯 A mejorar</div>
              {resultadoTest.debilidades.map((d,i)=><div key={i} style={{fontSize:13,color:C.warm,marginBottom:6,lineHeight:1.4}}>→ {d}</div>)}
            </div>
          </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <button className="btn-main" onClick={()=>{
              setPantalla("chat");
              setTimeout(()=>enviarSilencioso("Test completado. Nivel: "+resultadoTest?.nivel+". Puntuaciones: "+Object.entries(resultadoTest?.puntuaciones||{}).map(([k,v])=>k+": "+v+"%").join(", ")+". Fortalezas: "+resultadoTest?.fortalezas?.join(", ")+". A mejorar: "+resultadoTest?.debilidades?.join(", ")+". "+resultadoTest?.resumen+". Ajusta mi programación con estos datos."),500);
            }} style={{background:accentColor,color:"#fff",border:"none",borderRadius:14,padding:"14px",fontSize:15,fontWeight:600,cursor:"pointer"}}>
              ⚡ Ver mi programación ajustada
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
          <button className="btn-main" onClick={avanzar}
            disabled={(pregActual.tipo==="opciones"&&!respuestas[pregActual.id])||(pregActual.tipo==="multi"&&selMulti.length===0)||(pregActual.tipo==="texto"&&!textoTemp.trim())}
            style={{width:"100%",background:accentColor,color:"#fff",border:"none",borderRadius:14,padding:"15px",fontSize:15,fontWeight:600,cursor:"pointer",opacity:((pregActual.tipo==="opciones"&&!respuestas[pregActual.id])||(pregActual.tipo==="multi"&&selMulti.length===0)||(pregActual.tipo==="texto"&&!textoTemp.trim()))?0.35:1}}>
           
{pregIdx<preguntas.length-1?"Siguiente":"Generar mi programa"}
          </button>
        </div>
      )}

      {pantalla==="chat"&&cat&&(
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
                <button onClick={()=>setMostrarMenu(!mostrarMenu)} style={{background:"#FF6B00",border:"none",borderRadius:10,padding:"6px 12px",fontSize:13,color:"#fff",cursor:"pointer",fontWeight:600}}>
                  ☰ Menú
                </button>
                {mostrarMenu&&(
                  <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:8,zIndex:100,minWidth:160,boxShadow:"0 4px 20px rgba(0,0,0,0.3)"}}>
                    <button onClick={()=>{window.open(`/progreso?codigo=${codigoUsuario}`,'_blank');setMostrarMenu(false);}} style={{width:"100%",background:"none",border:"none",color:C.ink,fontSize:13,padding:"8px 12px",cursor:"pointer",textAlign:"left",borderRadius:8,display:"flex",alignItems:"center",gap:8}}>
                      📊 Mi progreso
                    </button>
                    <button onClick={()=>{window.open(`/plan?codigo=${codigoUsuario}`,'_blank');setMostrarMenu(false);}} style={{width:"100%",background:"none",border:"none",color:C.ink,fontSize:13,padding:"8px 12px",cursor:"pointer",textAlign:"left",borderRadius:8,display:"flex",alignItems:"center",gap:8}}>
                      📅 Mi plan
                    </button>
                    
                    <button onClick={()=>{window.open(`/historia?codigo=${codigoUsuario}`,'_blank');setMostrarMenu(false);}} style={{width:"100%",background:"none",border:"none",color:C.ink,fontSize:13,padding:"8px 12px",cursor:"pointer",textAlign:"left",borderRadius:8,display:"flex",alignItems:"center",gap:8}}>
                      📖 Mi historia
                    </button>
                    <button onClick={()=>{setMostrarEquipos(!mostrarEquipos);setMostrarMenu(false);}} style={{width:"100%",background:"none",border:"none",color:C.ink,fontSize:13,padding:"8px 12px",cursor:"pointer",textAlign:"left",borderRadius:8,display:"flex",alignItems:"center",gap:8}}>
                      👥 Equipos
                    </button>
                    <button onClick={()=>{window.open(`/atleta?codigo=${codigoUsuario}`,'_blank');setMostrarMenu(false);}} style={{width:"100%",background:"none",border:"none",color:C.ink,fontSize:13,padding:"8px 12px",cursor:"pointer",textAlign:"left",borderRadius:8,display:"flex",alignItems:"center",gap:8}}>
                      🎯 Mi Atleta
                    </button>
                    <button onClick={()=>{setMostrarPerfil(!mostrarPerfil);setMostrarMarcas(false);setMostrarMenu(false);}} style={{width:"100%",background:"none",border:"none",color:C.ink,fontSize:13,padding:"8px 12px",cursor:"pointer",textAlign:"left",borderRadius:8,display:"flex",alignItems:"center",gap:8}}>
                      ⚙️ Ajustes
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {mostrarEquipos&&(
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"16px 18px",marginBottom:10,maxHeight:450,overflowY:"auto"}}>
              <p style={{color:C.ink,fontSize:14,fontWeight:700,marginBottom:12}}>👥 Mis equipos</p>

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
                      if(!confirm(`¿Disolver el equipo "${eq.name}"?`)) return;
                      await apiCall({action:"disolver_equipo",codigo:codigoUsuario,datos:{team_id:eq.id}});
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
              <div key={i} className="msg-in" style={{display:"flex",justifyContent:msg.role==="user"?"flex-end":"flex-start",gap:10,alignItems:"flex-start",animationDelay:`${Math.min(i*0.05,0.3)}s`}}>
                {msg.role==="assistant"&&(
                  <div style={{width:32,height:32,borderRadius:10,overflow:"hidden",flexShrink:0}}>
                    <img src="/logo-forge.png" alt="Forge" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  </div>
                )}
                <div style={{maxWidth:"80%",padding:"13px 17px",borderRadius:msg.role==="user"?"16px 4px 16px 16px":"4px 16px 16px 16px",background:msg.role==="user"?"#FF6B00":C.card,color:msg.role==="user"?"#fff":C.ink,border:msg.role==="assistant"?`1px solid ${C.border}`:"none"}}>
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
                      setSesionPendiente(null);
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
    </div>
  );
}

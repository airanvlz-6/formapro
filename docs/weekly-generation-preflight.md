# Preflight compartido: disponibilidad habitual y decisión temporal

Base comprobada: `bfb8657303f617869b469eede22d41b9a8ed813b`, árbol limpio.
Commit nuevo; sin amend, rebase, migraciones ni push.

## Causa y cambio

Chat y botón tras cierre llamaban incondicionalmente a `availabilityQuestion()`.
Tras confirmar, la UI preguntaba siempre por empezar hoy. Ningún timestamp ni requisito
de backend imponía esa reconfirmación semanal. El parser temporal convertía respuestas
no reconocidas en false; Focus incluía hoy por defecto.

Ahora ambas entradas llaman a `dispararGeneracion`, que utiliza el mismo orquestador y
`preflight_generacion_semana`. El backend valida el token de generación y el target,
obtiene la fecha civil de Canarias y usa el snapshot atestado del servidor.
El inicio de Focus también pasa por el preflight sin conceder includeToday por defecto.

Flujo: snapshot → cierre comprobado → semana objetivo → preflight → Analyzer → Planner
con Goal Authority/3B → Builders → 3D → guardado existente.
El preflight consulta las autoridades y construye un contrato sin LLM para resolver la
decisión temporal. Por eso puede detectar el requisito de goal antes del Analyzer;
el gate estratégico existente vuelve a verificarlo en su recorrido habitual.

Una lectura fallida del cierre ya no se interpreta como «semana no cerrada».
La selección actual/siguiente conserva la política de cierre existente; esta fase no
añade un intérprete general de fechas o semanas solicitadas en lenguaje natural.

## Autoridad reutilizada

`resolveWeeklyGenerationPreflight` es server/core, sin React ni DOM. Devuelve un DTO:
availabilityStatus, availability cuando disponible, canContinue, temporalDecision y
goalRequirement/preflightRequirement cuando corresponda.

- VALID: días del lector canónico, compatibles con scope y con nombres de día válidos.
- MISSING: distribución ausente.
- INVALID: JSON/tipo incorrecto, disponibilidad no resuelta o días inválidos.
- READ_ERROR: no se genera ni se pide sustituir datos como si fueran desconocidos.
- NOT_CHECKED: permite distinguir un rechazo de scope previo a resolver disponibilidad.

Solo VALID puede continuar; no es suficiente por sí solo si otro gate bloquea.
Reutilizar realiza cero escrituras: no actualiza perfil, disponibilidad ni training sources.
`loadWeeklyCalendarContext` distingue ahora ausencia de un valor de tipo inválido;
conserva el rechazo de ambos. No cambia resolución de ownership.

Se mantienen readAvailabilityConfirmation, digest, availabilityResponse, gramática natural,
escritores y resultados parciales. Si falta disponibilidad se recoge una corrección por
el flujo existente; solo después de éxito completo se vuelve al preflight. Lo mismo ocurre
después de resolver una delegación pendiente, sin cambiar el escritor de ownership.
No se crea autoridad de excepciones semanales: estos días siguen siendo habituales.

## Decisión temporal

El nombre del nuevo DTO es `includeToday`. `empezarHoy` permanece exclusivamente como
compatibilidad con el transporte y contrato existentes: significa incluir/excluir hoy,
no seleccionar una supuesta «próxima fecha disponible».

1. Parsear únicamente intención explícita y acotada. Booleanos del contrato y expresiones
   inequívocas como «incluir hoy», «excluir hoy», «desde mañana» o «genera mi semana desde hoy».
2. «Sí/no» solo se interpreta como elección temporal si responde a esa pregunta identificada;
   un «sí» genérico a generar la semana no autoriza entrenar hoy.
3. Preparar el contrato semanal existente usando esa elección o inclusión provisional
   para inspección. Esta preparación no llama al Planner ni emite permiso de guardado.
4. Si el target no contiene hoy, derivar sin preguntar.
5. Si hoy no admite TRAIN nuevo, derivar sin preguntar. Incluye indisponibilidad, días
   completados/protegidos y casos donde el límite semanal impide añadir TRAIN hoy.
6. Para probar admisión se utiliza una DP finita sobre los siete días: cuenta ejecutable,
   descanso requerido y grupos de cobertura del contrato, forzando un TRAIN no protegido hoy.
   No basta encontrar un movimiento suelto o un día disponible.
7. Solo si existe esa posibilidad y falta intención explícita, devolver pregunta temporal.
   Excluir hoy elimina esa posibilidad y cambia el conjunto de semanas admisibles.

En casos derivados se conserva includeToday=true: no fuerza una sesión ni cambia estados
protegidos; deja actuar al contrato. La decisión no inventa una fecha ni una dosis.
Una respuesta ambigua mantiene temporalDecision=null y canContinue=false cuando existe
una elección real. Nunca se convierte silenciosamente en exclusión.

El preflight no es una autorización durable ni sustituye recibos, freshness checks,
restricciones o CAS. Los pasos posteriores siguen leyendo y validando su autoridad.
La fecha, el cierre y las autoridades se vuelven a consultar al reanudar una pregunta.

## Continuación de producto

La UI muestra «Construyendo tu semana…» y presenta solo requisitos devueltos por el servidor.
El botón conserva la exigencia de cierre completo: partial/closed:false no avanzan.
Las respuestas de disponibilidad y ownership vuelven a la entrada compartida tras verificarse.
La intención temporal original se conserva durante esas aclaraciones y las de goal;
es contexto de la solicitud, no una preferencia persistente entre semanas.
No se anuncia guardado al recibir un requisito de preflight o goal.

Goal resuelto no se reconfirma. Missing/conflict/unsupported siguen usando su resolución
estructurada, sin cambios en aliases, roles de fuentes o persistencia de primary.
Focus mantiene su scope; Coach reutiliza fuentes; Supervisión permanece no prescriptiva.

## Validación y entrega (28 puntos)

1. Base: `bfb8657303f617869b469eede22d41b9a8ed813b`.
2. Causa: preguntas incondicionales de UI, no expiración de autoridad.
3. Availability: lectura canónica válida → reutilizar → continuar sin confirmación.
4. Missing: requisito de disponibilidad por el flujo existente.
5. Invalid: requisito; no reutilización optimista.
6. Read errors: fail-closed, sin generación ni asumir valores previos.
7. Escrituras al reutilizar: cero.
8. Mutaciones de ownership al reutilizar: cero.
9. Algoritmo temporal: intención explícita o prueba de admisión de TRAIN nuevo hoy.
10. Derivados: semana futura, hoy sin TRAIN admisible, completado/protegido, intención explícita.
11. Ambigüedad real: TRAIN nuevo factible dentro de una semana admisible y sin elección temporal.
12. Respuesta ambigua: unresolved; sí/no requieren contexto de pregunta temporal.
13. Chat: entrada compartida, sin pregunta rutinaria de días.
14. Botón: entrada compartida después de cierre válido, sin pregunta rutinaria de días.
15. Goal: mismo gate; resuelto no pregunta, conflicto bloquea.
16. Focus: mismo scope; sin inclusión automática de hoy por defecto.
17. Coach: reutiliza scope/disponibilidad conocidos.
18. Supervisión: sigue no prescriptiva.
19. CrossFit + Carrera: catálogo/3B/Transfer sin cambios; fixtures existentes incluidas en suite.
20. Tests nuevos: 36 de preflight, gramática temporal, gates, scope, cero escrituras,
    entrada real chat/botón, orden preflight/Analyzer y continuidad de intención.
21. Suite completa: `node --test --test-concurrency=4 lib/**/*.test.mjs`, 1.314/1.314 PASS.
22. TypeScript: `npx tsc --noEmit`, PASS.
23. Diff: `git diff --check`, PASS.
24. Migraciones: ninguna.
25. Archivos: weeklyGenerationPreflight.ts y test nuevos; FormaPro; ruta chat;
    clasificación de errores en weeklyCalendarAuthority; tests chatAvailability,
    weekClosure y sessionContractIntegration; este informe.
26. Commit SHA: entrega final, commit nuevo.
27. Git status: comprobado después del commit.
28. NO PUSH.

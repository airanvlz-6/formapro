# Roles de objetivo y resolución con declaraciones reales

Base comprobada: `15c94e8828c548fc35b4f17184442a2704829156`, árbol limpio antes de editar.
Evidencia aportada: run `e907ac40-447f-4389-9d34-c26294226106`. No se han leído sus textos
privados ni comprobado remotamente el despliegue. Los logs prueban dos candidaturas no
reconocidas y el rechazo del gate; no prueban que los textos sean conceptualmente incompatibles.
Este informe actualiza la política descrita en `goal-authority-admission.md`.

## Auditoría de disponibilidad

`availabilityResponse.ts` elimina acentos y puntuación y comprueba pertenencia exacta a
un conjunto cerrado. «Si, es correcta» se normalizaba a `si es correcta`, ausente del conjunto.
«Sigue igual» sí estaba incluido. `es correcto` también existía; no faltaba toda la familia.
Se añaden exactamente `si es correcta`, `si correcto`, `es correcta`, `si todo correcto`,
`todo correcto`. La normalización existente cubre las variantes solicitadas con coma y acento.
No hay fuzzy matching, nuevas escrituras ni cambio de ownership. «No, es incorrecta» no confirma.

## Semántica de las cuatro fuentes

| SOURCE | CURRENT_ROLE antes del cambio | SHOULD_BE_PRIMARY_CANDIDATE | WHY |
|---|---|---|---|
| `usuarios.objetivo_principal` | primary sin precedencia sobre perfil | sí | campo explícito de objetivo actual; la ruta lo presenta como CURRENT_OBJECTIVE y su escritor exige intención explícita |
| `perfil.objetivo_general` | primary | sí | el alta autenticada recoge un campo separado «Objetivo» y lo persiste aquí; no es una nota de contexto |
| `perfil.objetivo_detalle` | primary | no como autoridad independiente | campo sobrecargado: metas, explicación, situación personal, restricciones descritas y notas de grupos; no garantiza una declaración primaria independiente |
| `perfil.objetivo_principal` | primary | sí | pregunta explícita «¿Cuál es tu objetivo principal?» en onboarding fitness |

Se conserva el conflicto entre las tres autoridades primarias cuando sus declaraciones difieren.
No se impone prioridad silenciosa al campo de la fila ni se equiparan textos mediante LLM.
`objetivo_detalle` deja de competir y se conserva íntegro en `goals.detail`, con source/raw/fecha
disponible, además de permanecer en su ubicación original del perfil.

## Preguntas y persistencia reales

| UI QUESTION / entrada | EXAMPLE ANSWER | PERSISTED FIELD | INTENDED SEMANTIC ROLE | CURRENT 3A ROLE anterior → nuevo |
|---|---|---|---|---|
| AuthPanel: «Objetivo»; `bootstrapNewAthlete` | «Mejorar resistencia» | `perfil.objetivo_general` | objetivo general declarado al crear cuenta | primary → primary |
| FormaPro fitness: «¿Cuál es tu objetivo principal?» | «Perder peso / reducir grasa» | `perfil.objetivo_principal` | prioridad principal explícita | primary → primary |
| Captura de modo: «¿Qué quieres conseguir exactamente?» | meta libre | `perfil.objetivo_detalle` | descripción de lo que busca | primary → detail |
| Running: «¿Qué quieres conseguir exactamente?» | «completar mi primer 10K en junio, bajar de 45 min» | `perfil.objetivo_detalle` | detalle que mezcla evento, fecha y marca | primary → detail |
| CrossFit: «¿Qué quieres conseguir?» | «mejorar mi Fran, conseguir el muscle-up, competir en Open» | `perfil.objetivo_detalle` | descripción de metas/skills | primary → detail |
| Híbrido: «¿Qué quieres lograr en los próximos 3-6 meses?» | «aumentar peso muerto y correr 10K en menos de 50min» | `perfil.objetivo_detalle` | descripción multimetas | primary → detail |
| Hyrox/obstáculos/triatlón: «¿Cuál es tu objetivo principal?» | terminar evento o mejorar tiempo | `perfil.objetivo_detalle` | meta descrita, sin rol estructurado en almacenamiento | primary → detail |
| Fitness: «Cuéntame tu situación y objetivo» | «tengo 15 kg de más, entreno por las mañanas» | `perfil.objetivo_detalle` | situación y contexto | primary → detail |
| Grupos: «¿Algo más que el coach deba saber?» | «hay varios atletas con lesión de hombro» | `perfil.objetivo_detalle` | contexto de grupo, no primary | primary → detail |
| Edición de perfil: textarea de objetivo | texto libre | `perfil.objetivo_detalle` | detalle editable | primary → detail |
| Declaración conversacional explícita; no una pregunta fija de onboarding | objetivo con fecha/tipo | `usuarios.objetivo_principal` | objetivo actual confirmado | primary → primary |
| Pregunta estructurada del gate | elegir declaración o «Mi objetivo es: ...» | `usuarios.objetivo_principal.descripcion` | elección principal inequívoca | primary → primary |

Evidencia de implementación: `app/auth/AuthPanel.tsx`, `lib/auth/athleteIdentity.ts`,
preguntas iniciales de `app/FormaPro.tsx`, captura de modo/extractor en `app/api/chat/route.ts`,
`projectAthletePrescriptionProfile`. Las respuestas del onboarding FormaPro se guardan en perfil.
El mismo nombre `objetivo_detalle` no permite inferir su intención de cada texto: algunas
preguntas sí dicen «principal», otras expresamente piden contexto. Por ello no se convierte
automáticamente en secondary ni primary, tampoco cuando es la única evidencia disponible.
Un usuario que solo tiene detalle deberá declarar primary explícitamente.

`objetivos_secundarios` conserva su rol secundario. Distancia, skill y targets específicos
siguen separados; competición/evento conserva su evidencia propia; weakness continúa siendo
desarrollo. Ninguno, ni disciplina/ownership/Analyzer, se promociona a objetivo principal.

## Política de resolución y escritura

Las opciones de pregunta son los candidatos reales, con número, texto original, fuente e ID
reconocido cuando existe. No se ofrece el catálogo de cinco goals como menú obligatorio.
Los textos se devuelven al usuario autenticado; los diagnósticos siguen ocultando la prosa.

- Dos reconocidos: mostrar ambos y elegir por número o texto exacto.
- Reconocido y desconocido: mostrar ambos; elegir el desconocido lo conserva sin remapearlo.
- Dos desconocidos: conservar el conflicto de autoridad y añadir
  `question.classification=needs_classification`, con elección/declaración explícita.
  Así se distingue de un conflicto entre IDs modelados sin perder los candidatos reales.
- Nueva declaración/corrección: `Mi objetivo es: ...`, gramática explícita y longitud acotada.
  Los aliases exactos existentes siguen siendo aceptables; no se interpretan embeddings ni prosa libre.
- «Mantener mi objetivo» con conflicto: `GOAL_SELECTION_AMBIGUOUS`, sin escritura y con pregunta
  pendiente. Con una sola meta puede salir sin cambios. «Cancelar» siempre sale sin resolver.
- Declaración elegida no modelada: se guarda como primary, se relee y se devuelve
  `saved=true`, `resolved=false`, `GOAL_UNSUPPORTED`, `canPlanTowardDeclaredGoal=false`.
  Web explica la limitación y no reinicia Planner. Halterofilia sigue fuera del catálogo.
- Declaración soportada: persistir → releer → `GOAL_RESOLVED` → continuación existente.

Se mantienen firma, usuario, huella, caducidad, CAS y relectura de la fase anterior.
Solo se archivan y retiran del perfil `objetivo_general` y `objetivo_principal` cuando una
elección explícita sustituye sus candidaturas. El primary previo se archiva íntegro.
`objetivo_detalle` ya no se borra ni se mueve al archivo; permanece como contexto activo.
No se recuperan automáticamente detalles archivados por selecciones de la fase anterior.
No hay migración ni modificación retroactiva de datos de producción.

## Compatibilidad y entrega

3B, Structured Dose, Sufficiency, Load, Readiness, Restrictions, Builder, 3D, reparación 3D.1
y retry DUPLICATE_MOVEMENT no cambian. El gate existente consume la proyección 3A corregida.
GOAL_RESOLUTION_DIAGNOSTIC y WEEK_STRATEGY_ADMISSION permanecen sin prosa sensible.
No se añade un diagnóstico redundante de roles: la proyección separa primary/detail/secondary/
competition y la procedencia conserva el campo. La resolución y las preguntas siguen siendo
serializables y compartidas por Web/React Native; la UI presenta y recoge respuestas.

1. Causa de «Si, es correcta»: faltaba su forma normalizada en la gramática cerrada.
2. Fix: cinco formas normalizadas añadidas; `es correcto` ya existía.
3. Semántica de campos: tablas anteriores, con escritores y preguntas reales.
4. Detalle no compite como primary por su uso mixto demostrado.
5. Cambio: evidence `goals.detail` y opciones basadas en candidatos reales.
6. Conflictos reconocidos: selección explícita entre declaraciones.
7. Unsupported: clasificación pendiente o primary unsupported guardado, nunca sustituto deportivo.
8. «Mantener»: ambiguo durante conflicto, no resuelve ni cancela silenciosamente la pregunta.
9. Persistencia: columnas existentes, CAS y reread; detalle preservado.
10. Nuevas pruebas: 14 (7 disponibilidad, 7 roles/UX/selección); fixtures antiguas de conflicto
    usan ahora una autoridad primaria real. Se mantiene la cobertura previa de no inferencia y CAS.
11. Suite completa: `node --test --test-concurrency=4 lib/**/*.test.mjs`, 1.278/1.278 PASS.
12. TypeScript: `npx tsc --noEmit`, PASS.
13. Diff: `git diff --check`, PASS.
14. Migraciones: ninguna.
15. Archivos: FormaPro, athletePrescriptionContext, goalAnswers, goalResolution.test,
    availabilityResponse, chatAvailability.test y este informe.
16. SHA: commit nuevo en entrega final, sin amend/rebase.
17. Git status: verificado después del commit.
18. NO PUSH.

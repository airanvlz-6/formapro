# Pre-gate 3C.1 → 3C.5

Commit auditado: `f52b3ba228c4fbd2b7f28cc266a54c6d8e7c4506`. Se conserva intacto: corrección en un commit posterior, sin amend/rebase ni push. No se implementa Training Load Model en este gate.

Resultado inicial: **CROSS_DOMAIN = REFACTOR_REQUIRED**. **MOBILE_READY = PASS**, con mejora de separación entre requisitos de pregunta y texto de presentación.

La decisión de suficiencia era pura y no tenía ramas `if carrera / else box`, pero su implementación dependía directamente de Movement Library, `DoseReference.kind='running'`, aliases de almacenamiento, conocimiento de ritmo equivalente y reglas de nivel técnico. Extenderla exigía editar el mismo módulo donde se decidían los estados. La corrección separa esa frontera, sin cambiar dosis, estrategia, scope ni persistencia.

## Clasificación del código auditado

El inventario completo de las **214 líneas coincidentes** está en [sufficiency-pre-gate-occurrences.json](./sufficiency-pre-gate-occurrences.json), con archivo, línea del commit original, términos encontrados, código, clase y motivo. Se buscaron carrera/running/box/CrossFit, comparaciones de disciplina, switches, equipment, measurement/capabilities, HR/GPS, benchmark, RPE, fallbacks, preguntas y dependencias de UI.

Alcance reproducible: archivos nuevos de autoridad de 3C.1 completos y todas las líneas añadidas por ese commit a archivos existentes. No se confunden miles de líneas anteriores de UI/planning con código introducido por 3C.1. Las dependencias anteriores relevantes se revisan también abajo.

| Clase | Líneas | Interpretación |
|---|---:|---|
| A | 12 | Requisito físico o regla de modalidad legítima; se conserva |
| B | 94 | Fixture o harness, sin autoridad de producto |
| C | 101 | Adaptador, contrato, almacenamiento o presentación |
| D | 7 | Acoplamiento de catálogo/unidades/política deportiva en el módulo central; extraído a adaptador |

Las siete líneas D son ejemplos concretos de la misma frontera mezclada, no siete reglas deportivas inválidas. El problema no era que existiera un fallback RPE o HR→ritmo: era que su conocimiento y la decisión central residían juntos.

| Aparición / dependencia | Clase y decisión |
|---|---|
| `movement.discipline.includes(... as 'box')` en el resolver | D. La admisión por catálogo pasa a `movementPrescriptionRequirements`; se elimina el cast cerrado |
| `kind === 'running'`, IDs `running:easyHr/easyPace` | D dentro de la antigua resolución; C en el adaptador/almacenamiento. El core nuevo no conoce estos nombres |
| Correspondencia thresholdHr→thresholdPace y easyHr/Z2→easyPace | A: conocimiento legítimo, ahora encapsulado en adaptador |
| RPE o duration_RPE según requisito de intensidad | A: política de compatibilidad del adaptador; el core solo ejecuta alternativas explícitas autorizadas |
| `run/cyclic` para opciones de Builder | C: semántica del catálogo actual, no clasificación de todos los deportes en el core |
| Equipment ALL/ANY, rack, barra, mancuernas | A/C: requisitos reales de Movement Library y compilación del adaptador; no inferencia por deporte |
| `skill.box.advanced`, `skill.carrera.advanced`, nivel_cf/nivel_carrera | C: mapa de campos actualmente capturados. No limita los IDs de evidencias del core |
| Opciones exactas de pulsómetro/GPS, maxHrMethod | C: adaptador de perfil manual existente; no se consulta ningún proveedor nuevo |
| `referenceQuestionFields` y parsers de respuestas numéricas | C: aliases y validación del almacenamiento existente, separados del core |
| Texto español de preguntas y `pendingPrescriptionQuestion` | C: presentación/transporte. La autoridad verifica token, usuario y scope en backend; no lee estado React ni compara el texto mostrado |
| `DoseReference` y normalización 3A de running/1RM | C: contrato de referencias desplegado; no se cambia en este gate para no romper recibos |
| `trainingFeasibility` admite hoy box/carrera | C: límite de cobertura del Builder anterior a 3C.1. No es el límite del nuevo core de suficiencia y no se amplía silenciosamente |
| `structuredSession` compara disciplina y catálogo | C: admisión de la librería desplegada, mantiene protección del scope |
| Etiquetas de objetivos en renderer profesional | C: presentación; no decide suficiencia |
| Coincidencias en tests de Coach/Focus/legacy/running/box | B: regresión de los dominios ya integrados |

## Frontera después del refactor

```text
Perfil/proveedor canónico + referencias + catálogo + intent ya autorizado
                              ↓
             Adaptador de requisitos del dominio
                              ↓
           lib/prescription/dataSufficiency.ts
             requisitos + evidencia + fallbacks
                              ↓
        status / missing / fallback / questionRequirements
                              ↓
       backend y contratos compartidos → Web / Mobile
```

`resolveDataSufficiency` no importa ningún módulo ni contiene nombres de deportes, unidades, catálogos, proveedores o componentes. Recibe `RequirementCheck[]`, evidencias resueltas, opciones de fallback y alternativas previamente autorizadas. Decide known→fallback→alternative→ask. Los adapters siguen siendo responsables de validar referencias, admisión, equivalencia deportiva y procedencia de sus entradas; un cliente no obtiene autoridad enviando arbitrariamente un requisito.

`lib/sports/prescriptionDataSufficiency.ts` conserva la API existente, compila mediante `movementPrescriptionRequirements`, llama al core y mantiene la representación histórica del resultado. `prescriptionReferenceFields.ts` contiene aliases de persistencia. `prescriptionQuestionRenderer.ts` ofrece el texto español compatible con los clientes actuales; no participa en el core.

La salida compartida incluye `QuestionRequirement` sin texto visual: ID, señales, tipo de respuesta y motivo. Cada cliente puede presentarla de forma distinta. El adaptador desplegado sigue devolviendo `questions[].text` para no romper Web/Mobile existentes, pero ninguna decisión depende de ese texto. `SignalEvidence.source` y `updatedAt` son datos; el core no enumera ni privilegia proveedores. La evidencia utilizada por fallbacks queda también conservada en `fallbackEvidence`.

## Fixtures fuera de los dominios iniciales

**Cycling-like:** se reutilizan `bike_erg`, patrón `cyclic`, implemento `bici_estatica` y una referencia HR ya representable. Duración por intensidad HR exige evidencia de referencia y capacidad de medición. Sin medición, usa duration+RPE solo cuando está autorizado; en caso contrario pregunta por capacidad. No recibe parámetro `cycling` ni añade rama alguna.

El ID legacy `running:z2` sigue siendo el identificador de la referencia existente; no se inventa una referencia de ciclismo ni se certifica que una zona concreta sea transferible entre deportes. El fixture demuestra resolución de requisitos HR previamente admitidos por un adaptador, no autorización de una planificación ciclista ni cálculo de zonas. El core no interpreta ese ID.

**Powerlifting-like:** `back_squat`, barra+rack y `reference.1rm:back_squat`. Con referencia válida: sufficient. Sin benchmark: RPE permitido y ninguna pregunta por 1RM. Con rack desconocido: pregunta por rack aunque RPE resuelva la intensidad. No existe parámetro ni rama `powerlifting`.

Estos fixtures reutilizan taxonomías reales. No se añaden librerías, movimientos, disciplinas ni endpoints de generación. Para ampliar la generación completa a otra especialidad habrá que aportar su conocimiento y admisión de dominio; no habrá que reconstruir este core. No existe bloqueo de taxonomía para los dos fixtures conceptuales solicitados.

## Mobile-ready

- Core ejecutado en una VM sin React, Next, DOM, browser APIs, Node APIs ni renderer. Cualquier import runtime en esa prueba falla.
- Entradas y resultados pasan JSON serialize/parse manteniendo estados, preguntas e IDs.
- Evidencias simuladas de perfil manual, HealthKit, Garmin, sensor móvil y proveedor externo producen la misma resolución y conservan provenance. Son nombres de fuente en fixtures, no integraciones.
- La UI local conserva un token para dirigir la respuesta; el servidor lo autentica de forma independiente y aplica scope actual. Expo consumirá la misma autoridad backend, no una reimplementación del planificador.
- No se depende del renderer profesional para resolver suficiencia. Los renderers consumen decisiones ya resueltas.

## Regresión y cierre

Se capturaron 20 resultados del código original antes del refactor. `compatibilityFixtures.json` conserva esos resultados y una prueba exige igualdad exacta de la API desplegada, incluidos fallbacks, preguntas, diagnósticos y fuentes. También se mantienen los 35 tests específicos de 3C.1 y toda la regresión de recibos, disponibilidad, restricciones, 3A/3B/3C, modos y persistencia.

Resultado definitivo: **CROSS_DOMAIN_GATE = PASS** y **MOBILE_READY_GATE = PASS**.

- `node --test lib/**/*.test.mjs`: **1064/1064**, cero fallos, omitidos o cancelados (122,25 s). Incluye 10 tests del gate además de los 1054 anteriores.
- `npx tsc --noEmit`: exit 0.
- `git diff --check`: exit 0.
- Sin migración, cambio de scope ni integración nueva. Las invariantes permanentes quedan en `AGENTS.md` para fases posteriores.
- Commit nuevo; SHA y estado final comunicados en la entrega. `f52b3ba…` permanece intacto. **NO PUSH**.

# FORGE — CONTRATO DE EQUIVALENCIA buildPrompt
**Documentado 18 de agosto de 2026, antes de crear getAthleteContext() para Forge Mobile**

Firma real confirmada con evidencia del código (`FormaPro.tsx`), llamada real en el flujo principal:

```
buildPrompt(
  catObj, respuestas, marcas, resumen, memoriaCoach, cicloActual,
  perfilPsicologico, esPremium||esAdmin, athleteState, datosEntrenamiento,
  estadoFisiologico, historialFisiologico, distribucionSemanal,
  objetivoPrincipal, planSemanal, debilidades, blockOutcomes, estadoCanonico
)
```

---

## Mapeo parámetro → fuente Supabase

| # | Parámetro (variable web) | Tipo | Fuente Supabase (columna `usuarios`) | Notas |
|---|---|---|---|---|
| 1 | `catObj` | `{id, titulo}` | Derivado de `categoria` + tabla `CATEGORIAS` (constante frontend) | Necesita replicar el array `CATEGORIAS` en backend, o simplificar |
| 2 | `respuestas` | `Record<string,string\|string[]>` | `perfil` | Directo |
| 3 | `marcas` | `{fecha,valor}[]` | `usuarios.marcas` | ✅ Confirmado: `u.marcas` directo, distinto de `marcas_especificas` e `historial_marcas` |
| 4 | `resumen` (historialResumen) | `string` | Generado en frontend desde `historial.slice(-6)` | **No es un campo de BD** — se construye a partir de `historial` |
| 5 | `memoriaCoach` | `{lesiones,plan,notas}` | `lesiones_actuales`, `plan_proxima_semana`, `notas_coach` | 3 columnas separadas combinadas en un objeto |
| 6 | `cicloActual` | `{bloque,semana,totalSemanas,objetivo}` | `ciclo_actual` | Directo |
| 7 | `perfilPsicologico` | `{arousal,confianza,estres,motivacion,notas_mentales}` | `perfil_psicologico` | Directo |
| 8 | `esPremium\|\|esAdmin` | `boolean` | `premium`, `admin` | Combinar con OR |
| 9 | `athleteState` | `Record<string,any>` | `athlete_state` | Directo |
| 10 | `datosEntrenamiento` | `Record<string,any>` | `datos_entrenamiento` | Directo |
| 11 | `estadoFisiologico` | `{fatiga_aguda,...}` | `estado_fisiologico` | Directo |
| 12 | `historialFisiologico` | `{fecha,hrv?,...}[]` | `historial_fisiologico` | Directo — verificar si `physiology_records` (tabla nueva) ya reemplazó esto o coexisten |
| 13 | `distribucionSemanal` | `string` | `distribucion_semanal` | Directo |
| 14 | `objetivoPrincipal` | `{descripcion,fecha,tipo}` | `objetivo_principal` | Directo |
| 15 | `planSemanal` | `any` | Accion backend `obtener_plan_semana` (tabla `weekly_plan`) | ✅ Confirmado: `cargarPlanSemanal` llama a `obtener_plan_semana` |
| 16 | `debilidades` | `{ejercicio,descripcion,fecha}[]` | `usuarios.debilidades` | ✅ Confirmado: `u.debilidades` directo, columna propia (no `athlete_development`) |
| 17 | `blockOutcomes` | `any[]` | Accion backend `obtener_block_outcomes` (tabla separada) | ✅ Confirmado: `cargarBlockOutcomes` llama a `obtener_block_outcomes` — **NO es `analisis_bloques`**, son datos distintos |
| 18 | `estadoCanonico` | `any` | Generado por `generarEstadoCanonico(supabase, codigo)` — función ya existente en backend | **Ya existe en backend**, reutilizable directamente sin cambios |

---

## Correcciones tras verificación con evidencia real

- ~~`marcas` sin confirmar~~ → **Confirmado**: `usuarios.marcas`
- ~~`debilidades` desde `athlete_development` (suposición)~~ → **Corregido**: `usuarios.debilidades` (columna propia)
- ~~`blockOutcomes` desde `analisis_bloques` (suposición incorrecta)~~ → **Corregido**: acción backend `obtener_block_outcomes`, tabla completamente distinta a `analisis_bloques`

---

## Hallazgos importantes para `getAthleteContext()`

1. **`resumen` (historialResumen) no es un campo de BD** — se construye en frontend a partir de `historial.slice(-6)`. El backend deberá replicar esta misma lógica de formateo a partir del historial guardado.

2. **`planSemanal` requiere una query adicional** a la tabla `weekly_plan`, no viene de la tabla `usuarios` directamente — igual que ya hacemos en otras acciones.

3. **`estadoCanonico` ya existe como función backend** (`generarEstadoCanonico`) — es el único parámetro que no necesita mapeo nuevo, se reutiliza tal cual.

4. **Pendiente de verificar con precisión**: nombre exacto de la columna para `debilidades` (candidato: `athlete_development`, pero no confirmado con el mismo rigor que el resto).

5. **`catObj`** requiere replicar el array `CATEGORIAS` (actualmente constante en frontend) en el backend, o simplificar la lógica si el backend no necesita el objeto completo.

---

## Próximos pasos (en orden)

1. Confirmar con precisión el nombre real de columna para `debilidades` (punto 16)
2. Confirmar nombre real de columna `marcas` (distinguir de `historial_marcas`, si aplica)
3. Construir `getAthleteContext(codigo)` en backend replicando este mapeo exacto
4. Copiar literalmente `buildPrompt` (sin modificar ni una línea) al backend
5. **Prueba de equivalencia**: comparar prompt generado por la web vs. el generado por `getAthleteContext + buildPrompt` copiado, para el mismo usuario en el mismo instante
6. Solo tras confirmar equivalencia, construir `enviar_mensaje_coach` con verificación JWT real
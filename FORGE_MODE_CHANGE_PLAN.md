# FORGE — Cambio de Modo (Mode Change), plan para mañana

## Regla de oro
El LLM no participa en la transición de modo. Ni para decidir qué modo quiere
el usuario, qué datos faltan, modificar el modo, cerrar el ciclo, o decidir
qué pasa con el histórico. Flujo: UI → backend determinista → estado →
mini-onboarding → confirmación → backend → nuevo estado.

## Conceptos a separar
- **Modo**: supervision / focus / coach — quién prescribe
- **Planificación**: ciclo actual, bloque, semana, sesiones, histórico, objetivos
- El cambio de modo nunca modifica el pasado (histórico = fotografía inmutable
  de lo que ocurrió realmente)

## Transición explícita
```
request_mode_change → validar modo destino → calcular datos ya existentes
→ calcular missingFields(targetMode) → ¿faltan datos?
   sí → mini-onboarding (solo lo nuevo, reutiliza edad/nivel/objetivo/etc)
   no → confirmación de cambio → ejecutar transición → nuevo estado
```

## Política del plan/ciclo activo
- Si el nuevo modo cambia fundamentalmente quién prescribe (ej: Coach→Focus):
  el plan actual se marca `interrupted_by_mode_change`, se conserva en
  histórico, nunca se borra ni se recalcula
- Nuevo ciclo/bloque/semana se genera tras el mini-onboarding del modo destino

## Nueva tabla: athlete_mode_events
```
id, user_codigo, from_mode, to_mode, reason, previous_cycle_id,
new_cycle_id, created_at
```
Trazabilidad de por qué existe cada plan, sin depender de memoria del LLM.

## Orden de trabajo (NO empezar por SQL ni por el botón)

**Fase 1 — contrato** (hacer esto primero, con calma, antes de código)
1. Definir estados y transiciones de modo
2. Definir qué datos son comunes vs. específicos de cada modo
3. Definir missingFields(targetMode) — reutilizando calcularEstadoOnboarding
4. Definir política de ciclo activo
5. Definir qué significa conservar/invalidar el plan futuro
6. Definir athlete_mode_events

**Fase 2 — backend**
7. calcularRequisitosModeChange()
8. requestModeChange()
9. Confirmación
10. Transición atómica
11. Tests de cada transición

**Fase 3 — UI**
12. Página "Mi Perfil" (Datos personales / Mi entrenamiento / Mi planificación /
    Cambiar plan / Cuenta — eliminar cuenta ya vive aquí)
13. Selector de modo
14. Mini-onboarding dinámico
15. Resumen + confirmación
16. Estado final y navegación al nuevo plan

**Fase 4 — pruebas destructivas**
17-24. Coach↔Focus↔Supervisión en ambas direcciones, cambio con semana/ciclo
activo, cancelar a mitad, repetir cambio, verificar histórico intacto
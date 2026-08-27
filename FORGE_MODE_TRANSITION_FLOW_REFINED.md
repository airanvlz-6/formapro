# FORGE — Mode Transition Flow determinista (refinamiento tras hallazgo real)

## Problema confirmado hoy
Dejar que el Coach conversacional "descubra" qué falta e interprete respuestas libres
para completar `missingFields` es una mala asignación de responsabilidad entre
UI/backend determinista/LLM — no un problema de prompt insuficiente. Produjo un caso
real de "punto muerto": el Coach preguntó ambiguamente, capturó mal la disciplina
externa, y nunca ejecutó la transición.

## Diagnóstico correcto
No construir una "máquina de preguntas dentro del Coach". Elevar el patrón a:

```
Máquina de estados determinista para transición de modo
+ formulario estructurado reutilizable (mismo componente que el onboarding inicial)
+ LLM únicamente para generación/interpretación excepcional
```

"Supervisión → Focus → recopilar datos → generar plan" es lógica de producto,
no razonamiento que deba delegarse al LLM.

## Arquitectura del Mode Transition Flow

```
1. Usuario selecciona modo destino (ya construido: /perfil)
2. Backend determina transición (current_mode, target_mode) — ya construido
3. Sistema calcula requiredFields faltantes — ya construido (calcularEstadoOnboarding)
4. UI ESTRUCTURADA recopila esos campos, una pregunta/pantalla a la vez — FALTA
   (reutilizar el mismo componente/patrón que FocusOnboarding, con chips de días,
   no conversación libre)
5. Validación determinista de cada campo (nunca "creo que dijo 4 días" — 
   sino ["lunes","miercoles","viernes"] real, seleccionado explícitamente)
6. Persistencia incremental de cada campo válido
7. Verificación final (missingFields === [])
8. Transacción de cambio (RPC change_athlete_mode — ya construida)
9. Generación inicial del plan (backend llama al Coach con contexto YA estructurado,
   el LLM no decide si generar, solo genera con los datos ya completos)
10. Resultado: modo activo + plan generado + usuario aterriza en Mi Plan
```

## Reutilización clave (evitar duplicar lógica)
Definir un componente/módulo compartido entre onboarding inicial de Focus y
Mode Transition:
```
FocusProfileRequirements
    ├── getRequiredFocusFields()
    ├── validateFocusField()
    └── saveFocusField()
```
Usado tanto por `InitialOnboarding` (usuario nuevo) como por `ModeTransition`
(usuario existente cambiando de modo) — nunca dos lógicas separadas que puedan
divergir con el tiempo.

## Rol correcto del LLM conversacional (secundario, no motor del flujo)
- Explicar por qué se pregunta algo
- Resolver dudas
- Interpretar una respuesta excepcional que no encaja en las opciones
  ("¿No encaja ninguna opción? Cuéntaselo a Forge" — como opción secundaria bajo
  los chips/opciones estructuradas, no como camino principal)
- Ayudar después de completar la transición

## Rol del Safety Net (verificar_datos_cambio_modo_deterministico)
Cambia de "reparador de un flujo frágil" a "última barrera de integridad":
```
Antes:  LLM intenta completar → Safety Net intenta arreglar
Después: UI estructurada → datos válidos → Safety Net verifica → transición
```
Se mantiene, pero como verificación final, no como mecanismo principal de captura.

## Decisión pendiente para la próxima sesión
Dónde vive la UI estructurada (dentro de /perfil como flujo expandido, o como
modal) — no decidir esto antes de tener claro el contrato lógico
(`mode_change: {current_mode, target_mode, required_fields[], collected_fields{},
status}`), que debe cerrarse primero.
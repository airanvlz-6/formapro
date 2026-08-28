# FORGE — Plan de transición: de desarrollo interno a usuarios externos

## Contexto
Tras la sesión del 27 de agosto (Mode Transition Flow completo y verificado), Forge
cruza un umbral: ya tiene una experiencia suficientemente completa (Supervisión,
Focus, Coach, cambio de modo entre ellos, Athlete State Engine, Modification Ledger,
Constraint Engine V2) como para exponerla a usuarios externos reales.

## Principio rector
No necesitas que Forge esté "perfecta" para empezar esta fase — necesitas que sea
suficientemente estable para que un tercero pueda usarla, y un canal sencillo para
que te diga "esto no funciona / no entiendo esto / esperaba otra cosa". Esa
información no puede obtenerse con más desarrollo interno.

## FASE A — Comunicación del nuevo modo (ahora, poco código)
- Actualizar la web para explicar los tres modos (Supervisión / Focus / Coach)
- Destacar Supervisión como propuesta diferencial (Forge no sustituye al entrenador)
- Explicar claramente que Forge puede convivir con entrenador y disciplinas externas
- Actualizar bio/perfiles sociales
- Publicar el anuncio del nuevo modo
- NO rediseñar la web ni añadir funcionalidades nuevas — solo comunicar lo que ya existe

## FASE B — Congelar web/backend (inmediatamente después)
- Dejar de tocar código web/backend salvo bugs críticos
- Momento adecuado: se acaba de cerrar una pieza compleja (Mode Transition Flow) y
  se obtuvo una lección clara sobre el proceso de desarrollo (verificar con evidencia
  antes de corregir, no asumir la causa)

## FASE C — App móvil (Apple Developer + HealthKit)
Objetivo de flujo completo a validar en real:
```
Instalar Forge → Crear cuenta → Onboarding → Elegir modo → Ver planificación
→ Registrar entrenamiento → Recibir/adaptar recomendaciones → Usar Readiness
→ Conectar HealthKit → Usar Forge de forma autónoma
```
- Pagar cuenta Apple Developer — ya no es "quiero probar HealthKit", es "quiero que
  usuarios externos usen Forge en condiciones cercanas a producción y descubran
  problemas que el desarrollador no puede ver"
- La parte iOS depende de capacidades nativas y distribución real — requiere el
  flujo de desarrollo/build de Apple correspondiente, no resoluble solo desde Expo Go

## Requisito imprescindible antes de entregar a usuarios externos: contacto en la app
En Mi Perfil / Ajustes, visible (no solo en la web):
```
¿Necesitas ayuda? Contacta con el equipo de Forge.
💬 Necesito ayuda
🐛 Reportar un problema
```
El reporte de problema debería incluir automáticamente: versión de la app,
plataforma (iOS/Android), usuario, fecha/hora, pantalla/contexto, descripción,
y opcionalmente captura de pantalla.

## Tono de beta abierta
No ocultar que es una versión en evolución:
- "Ayúdanos a mejorar Forge"
- Tras el uso: "¿Algo no ha funcionado como esperabas? Cuéntanoslo."
- El objetivo es que el usuario reporte el fallo, no que abandone la app en silencio

## FASE D — Primeros usuarios externos (feedback real)
Onboarding real → uso real → HealthKit → entrenamiento → Readiness → errores → feedback

## FASE E — Iteración
Solo entonces decidir qué merece la pena construir a continuación, con información
real de usuarios reales en vez de suposiciones internas.

## Orden completo
```
A. Comunicación → B. Congelación → C. Mobile/HealthKit → D. Testers externos → E. Iteración
```
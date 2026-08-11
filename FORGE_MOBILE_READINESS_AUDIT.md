# FORGE MOBILE READINESS AUDIT
**Iniciado 11 de agosto de 2026**

Auditoría previa a cualquier código móvil, siguiendo los 10 pasos definidos en el roadmap estratégico.

---

## 1. Inventario de páginas actuales

| Ruta | Función | Complejidad UI | Prioridad MVP móvil |
|---|---|---|---|
| `/app` | Chat principal (Coach), onboarding completo (bifurcación, categoría, formulario, test), banners de Forge Cards, Pending Actions | Muy alta — es el corazón de la app | 🥇 Crítica |
| `/hoy` | Daily Briefing: conocimiento, descubrimiento, objetivo, sesión de hoy, evolución, insight (adaptativo por modo_entrada) | Media | 🥇 Crítica |
| `/progreso` | Adherencia, tendencias fisiológicas (HRV/sueño), alertas inteligentes | Alta (gráficos Recharts) | 🥈 Importante |
| `/plan` | Mi Plan semanal, detalle de sesión por día, objetivo con progreso | Alta | 🥇 Crítica |
| `/atleta` | Perfil, conocimiento del atleta, datos personales, evaluación, disponibilidad | Media | 🥈 Importante |
| `/historia` | Timeline/calendario, eventos, Forge Insights, Share Cards | Alta (calendario visual) | 🥈 Importante |
| `V2` (landing) | Marketing, sin lógica de producto | Baja | ❌ No aplica a app (solo web) |

**Nota**: `/app` es la página más compleja — contiene el onboarding completo (bifurcación de modo, categoría, cuestionario, test inicial) además del chat. Para el MVP móvil, considerar si el onboarding merece pantallas nativas propias en vez de reutilizar el flujo conversacional completo tal cual.

---

## 2. Componentes reutilizables identificados

| Componente | Reutilizable en móvil? | Notas |
|---|---|---|
| `ForgeCardsGenerator.tsx` | ⚠️ Parcial | Usa `html2canvas` (DOM-based) — necesita reimplementación nativa (ej: `react-native-view-shot`) |
| `WorkoutShareCard.tsx` | ⚠️ Parcial | Mismo problema — `html2canvas` no existe en React Native |
| Lógica de parsers (`strengthRecordParser.ts`, `proposalParser.ts`) | ✅ Total | Puro TypeScript, sin dependencias DOM — reutilizable 100% |
| Lógica de validadores (`weekIntegrityValidator.ts`, `scientificRules.ts`) | ✅ Total | Puro TypeScript — reutilizable 100% |
| Estilos inline (patrón `style={{...}}` con objeto `C`) | ⚠️ Parcial | La paleta de colores (`C`) es reutilizable como constante; la sintaxis de estilos requiere adaptación a StyleSheet de React Native |

---

## 3. Separación UI / lógica de negocio (estado actual)

**Problema identificado**: la lógica está actualmente MUY entrelazada con la UI en `FormaPro.tsx` — el archivo mezcla llamadas a `apiCall`, parsers deterministas, y JSX en el mismo componente masivo.

**Recomendación para reutilización móvil**: antes de escribir la app, extraer a `lib/` (ya parcialmente hecho con validators y parsers) toda lógica que no sea puramente visual:
- Lógica de detección de confirmación (regex deterministas)
- Lógica de mapeo de datos para Share Cards
- Lógica de cálculo de disponibilidad/formato

---

## 4. Llamadas API identificadas

Todas las páginas usan un único patrón consistente: `POST /api/chat` con `{action, codigo, datos}`. Esto es una **ventaja real** para móvil — no hay múltiples endpoints REST que mapear, solo un cliente HTTP que reutiliza esta misma acción con distintos `action` strings.

**Acciones confirmadas hoy en la sesión** (lista parcial, no exhaustiva): `recuperar_usuario`, `guardar_usuario`, `actualizar_usuario`, `obtener_daily_briefing`, `obtener_plan_semana`, `guardar_plan_semana`, `obtener_progreso_objetivo`, `calcular_nivel_conocimiento`, `verificar_pr_deterministico`, `detectar_propuesta_sesion`, `confirmar_pending_action`, `cambiar_modo_entrada`, `verificar_semana_completa_sin_cierre`, entre muchas otras (el archivo `route.ts` es extenso).

---

## 5. Autenticación (estado actual)

**Confirmado**: Forge usa un sistema de "código de usuario" (ej: `FORGE12`, `PRUEBAS9`) como identificador — no hay login con email/contraseña tradicional en el flujo principal (aunque `email` se guarda opcionalmente para recuperación).

**Implicación para móvil**: este sistema es simple de portar (el código se puede guardar en `AsyncStorage`/`SecureStore` en vez de `localStorage`/URL params), pero es más débil que autenticación real — a evaluar si conviene reforzar con Supabase Auth nativo antes o durante la migración móvil, especialmente si se van a manejar datos de salud sensibles (ver sección de compliance del roadmap).

---

## 6. Dependencias exclusivamente web

| Dependencia | Uso | Alternativa móvil |
|---|---|---|
| `html2canvas` | Exportar Forge Cards / Share Cards como PNG | `react-native-view-shot` o `react-native-svg` + captura nativa |
| `URLSearchParams` / query params (`?codigo=...`) | Navegación entre páginas con código de usuario | Navegación nativa (React Navigation) + estado persistente |
| `window.location` | Redirecciones | React Navigation |
| Inputs `<input type="file">` | Subida de fotos para Share Cards | `expo-image-picker` |
| Recharts (gráficos de Progreso) | Visualización de tendencias | `react-native-svg` + librería de charts nativa (ej: `victory-native`) |

---

## 7. Funcionalidades que necesitan APIs nativas (no existen en la web actual)

- Notificaciones push (recordatorios de sesión, Forge Insights nuevos)
- Cámara nativa (no solo galería) para Share Cards
- Compartir nativo (share sheet de iOS/Android) en vez de solo "descargar PNG"
- Apple Health / Health Connect (lectura de datos si el usuario no usa Garmin)
- Background sync (si se implementa Fase A/B de wearables)
- Almacenamiento seguro de credenciales (SecureStore vs localStorage)

---

## Próximos pasos (puntos 8-10, próxima sesión)

8. Definir arquitectura web + mobile concreta (monorepo vs proyectos separados)
9. Crear proyecto móvil vacío (decidir Expo managed vs bare workflow)
10. Conseguir login → Home → Coach → Supabase funcionando end-to-end como prueba de concepto mínima
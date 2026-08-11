# FORGE — ROADMAP ESTRATÉGICO
**Documentado al cierre de la sesión del 11 de agosto de 2026**

Tres líneas paralelas de producto, ninguna debe tocar el núcleo ya blindado (Orchestrator, Knowledge Engine, Validators, Canonical Truth, Pending Actions, sistema de auditoría).

---

## 1. Wearables / Garmin

**Estado real verificado (agosto 2026)**: el formulario público de solicitud del Garmin Connect Developer Program parece retirado, con nuevas solicitudes pausadas sin fecha de reapertura. Verificar estado en vivo en developer.garmin.com antes de cada intento.

**Estrategia de 3 fases (desacoplada del proveedor):**

**Fase A — Mock Wearable Provider (empezar ya, sin dependencias externas)**
```
lib/integrations/wearables/
    ├── adapter.ts (interfaz comun)
    ├── mockProvider.ts
    └── (futuro: garminProvider.ts, terraProvider.ts)
```
Simula payloads reales (`activity`, `sleep`) que entran al mismo pipeline que ya existe (`workout_history`, `physiology_records`) — Forge no debe distinguir el origen del dato.

**Fase B — Terra (agregador con partnership Garmin ya activo)**
Registrar cuenta, probar flujo real: Usuario → Conectar Garmin → OAuth → Terra → Webhook Forge → Supabase. Documentar qué campos llegan y con qué frecuencia real.

**Fase C — Garmin directo (paralelo, sin bloquear)**
Solicitar el programa oficial en paralelo. Si aprueban: Garmin directo. Si no: Terra permanece como puente. El resto de Forge nunca debe "saber" cuál proveedor está activo.

**Impacto de producto**: resuelve directamente el hallazgo de "la gente es vaga, no quiere reportar" — de "atleta cuenta su entreno a Forge" a "Garmin lo detecta → Forge lo recibe y analiza automáticamente".

---

## 2. App móvil nativa

**Estrategia**: no reescritura desde cero. Web actual sigue como entorno de validación; app móvil se desarrolla en paralelo consumiendo el mismo backend.

**Decisión de stack**: React Native + Expo (si la arquitectura Next.js/React actual lo permite) — evitar WebView, Forge necesita capacidades nativas reales (notificaciones push, cámara/galería para Share Cards, Apple Health/Health Connect, background tasks).

**Paso previo obligatorio — Mobile Readiness Audit (antes de escribir código):**
1. Inventariar páginas actuales
2. Inventariar componentes reutilizables
3. Separar UI de lógica de negocio
4. Identificar llamadas API
5. Identificar autenticación
6. Identificar dependencias exclusivamente web
7. Identificar qué funcionalidades necesitan APIs nativas
8. Definir arquitectura web + mobile (backend como fuente común de verdad)
9. Crear proyecto móvil vacío
10. Conseguir que login → Home → Coach → Supabase funcione end-to-end

**MVP móvil (alcance, no las 20 páginas de la web):**
Hoy (recuperación, sesión de hoy, último entreno, Knowledge) · Coach (chat, registro, Pending Actions) · Mi Historia (entrenos, Cards, compartir) · Mi Plan · Mi Atleta.

**Primeras pruebas nativas (antes incluso de Garmin)**: notificaciones + cámara + compartir + persistencia + login — es lo que diferencia una app real de la webapp. El flujo "Entreno registrado → Forge Card → Compartir directo en Instagram/WhatsApp" es candidato fuerte a mejor experiencia móvil.

**Cuentas a abrir ya (no requieren app terminada)**: Apple Developer Program, Google Play Console. Preparar en paralelo: nombre app, Bundle ID, iconos, splash, política de privacidad, términos, declaración de datos de salud recopilados.

**Distribución de pruebas**: build desarrollo → dispositivos propios → TestFlight/Internal Testing → tú + pareja → 5-10 usuarios → 25-50 usuarios → publicación.

---

## 3. Datos de salud y compliance (pendiente de investigación con fuentes actuales)

Temas a resolver antes de publicar en tiendas, dado que Forge maneja datos de salud/fisiología (HRV, sueño, FC):
- GDPR (aplica en UE, no HIPAA)
- Políticas específicas de "health data" de App Store y Google Play
- Declaración de qué datos se recopilan, para qué se usan, cómo se almacenan
- Requisitos de seguridad para que la app sea clasificada como segura en ambas tiendas

**Acción**: investigar con búsqueda web real al inicio de la próxima sesión — este documento no contiene respuestas todavía, solo el mapa de lo que falta resolver.

---

## Principio que conecta las 3 líneas

Ninguna debe tocar el núcleo ya validado hoy (Orchestrator, Knowledge Engine, Validators, Canonical Truth, Pending Actions, auditoría de 3 niveles). Son todas capas de infraestructura/distribución nuevas que consumen el backend existente, nunca lo reinventan.
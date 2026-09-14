# Semántica composicional olímpica — propuesta separada, no implementada

Estado: DESIGNED como propuesta; NO CONNECTED, NO VERIFIED LOCALLY como implementación, NO PROVEN IN PRODUCTION. No forma parte del bugfix de los tres movimientos canónicos. Esta propuesta describe conocimiento de movimientos, nunca autoridad para prescribir.

## Contrato de conocimiento propuesto

Un adaptador de dominio de halterofilia resolvería una receta tipada con:

- baseLift: snatch, clean o jerk;
- startPosition: floor, below_knee, knee, above_knee, high_hang o blocks cuando sea aplicable al lift;
- receivingStyle: power, squat o split cuando sea aplicable;
- modifiers explícitos: pausa con posición y duración; tempo por fase definida; grip o stance solo si existe semántica validada en el adaptador; altura de blocks explícita cuando sea necesaria para resolver el inicio.

No basta una lista de strings: cada operación debe definir precondiciones, transformación semántica, requisitos de equipo/habilidad y qué evidencia biomecánica deja de ser válida. Jerk no hereda automáticamente los inicios del tirón de snatch/clean: se necesita representar su estado de rack/inicio propio antes de admitir esa composición. No se escogerá un default para hacer válida una combinación incompatible.

Una combinación se resuelve componiendo operaciones compatibles sobre una base, no registrando todas las variantes posibles. Una receta de hang power snatch desde knee se expresa mediante baseLift, inicio y recepción, no mediante un nuevo ID por combinación. Un modifier `better` no es semántica ejecutable. Display name siempre derivado o verificado contra la receta.

## Base e identidad

La implementación actual solo tiene tempo/stance/direction/loadPosition y patrones controlados. No existe infraestructura exacta de startPosition/receivingStyle. La biblioteca contiene snatch, power_snatch, hang_snatch, power_clean, hang_clean y clean_and_jerk, pero **clean_and_jerk no puede funcionar como alias silencioso de clean**: incorpora un segundo movimiento. El adaptador deberá resolver explícitamente la identidad atómica y sus requisitos sin falsear ese anchor compuesto.

Identidad estable: versión del resolver + base semántica + operaciones normalizadas en orden canónico. El ID local del proveedor no sustituye la identidad derivada. Una futura receta/resolver v2 debe coexistir con v1; no reinterpretar receipts existentes. No se presupone necesidad de Session v5: se evaluará únicamente si el envelope firmado actual no puede vincular de forma inequívoca la nueva versión del resolver.

## Frontera factual

El adaptador produce requisitos y evidencia con procedencia, nunca `safeForAthlete`, availability ni autorización de carga. El servidor contrasta los requisitos con los hechos del atleta mediante las autoridades compartidas existentes.

Cambios de geometría invalidan las garantías negativas no demostradas; exclusiones relevantes conocidas persisten. Biomecánica desconocida bajo una restricción relevante sigue siendo hard. Metadata puramente analítica ausente queda UNKNOWN cuando no impide identidad, ejecución o comprobación factual. No se inventan métricas a partir del nombre.

Inicio desde blocks implica un requisito de equipo que debe representarse y resolverse; no se asume disponibilidad ni se sustituye por hang. Referencias %1RM/HR/pace nunca se heredan por compartir familia o por parecerse el nombre: requieren compatibilidad exacta explícita. Sin ella, la referencia no está autorizada aunque la receta de movimiento pueda estar resuelta.

## Implementación futura y aceptación

1. Definir operaciones y matriz de compatibilidad por propiedades en el adaptador de dominio, con fuentes de conocimiento/procedencia revisadas antes de implementarlas.
2. Resolver identidad y descripción deterministas; mantener campos desconocidos y contradicciones como errores explícitos. Sin NLP arbitrario ni permiso basado en labels.
3. Integrar requisitos/evidencia en contratos compartidos, independientes de React, Next, Expo y UI.
4. Verificar composiciones no enumeradas, operaciones incompatibles, equipo desconocido/no disponible, recepción desconocida, restricciones activas, metadata analítica ausente sin restricción, referencias exactas, dosis/tiempo y nombres contradictorios.
5. Verificar hashes estables, no colisión entre bases/operaciones, receipts antiguos intactos y binding de la representación final. Separar conocimiento nuevo de selección deportiva: el Coach sigue decidiendo si conviene usar una receta admisible.

No aplicar ninguna de estas ampliaciones para ocultar MOVEMENT_SHAPE_INVALID en goblet_squat, single_leg_rdl o bulgarian_split_squat.

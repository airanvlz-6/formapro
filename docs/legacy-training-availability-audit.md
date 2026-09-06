# Legacy training availability audit

Baseline: `81219e2`. Production identified `carrera_larga` as a string, with `pista`
an array, Coach scope `box/carrera`, and no explicit overriding sources. The log
intentionally did not include the string contents. It proves the shape failure;
the supported grammar below is established by repository writers, not inferred
from the medical state or an LLM title. No production reads or migration were run.

## Storage and historical representations

The field is `usuarios.distribucion_semanal`. There is no tracked SQL definition
for that column, nor a generated database type that constrains it. The web state
declares `string`; the session adapter declares `unknown`; the integrity validator
declares category values `string[] | string`. Supabase returns it without a typed
schema. Readers accept a top-level object or a JSON-serialized object.

Historical writers in `app/FormaPro.tsx` used `days.join(', ')` for generic
availability and dynamic Focus categories. A one-element selection yields
`"domingo"`; multiple selections yield `"lunes, miércoles, domingo"`. The mode
change and onboarding capture handlers in `app/api/chat/route.ts` used the same
format. The pre-existing session contract adapter also explicitly split commas.
The conversational extractor accepted an entire distribution if **any** category
was an array, allowing `{pista: [...], carrera_larga: "domingo"}` to persist.
These paths explain how the shape can be produced; the exact historical write
transaction for the affected athlete is not available.

No writer was found producing JSON-encoded arrays *inside* category values.
Those remain rejected, as do empty strings, empty comma tokens, unknown weekdays,
sentences, external-coach annotations, null, objects, and mixed arrays. Whole
distribution JSON is distinct from embedded array JSON and remains supported.
Empty explicit arrays remain empty availability, not guessed training days.

## Writer inventory and changes

All tracked writes of this field are in `app/api/chat/route.ts`:

- `guardar_usuario`: inserts the existing projected onboarding payload. Auth
  projection is unchanged; its web producer now supplies category arrays instead
  of joined text and moves no ownership into availability values.
- `verificar_datos_cambio_modo_deterministico`: saves normalized generic day arrays.
- `guardar_campo_mode_change`: saves normalized generic day arrays or rejects.
- `actualizar_usuario` conversational extraction: retains the explicit-confirmation
  guard, validates **every** day category and saves normalized serialized JSON.
- `verificar_correccion_disponibilidad_deterministico` and
  `guardar_disponibilidad_actualizada`: refuse unstructured prose instead of
  overwriting a calendar with `{descripcion: ...}`. Recognized structured objects
  or serialized objects pass through the same writer boundary. No LLM text is
  heuristically parsed. The UI consumes the successful persisted representation.

Category names and associated metadata are preserved. Day-category values use
arrays in new writes; the envelope remains serialized JSON for existing readers.
An unstructured correction now reports `AVAILABILITY_FORMAT_INVALID` and requires
structured availability. This is intentional protection against recurring corrupt
writes, not a new natural-language extraction flow.

## Reader inventory

- `weeklyCalendarAuthority`: reads the stored field and explicit sources; uses the
  new boundary before its unchanged array predicate and calendar validation.
- `prepareSessionTrainingContract`: uses the same canonical boundary for named
  categories; explicit-source priority and Coach generic fallback remain unchanged.
- `prescriptionScope.resolveProfileDisciplines`: reads category names only; unchanged.
- `FormaPro`: loads the profile, parses it for blueprint/integrity checks and uses
  it as presentation/prompt context. It now stores the server-returned successful
  availability instead of reconstructing description-only objects.
- `weekIntegrityValidator`: parses the envelope and consumes category arrays; unchanged.
- `app/atleta/page.tsx`: displays the field; unchanged.
- `lib/mobile/getAthleteContext.ts` and mobile/web prompt builders: profile context;
  unchanged.
- Chat route snapshot/onboarding completeness, Block Analyzer, Week Planner and
  correction prompt reads remain unchanged.

The Week Planner's independent object-to-`[object Object]` prompt debt remains
pending. The strict calendar rereads persisted availability rather than trusting
a model-returned availability field.

## Canonical boundary and running taxonomy

`lib/sports/trainingAvailability.ts` owns day-format normalization and alias union.
Successful `normalizeTrainingAvailability` returns `Record<string, string[]>` for
the requested existing managed disciplines. Failure has no partial canonical map.
`normalizeAvailabilityForStorage` preserves source/category keys while normalizing
all day values. Neither function takes a session title.

`prescriptionScope.canonicalDiscipline` remains the exact alias authority:
`pista`, `carrera_larga`, `carrera_series`, `running`, `run` contribute to `carrera`.
`fartlek` is a movement ID, not a new discipline alias. `movementLibrary` assigns
running movements (fartlek, rodajes, tempo, series, etc.) to `carrera`;
`workoutStructureLibrary` assigns structures such as `intervalos_carrera` and
`tempo_continuo`; `STIMULUS_LIBRARY` identifies physiological intent.
`disciplineCatalog` also describes allowed formats. None is replaced or expanded.

Legacy integrity mappings and UI share-card type regexes also exist. They are
not consolidated here. No title-based discipline inference was found in the
canonical authority. Its existing recovery-title marker identifies calendar state,
not discipline; that compatibility behavior is unchanged. Tests exercise eight
running titles with explicit `tipo: carrera`, and reject using aliases themselves
as independent calendar prescription types.

The target-week Sunday remains `2026-09-13` for `week_start: 2026-09-07`, with
Atlantic/Canary date resolution. Scope, restrictions, dose, frequency, protected
REST/RECOVERY, receipt validation, CAS and closure are not redesigned.

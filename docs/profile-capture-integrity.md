# Athlete profile capture integrity — Phase A

Scope: capture/projection consistency, not dose, HR-zone, tempo, restriction or
development policy. No backfill, storage migration or second canonical profile.

## Integration manifest

| Source | Canonical destination | Normalization | Consumer / authority |
| --- | --- | --- | --- |
| usuarios.marcas_especificas.5k | running.byMetric.5k | exact alias to tiempo_5k, existing clock parser | SessionDoseContext 5K reference, with existing measurement gates |
| usuarios.marcas_especificas.10k | running.byMetric.10k | exact alias to tiempo_10k, existing clock parser | SessionDoseContext 10K reference, with existing measurement gates |
| existing tiempo_5k / tiempo_10k stores and historial_marcas | existing running metrics | unchanged parsing | same consumer; no last-write-wins |
| usuarios.marcas_especificas.bench | strength.byMovement.bench_press | movement identity only | existing strength resolution; bare kg remains unknown_rm |
| usuarios.perfil.nivel, only usuarios.especialidad=carrera | skill.carrera.advanced | exact actual Carrera questionnaire labels | existing skill signal; no volume/intensity policy |
| usuarios.perfil.nivel_carrera | skill.carrera.advanced | historical mapping retained | both known declarations must agree; disagreement/unknown competing declaration is ambiguous |
| usuarios.perfil.duracion | sessionTimeBudget | existing minutes/hours/range parser | existing maximum only |
| usuarios.test_atleta UI facts | existing test profile projection | capture shape/options validated, keys/values retained | persisted before report generation; report never supplies performance facts |

All aliases retain their real storage source. Existing running/strength resolution
coalesces equal evidence and rejects conflicting values. There is no rewrite of
historical profiles. Explicit persistent/date skill answers keep their precedence.
Generic level from another specialty is not a running declaration. Unrecognized
generic labels confer no new skill authority.

The test `profileCaptureIntegrity.test.mjs` reads the actual FORMULARIOS,
CAMPOS_MARCAS and TEST_ATLETA declarations. Its inventory requires every performance
capture key to have an explicitly reviewed connection or deferral; a new UI key
fails CI until reviewed. Positive cases additionally exercise the actual canonical
projector/dose context. Inventory membership alone does not establish authority.

## Deliberate deferrals

- 21k/42k: no compatible existing SessionDoseContext performance metric; no new
  distance or pacing model introduced.
- Generic strength editor entries are not labelled 1RM. Back/front squat,
  deadlift, snatch, clean_jerk, push_press and log_press retain existing identity
  handling. bench now identifies press banca, but only explicit RM evidence can
  authorize percentages. Bare squat and clean remain ambiguous; totals, farmer
  carry and skill/event benchmarks receive no invented RM semantics.
- Generic experience, declared skills, body weight, weekly kilometres, group and
  rehabilitation data do not acquire new dose authority.
- Free-text injuries do not become structured restrictions; declared weaknesses
  and the report do not become active development targets.

## Test facts and analysis

The real generarInformeTest handler validates capture, requires an existing user,
awaits the existing actualizar_usuario fact write, then calls the model. It saves
the report with the same captured facts and observation date only after successful
analysis. Network/JSON/report-write failures cannot erase the first write. A failed
fact write prevents analysis. The old test_atleta_fecha top-level submission was
dropped because the existing update allowlist never persisted it; test_atleta.fecha
remains the actual date source. This does not add report-to-authority inference.
The generic backend update API remains existing infrastructure; this change does
not claim atomic conflict resolution for concurrent tests on multiple clients.

## HR gap audit

onboarding_gaps contains a real missing fc_reposo write, but this HEAD has no
setPantalla transition to that screen and no setter call populating its missing
fields. It is not reactivated or edited in Phase A. Normal Carrera FC capture
persists perfil.fc_reposo; the test verifies its actual projection/provenance and
that it does not become a training target. Revisit the missing write before any
future reactivation. No zones or age formula are introduced.

## Goal semantics — product decision deferred

The integrated editor and /perfil show "Objetivo actual" while writing only
perfil.objetivo_detalle. That is contextual detail, not an update to the canonical
primary objective. GoalResolution reads primary evidence; StrategyResolution
remains unchanged. Proposed minimum presentation repair: call this field
"Contexto adicional del objetivo" and explicitly direct a primary-goal change to
the existing confirmed goal flow. Choosing to make this a primary-goal editor is
a separate product decision; no alias or authority change is included here.

## Time capture audit

The real mode-change question ID duracion_sesion writes perfil.duracion.
Onboarding and integrated profile edit use perfil.duracion. Group declarations
use perfil.duracion_clase. Historical perfil.duracion_sesion and tiempo_sesion
remain accepted by the existing parser. No new writer or storage alias is needed.
The projector also accepts top-level historical durations, but the canonical
loader does not select those columns; no active writer justifies expanding that
read in Phase A. Hasta 1 hora is 3600 seconds; Hasta 1h 30min is 5400 seconds;
60–90 min is a bounded range and Mas de 1h 30min has no maximum. Conflicting aliases
remain conflicts. TIME_ONLY_AS_MAXIMUM is unchanged.

# Explicit onboarding primary goal

Base: `73dcda0022c8f6a5e6dd0a98850792e9b10e2a78`, initially clean.

## Cause and boundary

The Carrera form asks an explicit goal in `perfil.objetivo_detalle` and captures
`perfil.distancia_objetivo`. Since bfb8657 the former is deliberately detail,
not an independent primary source. The welcome uses the local profile before
the write, so it could display a goal while planning received zero candidates.

This repair marks explicit goal questions with `goalRole: PRIMARY`. The shared
`captureOnboardingGoal` creates a transient, versioned provenance marker:

```json
{"version":1,"source":"onboarding_goal_question","field":"objetivo_detalle","role":"PRIMARY"}
```

The actual creation payload includes that marker; the backend creation writer
calls `projectOnboardingGoal`. It reads the original profile answer, never the
welcome, chat, labels, keywords, or a classification from the LLM. The marker
does not become a database column. Generic updates do not consume it.

The persisted goal is the minimal existing reader-compatible shape:

```json
{"descripcion":"mejorar tiempos en media maratón"}
```

`saveGoalAnswer` uses the same description field and also records update/history
metadata for its separate replacement workflow. Creation needs no fabricated
resolution, canonical ID, timestamp or replacement history. The original detail
and structured distance remain unchanged. The description is preserved verbatim.

## Explicit forms versus context

Marked goal questions: Carrera, CrossFit, calisthenics, Hyrox, general hybrid,
OCR, triathlon and strength. They ask what the athlete wants to achieve. No
sport-specific matching occurs in the writer.

Unmarked detail questions: generic fitness context (already has a primary
question), group forms and rehabilitation context. The mode-change flow is not
changed. Merely storing `objetivo_detalle` does not grant primary authority.
The helper requires the exact marker, a nonblank string and at most 2000
characters, matching the existing declaration length boundary.

## Precedence and conflicts

- If the creation input already includes `objetivo_principal`, preserve it
  exactly and do not promote detail. Presence reserves that source even when
  empty/malformed; existing readers still determine whether it is usable.
- If the profile already has a nonempty reader-compatible `objetivo_general`
  or `objetivo_principal`, do not add a top-level primary from detail.
- If those existing explicit primary sources already contradict one another,
  preserve them and their existing GOAL_CONFLICT behavior. No silent resolution
  and no third candidate from detail.
- Generic updates and existing user authority are unchanged. No backfill.

## Before and after

Before the creation projection:

```json
{"perfil":{"objetivo_detalle":"mejorar tiempos en media maratón","distancia_objetivo":"Media maratón (21K)"}}
```

After: the same profile plus `usuarios.objetivo_principal` with the description
above. Availability still stores Carrera L/X/V/D; maximum duration remains
90 minutes. No availability confirmation is issued by creation.

| Layer | Before | After |
|---|---|---|
| Primary candidates | 0 | 1, source usuarios.objetivo_principal |
| Goal Authority | GOAL_MISSING | GOAL_UNSUPPORTED, free description preserved |
| canonicalGoalId | null | null (no alias changes) |
| Strategy | GOAL_MISSING | STRATEGY_RESOLVED, half_marathon, structured_event |
| First planning preflight, other inputs resolved | goal required | canContinue=true; no goalRequirement |

The integration fixture confirms availability, receives the temporal question,
chooses the next available day and passes preflight with includeToday=false.
It does not bypass other planning authorities or assert that arbitrary production
profiles must pass all unrelated gates.

## Tests and limits

`onboardingGoal.test.mjs` executes real form metadata and the actual creation
payload AST, before/after projection, readers and full preflight. It checks
welcome independence, preservation, notes/context exclusion, prior primary
precedence, genuine conflicts, invalid markers, bounds and availability.
`legacyContainment.test.mjs` exercises the complete POST and inserted/returned
primary shape. Seven tests are added; existing grammar tests remain unchanged.

Historical users are not rewritten. Unmarked clients do not gain primary
authority merely by submitting detail. The conversational phrase without a
colon remains outside the current goal answer grammar; this is separate work.
No Goal aliases, Strategy, matching, availability/environment, intensity, dose,
feasibility, retries or generation-limit changes.

Local commit only. No push.

## Validation

- Seven permanent tests added, all passing.
- Selected onboarding, goal answers/authority, strategy, availability and
  generation preflight tests: 309/309 passed.
- `node --test --test-concurrency=4 lib/**/*.test.mjs`: 1793/1793 passed.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.
- Lint delta zero: FormaPro retains 182 errors / 46 warnings against the HEAD
  baseline; legacyContainment retains its two existing errors. New helper/tests
  and changed containment tests have zero errors/warnings. Lint is not globally
  clean; the historical debt is unchanged.

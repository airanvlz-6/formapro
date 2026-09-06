# 2E.3A.2 — Canonical session intent

Baseline: `8f828e29a12c68f87236eedf86439af703564b47`. Capability only;
the current weekly path does not supply authoritative intent.

## Taxonomy audit before implementation

`lib/sports/movementLibrary.ts` defines `PatronMovimiento`:
`squat`, `hinge`, `horizontal_push`, `vertical_push`, `horizontal_pull`,
`vertical_pull`, `olympic_lift`, `carry`, `run`, `jump`, `core_antirotacion`,
`core_flexion`, `core_antiextension`, `locomotion`, `lunge`, `rotational`,
`cyclic`, `inverted_locomotion`.

All 162 catalog movements have exactly one `movement_pattern`. Seventeen of the
18 type members have catalog instances; `locomotion` has none. It remains a valid
canonical pattern but cannot discharge an intent with the present catalog.
Multidiscipline movement membership is separate from pattern membership.
For example, bench_press is horizontal_push, back_squat is squat and deadlift is
hinge. Composite exercises still have their single declared pattern; no secondary
pattern is inferred from an exercise name or biomechanics.

Other existing semantics were inspected:

- `stimulus` and `suitable_for` are movement metadata. The authoritative candidate
  lookup uses `suitable_for` plus discipline; this is unchanged.
- `ModalidadEjercicio` and `MODALIDAD_POR_MOVIMIENTO` live in
  `workoutStructureLibrary.ts`. They support exposure aggregation and are not a
  required adaptation or a main-pattern contract.
- `agregarExposicionPorPatron` aggregates exposure using movement_pattern. Before
  this phase, it did not impose a required pattern on an executable session.
- Progression, regression and variant IDs are relationships, not multiple pattern
  membership. No separate canonical family/group or primary/secondary pattern
  field was found in the movement model.
- Weakness labels, `debilidad_relacionada` and blueprint `trabaja_debilidad` support
  context, variety/coherence checks and warnings. They do not prove a canonical
  movement-pattern mapping. They are not an intent source.
- No existing AllowedTrainingContract field expressed a required pattern.
- `checkSessionShape` already requires ordered warmup/main/cooldown blocks and
  nonempty distinct movement IDs within each block. It has no finer distinction
  between primary and accessory entries inside main.

## Minimal model and provenance

`PrescriptionIntent = { kind: 'stimulus_only' } | { kind: 'main_pattern';
pattern: PatronMovimiento }` reuses that exact type. An exhaustive runtime Record
validates its existing members without aliases or a new taxonomy. Values must
have exact keys. Null, explicit undefined, strings, missing fields, extra fields
and unknown patterns reject; only absence of the optional field defaults to
stimulus_only. There is no title, focus, explanation, weakness or display parser.

The pure API accepts canonical input from trusted server code. Runtime shape
validation establishes validity, not the trustworthiness of an arbitrary caller.
Future adoption must obtain the value from admitted structured planner metadata
or a deterministic code-owned source. This phase does not designate current LLM
free text or request data as authoritative. The current adapter deliberately
does not consume an extra request intent field. No new HTTP source was added.

## Shared semantics and ordering

Existing stimulus/discipline lookup and exposure ranking run first, followed by
area, explicit movement and capability restrictions, including relevant unknowns.
`intentMatchingMovementIds` then selects matching IDs from the safe pool. The same
helper checks executed main IDs and supplies the conditional generation guidance.
No second metadata comparison or pattern filter exists.

The safe `allowedMovementIds` pool remains available for accessories; intent does
not require every movement to match. `intentMovementIds` is an internal core
result, not a second caller-supplied authoritative list. A main_pattern requires
at least one matching allowed ID inside main. Warmup/cooldown do not count.
This is the smallest enforceable primary-work requirement: no workload fraction,
dominance, eccentric tempo or dose objective is claimed by this model.

Structure existence then requires enough distinct safe IDs and at least one
matching ID. Accessories may fill other couplet/triplet slots. Continuous and
other existing structure constraints remain unchanged. Missing safe movements
still yields MOVEMENT_POOL_EMPTY; a nonempty safe pool without an intent match
yields INTENT_POOL_EMPTY. Insufficient structure space remains a separate error.
Executed main work without a match yields INTENT_NOT_SATISFIED.

## Contract, authentication, generation and rendering

An absent intent preserves the version-1 public contract byte-for-byte. Explicit
intent uses version 2, including explicit stimulus_only. Version 2 requires a
valid intent; version 1 rejects one. This prevents an old version-1 validator from
silently admitting a version-2 constraint it does not understand. Other fields,
pool IDs, filtering and ranking are unchanged. No persistence migration is needed.

`sessionAuthority` already signs the entire contract and proposal; intent and
contractVersion therefore participate in the existing HMAC payload. Verification
rerenders through the updated structured validator. Tests cover removal/change of
intent without a valid MAC and invalid main work even in a signed fixture.
The receipt format, HMAC domain and calendar receipt semantics are unchanged.

`generateContractSession` already clones and deeply freezes the entire contract.
Intent is immutable through retry. Only main_pattern contracts receive additional
prompt guidance listing matching IDs from the shared helper. Current no-intent
prompts and retry policy remain unchanged. The renderer still revalidates and
only claims the generic stimulus; arbitrary explanations are not rendered.

## Production outcomes and scope

With impact/jump/deep-flexion prohibited and axial-load prohibition false:

- Thursday fuerza_maxima + stimulus_only: ["bench_press"].
- Thursday fuerza_maxima + main_pattern:squat: INTENT_POOL_EMPTY.
- Thursday fuerza_maxima + main_pattern:horizontal_push: ["bench_press"].

The seven existing no-intent regressions remain six MOVEMENT_POOL_EMPTY cases and
Thursday bench_press. The present weekly proposal still arrives without intent;
this phase does not claim to fix that upstream adoption gap.

No weekly authority, planner schema, free-text inference, frequency, REST/RECOVERY,
Readiness, timezone, movement metadata, fallback, Auth, Team, calendar slot binding
or prompt-object debt changes. No push.

## Tests

25 new tests cover taxonomy admission, invalid/unknown intents, real squat/push/
hinge metadata, Thursday restrictions, main versus warmup/cooldown, accessories,
structure cardinality, version guards, HMAC tampering, retry immutability, generic
rendering and non-adoption by the current adapter. The existing parity test's
invalid-version fixture moves from 2 to 3 because version 2 is now defined;
new tests explicitly cover version 2 with missing or invalid intent.

Validation: intent 25/25; targeted 189/189; planning 291/291; sports 268/268;
full lib 743/743, no failures/skips/cancellations. TypeScript
(`npx tsc --noEmit --incremental false`) and diff-check passed.

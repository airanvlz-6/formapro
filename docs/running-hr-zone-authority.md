# Running HR Zone Authority: existing references only

## Audit delivered before implementation

The flow and bounded proposal were delivered in the task before editing production code. No new zones, physiological calculations, HRmax estimates, method-to-zone table or B3/week-distribution rules were introduced.

### Storage and normalization

`app/api/chat/route.ts` and the legacy `app/FormaPro.tsx` metric writer allow `z1_fc` through `z5_fc` under `usuarios.datos_entrenamiento`. `projectAthletePrescriptionProfile` in `lib/athlete/athletePrescriptionContext.ts` reads exact zone aliases `z1_fc…z5_fc` and `z1…z5` from `perfil`, `test_atleta`, `marcas_especificas`, `datos_entrenamiento`, and named history metrics in `historial_marcas`.

Its existing `parseRunning` accepts positive numbers and strict strings such as `130-145`, `130–145 ppm`, `130—145 bpm`; wrappers use `value`/`valor` with compatible `unit`/`unidad`. Ranges become `{min,max}`. Bare `{min,max}` objects, arrays and explanatory prose are **not** admitted storage inputs by that parser. A scalar is not a complete zone range. Units and conflicting declarations are not silently normalized into equivalence. `resolveEvidence` creates `running.byMetric` with resolved/unknown/conflict and source provenance.

`usuarios.perfil.hrZoneBootstrap` is a separate existing typed zone-system format: zone identity and lower/upper limits, origin, policy, confirmation and digests. `admittedHrZones` accepts an already confirmed valid system, or an internally consistent complete set of five legacy declared ranges. This work does not call proposal/estimation actions or change their formulas. Existing estimated systems retain their estimated provenance; they are not relabelled measured.

A single raw Z2, even if parsed numerically, does not currently establish the existing `running_base_zone2_compatibility` system binding. Report this as **NEEDS_DOMAIN_DATA** for zone-system compatibility, not as permission to infer easyHr. No unsupported storage format was silently admitted.

### Capability, reference, contract, Builder and save

1. `projectPrescriptionSignals` in `lib/athlete/prescriptionSignals.ts` projects device/explicit capability evidence. A GPS device and heart-rate capability are separate facts. Unknown/unavailable/ambiguous are not true.
2. `resolveRunningReferences` in `lib/sports/runningReferenceAuthority.ts` builds `DoseReference` entries. For an admitted system it adds `running:confirmedBaseZone`, retaining exact Z2 bounds and `zoneCompatibility` (system, zone, policy, origin and digest). It never aliases every z2 to easyHr.
3. `buildSessionDoseContext` transports references, resolution, reference authority, sufficiency and evidence digests. `validateDoseContext` rechecks the projection and its binding. Neither function selects a new numeric intensity.
4. `prescriptionGenerationOptions` produces `executableReferenceIds`: capability and movement compatibility, not method physiology. A generic run/cyclic check alone is insufficient.
5. `runningIntensityPolicy` selects a compatible reference and primary metric using existing method policy. `resolveMethodIntensity` supplies exact targets and optional perception guidance. `generateTrainingSession` attaches this authority before `generateContractSession` gives the immutable contract to Builder.
6. Builder copies `primary` into `prescription.intensity`. A reference target is `{kind:"reference",referenceId:"…"}`: the bounds live in the authenticated reference, not model-controlled numeric fields. A zone label without that reference cannot substitute for it.
7. `StructuredSession.validateSessionAgainstTrainingContract` checks schema, contract, B3, dose, sufficiency and method intensity. Before this change, the independent `validateSessionDose` only performed generic reference compatibility in `intensityErrors`; its direct consumers could miss the method authority. It now also invokes the existing `validateMethodIntensity`, without changing that authority or permitting repairs. Historical contracts without that extension retain their existing compatibility; current server generation attaches the method authority before Builder.
8. `renderContractSession` revalidates, then professional/human projections render structured facts. `structuredPrescription.references` retains used reference values and provenance; `structuredPrescription.intensityAuthority` retains primary/secondary targets.
9. `verifySessionReceipt` authenticates contract + proposal, rerenders and compares content. `admitSessionContent` is the save-admission boundary; the weekly writer uses this before canonical persistence. `createPlan`/`mutatePlanWithCAS` persist the structured session JSON. Nothing is reconstructed from its rendered text on reload.

## Existing method knowledge and metric order

| Method | Existing objective compatibility | Existing subjective fallback | HR zone mapping status |
| --- | --- | --- | --- |
| running_base | easyHr / admitted confirmedBaseZone; easyPace | RPE 2–3 | Existing admitted-system Z2 policy only |
| running_long_run | Same existing easy intensity references | RPE 2–3 | Existing admitted-system Z2 compatibility; no numeric dose changes |
| running_threshold | thresholdHr; thresholdPace | RPE 6–7 | No generic Z2 or Z4 substitution |
| running_specific | Goal-compatible 10k or halfMarathon pace | Existing goal-specific RPE | NEEDS_DOMAIN_DATA for HR compatibility |
| running_recovery | No existing objective selector | RPE 1–2 | NEEDS_DOMAIN_DATA for HR compatibility |
| running_vo2 | No existing objective selector | RPE 8–9 | NEEDS_DOMAIN_DATA for HR compatibility |
| running_economy | No executable intensity policy | Unresolved | NEEDS_POLICY / movement-and-bout domain data |

These are catalog facts, not newly prescribed physiological constants. A missing HR mapping does not disable an already authorized RPE fallback for the method. Economy remains `METHOD_INTENSITY_POLICY_UNRESOLVED`. No universal numbered-zone equivalence is assumed.

Within compatible references: **HR first, then pace, then authorized RPE**. Base/long-run already had that order. Threshold previously selected pace first and is now version 2 with HR first. Existing within-HR reference precedence remains unchanged; an easyHr reference is not renamed a numbered zone. No capability/reference means no fabricated range. A conflict can fall through only to another independently authorized reference/metric.

## Findings and minimal implementation

The four cited historical counterexamples were already rejected by full post-Builder C2 tests in this checkout. They did not establish a new bypass of current signed save admission. The confirmed narrower holes were:

- Threshold preferred pace despite available compatible HR.
- Direct `validateSessionDose` calls omitted the method-intensity check used by StructuredSession.
- Professional rendering exposed `confirmedBaseZone`; human rendering used `FC objetivo`, omitting the explicit zone identity already present in authoritative metadata.

Production changes are confined to `runningIntensityPolicies.ts`, `sessionDose.ts`, `sessionProfessionalRenderer.ts`, and `humanCoachingProjection.ts`. Both renderers now use `zoneCompatibility.sourceZone` from the admitted reference, followed by its exact range: **Z2 · 130–145 ppm**. Human v3 retains `RPE esperado 2–3` as secondary perception guidance and stores `purpose=perception_guide`; it is not substituted into the primary target.

No physiological parser, bootstrap formula, B3.3, weekly selection, fixedPrescriptionKey or persistence implementation was changed. Changing renderer output can make an old in-flight receipt with the former label fail its exact text comparison; it does not authorize silently rewriting stored sessions. Historical stored prescriptions are not migrated by this local change.

## Regressions

`runningHrZoneAuthority.test.mjs` adds nine cases with declared fixture zones, never calculated zones:

- A/H: admitted Z2 130–145 drives a successful Builder and all three render paths; human v3 shows secondary RPE after HR.
- B: model-supplied altered limits reject as schema violations; altered canonical snapshot limits also reject contract validation.
- C: RPE-primary downgrade rejects while HR is mandatory.
- Different zone and invented reference reject.
- D: threshold/Z2, recovery/RPE8, base/RPE7 and VO2/RPE1 reject through direct dose validation and StructuredSession.
- E/F: no monitor, no reference, HRmax/resting-HR without zones, and compatible pace fallback do not invent zones. Threshold HR wins when both metrics are available.
- Format and domain boundaries: strict legacy parser; no interpretation of min/max input objects or prose; no automatic isolated-Z2 mapping; unsupported HR method mappings remain unresolved/authorized subjective fallback as appropriate.
- G: signed save admission → strict mutation validation → real persistence adapter with in-memory transport → JSON reload preserves exact zone identity, min/max, reference and provenance. Mutating bounds, zone identity or primary intensity cannot pass the original receipt.

Prior matrix expectations were updated only where threshold's intentionally changed priority or the zone label changed. Other domain compatibility checks remain in force.

## Validation

- Focused reference/intensity/bootstrap/save tests: 234/234, no failures or skips.
- `npx tsc --noEmit`: passed.
- Full suite `node --test --test-concurrency=4 'lib/**/*.test.mjs'`: 2,195/2,195, zero failures/skips/cancellations (168.9 s).
- `git diff --check`: passed.

Local work only; no production data reads/writes, SQL, zone-estimation action or push.

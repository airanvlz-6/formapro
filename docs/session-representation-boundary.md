# Session representation boundary — coach-executable-v1

## Evidence boundary

Incident: `dd312b54-1407-4b13-982c-9901e44894dc`, week `2026-09-14`.
Status: **PRODUCTION_PAYLOAD_UNKNOWN**. The user explicitly confirmed that neither provider output is available and requested isolated validator reproductions instead of reconstruction.

Reported production evidence: Monday and Tuesday completed after two attempts; Thursday exhausted two attempts at checkSessionShape with GENERATED_VARIANT_SHAPE_INVALID and DOSE_INSTRUCTION_UNRESOLVED. DOSE_SIDE_REPS_REQUIRED was absent. This does not identify Thursday's movements, instructions, or which codes appeared on attempt 1.

## Audit and final report

1. **Attempt 1 payload:** UNKNOWN. No equivalent production payload claimed. Local fixtures are synthetic and reproduce validator conditions only.
2. **Attempt 2 payload:** UNKNOWN. Same boundary; the reported aggregate violations are not a raw provider response.
3. **Movements responsible:** UNKNOWN in production. Local fixtures exercise both errors on one generated entry and on separate entries (ordinal 1 generated db_lunge recipe, ordinal 2 canonical db_lunge dose). These IDs are test choices, not incident evidence.
4. **Exact variant shape conditions:** generated ID must match `generated:[a-z0-9_-]{1,32}`; variant must be an object with only version/canonicalFamily/displayName/modifiers; version must be 1; canonicalFamily must be a string; supplied displayName must be a string of at most 160 characters; modifiers must be a nonempty object containing only tempo/stance/direction/loadPosition. Previously a missing displayName also failed. It is now safely derived from the typed recipe. Tests isolate every condition. Unknown canonical families, incompatible modifier values and contradictory names have distinct semantic errors; they are not silently normalized.
5. **Exact instruction condition:** DOSE_INSTRUCTION_UNRESOLVED means the complete string fails resolveDoseInstruction, including non-string, empty, over 180 characters, control characters, or unmatched grammar. Structured conflicts and missing objective reference assertions have separate codes. The particular production condition is UNKNOWN.
6. **Retry:** the previous code supplied flat violations, with special repair detail only for duplicate movements. It did not identify variant/dose paths or ordinals. This is a demonstrated feedback limitation, not proof of why the actual second output failed. New REPAIR_SHAPE_DETAILS supplies per-entry diagnostics; tests cover both exhaustion at two attempts and correction on attempt 2. It leaves exercise selection to the Coach.
7. **Unjustified strictness corrected:** multiplicative quantity wording (`series de`, `sets of`, `sets,`) now joins x/× in the same sets/reps class; qualitative sets admit a bounded effort clause. A missing redundant variant display name no longer rejects an otherwise resolvable recipe. None of these fixes is attributed to the unknown incident payload.
8. **Legitimate hard boundaries:** unknown operation/family semantics, misleading supplied names, relevant unknown restriction geometry, equipment/capability requirements, exact objective references, hidden work and incoherent/computably excessive time remain hard. No arbitrary prose or model safety claims are admitted. Existing safety validators, authority, signatures, freshness and CAS are unchanged.
9. **Changes:** grammar and prompt; shared variant shape reasons and optional derived name; non-authoritative per-entry observation during the real parser pass; safe diagnostic projection; correlated SESSION_SHAPE_VIOLATION events and actionable retry feedback. No new Session version or execution policy: existing admitted normalization, identity hashes and renderings are unchanged. Newly admitted recipes/instructions are included in the same signed final proposal.
10. **Tests:** sessionRepresentation.test.mjs covers equivalent wording, partial dose/unknown duration, non-executable prose, hidden work, objective assertions, malformed instructions, isolated variant schema predicates, unknown family/operation, no-restriction versus unknown active biomechanics, same/separate failing ordinals, observer failure isolation, privacy, provider run correlation, two-attempt exhaustion and successful repair. sessionExecution.test.mjs now carries the newly admitted bounded instruction through issuance, signed final normalized proposal, siblings, KEEP, content tampering and freshness. Existing variant and dose tests retain reference, capability, equipment and time coverage.
11. **Full suite:** validation results are recorded below after execution.
12. **TypeScript:** `npx tsc --noEmit`; result below.
13. **Diff check:** tracked and new files checked; result below.
14. **Limitations:** no incident payload, no new production run and no production confirmation of this patch. Unknown grammar is reported as UNRECOGNIZED_GRAMMAR, not guessed to be safe, hidden work, or a wording-only issue. No new domain semantics for Olympic start/catch positions: the current resolver has no such typed operations. The conceptual hang-power-snatch example therefore remains unresolved; a library family/name alone is insufficient to derive its geometry safely. No Movement Library expansion. JSON/proposal/block-level invalidity has no trustworthy movement ordinal and remains in SESSION_BUILDER_ATTEMPT. Per-entry shape events cover errors actually reached, not later validators skipped by failure.
15. **Status:** DESIGNED, CONNECTED and VERIFIED LOCALLY. PROVEN IN PRODUCTION: **NO for this patch**. The two previously reported v4 successes are evidence for the deployed base only. No commit, push, deploy, migration or DB mutation performed.

## Complete supported instruction grammar

Normalization: strip diacritics, lowercase, trim and collapse whitespace after checking the raw length/control-character bound. The parser consumes the whole expression; it never extracts a valid prefix and ignores remaining prose.

Optional terminal intensity: RPE/RIR numeric; numeric %1RM/bpm/ppm; `m:ss min/km` or `m:ss /km`. Separators: @, a, at, whitespace or start of string. Objective expressions still need matching structured intensity and authorized compatible reference; HR/pace value/range and measurement capabilities remain checked downstream. No kg assertion grammar.

Optional side suffix before intensity: por lado, por pierna, each side, per side. No inferred perSide value without that suffix.

Body alternatives:

- integer sets × integer reps, with x/× or series/sets followed by de/of/comma; optional reps/repeticiones unit;
- optional integer sets x/×, then numeric duration or distance in s/segundos/min/minutos/m/metros/km;
- integer reps/repeticiones, optionally prefixed acumula/accumulate and suffixed de calidad/quality;
- integer series/sets, optionally moderate/technical/controlled (Spanish gender/plural forms also accepted), optionally comma and lejos del fallo/sin llegar al fallo/away from failure/short of failure;
- 1–100 pasadas controladas/controlled passes, preserved qualitatively without invented repetitions;
- existing trabajo técnico [y fluido] / technical [flowing] work;
- intensity alone.

For sets alone, a useful qualifier or other executable quantity/effort is still needed. The existing technical-work class remains accepted; this patch does not harden previously valid instructions. Numeric bounds and conflicts are enforced after parsing. Unknown total duration or repetition count remains UNKNOWN rather than zero or a fabricated estimate. The bounded effort clause does not invent an RIR/RPE value.

## Classification of isolated evidence

| Class | Synthetic evidence | Result |
| --- | --- | --- |
| NON_EXECUTABLE_INSTRUCTION | `haz algo técnico` | unresolved; no dose admitted |
| OBJECTIVE_REFERENCE_UNRESOLVED | `3 x 8 @ 140 bpm` without structured authority | reference required; hard |
| HIDDEN_WORK | `3 x 8 y 10 burpees`, `3 x 8 luego correr 90 min` | whole-string grammar fails; hard |
| GRAMMAR_TOO_NARROW | `3 sets of 8 each side`, `3 series técnicas, lejos del fallo` | formerly outside grammar; now resolved/preserved |
| MALFORMED_OUTPUT | control character in instruction, wrong variant field type | rejected; safe shape diagnosis |

These classifications follow inspection of known synthetic inputs. They are not a semantic classifier applied to unknown production prose. A generic unresolved grammar code cannot distinguish the first, third and fourth classes reliably; inventing that distinction would obscure the evidence boundary.

## Observability and next production run

Actual path: provider completion → bounded JSON parse → checkSessionShape clone under execution policy → variant resolution → dose normalization → remaining shape checks → contract safety/reference/time validation → signed/rendered final proposal. The new observer attaches to the real per-entry shape pass, including early returns, and snapshots original field presence before dose normalization.

SESSION_SHAPE_VIOLATION includes run ID (including provider-supplied ID), builder invocation ID, contract identity, week/day/attempt, block index/type, one-based movementOrdinal, exact structural path, known canonical ID, safe typed modifiers, closed failed-field paths and semantic reasons, original dose field presence, instruction type/length/resolved-field names/qualitative/reference-kind summary and violation codes. It never logs instruction text, free labels, arbitrary keys/IDs, private profiles or reference values. Unknown modifier values are redacted; unknown field names become extraFields. Diagnostic callback/logging failure cannot affect admission.

On the next production failure, group by builderInvocationId and attempt and compare movementOrdinal plus failedFields/semanticFailures/instructionResolutionCode. This establishes whether the codes belong to one entry or separate entries and which structural predicate failed. A redacted UNRECOGNIZED_GRAMMAR summary intentionally cannot reproduce the missing text; semantic causality still requires a safely supplied minimal fixture or additional approved diagnostic vocabulary. Do not claim that logging alone reconstructs provider prose.

## Validation results

- Complete discovery: `rg --files --no-ignore lib app -g '*.test.mjs' -g '*.test.cjs'`, executed with `node --test --test-concurrency=4 --test-reporter=spec`: **2417/2417 pass**, zero failed/cancelled/skipped, 320.0 seconds on the final run.
- New isolated representation coverage: **27 tests**. Existing receipt/freshness integration now additionally asserts the normalized sets and preserved new bounded instruction in the signed payload.
- Focused diagnostics/representation verification: **37/37 pass**. Partial-dose/receipt plus representation verification: **58/58 pass**.
- `npx tsc --noEmit`: **PASS**.
- `git -c core.safecrlf=false diff --check` and whitespace checks on all three new files: **PASS**.
- The first full run found two duplicate-retry fixture failures caused by appending content after its existing terminal JSON feedback block. Preserving that block last fixed the compatibility issue; existing tests were not weakened. The final full run above includes that fix.
- Nine local files changed/added; no diagnostic outputs, secrets or temporary artifacts in the working diff. Test logs are outside the repository in the OS temporary directory.

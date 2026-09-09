# C1 — Intensity infrastructure and historical HR audit

Initial HEAD: `e871adb4e100c0d0b3a732e49fe89be82d22684a`. No sports policy activated, no HR formula introduced, no migration.

## Historical HR findings (before implementation)

Repository-wide searches for Karvonen, HRR, heart rate reserve, reserve formulas, zone calculation, fc_max/fc_maxima/fc_reposo/fc_min and zone fields found no implemented Karvonen/HRR calculator. Git is not shallow. Searches of available Git history for Karvonen/HRR and the 220-age expression likewise found no HRR engine to recover. This conclusion concerns the repository and locally available history, not an external service or undocumented production implementation.

The historical UI in `app/FormaPro.tsx` says “220 - edad” will calculate zones. Commit `a32d5db` introduced that text. Its handler saves fc_max (or null) and fc_max_metodo (`real`/`formula_edad`), not calculated zones. That legacy gap handler also collects onboardingFcMin but does not include it in its payload; the regular questionnaire has a separate fc_reposo field. This UI issue is documented, not repaired in C1. Current onboarding completion uses age presence for fc_max_o_metodo, rather than making that old gap screen a physiological authority.

| Historical claim | Demonstrated behavior |
|---|---|
| A. Compute zones from HRmax + HRrest | No deterministic implementation found |
| B. Estimate HRmax | UI promise and estimation-method marker; no executable formula found |
| C. Karvonen/HRR | No implementation found |
| D. Higher observed HR updates physiological HRmax | No gated promotion/recalculation chain found |
| E. New resting HR observation | Canonical physiology ingestion exists; not a promotion of the lowest observation to a personal zone reference |
| F/G. Persist zones | Yes: declared/extracted z1_fc…z5_fc values can enter usuarios.datos_entrenamiento; also recognized profile/reference stores |
| H. Connected now | Explicit stored zones can become references; no derived-zone calculator to reconnect |

`app/api/chat/route.ts` updates datos_entrenamiento from extracted whitelisted fields by merging supplied values. This is not a versioned physiological derivation, a maximum-observation gate, or evidence that observed workout HR equals physiological HRmax. `lib/physiology/authority.ts` and `adapters.ts` preserve validated resting-HR observations; extraction requires resting classification/confidence in the relevant adapter. That independent observation/recovery path remains intact. C1 does not reactivate an automatic max/min update or overwrite observations.

Reused: canonical capabilities, declared/reference conflict resolution, existing executableReferenceIds, reference validation, and the existing 5K/10K time-to-average-pace conversion. No duplicate calculator or new estimator was created. Existing maxHrMethod continues to distinguish declared/estimated/unknown legacy origin. C1 never treats that marker as a zone derivation policy.

## Authority model

New module: `lib/sports/methodIntensityAuthority.ts`.

- `IntensityEvidence`: DIRECT / DERIVED / ESTIMATED / SUBJECTIVE, resolution, existing declared/recorded/estimated/unknown confidence vocabulary, explicit measurementBasis, source, input references/source/estimated flags, versioned algorithm and containsEstimatedData. DIRECT does not mean measured. A derived target requires algorithm/version and input provenance. Estimated inputs cannot be hidden behind a false containsEstimatedData flag.
- `IntensityTarget`: movementId, exact primary intensity and its evidence; optional separate secondary RPE/RIR perception guide and evidence.
- `MethodIntensityPolicy`: server-owned methodId, policy identity/version, explicit main-block scope, complete targets. No numeric sport tables are registered.
- `MethodIntensityAuthority`: extension version 1, methodId, scope, sourceDigest, RESOLVED/UNRESOLVED, reason, policy and targets.

The reference values themselves remain in doseContext.references. The new evidence model records provenance of a policy-authorized target; it does not retroactively pretend that every historical reference has measured or derived provenance. Actual HR derivation is absent because no historical policy was demonstrated. C1 supports carrying estimated/derived facts when a later authorized domain producer supplies them; tests use explicitly test-only evidence.

## Flow and enforcement

Canonical athlete evidence → existing capabilities/references → final AllowedTrainingContract → resolveMethodIntensity → signed contract extension → Builder options by scope → existing schema/dose/executability validators → validateMethodIntensity → rendering/receipt.

`generateTrainingSession` resolves the extension after preparing the final session contract. Today it returns UNRESOLVED/NO_METHOD_POLICY for every method. This explicitly preserves compatible production behavior and emits SAFE METHOD_INTENSITY_AUTHORITY (version/status/reason/scope only). Logging failure is non-authoritative.

The resolver intersects policy reference targets with existing per-movement executableReferenceIds. Missing capability/reference cannot yield a resolved numeric target. It does not derive zones from a device or FCmax. A policy mismatch or non-executable target returns UNRESOLVED/POLICY_NOT_EXECUTABLE.

When RESOLVED, Builder main options are only policy targets; preparation options remain separately scoped. The model copies the exact primary metric/reference/value/range. Main movements without targets fail closed. The secondary guide is a separate server fact, not another model choice or a new proposal field. It is transported in structuredPrescription but no new editorial copy is generated. Guidance for warmup/cooldown is deliberately outside this main-scoped authority, rather than falsely marked resolved.

Post-Builder validation distinguishes existing shape, existing executable references/capabilities, and method-domain membership. An otherwise executable Z2 reference can be rejected by a test policy that authorizes another exact target. Without a sports policy, C1 does not claim the audit's RPE counterexamples are physiologically invalid. The test-local numeric targets are not production domain knowledge.

This changes neither retry eligibility nor attempt limits. METHOD_INTENSITY_OUTSIDE_DOMAIN is a terminal rejection under existing retry rules. No profile or dose default is created. Goal/Strategy, availability, equipment, feasibility, duplicate rules, sport time policies, Week Integrity, generation cap and general persistence are untouched.

## Receipts, provenance and compatibility

The optional contract extension has its own explicit version 1. Its sourceDigest binds intent, allowed movements, references and signals. The existing receipt HMAC already signs the complete contract, including resolution, policy, target and secondary guide. No signature algorithm/domain/TTL change is made. Unknown extension versions, changed source evidence and malformed authority reject.

Absence of the extension retains the historical path; old receipts are not reinterpreted with a newly active policy. No contractVersion or presentationVersion is repurposed. The professional renderer conditionally carries the extension in structuredPrescription without changing visible text. Human v2 inherits those facts without editorial changes. Existing metadata comparison checks the extension on receipt verification.

Existing evidenceDigest algorithms are unchanged. Whole-payload receipt/contract hashes naturally differ when new signed fields are present; this is an explicit versioned content extension, not a claim that new payload bytes have identical hashes. A signed resolved authority remains self-contained for historical verification; validation does not depend on looking up a mutable current policy registry.

## Tests and limitations

`methodIntensityAuthority.test.mjs` covers A–K: no zones from device or FCmax, HR/pace capability intersection, resolved Builder targets, out-of-domain rejection, explicit unresolved behavior, primary plus secondary, DIRECT/DERIVED/ESTIMATED preservation, historical/C1 receipts, version/content/source tampering, invalid derivation metadata and logger failure. Production policies remain empty. Existing Session Authority/renderer tests additionally cover emission and historical behavior.

No Karvonen fractions, 220-age estimator, physiological promotion gate, 18-method sport ranges, general metric priority, secondary editorial rendering or execution guidance policy is implemented. MethodIntensityPolicy currently resolves concrete per-movement primary targets, not a broad optimization engine. Future domain policies must provide authorized targets and provenance; they cannot be accepted from user or Builder claims.

Files: methodIntensityAuthority.ts and its test; allowedTrainingContract.ts; structuredSession.ts; sessionAuthority.ts; sessionGeneration.ts; sessionProfessionalRenderer.ts (conditional metadata only); this report.

Final validation: 8/8 new C1 tests; 91/91 targeted tests (C1, Session Authority, Human Renderer, sufficiency); complete suite 1597/1597 with no failures/skips. TypeScript and diff-check pass. ESLint matches HEAD exactly: 19 preexisting errors in sessionAuthority and one preexisting warning in allowedTrainingContract; all other changed code files clean. No additional lint debt. Local commit only; no push.

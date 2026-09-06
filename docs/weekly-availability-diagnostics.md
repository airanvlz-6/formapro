# Weekly availability diagnostics

Search server logs for `WEEKLY_AVAILABILITY_UNRESOLVED` (error code `CALENDAR_AVAILABILITY_UNRESOLVED`).
The event is emitted only at the existing failed availability predicate. It includes the managed scope,
raw category names, relevant category shapes, explicit sources selected by the existing resolver,
resolution source, and resolved capability shape. It contains no athlete identifiers or profile text.
Unknown category labels are redacted; day values are included only when the entire array contains
recognized weekday names. `resolvedType` is JavaScript `typeof` (including `object` for null);
`isNull`, `isArray`, and `length` distinguish shapes in server logs.

The top-level `reason` identifies the malformed origin (`missing`, `null`, `non_array`, or
`non_string_member`). `canonicalCapabilityResult.reason` describes the resolved value itself;
for example a malformed alias array can resolve to null. A missing category does not prove an
unsupported discipline, so the logger does not invent `unsupported_category` or `unresolved_scope`.
The planner response adds only `reason`, `discipline`, and `resolvedType` alongside the existing
code and `retryable:false`. No acceptance rules or source precedence change.

The legacy day-format boundary now recognizes weekday-only comma strings before
the strict calendar predicate. Unsupported strings still produce this event with
their original runtime shape (never their text). See `legacy-training-availability-audit.md`.

## Confirmed independent debt

The Week Planner interpolates `usuarioPlanner.distribucion_semanal` directly into its prompt.
A stored object becomes `[object Object]`; a JSON string remains readable. This can degrade the
LLM proposal but does not explain the `UNRESOLVED` predicate: calendar authority reads availability
from the database independently. Prompt serialization is deliberately unchanged in this commit.

# Canonical specialty persistence

`usuarios.especialidad` remains the planning discipline source. Category is used
only to fill missing persistence at creation or authorized planning transitions.
The compatibility mapping is deliberately limited to exact `carrera`, whose
existing questionnaire selections all persist `carrera`. It is not a strategy
fallback, ownership decision, or inference from availability or goal text.

Generic edits omit null, undefined, empty, whitespace-only and non-string
specialty values, preserving the stored column. Existing nonempty specialties
are preserved, including specialties without a modeled planning strategy; strategy
support remains the responsibility of the existing resolver.

Planning mode transitions and onboarding confirmation require the persisted
specialty. A missing value is repaired using a conditional update and checked
returned row before continuing. Failed reads, writes or concurrent changes fail
closed. Read-only onboarding checks never repair data. Supervision requirements
are unchanged. The authenticated bootstrap already populates specialty and is
unchanged.

The structured running distance is compared exactly after case, accent and
surrounding-whitespace normalization. This supports the historical questionnaire
value `Media maraton (21K)` without parsing event names or human goal descriptions.

## Recommended legacy backfill — not executed

No repository migration mechanism or versioned SQL migration directory was found.
The following is a reviewed recommendation for the normal database deployment
process, not an application migration or a command run by this change:

```sql
UPDATE usuarios
SET especialidad = 'carrera'
WHERE categoria = 'carrera'
  AND especialidad IS NULL;
```

Do not extend to other categories without demonstrating an unambiguous mapping.
Do not overwrite existing specialties. Existing planning profiles that do not
pass through an authorized transition/confirmation still need this backfill;
planning reads intentionally do not mutate them.

The specialty repair and existing mode RPC are separate writes. Repairing the
missing specialty is retained if a later mode change fails. There is no new
database transaction or constraint: external writers and concurrent changes
after the guard are not covered by this application-only repair.

Regression tests cover creation, empty updates, real route transitions and
completeness logic, the historic event, unchanged CrossFit and supervision,
repair failures, and conditional-write races.

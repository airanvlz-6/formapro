# D2A.1 legacy running semantic coverage

`LEGACY_RUNNING_TYPE_MAP_V1` is a read-time, deterministic catalog. It
normalizes historical running labels into factual exposure classes: `easy`,
`recovery`, `long_run`, and `quality`. The original normalized label and the
`LEGACY_STRUCTURED` provenance remain on each canonical record.

Exposure is intentionally separate from numeric dose. A valid date, running
discipline, and recognized legacy type admit an execution even when `duracion`
is unitless. Such a row contributes session and exposure facts, including the
last identifiable long-run date, but contributes no duration or distance total.
No value is inferred from `notas` or `analisis`.

The catalog includes the observed variants (`rodaje_z2`, `z2_suave`,
`carrera_z2_regenerativo`, `carrera_recuperacion_z1`, interval/series forms,
`fartlek`, and long-run forms). Unknown types remain rejected conservatively;
duplicate identity and safety-net reconciliation rules are unchanged.

This is a read-time compatibility improvement. It does not change
`running_execution_records`, write validation, completion semantics, dose
authority, progression, event phase, or training-load calculations.

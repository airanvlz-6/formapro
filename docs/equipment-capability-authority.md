# Equipment capability authority

The server projects environment defaults into the existing prescription signals.
There is no new sufficiency engine, inventory writer, or model authority.

## Exact environment catalog

`lugar_entreno` accepts the canonical IDs BOX, GYM, HOME, OUTDOOR, UNKNOWN and
the existing questionnaire selections:

| Selection | Environment |
| --- | --- |
| Box CrossFit (equipamiento completo) | BOX |
| Gimnasio convencional adaptado | GYM |
| En casa con equipamiento básico | HOME |
| Mixto (box + casa) | UNKNOWN |

Comparisons normalize case, accents and surrounding whitespace only. Appending
free text does not match. Existing `tipo_sala` selections `Sala de pesas completa`
and `Sala mixta (pesas + cardio)`, and the `material` option `Gimnasio completo`,
also declare GYM. Other individual material selections do not declare a location.
Unknown nonempty environment selections and conflicting declarations prevent
implicit inventory. Explicit equipment remains usable in that case.

No current unambiguous outdoor questionnaire label exists; canonical OUTDOOR
is supported without adding UI. Casa/parque combinations are not disambiguated.
Sport, availability, goals, history, titles and prompts never establish access.

## Profiles

- STANDARD_BOX: mancuerna, kettlebell, barra, disco, bumper, rack,
  barra_dominadas, anillas, cajon, balon_medicinal, comba.
- STANDARD_GYM: mancuerna, barra, disco, rack, banco, barra_dominadas,
  bici_estatica.
- HOME uses EXPLICIT; OUTDOOR uses MINIMAL; UNKNOWN uses UNKNOWN.
  These three profiles add no equipment signals.

All equipment IDs belong to the existing movement catalog. No generic ergometer
capability exists, so concrete rowers/SkiErg/Assault/Echo bikes remain unknown
without explicit evidence. Commercial machines without existing IDs, load ranges,
plate increments, clearance and permission to drop weights are not inferred.
Nor are measurement capability, skill, strength references or dose inferred.

## Precedence and provenance

From highest to lowest priority: date-specific `prescription_access`, persistent
`prescription_signals`, explicit `material`, environment defaults, unknown.
Unknown/ambiguous explicit answers also override defaults, retaining the existing
semantics. Date overrides apply only to the prescription date already supplied
by the canonical context loader. There is no new exception expiry mechanism.

Implicit signals use source
`derived:training_environment:v1:STANDARD_BOX:usuarios.perfil.lugar_entreno`
(or the corresponding profile and field). They do not impersonate explicit
answers. Existing sources and timestamps for material, persistent answers and
date overrides are unchanged. The context includes serializable environment
evidence and its version, and the existing dose evidence digest includes it.

An unavailable override suppresses the confirmation question and lets the
existing feasibility/authorized-alternative path operate. It does not guarantee
that an alternative exists under every restriction and intent.

Mixed locations cannot grant equipment on every day. A session-specific facility
selector is outside this repair; athletes with mixed locations retain explicit
equipment and date overrides. No database migration or data mutation is needed.

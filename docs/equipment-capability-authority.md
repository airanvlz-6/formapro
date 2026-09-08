# Equipment capability authority

The server projects environment capabilities into existing prescription signals.
The original per-profile arrays have been replaced by one domain equipment
catalog (`equipmentCatalog.ts`). Environment resolution asks
`isEquipmentAvailableByEnvironment(id, environment)`; it does not maintain a
second equipment whitelist or infer facilities from movement disciplines.

## Catalog audit and classification

Before this change the movement library referenced 23 equipment IDs, five ANY
requirement groups, and five concrete ergometers (remo, bici_estatica, ski_erg,
assault_bike, echo_bike). There was no commercial-machine family or facility
metadata. ALL and ANY movement requirements remain unchanged.

| Classification | Equipment IDs |
| --- | --- |
| BOTH | balon_medicinal, banco, barra, barra_dominadas, bici_estatica, comba, disco, kettlebell, mancuerna, paralelas, rack, remo |
| BOX_COMPATIBLE | anillas, assault_bike, bumper, cajon, cuerda, echo_bike, ghd, sandbag, ski_erg, sled |
| GYM_COMPATIBLE | leg_press (new equipment capability only) |
| EXPLICIT_ONLY | yoke |

These are versioned product/domain defaults for a conventional facility, not a
claim about every installation. Yoke is a specialized strongman implement and
requires explicit availability. GHD, ropes and sleds belong to the conventional
Box repertoire under the updated product policy. Concrete ergometers are now
accredited by catalog compatibility; no generic machine is silently substituted.

`leg_press` is added solely as a Gym equipment capability to cover the requested
requirement. It does not add a movement, dose, strategy or permission to prescribe
an unknown movement. Other absent commercial-machine families remain outside the
current movement catalog. Adding them requires catalog/domain work; they are not
inferred from arbitrary strings or LLM output. Tests fail if a movement's equipment
or ANY requirements introduce an unclassified ID.

## Exact environment catalog

Existing recognition is unchanged: `lugar_entreno` accepts canonical IDs BOX,
GYM, HOME, OUTDOOR, UNKNOWN and these questionnaire options:

| Selection | Environment |
| --- | --- |
| Box CrossFit (equipamiento completo) | BOX |
| Gimnasio convencional adaptado | GYM |
| En casa con equipamiento básico | HOME |
| Mixto (box + casa) | UNKNOWN |

Case, accents and surrounding whitespace are normalized; appended free text does
not match. `tipo_sala` values Sala de pesas completa / Sala mixta (pesas + cardio)
and `material` option Gimnasio completo also establish GYM. Contradictory or mixed
locations do not grant implicit inventory. HOME/OUTDOOR/UNKNOWN grant no catalog
items automatically; explicit material remains usable. Sport, goals, availability,
history and prompts never establish a facility. No UI or location writer changed.

## Precedence and provenance

Highest first: date-specific prescription_access, persistent prescription_signals,
environment compatibility, explicit material, unknown. An explicit unavailable
signal defeats a compatible environment. The existing alternative path operates;
no repeated inventory question is asked for a known negative answer. Alternatives
are still constrained by intent, restrictions, scope and movement requirements.

Derived source is `derived:training_environment:v2:STANDARD_BOX:usuarios.perfil.lugar_entreno`
(or corresponding profile/source). Persistent/date-specific sources remain intact.
Material retains its source where the environment does not already grant the item.
Unknown/ambiguous explicit answers retain the existing override semantics. No new
expiry mechanism, DB reads or writes have been introduced.

## Production diagnostic

`generateTrainingSession` emits immediately after building canonical dose context,
before rebuilding the equipment-filtered contract. It reuses that evidence and
base candidate movement requirements, with no feasibility reevaluation. It emits
on viable and failing paths, before the Builder is called.

Each log is a single flat JSON string. EQUIPMENT_AUTHORITY_SUMMARY reports field
presence booleans, resolved environment and reason, safe run/day, totalCount and
truncated. EQUIPMENT_AUTHORITY_DETAIL additionally reports equipmentId,
environmentCompatibility, availableByEnvironment, finalEquipmentState and
provenance category. Maximum 32 unique equipment details per session plus one
summary; truncation is explicit. Equipment IDs are catalog allowlisted.

No raw location, clinical text, profile, goals, user identifiers, prompts, tokens,
receipts or arbitrary source strings are emitted. Logger/serialization failures
are non-authoritative. Presence is not recognition: rawEnvironmentPresent=true
and resolvedEnvironment=UNKNOWN shows that a value arrived but did not resolve;
false shows the primary location field was absent (other presence flags identify
room/material evidence). BOX + compatible + final unknown instead points to an
explicit unknown override or an evidence inconsistency, visible through provenance.

The original production incident is not claimed fixed merely by broadening the
catalog: an absent or unrecognized environment still leaves equipment unknown.
No production log was retrieved or deployment performed by this change.

No specialty, goal, strategy, dose, UI, LLM prompt or sufficiency-core change.

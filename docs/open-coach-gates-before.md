# Open Coach execution: audit before changes

Snapshot taken before implementation. Each row records the exact rejection predicate/emission and source; dynamic suffixes remain in the source expression. See the companion report for reachability and authority by family.

| Source | Predicate / emission |
|---|---|
| lib\sports\structuredSession.ts:31 | `export type SessionValidation = { ok: true; proposal: StructuredSessionProposal; representationAdvisories?: string[] } &#124; { ok: false; violations: string[] };` |
| lib\sports\structuredSession.ts:67 | `&#124;&#124; !Array.isArray(value.blocks) &#124;&#124; (modern ? ![1, 2, 3].includes(value.blocks.length) : value.blocks.length !== 3)) return { ok: false, violations: ['PROPOSAL_SHAPE_INVALID'] };` |
| lib\sports\structuredSession.ts:73 | `violations.push('BLOCK_INVALID:${index}'); return;` |
| lib\sports\structuredSession.ts:75 | `if (Object.hasOwn(block, 'formatDose') && !checkFormatDose(block.formatDose)) violations.push('DOSE_FORMAT_INVALID');` |
| lib\sports\structuredSession.ts:81 | `if (movementShapeFailures(entry, modern).length) { violations.push('MOVEMENT_SHAPE_INVALID:${index}'); return; }` |
| lib\sports\structuredSession.ts:84 | `if (seen.has(entry.movementId)) violations.push('DUPLICATE_MOVEMENT:${index}:${entry.movementId}');` |
| lib\sports\structuredSession.ts:88 | `if (result.status !== 'GENERATED_RESOLVED') violations.push(...('errors' in result ? result.errors : ['GENERATED_VARIANT_SHAPE_INVALID']));` |
| lib\sports\structuredSession.ts:92 | `if (!resolved.ok) { violations.push(...resolved.errors); return; }` |
| lib\sports\structuredSession.ts:96 | `if (modern) violations.push(...checkDoseExtension(dose, execution));` |
| lib\sports\structuredSession.ts:97 | `if (execution ? !executionInstructionComplete(dose as MovementDose) : !['reps', 'durationSeconds', 'distanceMeters'].some(k => Object.hasOwn(dose, k))) violations.push(execution ? 'EXECUTION_INSTRUCTION_INCOMPLETE' : 'DOSE_REQUIRED');` |
| lib\sports\structuredSession.ts:101 | `&#124;&#124; (['sets', 'reps'].includes(k) && !Number.isSafeInteger(n))) violations.push('DOSE_INVALID:${k}');` |
| lib\sports\structuredSession.ts:102 | `else if (n > GENERATION_SAFETY_BOUNDS[k]) violations.push('DOSE_SAFETY_BOUND:${k}');` |
| lib\sports\structuredSession.ts:105 | `if (typeof dose.reps === 'number' && sets * dose.reps > 10000) violations.push('DOSE_TOTAL_REPS_BOUND');` |
| lib\sports\structuredSession.ts:106 | `if (typeof dose.durationSeconds === 'number' && sets * dose.durationSeconds > 28800) violations.push('DOSE_TOTAL_DURATION_BOUND');` |
| lib\sports\structuredSession.ts:107 | `if (typeof dose.distanceMeters === 'number' && sets * dose.distanceMeters > 100000) violations.push('DOSE_TOTAL_DISTANCE_BOUND');` |
| lib\sports\structuredSession.ts:119 | `violations.push('DOSE_SESSION_TOTAL_BOUND:${field}');` |
| lib\sports\structuredSession.ts:122 | `return violations.length ? { ok: false, violations } : { ok: true, proposal: value as StructuredSessionProposal };` |
| lib\sports\structuredSession.ts:126 | `if (typeof raw !== 'string' &#124;&#124; raw.length > 64000) return { ok: false, violations: ['JSON_REQUIRED'] };` |
| lib\sports\structuredSession.ts:131 | `catch { return { ok: false, violations: ['JSON_INVALID'] }; }` |
| lib\sports\structuredSession.ts:142 | `if (!authority.ok) return { ok: false, violations: authority.errors.map(e => 'CONTRACT:${e}') };` |
| lib\sports\structuredSession.ts:146 | `if (projected.errors.length) return { ok: false, violations: projected.errors };` |
| lib\sports\structuredSession.ts:152 | `if (hard.length) return { ok: false, violations: hard };` |
| lib\sports\structuredSession.ts:158 | `if(contract.intensityAuthority?.status !== 'RESOLVED') violations.push('D3_C2_INTENSITY_UNRESOLVED');` |
| lib\sports\structuredSession.ts:159 | `if(contract.runningMethodDose?.status !== 'RESOLVED') violations.push('D3_B3_DOSE_UNRESOLVED');` |
| lib\sports\structuredSession.ts:161 | `violations.push('D3_LONG_RUN_FORBIDDEN');` |
| lib\sports\structuredSession.ts:163 | `if (openExecution(contract) && Object.hasOwn(p, 'discipline') && (p as unknown as { discipline: unknown }).discipline !== contract.discipline) violations.push('SESSION_DISCIPLINE_SCOPE_MISMATCH');` |
| lib\sports\structuredSession.ts:164 | `if (p.stimulusId !== contract.stimulusId) violations.push('STIMULUS_MISMATCH');` |
| lib\sports\structuredSession.ts:166 | `if (!structure &#124;&#124; (contract.contractVersion !== 4 && (!contract.allowedStructureIds.includes(p.structureId) &#124;&#124; structure.discipline !== contract.discipline))) violations.push(contract.contractVersion === 4 ? 'STRUCTURE_REPRESENTATION_UNRESOLVED' : 'STRUCTURE_NOT_ALLOWED');` |
| lib\sports\structuredSession.ts:168 | `violations.push('SINGLE_BLOCK_COMPOSITION_NOT_AUTHORIZED');` |
| lib\sports\structuredSession.ts:170 | `violations.push(...validateStructureSemantics(structure, main));` |
| lib\sports\structuredSession.ts:173 | `&& (!!entry.variant &#124;&#124; contract.allowedMovementIds.includes(entry.movementId)))) violations.push('INTENT_NOT_SATISFIED');` |
| lib\sports\structuredSession.ts:180 | `if (!openExecution(contract) && new Set(exact).size !== exact.length) violations.push('GENERATED_EXACT_IDENTITY_DUPLICATED');` |
| lib\sports\structuredSession.ts:184 | `if (!m) { violations.push('${contract.contractVersion === 4 ? 'MOVEMENT_SEMANTICS_UNRESOLVED' : 'MOVEMENT_UNKNOWN'}:${entry.movementId}'); continue; }` |
| lib\sports\structuredSession.ts:186 | `if (!contract.generatedMovementAuthority) violations.push('GENERATED_MOVEMENT_NOT_AUTHORIZED');` |
| lib\sports\structuredSession.ts:187 | `if (contract.contractVersion !== 4 && !m.stimulus.includes(contract.stimulusId) && !m.suitable_for.includes(contract.stimulusId)) violations.push('GENERATED_STIMULUS_INCOMPATIBLE');` |
| lib\sports\structuredSession.ts:188 | `if (generatedIdentities.has(entry.movementId) && generatedIdentities.get(entry.movementId) !== resolved!.identity) violations.push('GENERATED_LOCAL_ID_CONFLICT');` |
| lib\sports\structuredSession.ts:190 | `if (resolved!.geometryChanged && restrictions.areas.length) violations.push('GENERATED_RESTRICTION_UNKNOWN:body_area');` |
| lib\sports\structuredSession.ts:191 | `if (entry.variant.modifiers.tempo && JSON.stringify(entry.variant.modifiers.tempo) !== JSON.stringify(entry.prescription.tempo)) violations.push('GENERATED_TEMPO_DOSE_MISMATCH');` |
| lib\sports\structuredSession.ts:192 | `} else if (contract.contractVersion !== 4 && !contract.allowedMovementIds.includes(m.id)) violations.push('MOVEMENT_OUTSIDE_POOL:${m.id}');` |
| lib\sports\structuredSession.ts:193 | `if (contract.contractVersion !== 4 && !m.discipline.includes(contract.discipline as 'box' &#124; 'carrera' &#124; 'fuerza')) violations.push('MOVEMENT_DISCIPLINE:${m.id}');` |
| lib\sports\structuredSession.ts:195 | `if (entry.variant && restriction.unknown.length) violations.push(...restriction.unknown.map(flag => 'GENERATED_RESTRICTION_UNKNOWN:${flag}'));` |
| lib\sports\structuredSession.ts:196 | `if (contract.contractVersion === 4 && restriction.unknown.length) violations.push('UNKNOWN_SAFETY:${m.id}');` |
| lib\sports\structuredSession.ts:198 | `&#124;&#124; notes.some(n => normalizeTrainingKey(n.movement) === (resolved!.canonicalFamily ?? m.id))) violations.push('MOVEMENT_RESTRICTED:${m.id}');` |
| lib\sports\structuredSession.ts:200 | `if (!violations.length) violations.push(...validateRunningMethodDose(contract, p));` |
| lib\sports\structuredSession.ts:201 | `if (!violations.length) violations.push(...validateSessionDose(contract, p, observeDose));` |
| lib\sports\structuredSession.ts:224 | `violations.push(contract.contractVersion === 4 ? '${s.state === 'unavailable' ? 'FACTUAL_REQUIREMENT_UNAVAILABLE' : 'REQUIREMENT_UNKNOWN'}:${s.signal}' : 'PRESCRIPTION_DATA_MISSING:${s.signal}');` |
| lib\sports\structuredSession.ts:228 | `if (!violations.length) violations.push(...validateMethodIntensity(contract, p));` |
| lib\sports\structuredSession.ts:229 | `return violations.length ? { ok: false, violations } : checked;` |
| lib\sports\structuredSession.ts:237 | `if (!validation.ok) throw new Error('SESSION_CONTRACT_INVALID:${validation.violations.join(',')}');` |
| lib\sports\structuredSession.ts:240 | `if (contract.contractVersion < 3) throw new Error('SESSION_PRESENTATION_CONTRACT_UNSUPPORTED');` |
| lib\sports\minimalSessionRepresentation.ts:13 | `const fail = (code: string): SessionValidation => ({ ok: false, violations: [code] });` |
| lib\sports\minimalSessionRepresentation.ts:16 | `return fail('PROPOSAL_STRUCTURE_UNINTERPRETABLE');` |
| lib\sports\minimalSessionRepresentation.ts:22 | `&#124;&#124; !Array.isArray(b.movements) &#124;&#124; !b.movements.length &#124;&#124; b.movements.length > 30) return fail('BLOCK_STRUCTURE_UNINTERPRETABLE');` |
| lib\sports\minimalSessionRepresentation.ts:25 | `if (!object(e)) return fail('MOVEMENT_OBJECT_INVALID');` |
| lib\sports\minimalSessionRepresentation.ts:26 | `if (!object(e.prescription)) return fail('MOVEMENT_PRESCRIPTION_SHAPE_INVALID');` |
| lib\sports\minimalSessionRepresentation.ts:29 | `if (typeof e.movementId !== 'string' &#124;&#124; !e.movementId.trim()) return fail('MOVEMENT_IDENTITY_UNRESOLVED');` |
| lib\sports\minimalSessionRepresentation.ts:35 | `if (!seen.has('main')) return fail('MAIN_STRUCTURE_REQUIRED');` |
| lib\sports\minimalSessionRepresentation.ts:54 | `errors.push('HIDDEN_WORK_OR_CONFLICTING_REPRESENTATION');` |
| lib\sports\minimalSessionRepresentation.ts:63 | `if (known(alternative) && alternative !== e.movementId) errors.push('MOVEMENT_IDENTITY_CONFLICT');` |
| lib\sports\sessionExecution.ts:48 | `if (!instruction) return { ok: false as const, errors: ['DOSE_INSTRUCTION_UNRESOLVED'] };` |
| lib\sports\sessionExecution.ts:53 | `return { ok: false as const, errors: ['DOSE_INSTRUCTION_CONFLICT'] };` |
| lib\sports\sessionExecution.ts:58 | `return { ok: false as const, errors: ['DOSE_INSTRUCTION_REFERENCE_REQUIRED'] };` |
| lib\sports\sessionExecution.ts:63 | `if (!d.doseInstruction) return [];` |
| lib\sports\sessionExecution.ts:65 | `if (!expression &#124;&#124; expression.kind === 'percent_1rm') return [];` |
| lib\sports\sessionDose.ts:22 | `if (!exact(d, [...DOSE_FIELDS, ...(execution ? ['doseInstruction'] : [])])) return ['DOSE_FIELDS_INVALID'];` |
| lib\sports\sessionDose.ts:23 | `if (d.perSide !== undefined && typeof d.perSide !== 'boolean') errors.push('DOSE_SIDE_INVALID');` |
| lib\sports\sessionDose.ts:25 | `&#124;&#124; d.tempo.reduce((a: number, b: number) => a + b, 0) <= 0)) errors.push('DOSE_TEMPO_INVALID');` |
| lib\sports\sessionDose.ts:28 | `if (!obj(i) &#124;&#124; !['rpe', 'rir', 'percent_1rm', 'reference'].includes(i.kind)) errors.push('DOSE_INTENSITY_INVALID');` |
| lib\sports\sessionDose.ts:30 | `if (!exact(i, ['kind', 'referenceId']) &#124;&#124; typeof i.referenceId !== 'string') errors.push('DOSE_INTENSITY_INVALID');` |
| lib\sports\sessionDose.ts:36 | `&#124;&#124; (i.kind === 'percent_1rm' && typeof i.referenceId !== 'string')) errors.push('DOSE_INTENSITY_INVALID');` |
| lib\sports\sessionDose.ts:53 | `if (i.kind === 'rpe' &#124;&#124; i.kind === 'rir') return [];` |
| lib\sports\sessionDose.ts:54 | `if (entry.variant) return ['GENERATED_REFERENCE_NOT_AUTHORIZED'];` |
| lib\sports\sessionDose.ts:56 | `if (!r) return ['BENCHMARK_RESOLUTION:REFERENCE_NOT_ALLOWED'];` |
| lib\sports\sessionDose.ts:112 | `if (p.schemaVersion !== 2) return ['SESSION_DOSE_INCOMPLETE:SCHEMA_VERSION_REQUIRED'];` |
| lib\sports\sessionDose.ts:115 | `const structure = WORKOUT_STRUCTURE_LIBRARY[p.structureId]; if (!structure) return ['STRUCTURE_NOT_ALLOWED'];` |
| lib\sports\sessionDose.ts:121 | `errors.push(...validateExecutableFormat(c, p));` |
| lib\sports\sessionDose.ts:122 | `for (const b of p.blocks) for (const m of b.movements) errors.push(...intensityErrors(c, m, m.prescription.intensity), ...instructionReferenceErrors(c, m.prescription));` |
| lib\sports\sessionDose.ts:124 | `if (f && !metcon && format !== 'complex') errors.push('DOSE_FORMAT_NOT_ALLOWED');` |
| lib\sports\sessionDose.ts:128 | `if (Object.keys(f).some(k => !allowed.includes(k))) errors.push('DOSE_FORMAT_FIELDS_CONFLICT');` |
| lib\sports\sessionDose.ts:129 | `if (f.durationSeconds && f.rounds && f.intervalSeconds && f.durationSeconds !== f.rounds * f.intervalSeconds) errors.push('DOSE_FORMAT_CYCLE_CONFLICT');` |
| lib\sports\sessionDose.ts:130 | `if ((format === 'emom' && f.intervalSeconds !== 60) &#124;&#124; (format === 'e2mom' && f.intervalSeconds !== 120)) errors.push('DOSE_FORMAT_INTERVAL_MISMATCH');` |
| lib\sports\sessionDose.ts:132 | `if (timed && !f?.durationSeconds && !(f?.intervalSeconds && f?.rounds)) errors.push('SESSION_DOSE_INCOMPLETE:FORMAT_DURATION');` |
| lib\sports\sessionDose.ts:134 | `&#124;&#124; f.workSeconds + f.restSeconds !== f.intervalSeconds &#124;&#124; (f.durationSeconds && f.durationSeconds % f.intervalSeconds !== 0))) errors.push('SESSION_DOSE_INCOMPLETE:WORK_REST_CYCLE');` |
| lib\sports\sessionDose.ts:135 | `if (metcon && !timed && (!f?.rounds &#124;&#124; !f.timeCapSeconds)) errors.push('SESSION_DOSE_INCOMPLETE:ROUNDS_TIME_CAP');` |
| lib\sports\sessionDose.ts:136 | `if (format === 'complex' && (!f?.rounds &#124;&#124; f.restSeconds === undefined)) errors.push('SESSION_DOSE_INCOMPLETE:COMPLEX_ROUNDS_REST');` |
| lib\sports\sessionDose.ts:137 | `if (f?.durationSeconds && f.timeCapSeconds) errors.push('DOSE_FORMAT_TIME_CONFLICT');` |
| lib\sports\sessionDose.ts:140 | `if (['reps', 'durationSeconds', 'distanceMeters'].filter(k => Object.hasOwn(d, k)).length !== 1) errors.push('DOSE_VOLUME_CONFLICT');` |
| lib\sports\sessionDose.ts:141 | `if (d.perSide && !d.reps) errors.push('DOSE_SIDE_REPS_REQUIRED');` |
| lib\sports\sessionDose.ts:142 | `errors.push(...intensityErrors(c, m, d.intensity));` |
| lib\sports\sessionDose.ts:145 | `if (running && d.intensity?.kind === 'rir') errors.push('DOSE_RUNNING_RIR_UNSUPPORTED');` |
| lib\sports\sessionDose.ts:146 | `if (mainStrength && (!d.sets &#124;&#124; (descriptor?.dose_basis === 'duration' ? !d.durationSeconds : !d.reps) &#124;&#124; d.restSeconds === undefined)) errors.push('SESSION_DOSE_INCOMPLETE:STRENGTH_SETS_REPS_REST');` |
| lib\sports\sessionDose.ts:147 | `if (running && !d.durationSeconds && !d.distanceMeters) errors.push('SESSION_DOSE_INCOMPLETE:RUNNING_VOLUME');` |
| lib\sports\sessionDose.ts:148 | `if (b.blockType === 'main' && format === 'intervals' && (!d.sets &#124;&#124; d.restSeconds === undefined)) errors.push('SESSION_DOSE_INCOMPLETE:INTERVAL_COUNT_RECOVERY');` |
| lib\sports\sessionDose.ts:149 | `if (metcon && b.blockType === 'main' && !d.reps && !d.durationSeconds && !d.distanceMeters) errors.push('SESSION_DOSE_INCOMPLETE:METCON_VOLUME');` |
| lib\sports\sessionDose.ts:150 | `if (b.blockType !== 'main' && b.formatDose) errors.push('DOSE_FORMAT_MAIN_ONLY');` |
| lib\sports\sessionDose.ts:151 | `if (b.blockType === 'cooldown' && d.intensity?.kind === 'percent_1rm') errors.push('DOSE_COOLDOWN_LOADED_STRENGTH');` |
| lib\sports\sessionDose.ts:154 | `if (JSON.stringify(b.movements) === JSON.stringify(main.movements)) errors.push('DOSE_PREPARATION_IDENTICAL_TO_MAIN');` |
| lib\sports\sessionDose.ts:159 | `if (totalReps > 10000 &#124;&#124; estimate.minimumSeconds > 28800) errors.push('DOSE_SESSION_TOTAL_BOUND');` |
| lib\sports\sessionDose.ts:160 | `if (!execution && maximum !== null && estimate.maximumSeconds === null) errors.push('SESSION_DURATION_ESTIMATE:UNBOUNDED_WITH_FINITE_BUDGET');` |
| lib\sports\sessionDose.ts:161 | `else if (maximum !== null && (estimate.minimumSeconds > maximum &#124;&#124; estimate.maximumSeconds !== null && estimate.maximumSeconds > maximum)) errors.push('SESSION_BUDGET_EXCEEDED');` |
| lib\sports\sessionDose.ts:162 | `if (!execution && c.doseContext?.timeAuthority) errors.push(...validateSessionTimeDose(c.doseContext.timeAuthority,` |
| lib\sports\sessionDose.ts:166 | `if (!errors.length) errors.push(...validateMethodIntensity(c, p));` |
| lib\sports\sessionDose.ts:168 | `return [...new Set(errors)];` |
| lib\sports\sessionExecutableDose.ts:46 | `if (f?.durationSeconds && f.timeCapSeconds) errors.push('DOSE_FORMAT_TIME_CONFLICT');` |
| lib\sports\sessionExecutableDose.ts:47 | `if(f?.intervalSeconds&&f.rounds&&f.durationSeconds&&f.intervalSeconds*f.rounds!==f.durationSeconds) errors.push('DOSE_FORMAT_CYCLE_CONFLICT');` |
| lib\sports\sessionExecutableDose.ts:50 | `errors.push('SESSION_DOSE_INCOMPLETE:WORK_REST_CYCLE');` |
| lib\sports\sessionExecutableDose.ts:52 | `if((format==='emom'&&f?.intervalSeconds!==60)&#124;&#124;(format==='e2mom'&&f?.intervalSeconds!==120)) errors.push('DOSE_FORMAT_INTERVAL_MISMATCH');` |
| lib\sports\sessionExecutableDose.ts:53 | `if(['amrap','density','death_by','emom','e2mom'].includes(format??'') && !f?.durationSeconds && !(f?.intervalSeconds&&f.rounds)) errors.push('EXECUTION_INSTRUCTION_INCOMPLETE:FORMAT_CLOCK');` |
| lib\sports\sessionExecutableDose.ts:54 | `if(f?.intervalSeconds&&f.durationSeconds&&f.durationSeconds%f.intervalSeconds!==0) errors.push('DOSE_FORMAT_CYCLE_CONFLICT');` |
| lib\sports\sessionExecutableDose.ts:61 | `if(Object.keys(f).some(k=>!allowed.includes(k))) errors.push('DOSE_FORMAT_FIELDS_CONFLICT');` |
| lib\sports\sessionExecutableDose.ts:64 | `if(b.blockType!=='main'&&b.formatDose) errors.push('DOSE_FORMAT_MAIN_ONLY');` |
| lib\sports\sessionExecutableDose.ts:66 | `if(!executionInstructionComplete(d)) errors.push('EXECUTION_INSTRUCTION_INCOMPLETE');` |
| lib\sports\sessionExecutableDose.ts:67 | `if(d.reps&&d.durationSeconds&&d.tempo&&d.reps*d.tempo.reduce((a,b)=>a+b,0)>d.durationSeconds) errors.push('DOSE_VOLUME_TIME_CONFLICT');` |
| lib\sports\sessionExecutableDose.ts:68 | `if(b.blockType==='main'&&format==='intervals'&&d.sets===undefined&&!f?.rounds) errors.push('EXECUTION_INSTRUCTION_INCOMPLETE:INTERVAL_COUNT');` |
| lib\sports\sessionExecutableDose.ts:72 | `if (totalDistance > 100000) errors.push('DOSE_SESSION_TOTAL_BOUND:distanceMeters');` |
| lib\sports\sessionExecutableDose.ts:76 | `if(clock!==undefined&&mainWork.minimumSeconds>clock) errors.push('DOSE_FORMAT_WORK_EXCEEDS_CLOCK');` |
| lib\sports\sessionExecutableDose.ts:77 | `if(f?.workSeconds!==undefined && blockTime(c,{...main,formatDose:undefined}).minimumSeconds>f.workSeconds) errors.push('DOSE_FORMAT_WORK_EXCEEDS_CLOCK');` |
| lib\sports\structureSemantics.ts:15 | `if (rules.exactMainMovements === 2 && main.length !== 2) errors.push('STRUCTURE_REQUIRES_TWO_MOVEMENTS');` |
| lib\sports\structureSemantics.ts:16 | `if (rules.exactMainMovements === 3 && main.length !== 3) errors.push('STRUCTURE_REQUIRES_THREE_MOVEMENTS');` |
| lib\sports\structureSemantics.ts:17 | `if (rules.uninterrupted && main.some(m => (m.prescription.sets ?? 1) > 1 &#124;&#124; (m.prescription.restSeconds ?? 0) > 0)) errors.push('STRUCTURE_CONTINUOUS_INTERRUPTED');` |
| lib\sports\movementVariants.ts:28 | `return [modifiers.tempo ? 'Tempo ${modifiers.tempo.join('-')}' : '', modifiers.stance ?? '',` |
| lib\sports\movementVariants.ts:35 | `if (typeof entry.movementId !== 'string' &#124;&#124; !/^generated:[a-z0-9_-]{1,32}$/.test(entry.movementId)) errors.push('movementId');` |
| lib\sports\movementVariants.ts:36 | `if (!object(v)) return [...errors, 'variant'];` |
| lib\sports\movementVariants.ts:37 | `if (!keys(v, ['version', 'canonicalFamily', 'displayName', 'modifiers'])) errors.push('variant.extraFields');` |
| lib\sports\movementVariants.ts:38 | `if (v.version !== 1) errors.push('variant.version');` |
| lib\sports\movementVariants.ts:39 | `if (typeof v.canonicalFamily !== 'string') errors.push('variant.canonicalFamily');` |
| lib\sports\movementVariants.ts:40 | `if (v.displayName !== undefined && (typeof v.displayName !== 'string' &#124;&#124; v.displayName.length > 160)) errors.push('variant.displayName');` |
| lib\sports\movementVariants.ts:41 | `if (!object(v.modifiers) &#124;&#124; !Object.keys(v.modifiers).length) errors.push('variant.modifiers');` |
| lib\sports\movementVariants.ts:42 | `else if (!keys(v.modifiers, ['tempo', 'stance', 'direction', 'loadPosition'])) errors.push('variant.modifiers.extraFields');` |
| lib\sports\movementVariants.ts:55 | `if (variantShapeFailures(entry).length) return fail('GENERATED_VARIANT_SHAPE_INVALID');` |
| lib\sports\movementVariants.ts:57 | `if (!base &#124;&#124; !controlledPatterns.includes(base.movement_pattern)) return fail('GENERATED_SEMANTICS_UNRESOLVED:canonicalFamily');` |
| lib\sports\movementVariants.ts:61 | `&#124;&#124; mods.tempo.reduce((a, b) => a + b, 0) <= 0 &#124;&#124; base.dose_basis === 'duration')) return fail('GENERATED_SEMANTICS_UNRESOLVED:tempo');` |
| lib\sports\movementVariants.ts:63 | `&#124;&#124; !(['squat', 'hinge'].includes(base.movement_pattern) &#124;&#124; base.id === 'plank'))) return fail('GENERATED_SEMANTICS_UNRESOLVED:stance');` |
| lib\sports\movementVariants.ts:66 | `return fail('GENERATED_SEMANTICS_UNRESOLVED:direction');` |
| lib\sports\movementVariants.ts:69 | `return fail('GENERATED_SEMANTICS_UNRESOLVED:loadPosition');` |
| lib\sports\movementVariants.ts:71 | `if (v.displayName !== undefined && v.displayName.trim().toLowerCase() !== displayName.toLowerCase()) return fail('GENERATED_DISPLAY_SEMANTICS_MISMATCH');` |
| lib\sports\trainingFeasibility.ts:36 | `if (!scope.prescriptionAllowed) errors.push('PRESCRIPTION_NOT_ALLOWED');` |
| lib\sports\trainingFeasibility.ts:37 | `if (!scope.managedDisciplines.includes(input.discipline) &#124;&#124; scope.externalDisciplines.includes(input.discipline)) errors.push('DISCIPLINE_OUTSIDE_MANAGED_SCOPE');` |
| lib\sports\trainingFeasibility.ts:38 | `if (!['box', 'carrera'].includes(input.discipline)) errors.push('DISCIPLINE_UNSUPPORTED');` |
| lib\sports\trainingFeasibility.ts:39 | `if (!dateValid(input.targetWeekStart) &#124;&#124; new Date(input.targetWeekStart).getUTCDay() !== 1) errors.push('TARGET_WEEK_INVALID');` |
| lib\sports\trainingFeasibility.ts:40 | `if (!DAYS.includes(input.targetDay)) errors.push('TARGET_DAY_INVALID');` |
| lib\sports\trainingFeasibility.ts:41 | `if (input.availableDays !== null && (!Array.isArray(input.availableDays) &#124;&#124; input.availableDays.some(d => !DAYS.includes(d)) &#124;&#124; !input.availableDays.includes(input.targetDay))) errors.push('DAY_NOT_AVAILABLE');` |
| lib\sports\trainingFeasibility.ts:43 | `if (!r &#124;&#124; !dateValid(r.asOfDate) &#124;&#124; !Array.isArray(r.areas) &#124;&#124; !Array.isArray(r.restrictions) &#124;&#124; !Array.isArray(r.reassessments)) return [...errors, 'RESTRICTIONS_INVALID'];` |
| lib\sports\trainingFeasibility.ts:46 | `if (!activeRestrictionFlags([n]).length && !Object.hasOwn(MOVEMENT_LIBRARY, normalizeTrainingKey(n.movement))) errors.push('RESTRICTION_UNRESOLVED');` |
| lib\sports\trainingFeasibility.ts:48 | `if (r.areas.some(area => !Object.values(MOVEMENT_LIBRARY).some(m => m.avoid_with?.includes(area)))) errors.push('RESTRICTION_AREA_UNSUPPORTED');` |
| lib\sports\trainingFeasibility.ts:49 | `if (r.state && r.state.estado !== 'normal' && !r.areas.length && !r.restrictions.length && !r.reassessments.length) errors.push('RESTRICTION_UNRESOLVED');` |
| lib\sports\trainingFeasibility.ts:52 | `&#124;&#124; !Array.isArray(external.activities) &#124;&#124; !Array.isArray(external.records)) errors.push('EXTERNAL_CONTEXT_INVALID');` |
| lib\sports\trainingFeasibility.ts:54 | `&#124;&#124; external.records.some(r => !scope.externalDisciplines.includes(r.disciplina) &#124;&#124; !dateValid(r.fecha))) errors.push('EXTERNAL_CONTEXT_OUTSIDE_SCOPE');` |
| lib\sports\trainingFeasibility.ts:57 | `&#124;&#124; exposure.report.exposiciones.some(e => !Object.hasOwn(MOVEMENT_LIBRARY, e.movementId) &#124;&#124; !Number.isSafeInteger(e.vecesUltimas4Semanas) &#124;&#124; e.vecesUltimas4Semanas < 0)) errors.push('EXPOSURE_INVALID');` |
| lib\sports\trainingFeasibility.ts:60 | `if (!intent.ok) errors.push(...intent.errors);` |
| lib\sports\trainingFeasibility.ts:63 | `if (method.discipline !== input.discipline &#124;&#124; method.stimulusId !== input.stimulus) errors.push('STRATEGIC_METHOD_MISMATCH');` |
| lib\sports\trainingFeasibility.ts:66 | `if (input.source !== 'weekly_session_builder') errors.push('CONTRACT_SOURCE_INVALID');` |
| lib\sports\trainingFeasibility.ts:68 | `errors.push('SESSION_DOSE_TIME_INFEASIBLE');` |
| lib\sports\trainingFeasibility.ts:69 | `return [...new Set(errors)];` |
| lib\sports\trainingFeasibility.ts:98 | `if (stimulus.status === 'unresolved') errors.push(stimulus.reason);` |
| lib\sports\trainingFeasibility.ts:120 | `if (!allowedMovementIds.length) errors.push('MOVEMENT_POOL_EMPTY');` |
| lib\sports\trainingFeasibility.ts:121 | `else if (!intentMovementIds.length) errors.push('INTENT_POOL_EMPTY');` |
| lib\sports\trainingFeasibility.ts:122 | `if (!allowedStructureIds.length) errors.push('STRUCTURE_POOL_EMPTY');` |
| lib\sports\trainingFeasibility.ts:123 | `else if (intentMovementIds.length && !satisfiableStructureIds.length) errors.push('STRUCTURE_SPACE_UNSATISFIABLE');` |
| lib\sports\allowedTrainingContract.ts:55 | `export type ContractResult = { ok: true; contract: AllowedTrainingContract } &#124; { ok: false; errors: string[] };` |
| lib\sports\allowedTrainingContract.ts:59 | `catch { return { ok: false, errors: ['CONTRACT_INPUT_MALFORMED'] }; }` |
| lib\sports\allowedTrainingContract.ts:63 | `if (!pool.resolved &#124;&#124; !pool.feasible) return { ok: false, errors: pool.errors };` |
| lib\sports\allowedTrainingContract.ts:75 | `export function validateAllowedTrainingContract(contract: AllowedTrainingContract): { ok: true } &#124; { ok: false; errors: string[] } {` |
| lib\sports\allowedTrainingContract.ts:79 | `if (contract.executionPolicy !== undefined && (contract.executionPolicy !== EXECUTION_POLICY &#124;&#124; contract.contractVersion !== 4)) errors.push('EXECUTION_POLICY_INVALID');` |
| lib\sports\allowedTrainingContract.ts:83 | `errors.push('GENERATED_MOVEMENT_AUTHORITY_INVALID');` |
| lib\sports\allowedTrainingContract.ts:85 | `if (contract.intent?.kind !== 'adaptation' &#124;&#124; !runningEventMethodAllowed(contract.runningEventPreparation,contract.intent.methodId)) errors.push('D3_METHOD_FORBIDDEN');` |
| lib\sports\allowedTrainingContract.ts:88 | `if(date===contract.runningEventPreparation.constraints.protectedDate) errors.push('D3_EVENT_DATE_PROTECTED');` |
| lib\sports\allowedTrainingContract.ts:90 | `if (!validMethodIntensity(contract)) errors.push('METHOD_INTENSITY_AUTHORITY_INVALID');` |
| lib\sports\allowedTrainingContract.ts:91 | `if (!validRunningMethodDose(contract)) errors.push('RUNNING_METHOD_DOSE_AUTHORITY_INVALID');` |
| lib\sports\allowedTrainingContract.ts:92 | `if (![1, 2, 3, 4].includes(contract.contractVersion)) errors.push('CONTRACT_VERSION_INVALID');` |
| lib\sports\allowedTrainingContract.ts:94 | `&#124;&#124; contract.contractVersion !== 4 && contract.intent?.kind === 'open_coach') errors.push('OPEN_DESIGN_VERSION_MISMATCH');` |
| lib\sports\allowedTrainingContract.ts:95 | `if (contract.contractVersion === 4 && (!contract.doseContext?.sufficiency &#124;&#124; contract.doseContext.sessionDecisionAuthority !== 'coach')) errors.push('OPEN_DESIGN_FACTS_REQUIRED');` |
| lib\sports\allowedTrainingContract.ts:96 | `if ([3, 4].includes(contract.contractVersion) ? !validateDoseContext(contract.doseContext!) : Object.hasOwn(contract, 'doseContext')) errors.push('DOSE_CONTEXT_VERSION_INVALID');` |
| lib\sports\allowedTrainingContract.ts:98 | `timeAuthorityForIntent(contract.doseContext.timeBudget, contract.intent))) errors.push('SESSION_DOSE_AUTHORITY_MISMATCH');` |
| lib\sports\allowedTrainingContract.ts:99 | `if (contract.contractVersion === 1 && Object.hasOwn(contract, 'intent')) errors.push('INTENT_VERSION_MISMATCH');` |
| lib\sports\allowedTrainingContract.ts:100 | `if (contract.contractVersion === 2 && !Object.hasOwn(contract, 'intent')) errors.push('INTENT_REQUIRED');` |
| lib\sports\allowedTrainingContract.ts:102 | `if (stimulus.status !== 'resolved') errors.push(stimulus.reason);` |
| lib\sports\allowedTrainingContract.ts:104 | `if (!Array.isArray(ids) &#124;&#124; (!ids.length && contract.intent?.kind !== 'open_coach')) errors.push('${kind}_POOL_EMPTY');` |
| lib\sports\allowedTrainingContract.ts:106 | `if (new Set(ids).size !== ids.length) errors.push('${kind}_IDS_DUPLICATED');` |
| lib\sports\allowedTrainingContract.ts:107 | `if (ids.some(id => typeof id !== 'string' &#124;&#124; !Object.hasOwn(library, id))) errors.push('${kind}_ID_UNKNOWN');` |
| lib\sports\allowedTrainingContract.ts:110 | `if (errors.length) return { ok: false, errors: [...new Set(errors)] };` |
| lib\sports\allowedTrainingContract.ts:112 | `if (!pool.resolved) return { ok: false, errors: pool.errors };` |
| lib\sports\allowedTrainingContract.ts:114 | `if (!same(contract.allowedMovementIds, pool.allowedMovementIds)) errors.push('MOVEMENT_POOL_MISMATCH');` |
| lib\sports\allowedTrainingContract.ts:115 | `if (!same(contract.allowedStructureIds, pool.allowedStructureIds)) errors.push('STRUCTURE_POOL_MISMATCH');` |
| lib\sports\allowedTrainingContract.ts:116 | `if (JSON.stringify(contract.rankedCandidates) !== JSON.stringify(pool.rankedCandidates)) errors.push('RANKING_MISMATCH');` |
| lib\sports\allowedTrainingContract.ts:117 | `if (JSON.stringify(contract.restrictionFiltering) !== JSON.stringify(pool.restrictionFiltering)) errors.push('RESTRICTION_FILTERING_MISMATCH');` |
| lib\sports\allowedTrainingContract.ts:118 | `if (!errors.length && !pool.feasible) errors.push(...pool.errors);` |
| lib\sports\allowedTrainingContract.ts:119 | `return errors.length ? { ok: false, errors } : { ok: true };` |
| lib\sports\allowedTrainingContract.ts:120 | `} catch { return { ok: false, errors: ['CONTRACT_MALFORMED'] }; }` |
| lib\sports\prepareSessionTrainingContract.ts:26 | `restrictions: CanonicalRestrictions): Promise<{ ok: true; input: ContractInput } &#124; { ok: false; errors: string[] }> {` |
| lib\sports\prepareSessionTrainingContract.ts:29 | `if (sourceRead.error &#124;&#124; !Array.isArray(sourceRead.data)) return { ok: false, errors: ['SCOPE_SOURCES_READ_FAILED'] };` |
| lib\sports\prepareSessionTrainingContract.ts:36 | `if (!scope.scope.prescriptionAllowed) return { ok: false, errors: ['PRESCRIPTION_NOT_ALLOWED'] };` |
| lib\sports\prepareSessionTrainingContract.ts:37 | `if (!scope.scope.managedDisciplines.includes(discipline)) return { ok: false, errors: ['DISCIPLINE_OUTSIDE_MANAGED_SCOPE'] };` |
| lib\sports\prepareSessionTrainingContract.ts:46 | `if (scope.scope.mode === 'focus' && availableDays === null) return { ok: false, errors: ['FOCUS_AVAILABILITY_UNRESOLVED'] };` |
| lib\sports\prepareSessionTrainingContract.ts:54 | `if (read.error &#124;&#124; !Array.isArray(read.data)) return { ok: false, errors: ['EXTERNAL_LOAD_READ_FAILED'] };` |
| lib\sports\prepareSessionTrainingContract.ts:58 | `if (history.error &#124;&#124; !Array.isArray(history.data)) return { ok: false, errors: ['EXPOSURE_READ_FAILED'] };` |
| lib\sports\prepareSessionTrainingContract.ts:67 | `} catch { return { ok: false, errors: ['CONTRACT_CONTEXT_READ_FAILED'] }; }` |
| lib\sports\sessionAuthority.ts:39 | `if (!secret) throw new Error('SESSION_AUTHORITY_UNAVAILABLE');` |
| lib\sports\sessionAuthority.ts:58 | `if (!parsed.ok) throw new Error('WEEK_REPAIR_PROPOSAL_INVALID');` |
| lib\sports\sessionAuthority.ts:60 | `if (!checked.ok) throw new Error('WEEK_REPAIR_CONTRACT_INVALID');` |
| lib\sports\sessionAuthority.ts:70 | `return { ok: false as const, code: 'TRANSFER_REQUIRES_WEEKLY_AUTHORITY' };` |
| lib\sports\sessionAuthority.ts:72 | `return { ok: false as const, code: 'OPEN_INTENT_REQUIRES_WEEKLY_AUTHORITY' };` |
| lib\sports\sessionAuthority.ts:90 | `if (!Array.isArray(previous) &#124;&#124; previous.length > 6) throw new Error('WEEKLY_SIBLING_EVIDENCE_REQUIRED');` |
| lib\sports\sessionAuthority.ts:95 | `&#124;&#124; previous.some(s => !earlier.some((a: any) => a.day === calendarKey(s.dia)))) throw new Error('WEEKLY_SIBLING_SEQUENCE_INVALID');` |
| lib\sports\sessionAuthority.ts:99 | `if (stored.error) throw new Error('WEEKLY_SIBLING_READ_FAILED');` |
| lib\sports\sessionAuthority.ts:113 | `return { ok: false as const, code: 'TRAINING_CONTRACT_INVALID', errors: ['SESSION_STATE_MISMATCH'] };` |
| lib\sports\sessionAuthority.ts:116 | `if (error &#124;&#124; !profile) return { ok: false as const, code: 'CONTRACT_PROFILE_READ_FAILED' };` |
| lib\sports\sessionAuthority.ts:128 | `if (!base.ok) return { ok: false as const, code: 'TRAINING_CONTRACT_INVALID', errors: base.errors };` |
| lib\sports\sessionAuthority.ts:144 | `return { ok: false as const, code: 'PRESCRIPTION_DATA_MISSING', errors: prepared.errors, sufficiency, question,` |
| lib\sports\sessionAuthority.ts:160 | `throw new Error('WEEKLY_CONTEXT_STALE');` |
| lib\sports\sessionAuthority.ts:162 | `if (history.error &#124;&#124; !Array.isArray(history.data)) return { ok: false as const, code: 'SESSION_HISTORY_READ_FAILED' };` |
| lib\sports\sessionAuthority.ts:180 | `} catch (error: any) { return { ok: false as const, code: error.message?.startsWith('WEEKLY_') &#124;&#124; error.message?.startsWith('CALENDAR_')` |
| lib\sports\sessionAuthority.ts:187 | `if (typeof receipt !== 'string' &#124;&#124; receipt.length > 200_000) throw new Error('SESSION_RECEIPT_REQUIRED');` |
| lib\sports\sessionAuthority.ts:189 | `if (!payload &#124;&#124; !mac &#124;&#124; extra !== undefined) throw new Error('SESSION_RECEIPT_INVALID');` |
| lib\sports\sessionAuthority.ts:192 | `if (expected.length !== received.length &#124;&#124; !timingSafeEqual(expected, received)) throw new Error('SESSION_RECEIPT_INVALID');` |
| lib\sports\sessionAuthority.ts:195 | `&#124;&#124; evidence.contract?.targetWeekStart !== weekStart) throw new Error('SESSION_RECEIPT_CONTEXT_MISMATCH');` |
| lib\sports\sessionAuthority.ts:197 | `throw new Error('WEEKLY_SESSION_CHAIN_MISMATCH');` |
| lib\sports\sessionAuthority.ts:205 | `throw new Error('WEEKLY_SESSION_CHAIN_MISMATCH');` |
| lib\sports\sessionAuthority.ts:208 | `if (fields.some(k => !Object.is(session[k] ?? (k === 'debilidad_relacionada' ? null : undefined), rendered[k]))) throw new Error('SESSION_CONTENT_MISMATCH');` |
| lib\sports\sessionAuthority.ts:213 | `throw new Error('SESSION_CONTENT_MISMATCH');` |
| lib\sports\sessionAuthority.ts:225 | `if (material(original) !== material(current)) throw new Error('SESSION_RESTRICTIONS_CHANGED_REGENERATE');` |
| lib\sports\sessionAuthority.ts:230 | `if (access.error &#124;&#124; !access.data) throw new Error('SESSION_AVAILABILITY_READ_FAILED');` |
| lib\sports\sessionAuthority.ts:231 | `if (access.data.perfil?.prescription_access?.[date]?.availability === 'unavailable') throw new Error('SESSION_TEMPORARY_AVAILABILITY_CHANGED');` |
| lib\sports\sessionAuthority.ts:233 | `if (declaredDays && !declaredDays.includes(contract.targetDay)) throw new Error('SESSION_TEMPORARY_AVAILABILITY_CHANGED');` |
| lib\sports\sessionAuthority.ts:247 | `if (now.evidenceDigest !== contract.doseContext.evidenceDigest) throw new Error('SESSION_DOSE_CONTEXT_CHANGED_REGENERATE');` |
| lib\sports\sessionAuthority.ts:250 | `throw new Error('RUNNING_METHOD_DOSE_CONTEXT_CHANGED_REGENERATE');` |
| lib\sports\sessionAuthority.ts:258 | `if (error &#124;&#124; !profile &#124;&#124; sources.error &#124;&#124; !Array.isArray(sources.data)) throw new Error('SESSION_SCOPE_READ_FAILED');` |
| lib\sports\sessionAuthority.ts:260 | `if (!scope.ok &#124;&#124; !scope.scope.prescriptionAllowed &#124;&#124; !scope.scope.managedDisciplines.includes(canonicalDiscipline(discipline))) throw new Error('SESSION_SCOPE_REVOKED');` |
| lib\sports\sessionAuthority.ts:268 | `if (!['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].includes(dia)) throw new Error('SESSION_DAY_INVALID');` |
| lib\sports\sessionAuthority.ts:272 | `if (session.tipo === 'external_blocked') throw new Error('EXTERNAL_SLOT_NOT_AUTHORIZED');` |
| lib\sports\sessionGeneration.ts:32 | `if (!preflight.ok) return { ok: false as const, code: 'TRAINING_CONTRACT_INVALID', violations: preflight.errors };` |
| lib\sports\sessionGeneration.ts:34 | `return {ok:false as const,code:'D3_C2_INTENSITY_UNRESOLVED',violations:['D3_C2_INTENSITY_UNRESOLVED']};` |
| lib\sports\sessionGeneration.ts:36 | `return {ok:false as const,code:'D3_B3_DOSE_UNRESOLVED',violations:['D3_B3_DOSE_UNRESOLVED']};` |
| lib\sports\sessionGeneration.ts:39 | `if (authority.runningMethodDose && authority.runningMethodDose.status !== 'RESOLVED') return { ok: false as const,` |
| lib\sports\sessionGeneration.ts:46 | `if (gate.errors.length) return {ok:false as const,code:gate.errors[0],violations:gate.errors};` |
| lib\sports\sessionGeneration.ts:134 | `catch { trace.emit(attempt + 1, 'provider', 'SESSION_GENERATION_FAILED', ['LLM_REQUEST_FAILED'], false, 'provider_failure_terminal'); return { ok: false as const, code: 'SESSION_GENERATION_FAILED', violations: ['LLM_REQUEST_FAILED'], diagnostics: trace.summary() }; }` |
| lib\sports\sessionGeneration.ts:144 | `return { ok: false as const, code: 'SESSION_PROPOSAL_INVALID', violations: parsed.violations, diagnostics: trace.summary() };` |
| lib\sports\sessionGeneration.ts:159 | `return { ok: false as const, code: 'SESSION_PROPOSAL_INVALID', violations: previousErrors, diagnostics: trace.summary() };` |
| lib\sports\sessionGeneration.ts:178 | `return { ok: false as const, code: 'SESSION_CONTRACT_INVALID', violations: validation.violations, diagnostics: trace.summary() };` |
| lib\sports\sessionGeneration.ts:201 | `return { ok: false as const, code: 'SESSION_DUPLICATE', violations: ['RETRY_STILL_DUPLICATE'], diagnostics: trace.summary() };` |
| lib\sports\methodIntensityAuthority.ts:102 | `if (a.status === 'UNRESOLVED') return ['NO_METHOD_POLICY', 'POLICY_NOT_EXECUTABLE'].includes(a.reason) && a.policy === null && Array.isArray(a.targets) && a.targets.length === 0;` |
| lib\sports\methodIntensityAuthority.ts:107 | `if (!validMethodIntensity(c)) return ['METHOD_INTENSITY_AUTHORITY_INVALID'];` |
| lib\sports\methodIntensityAuthority.ts:109 | `if (!a &#124;&#124; a.status === 'UNRESOLVED') return [];` |
| lib\sports\runningMethodDoseAuthority.ts:79 | `if (evidence.status === 'CONFLICT' &#124;&#124; evidence.conflicts.length &#124;&#124; evidence.structuredMethodExecution?.status === 'CONFLICT') return fail('CONFLICT', 'CONFLICTING_EVIDENCE');` |
| lib\sports\runningMethodDoseAuthority.ts:80 | `if (!p &#124;&#124; p.family !== evidence.family) return fail('UNRESOLVED', 'DOMAIN_UNSUPPORTED');` |
| lib\sports\runningMethodDoseAuthority.ts:92 | `return fail('UNRESOLVED',suitability.status);` |
| lib\sports\runningMethodDoseAuthority.ts:96 | `if (reason) return fail(reason === 'CONFLICTING_EVIDENCE' ? 'CONFLICT' : 'UNRESOLVED', reason);` |
| lib\sports\runningMethodDoseAuthority.ts:111 | `return fail(result.reason === 'AMBIGUOUS_LATEST_METHOD_EXECUTION' ? 'CONFLICT' : 'UNRESOLVED', result.reason);` |
| lib\sports\runningMethodDoseAuthority.ts:117 | `if (!selected) return fail('UNRESOLVED', p.family === 'TECHNICAL_EXPOSURE'` |
| lib\sports\runningMethodDoseAuthority.ts:119 | `if (!validSelection(selected)) return fail('UNRESOLVED', 'SELECTED_TARGET_NOT_ESTABLISHED');` |
| lib\sports\runningMethodDoseAuthority.ts:143 | `if (!a) return [];` |
| lib\sports\runningMethodDoseAuthority.ts:145 | `if (!validRunningMethodDose(c)) return ['RUNNING_METHOD_DOSE_AUTHORITY_INVALID'];` |
| lib\sports\runningMethodDoseAuthority.ts:146 | `if (a.decisionAuthority === 'coach' && a.status === 'RESOLVED') return [];` |
| lib\sports\runningMethodDoseAuthority.ts:147 | `if (a.status !== 'RESOLVED' &#124;&#124; !a.dose) return ['RUNNING_METHOD_DOSE_${a.status}'];` |
| lib\sports\runningMethodDoseAuthority.ts:149 | `if (!main) return ['RUNNING_METHOD_DOSE_MAIN_REQUIRED'];` |
| lib\sports\runningMethodDoseAuthority.ts:150 | `if (!d.structures.includes(proposal.structureId)) errors.push('RUNNING_METHOD_DOSE_STRUCTURE_MISMATCH');` |
| lib\sports\runningMethodDoseAuthority.ts:151 | `if (main.formatDose) errors.push('RUNNING_METHOD_DOSE_FORMAT_OVERRIDE');` |
| lib\sports\runningMethodDoseAuthority.ts:153 | `errors.push('RUNNING_METHOD_DOSE_SINGLE_CONTINUOUS_TOTAL_REQUIRED');` |
| lib\sports\runningMethodDoseAuthority.ts:155 | `errors.push('RUNNING_METHOD_DOSE_SINGLE_INTERVAL_MAIN_REQUIRED');` |
| lib\sports\runningMethodDoseAuthority.ts:159 | `if (d.allowedMovementIds && !d.allowedMovementIds.includes(m.movementId)) errors.push('RUNNING_METHOD_DOSE_MOVEMENT_NOT_AUTHORIZED');` |
| lib\sports\runningMethodDoseAuthority.ts:165 | `errors.push('RUNNING_METHOD_DOSE_METRIC_MISMATCH');` |
| lib\sports\runningMethodDoseAuthority.ts:169 | `errors.push('RUNNING_METHOD_DOSE_CONTINUOUS_REQUIRED');` |
| lib\sports\runningMethodDoseAuthority.ts:170 | `if (s.bout && (s.bout.unit !== workUnit &#124;&#124; !inside(work ?? 0, s.bout.range))) errors.push('RUNNING_METHOD_DOSE_BOUT_EXCEEDED');` |
| lib\sports\runningMethodDoseAuthority.ts:171 | `if (s.recoverySeconds && !inside(q.restSeconds ?? -1, s.recoverySeconds)) errors.push('RUNNING_METHOD_DOSE_RECOVERY_MISMATCH');` |
| lib\sports\runningMethodDoseAuthority.ts:173 | `if (d.structureConstraints.efforts && !inside(efforts, d.structureConstraints.efforts)) errors.push('RUNNING_METHOD_DOSE_REPETITIONS_OUTSIDE_AUTHORITY');` |
| lib\sports\runningMethodDoseAuthority.ts:174 | `if (d.maximumAuthorized !== null && total > d.maximumAuthorized) errors.push('RUNNING_METHOD_DOSE_EXCEEDS_AUTHORITY');` |
| lib\sports\runningMethodDoseAuthority.ts:175 | `if (d.minimumUseful !== null && total < d.minimumUseful) errors.push('RUNNING_METHOD_DOSE_BELOW_MINIMUM_USEFUL');` |
| lib\sports\runningMethodDoseAuthority.ts:176 | `if (d.selectedTarget && !inside(total, d.selectedTarget)) errors.push('RUNNING_METHOD_DOSE_OUTSIDE_SELECTED_TARGET');` |
| lib\sports\runningMethodDoseAuthority.ts:177 | `if (d.compositionTolerance && !inside(total, d.compositionTolerance)) errors.push('RUNNING_METHOD_DOSE_OUTSIDE_COMPOSITION_TOLERANCE');` |
| lib\sports\runningMethodDoseAuthority.ts:178 | `errors.push(...validateRunningPreparation(proposal));` |
| lib\sports\runningMethodDoseAuthority.ts:179 | `return [...new Set(errors)];` |

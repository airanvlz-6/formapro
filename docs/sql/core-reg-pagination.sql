-- Apply AFTER core-reg-1-workouts.sql, in an authorized maintenance window.
-- Read-only projections of existing authorities. No copied data or backfill.
BEGIN;
CREATE INDEX workout_latest_revision ON public.running_execution_records(user_codigo, execution_id, revision DESC) WHERE record_version = 2;
CREATE VIEW public.workout_current_records WITH (security_invoker = true) AS
SELECT DISTINCT ON (user_codigo, execution_id) *
FROM public.running_execution_records WHERE record_version = 2
ORDER BY user_codigo, execution_id, revision DESC;

CREATE VIEW public.workout_read_rows WITH (security_invoker = true) AS
SELECT r.*, ('v2:' || execution_id) COLLATE "C" AS read_key FROM public.workout_current_records r
UNION ALL
SELECT r.*, ('v1:' || execution_id || ':' || content_digest) COLLATE "C" AS read_key
FROM public.running_execution_records r WHERE record_version IS NULL;

-- Append-only revision count invalidates an in-flight cursor after any mutation.
-- Derived on read: no counter table, persisted snapshot or second authority.
CREATE VIEW public.workout_history_version WITH (security_invoker = true) AS
SELECT user_codigo,count(*)::text AS revision_count FROM public.running_execution_records GROUP BY user_codigo;

-- Mirrors resolveCompletionDate: invalid/unknown dates remain explicitly unknown.
CREATE FUNCTION public.workout_civil_date(value text) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public AS $$
DECLARE d date; local_time timestamp; offset_minutes integer := 0; zone text;
BEGIN
  IF value IS NULL OR value !~ '^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2}))?$' THEN RETURN NULL; END IF;
  d := left(value,10)::date;
  IF length(value) > 10 THEN
    IF substring(value,12,2)::int > 23 OR substring(value,15,2)::int > 59 OR substring(value,18,2)::int > 59 THEN RETURN NULL; END IF;
    IF right(value,1)='Z' THEN local_time := left(value,length(value)-1)::timestamp;
    ELSE
      zone := right(value,6);
      IF substring(zone,2,2)::int > 23 OR right(zone,2)::int > 59 THEN RETURN NULL; END IF;
      offset_minutes := (substring(zone,2,2)::int*60+right(zone,2)::int) * CASE WHEN left(zone,1)='-' THEN -1 ELSE 1 END;
      local_time := left(value,length(value)-6)::timestamp;
    END IF;
    d := ((local_time - make_interval(mins=>offset_minutes)) AT TIME ZONE 'UTC' AT TIME ZONE 'Atlantic/Canary')::date;
  END IF;
  RETURN to_char(d,'YYYY-MM-DD');
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN NULL;
END $$;

CREATE VIEW public.workout_history_entries WITH (security_invoker = true) AS
WITH current AS NOT MATERIALIZED (SELECT * FROM public.workout_current_records),
running AS (
  SELECT user_codigo, execution_id, max(record->>'occurredAt') AS day,
    jsonb_agg(to_jsonb(r) ORDER BY content_digest) AS payload
  FROM public.running_execution_records r WHERE record_version IS NULL
  GROUP BY user_codigo, execution_id
), legacy AS (
  SELECT u.codigo AS user_codigo, h.value AS payload, (h.ordinality - 1)::text AS ordinal
  FROM public.usuarios u CROSS JOIN LATERAL jsonb_array_elements(coalesce(nullif(u.workout_history,'null'::jsonb),'[]'::jsonb)) WITH ORDINALITY h
), sessions AS (
  SELECT p.user_codigo, p.id::text AS plan_id, p.week_start::text AS week_start,
    s.value AS session, coalesce(s.value->>'session_id',(s.ordinality-1)::text) AS session_id
  FROM public.weekly_plan p CROSS JOIN LATERAL jsonb_array_elements(coalesce(nullif(p.sessions,'null'::jsonb),'[]'::jsonb)) WITH ORDINALITY s
), entries AS (
  SELECT user_codigo, execution_id AS identity, execution_id, executed_on::text AS day, 'canonical'::text AS kind, to_jsonb(c) AS payload
  FROM current c WHERE deleted_at IS NULL
  UNION ALL
  SELECT r.user_codigo, 'running-v1:'||r.execution_id, r.execution_id, r.day, 'running', r.payload FROM running r
  WHERE NOT EXISTS (SELECT 1 FROM current c WHERE c.user_codigo=r.user_codigo AND c.execution_id=r.execution_id)
  UNION ALL
  SELECT l.user_codigo, 'legacy:'||l.ordinal, l.payload->>'executionId', public.workout_civil_date(l.payload->>'fecha'), 'legacy', l.payload FROM legacy l
  WHERE NOT EXISTS (SELECT 1 FROM current c WHERE c.user_codigo=l.user_codigo
    AND c.execution_id IN (l.payload->>'executionId',l.payload->>'workout_id'))
    AND NOT EXISTS (SELECT 1 FROM running r WHERE r.user_codigo=l.user_codigo
    AND r.execution_id IN (l.payload->>'executionId',l.payload->>'workout_id'))
  UNION ALL
  SELECT s.user_codigo, 'plan:'||s.plan_id||':'||s.session_id||':'||coalesce(e.value->>'id',(e.ordinality-1)::text), NULL,
    public.workout_civil_date(e.value->>'executionDate'), 'report', e.value
  FROM sessions s CROSS JOIN LATERAL jsonb_array_elements(coalesce(nullif(s.session->'chatExecutionEvidence','null'::jsonb),'[]'::jsonb)) WITH ORDINALITY e
  WHERE e.value->>'kind'='PERFORMED'
    AND NOT EXISTS (SELECT 1 FROM current c CROSS JOIN LATERAL jsonb_array_elements(c.record->'prescriptionReferences') ref
      WHERE c.user_codigo=s.user_codigo AND ref->>'planId'=s.plan_id AND ref->>'sessionId'=s.session_id)
    AND NOT EXISTS (SELECT 1 FROM legacy l WHERE l.user_codigo=s.user_codigo AND l.payload->>'operationId'=e.value->>'id')
    AND NOT EXISTS (SELECT 1 FROM public.running_execution_records r WHERE r.user_codigo=s.user_codigo AND r.record_version IS NULL
      AND r.record->'planAssociation'->>'weekStart'=s.week_start AND r.record->'planAssociation'->>'sessionId'=s.session_id)
  UNION ALL
  SELECT s.user_codigo, 'plan:'||s.plan_id||':'||s.session_id, NULL, NULL, 'completion', s.session FROM sessions s
  WHERE s.session->'completada'='true'::jsonb
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(nullif(s.session->'chatExecutionEvidence','null'::jsonb),'[]'::jsonb)) e WHERE e->>'kind'='PERFORMED')
    AND NOT EXISTS (SELECT 1 FROM current c CROSS JOIN LATERAL jsonb_array_elements(c.record->'prescriptionReferences') ref
      WHERE c.user_codigo=s.user_codigo AND ref->>'planId'=s.plan_id AND ref->>'sessionId'=s.session_id)
    AND NOT EXISTS (SELECT 1 FROM public.running_execution_records r WHERE r.user_codigo=s.user_codigo AND r.record_version IS NULL
      AND r.record->'planAssociation'->>'weekStart'=s.week_start AND r.record->'planAssociation'->>'sessionId'=s.session_id)
)
SELECT *, (coalesce(day,'0000-00-00')||'|'||identity) COLLATE "C" AS chronology_key FROM entries;

REVOKE ALL ON public.workout_current_records, public.workout_read_rows, public.workout_history_entries, public.workout_history_version FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.workout_current_records, public.workout_read_rows, public.workout_history_entries, public.workout_history_version TO service_role;
REVOKE ALL ON FUNCTION public.workout_civil_date(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workout_civil_date(text) TO service_role;
COMMIT;

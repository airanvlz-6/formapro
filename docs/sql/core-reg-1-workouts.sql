-- Pending authorized deployment. No backfill. Run PRE checks in core-reg-1-delivery.md first.
BEGIN;
ALTER TABLE public.running_execution_records
  ADD COLUMN record_version integer,
  ADD COLUMN revision integer,
  ADD COLUMN request_id text,
  ADD COLUMN request_digest text,
  ADD COLUMN executed_on date,
  ADD COLUMN updated_at timestamptz,
  ADD COLUMN deleted_at timestamptz,
  ADD CONSTRAINT workout_v2_shape CHECK (coalesce((
    (record_version IS NULL AND (record->>'version')::integer = 1) OR
    (record_version = 2 AND record->>'version' = '2'
      AND revision IS NOT NULL AND revision > 0 AND revision = (record->>'revision')::integer
      AND request_id IS NOT NULL AND request_id = record->>'requestId'
      AND request_digest IS NOT NULL AND length(request_digest) = 64 AND request_digest = record->>'requestDigest'
      AND executed_on IS NOT NULL AND executed_on = (record->'data'->>'executedOn')::date
      AND updated_at IS NOT NULL AND updated_at = (record->>'updatedAt')::timestamptz
      AND deleted_at IS NOT DISTINCT FROM (record->>'deletedAt')::timestamptz)),false));
CREATE UNIQUE INDEX workout_request_once ON public.running_execution_records(user_codigo, request_id) WHERE record_version = 2;
CREATE UNIQUE INDEX workout_revision_once ON public.running_execution_records(user_codigo, execution_id, revision) WHERE record_version = 2;
CREATE INDEX workout_chronology ON public.running_execution_records(user_codigo, executed_on DESC, execution_id DESC) WHERE record_version = 2;

-- Append signed revisions in the SAME factual store. Historical v1 rows are untouched.
-- No direct writes: SECURITY DEFINER owns the sole transactional writer.
REVOKE INSERT ON public.running_execution_records FROM service_role;
CREATE FUNCTION public.mutate_workout(p_user text, p_operation text, p_expected integer, p_row jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  r jsonb := p_row->'record';
  previous public.running_execution_records%ROWTYPE;
  receipt public.running_execution_records%ROWTYPE;
  saved public.running_execution_records%ROWTYPE;
  linked_plan jsonb;
BEGIN
  -- Serialize requests per athlete, including creates and request-ID collisions across executions.
  PERFORM pg_advisory_xact_lock(hashtextextended('forge-workout:' || p_user, 0));
  IF p_user IS NULL OR p_user = '' OR p_operation NOT IN ('create','update','delete')
    OR r->>'version' IS DISTINCT FROM '2' OR r->>'operation' IS DISTINCT FROM p_operation
    OR coalesce(r->>'executionId','') = '' OR coalesce(r->>'requestId','') = ''
    OR coalesce(p_row->>'signature','') = '' THEN RAISE EXCEPTION 'WORKOUT_INVALID_ENVELOPE'; END IF;
  SELECT * INTO receipt FROM public.running_execution_records
    WHERE user_codigo = p_user AND record_version = 2 AND request_id = r->>'requestId';
  IF FOUND THEN
    IF receipt.request_digest IS DISTINCT FROM r->>'requestDigest' OR receipt.execution_id IS DISTINCT FROM r->>'executionId' THEN
      RETURN jsonb_build_object('code','WORKOUT_REQUEST_CONFLICT');
    END IF;
    SELECT * INTO saved FROM public.running_execution_records WHERE user_codigo = p_user AND record_version = 2
      AND execution_id = receipt.execution_id ORDER BY revision DESC LIMIT 1;
    RETURN jsonb_build_object('status','already_applied','row',to_jsonb(saved));
  END IF;
  SELECT * INTO previous FROM public.running_execution_records WHERE user_codigo = p_user AND record_version = 2
    AND execution_id = r->>'executionId' ORDER BY revision DESC LIMIT 1;
  IF p_operation = 'create' THEN
    IF FOUND OR EXISTS (SELECT 1 FROM public.running_execution_records WHERE user_codigo=p_user AND execution_id=r->>'executionId') THEN
      RETURN jsonb_build_object('code','WORKOUT_ID_CONFLICT');
    END IF;
    IF p_expected <> 0 OR r->>'revision' <> '1' OR r->>'createdAt' IS DISTINCT FROM r->>'updatedAt' THEN
      RAISE EXCEPTION 'WORKOUT_INVALID_INITIAL_REVISION';
    END IF;
  ELSE
    IF NOT FOUND THEN RETURN jsonb_build_object('code','WORKOUT_NOT_FOUND'); END IF;
    IF previous.deleted_at IS NOT NULL THEN
      IF p_operation = 'delete' THEN RETURN jsonb_build_object('status','already_applied','row',to_jsonb(previous)); END IF;
      RETURN jsonb_build_object('code','WORKOUT_DELETED');
    END IF;
    IF previous.revision <> p_expected THEN RETURN jsonb_build_object('code','WORKOUT_REVISION_CONFLICT'); END IF;
    IF (r->>'revision')::integer <> previous.revision + 1 OR r->>'createdAt' IS DISTINCT FROM previous.record->>'createdAt'
      OR r->>'athleteScope' IS DISTINCT FROM previous.record->>'athleteScope'
      OR (r->>'updatedAt')::timestamptz < previous.updated_at THEN RAISE EXCEPTION 'WORKOUT_INVALID_REVISION'; END IF;
  END IF;
  IF (p_operation = 'delete') IS DISTINCT FROM (r->>'deletedAt' IS NOT NULL) THEN RAISE EXCEPTION 'WORKOUT_INVALID_STATE'; END IF;
  IF p_operation = 'delete' AND (r->'data' IS DISTINCT FROM previous.record->'data'
    OR r->'structuredRunning' IS DISTINCT FROM previous.record->'structuredRunning') THEN RAISE EXCEPTION 'WORKOUT_INVALID_TOMBSTONE'; END IF;
  IF p_operation <> 'delete' AND r->'data'->'prescription' IS NOT NULL THEN
    -- Lock the exact owned plan while checking its session; never resolve by day or modify prescription.
    SELECT to_jsonb(p) INTO linked_plan FROM public.weekly_plan p
      WHERE p.user_codigo = p_user AND p.id::text = r->'data'->'prescription'->>'planId' FOR SHARE;
    IF linked_plan IS NULL OR (SELECT count(*) FROM jsonb_array_elements(linked_plan->'sessions') s
      WHERE s->>'session_id' = r->'data'->'prescription'->>'sessionId') <> 1 THEN
      RETURN jsonb_build_object('code','WORKOUT_PRESCRIPTION_NOT_OWNED');
    END IF;
  END IF;
  INSERT INTO public.running_execution_records(user_codigo,execution_id,content_digest,record,signature,
    record_version,revision,request_id,request_digest,executed_on,updated_at,deleted_at)
  VALUES(p_user,r->>'executionId',p_row->>'content_digest',r,p_row->>'signature',2,(r->>'revision')::integer,
    r->>'requestId',r->>'requestDigest',(r->'data'->>'executedOn')::date,(r->>'updatedAt')::timestamptz,(r->>'deletedAt')::timestamptz)
  RETURNING * INTO saved;
  RETURN jsonb_build_object('status','committed','row',to_jsonb(saved));
END $$;
REVOKE ALL ON FUNCTION public.mutate_workout(text,text,integer,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_workout(text,text,integer,jsonb) TO service_role;
COMMIT;

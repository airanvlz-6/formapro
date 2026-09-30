-- READ ONLY. Run as a role allowed to inspect grants, after both migrations.
BEGIN TRANSACTION READ ONLY;
DO $$ DECLARE n text; r text; BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.running_execution_records'::regclass) THEN RAISE EXCEPTION 'RLS disabled'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.running_execution_records'::regclass AND conname='workout_v2_shape' AND convalidated) THEN RAISE EXCEPTION 'Shape constraint missing'; END IF;
  FOREACH n IN ARRAY ARRAY['workout_request_once','workout_revision_once','workout_chronology','workout_latest_revision'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.'||n) AND indisvalid AND indisready) THEN RAISE EXCEPTION 'Missing/invalid index %',n; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.mutate_workout(text,text,integer,jsonb)'::regprocedure AND prosecdef
    AND proconfig @> ARRAY['search_path=pg_catalog, public']) THEN RAISE EXCEPTION 'Writer security definition mismatch'; END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_table_privilege(r,'public.running_execution_records','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') THEN RAISE EXCEPTION 'Direct mutation grant for %',r; END IF;
    IF has_schema_privilege(r,'public','CREATE') THEN RAISE EXCEPTION 'Untrusted search_path writer %',r; END IF;
    IF has_function_privilege(r,'public.mutate_workout(text,text,integer,jsonb)','EXECUTE') <> (r='service_role') THEN RAISE EXCEPTION 'RPC grant mismatch %',r; END IF;
    IF has_table_privilege(r,'public.running_execution_records','SELECT') <> (r='service_role') THEN RAISE EXCEPTION 'Factual read grant mismatch %',r; END IF;
    FOREACH n IN ARRAY ARRAY['workout_current_records','workout_read_rows','workout_history_entries','workout_history_version'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||n) AND reloptions @> ARRAY['security_invoker=true']) THEN RAISE EXCEPTION 'Invoker security missing %',n; END IF;
      IF has_table_privilege(r,'public.'||n,'SELECT') <> (r='service_role') THEN RAISE EXCEPTION 'View read grant mismatch % %',r,n; END IF;
      IF has_table_privilege(r,'public.'||n,'INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'View mutation grant % %',r,n; END IF;
    END LOOP;
  END LOOP;
END $$;
SELECT p.oid::regprocedure,p.proowner::regrole,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid)
FROM pg_proc p WHERE p.oid IN ('public.mutate_workout(text,text,integer,jsonb)'::regprocedure,'public.workout_civil_date(text)'::regprocedure);
SELECT viewname,definition FROM pg_views WHERE schemaname='public' AND viewname IN ('workout_current_records','workout_read_rows','workout_history_entries','workout_history_version');
SELECT user_codigo,request_id,count(*) FROM public.running_execution_records WHERE record_version=2 GROUP BY user_codigo,request_id HAVING count(*)>1;
SELECT user_codigo,execution_id,revision,count(*) FROM public.running_execution_records WHERE record_version=2 GROUP BY user_codigo,execution_id,revision HAVING count(*)>1;
-- Zero rows expected in both checks. Never echo workout content in deployment logs.
SELECT count(*) AS active_current FROM public.workout_current_records WHERE deleted_at IS NULL;
SELECT count(*) AS current_tombstones FROM public.workout_current_records WHERE deleted_at IS NOT NULL;
SELECT kind,count(*) FROM public.workout_history_entries GROUP BY kind ORDER BY kind;
SELECT 'running_v1' AS source,count(*) AS rows,md5(coalesce(string_agg(md5(ROW(user_codigo,execution_id,content_digest,record,signature,created_at)::text),'' ORDER BY user_codigo,execution_id,content_digest),'')) AS fingerprint
FROM public.running_execution_records WHERE record->>'version'='1'
UNION ALL SELECT 'profile_history',count(*),md5(coalesce(string_agg(md5(ROW(codigo,workout_history)::text),'' ORDER BY codigo),'')) FROM public.usuarios
UNION ALL SELECT 'weekly_plan',count(*),md5(coalesce(string_agg(md5(ROW(id,user_codigo,week_start,sessions)::text),'' ORDER BY id::text),'')) FROM public.weekly_plan;
COMMIT;

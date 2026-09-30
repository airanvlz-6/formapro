-- READ ONLY. Save output with environment/release identity before authorization.
BEGIN TRANSACTION READ ONLY;
SELECT current_database() AS database_name, current_user, current_setting('server_version_num') AS server_version;
DO $$ BEGIN
  IF current_setting('server_version_num')::int < 150000 THEN RAISE EXCEPTION 'PostgreSQL 15+ required for security_invoker views'; END IF;
  IF to_regclass('public.running_execution_records') IS NULL OR to_regclass('public.usuarios') IS NULL
    OR to_regclass('public.weekly_plan') IS NULL THEN RAISE EXCEPTION 'Missing prerequisite authority'; END IF;
  IF EXISTS (SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) r(name)
    WHERE NOT EXISTS (SELECT 1 FROM pg_roles p WHERE p.rolname=r.name)) THEN RAISE EXCEPTION 'Missing Supabase role'; END IF;
END $$;
SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns WHERE table_schema='public'
AND table_name IN ('usuarios','weekly_plan','running_execution_records')
ORDER BY table_name,ordinal_position;
-- Required: usuarios.codigo text and workout_history jsonb; weekly_plan user_codigo text,
-- sessions jsonb, id with stable text representation, week_start civil date/text.
-- running_execution_records base columns must match b32c-running-execution-records.sql.
SELECT to_regprocedure('public.mutate_workout(text,text,integer,jsonb)') AS registry_writer,
  to_regclass('public.workout_current_records') AS current_view,
  to_regclass('public.workout_read_rows') AS read_view,
  to_regclass('public.workout_history_entries') AS history_view;
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relowner::regrole,c.reloptions
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('usuarios','weekly_plan','running_execution_records','workout_current_records','workout_read_rows','workout_history_entries','workout_history_version');
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN ('usuarios','weekly_plan','running_execution_records');
SELECT rolname,rolsuper,rolinherit,rolbypassrls FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role');
SELECT member::regrole,roleid::regrole FROM pg_auth_members
WHERE member IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'));
SELECT r.name,has_schema_privilege(r.name,'public','CREATE') AS can_create_in_function_search_path,
  has_table_privilege(r.name,'public.running_execution_records','SELECT') AS can_read,
  has_table_privilege(r.name,'public.running_execution_records','INSERT') AS can_insert,
  has_table_privilege(r.name,'public.running_execution_records','UPDATE') AS can_update,
  has_table_privilege(r.name,'public.running_execution_records','DELETE') AS can_delete
FROM (VALUES ('anon'),('authenticated'),('service_role')) r(name);
SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='running_execution_records';
SELECT conname,convalidated,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.running_execution_records'::regclass;
SELECT count(*) AS unknown_versions FROM public.running_execution_records WHERE record->>'version' NOT IN ('1','2') OR record->>'version' IS NULL;
-- Must both be zero; malformed legacy containers need a separate decision, never backfill.
SELECT count(*) AS invalid_history_arrays FROM public.usuarios WHERE workout_history IS NOT NULL AND jsonb_typeof(workout_history) NOT IN ('array','null');
SELECT count(*) AS invalid_session_arrays FROM public.weekly_plan WHERE sessions IS NOT NULL AND jsonb_typeof(sessions) NOT IN ('array','null');
-- Compare these SAME fingerprints after both migrations, while writers are paused.
SELECT 'running_v1' AS source,count(*) AS rows,md5(coalesce(string_agg(md5(ROW(user_codigo,execution_id,content_digest,record,signature,created_at)::text),'' ORDER BY user_codigo,execution_id,content_digest),'')) AS fingerprint
FROM public.running_execution_records WHERE record->>'version'='1'
UNION ALL SELECT 'profile_history',count(*),md5(coalesce(string_agg(md5(ROW(codigo,workout_history)::text),'' ORDER BY codigo),'')) FROM public.usuarios
UNION ALL SELECT 'weekly_plan',count(*),md5(coalesce(string_agg(md5(ROW(id,user_codigo,week_start,sessions)::text),'' ORDER BY id::text),'')) FROM public.weekly_plan;
COMMIT;

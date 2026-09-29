-- Apply explicitly in the runtime project's SQL Editor BEFORE testing the application.
-- No table, RLS policy, profile version or existing data changes.
-- Review deployed policies/grants in SQL Editor (REST OpenAPI does not expose them):
-- SELECT relrowsecurity, relforcerowsecurity FROM pg_catalog.pg_class
--   WHERE oid='public.usuarios'::regclass;
-- SELECT policyname, roles, cmd, qual, with_check FROM pg_catalog.pg_policies
--   WHERE schemaname='public' AND tablename='usuarios';
-- SELECT has_table_privilege('service_role','public.usuarios','SELECT') AS can_read,
--   has_table_privilege('service_role','public.usuarios','UPDATE') AS can_write;
begin;
do $precondition$
begin
  if not exists (select 1 from pg_catalog.pg_attribute where attrelid='public.usuarios'::regclass
    and attname='perfil' and atttypid='jsonb'::regtype and not attisdropped) then
    raise exception 'WEEKLY_AVAILABILITY_JSONB_REQUIRED';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_index i join pg_catalog.pg_attribute a
      on a.attrelid=i.indrelid and a.attnum=i.indkey[0]
    where i.indrelid='public.usuarios'::regclass and a.attname='codigo' and a.atttypid='text'::regtype
      and i.indisunique and i.indisvalid and i.indisready and i.indimmediate
      and i.indnkeyatts=1 and i.indpred is null and i.indexprs is null
  ) then raise exception 'WEEKLY_AVAILABILITY_USER_UNIQUENESS_REQUIRED'; end if;
end;
$precondition$;

-- p_user comes from the authenticated server athlete, never a client-selected identity.
-- Null expected profile means SQL NULL; no coalescing before the CAS comparison.
create or replace function public.forge_weekly_availability_cas(
  p_user text, p_week text, p_expected_profile jsonb, p_declaration jsonb
) returns jsonb language plpgsql security invoker set search_path = pg_catalog as $$
declare
  actual_profile jsonb;
  next_weekly jsonb;
begin
  if p_user is null or p_week is null or p_week !~ '^\d{4}-\d{2}-\d{2}$'
    or to_char(p_week::date,'YYYY-MM-DD') <> p_week or extract(isodow from p_week::date) <> 1
    or jsonb_typeof(p_declaration) is distinct from 'object'
    or p_declaration->>'source' is distinct from 'explicit_user_declaration'
    or p_declaration->'version' is distinct from '1'::jsonb
    or jsonb_typeof(p_declaration->'availability') is distinct from 'object' then
    return jsonb_build_object('result','ERROR','code','INVALID_ARGUMENT');
  end if;
  select perfil into actual_profile from public.usuarios where codigo=p_user for update;
  if not found then return jsonb_build_object('result','NOT_FOUND'); end if;
  if actual_profile is distinct from p_expected_profile then
    return jsonb_build_object('result','CONFLICT');
  end if;
  if actual_profile is not null and jsonb_typeof(actual_profile) <> 'object' then
    return jsonb_build_object('result','ERROR','code','PROFILE_INVALID');
  end if;
  next_weekly := actual_profile->'weekly_availability';
  if next_weekly is null or next_weekly='null'::jsonb then next_weekly := '{}'::jsonb; end if;
  if jsonb_typeof(next_weekly) <> 'object' then
    return jsonb_build_object('result','ERROR','code','WEEKLY_STORAGE_INVALID');
  end if;
  next_weekly := next_weekly || jsonb_build_object(p_week,p_declaration);
  update public.usuarios set perfil=jsonb_set(coalesce(actual_profile,'{}'::jsonb),'{weekly_availability}',next_weekly)
    where codigo=p_user;
  if not found then return jsonb_build_object('result','NOT_FOUND'); end if;
  return jsonb_build_object('result','SUCCESS');
exception
  when insufficient_privilege then return jsonb_build_object('result','NOT_AUTHORIZED');
  when others then return jsonb_build_object('result','ERROR','code','WRITE_FAILED');
end;
$$;
revoke all on function public.forge_weekly_availability_cas(text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.forge_weekly_availability_cas(text,text,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
-- Rollback (only if newly introduced):
-- DROP FUNCTION public.forge_weekly_availability_cas(text,text,jsonb,jsonb);
-- NOTIFY pgrst, 'reload schema';

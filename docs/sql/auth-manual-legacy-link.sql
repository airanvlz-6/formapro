-- Run once as postgres in the Supabase SQL editor. Does NOT migrate any profile.
-- Keep this schema OUT of the Data API exposed schemas.
begin;
create schema if not exists forge_admin;
revoke all on schema forge_admin from public, anon, authenticated, service_role;

-- Fails deployment if pre-existing duplicate links exist; never repairs them.
create unique index if not exists forge_auth_user_unique on public.usuarios(auth_user_id);

create or replace function forge_admin.link_legacy_athlete(
  athlete_id uuid, auth_id uuid, expected_codigo text, expected_email text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  target public.usuarios%rowtype;
  auth_email text;
  confirmed timestamptz;
  after_row jsonb;
begin
  if athlete_id is null or auth_id is null or expected_codigo is null
     or expected_email is null or btrim(expected_email) = '' then
    raise exception 'LINK_INPUT_INVALID';
  end if;
  -- Serializes attempts using the same Auth; FK/unique enforce other writers too.
  select email, email_confirmed_at into auth_email, confirmed
    from auth.users where id = auth_id for update;
  if not found then raise exception 'LINK_AUTH_NOT_FOUND'; end if;
  if confirmed is null then raise exception 'LINK_AUTH_UNCONFIRMED'; end if;

  select * into target from public.usuarios where id = athlete_id for update;
  if not found then raise exception 'LINK_ATHLETE_NOT_FOUND'; end if;
  if target.auth_user_id is not null then raise exception 'LINK_ALREADY_LINKED'; end if;
  if exists (select 1 from public.usuarios where auth_user_id = auth_id) then
    raise exception 'LINK_AUTH_IN_USE';
  end if;
  -- Sanity checks only. These are NOT evidence of ownership. The operator verifies
  -- ownership personally before running this operation with explicit UUIDs.
  if target.codigo is distinct from expected_codigo
     or lower(btrim(target.email)) is distinct from lower(btrim(expected_email))
     or lower(btrim(auth_email)) is distinct from lower(btrim(expected_email)) then
    raise exception 'LINK_EXPECTATION_MISMATCH';
  end if;

  update public.usuarios set auth_user_id = auth_id
    where id = athlete_id and auth_user_id is null
    returning to_jsonb(usuarios) into after_row;
  if not found then raise exception 'LINK_CONFLICT'; end if;
  if (after_row - 'auth_user_id') is distinct from (to_jsonb(target) - 'auth_user_id') then
    raise exception 'LINK_UNEXPECTED_PROFILE_CHANGE';
  end if;
  -- No tokens, emails, passwords or profile contents in the audit record.
  raise log 'FORGE_LEGACY_LINK actor=% athlete_id=% auth_id=% result=linked', session_user, athlete_id, auth_id;
  return jsonb_build_object('result', 'linked', 'athlete_id', athlete_id,
    'auth_user_id', auth_id, 'actor', session_user, 'at', clock_timestamp());
end;
$$;
revoke all on function forge_admin.link_legacy_athlete(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
commit;

-- AFTER personal ownership verification, in a SEPARATE administrator session:
-- select forge_admin.link_legacy_athlete(
--   '<existing usuarios.id>'::uuid, '<verified auth.users.id>'::uuid,
--   '<unchanged codigo>', '<expected email>');
-- Retain the successful committed result in the restricted migration record.
-- A repeated call is rejected (LINK_ALREADY_LINKED), never an overwrite.

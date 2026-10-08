-- Build 8C-A.2 — field-scoped compare-and-set for the canonical profile editor.
-- Apply explicitly in the runtime project's SQL Editor BEFORE using PATCH /api/athlete/profile (fail-closed without it).
-- No table, column, index, RLS policy or data change: it only adds one function.
--
-- WHY: the previous guard compared the WHOLE `perfil` (and several JSON columns) through PostgREST filters
-- (`.eq('perfil', JSON.stringify(row))`). That puts the entire JSON in the request URL (large profiles exceed the URL limit and fail)
-- and round-trips jsonb through text, and any non-conflict DB error was reported as a 409. Many unrelated writers also touch `perfil`.
-- NOW: the server sends ONLY the authorities the edit touches (expected values as read) and the new values. The comparison, the
-- merge and the write happen in ONE locked statement in the database, so:
--   * editing `objective` never conflicts because an unrelated `perfil` key (or avatar, timestamp, signal, turn journal) changed;
--   * a real concurrent change to a touched authority (objective A → B by another writer, then A → C by us) is a CONFLICT;
--   * unrelated `perfil` keys written meanwhile are preserved (the merge is applied to the CURRENT perfil, not to the stale copy).
--
-- p_user comes from the authenticated server athlete, never from a client-selected identity.
-- p_expected = { "columns": { "<col>": <value as read> }, "perfil": [ { "path": ["k"] | ["k","sub"], "value": <as read> } | { "path": [...], "absent": true } ] }
-- p_set      = { "columns": { "<col>": <new value> },     "perfil": [ { "path": [...], "value": <new> } | { "path": [...], "remove": true } ] }
begin;
do $precondition$
begin
  if not exists (select 1 from pg_catalog.pg_attribute where attrelid='public.usuarios'::regclass
    and attname='perfil' and atttypid='jsonb'::regtype and not attisdropped) then
    raise exception 'PROFILE_CAS_JSONB_REQUIRED';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_index i join pg_catalog.pg_attribute a
      on a.attrelid=i.indrelid and a.attnum=i.indkey[0]
    where i.indrelid='public.usuarios'::regclass and a.attname='codigo' and a.atttypid='text'::regtype
      and i.indisunique and i.indisvalid and i.indisready and i.indimmediate
      and i.indnkeyatts=1 and i.indpred is null and i.indexprs is null
  ) then raise exception 'PROFILE_CAS_USER_UNIQUENESS_REQUIRED'; end if;
end;
$precondition$;

create or replace function public.forge_profile_apply(p_user text, p_expected jsonb, p_set jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog as $$
declare
  allowed constant text[] := array['categoria','especialidad','objetivo_principal','distribucion_semanal'];
  u public.usuarios%rowtype;
  row_json jsonb;
  v_perfil jsonb;
  item jsonb;
  col text;
  p text[];
  cur jsonb;
  conflicts text[] := array[]::text[];
  perfil_changes boolean := false;
begin
  if p_user is null or jsonb_typeof(p_expected) is distinct from 'object' or jsonb_typeof(p_set) is distinct from 'object'
    or (p_expected ? 'columns' and jsonb_typeof(p_expected->'columns') is distinct from 'object')
    or (p_set ? 'columns' and jsonb_typeof(p_set->'columns') is distinct from 'object')
    or (p_expected ? 'perfil' and jsonb_typeof(p_expected->'perfil') is distinct from 'array')
    or (p_set ? 'perfil' and jsonb_typeof(p_set->'perfil') is distinct from 'array') then
    return jsonb_build_object('result','ERROR','code','INVALID_ARGUMENT');
  end if;
  for col in select jsonb_object_keys(coalesce(p_expected->'columns','{}'::jsonb)) union select jsonb_object_keys(coalesce(p_set->'columns','{}'::jsonb)) loop
    if not (col = any(allowed)) then return jsonb_build_object('result','ERROR','code','COLUMN_NOT_ALLOWED'); end if;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(p_expected->'perfil','[]'::jsonb)) union all select * from jsonb_array_elements(coalesce(p_set->'perfil','[]'::jsonb)) loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'path') is distinct from 'array'
      or jsonb_array_length(item->'path') not between 1 and 2
      or exists (select 1 from jsonb_array_elements(item->'path') e where jsonb_typeof(e) is distinct from 'string') then
      return jsonb_build_object('result','ERROR','code','INVALID_PATH');
    end if;
  end loop;

  select * into u from public.usuarios where codigo = p_user for update;
  if not found then return jsonb_build_object('result','NOT_FOUND'); end if;
  row_json := to_jsonb(u);
  v_perfil := coalesce(u.perfil,'{}'::jsonb);
  if jsonb_typeof(v_perfil) <> 'object' then return jsonb_build_object('result','ERROR','code','PROFILE_INVALID'); end if;

  -- Compare ONLY what the edit touches. JSON null / SQL NULL compare as 'null'::jsonb for columns.
  for col in select jsonb_object_keys(coalesce(p_expected->'columns','{}'::jsonb)) loop
    if (row_json->col) is distinct from (p_expected->'columns'->col) then conflicts := conflicts || ('column:' || col); end if;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(p_expected->'perfil','[]'::jsonb)) loop
    p := array(select jsonb_array_elements_text(item->'path'));
    cur := v_perfil #> p;   -- SQL NULL = absent; 'null'::jsonb = stored JSON null
    if coalesce((item->>'absent')::boolean,false) then
      if cur is not null then conflicts := conflicts || ('perfil:' || array_to_string(p,'.')); end if;
    elsif cur is distinct from (item->'value') then
      conflicts := conflicts || ('perfil:' || array_to_string(p,'.'));
    end if;
  end loop;
  if cardinality(conflicts) > 0 then return jsonb_build_object('result','CONFLICT','fields',to_jsonb(conflicts)); end if;

  -- Apply. Columns first (typed through the table's own record type), then the perfil paths on the CURRENT perfil.
  for col in select jsonb_object_keys(coalesce(p_set->'columns','{}'::jsonb)) loop
    execute format('update public.usuarios set %I = (jsonb_populate_record(null::public.usuarios, $1)).%I where codigo = $2', col, col)
      using jsonb_build_object(col, p_set->'columns'->col), p_user;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(p_set->'perfil','[]'::jsonb)) loop
    p := array(select jsonb_array_elements_text(item->'path'));
    perfil_changes := true;
    if coalesce((item->>'remove')::boolean,false) then
      v_perfil := v_perfil #- p;
    else
      if cardinality(p) = 2 and jsonb_typeof(v_perfil->p[1]) is distinct from 'object' then
        v_perfil := jsonb_set(v_perfil, array[p[1]], '{}'::jsonb, true);
      end if;
      v_perfil := jsonb_set(v_perfil, p, item->'value', true);
    end if;
  end loop;
  if perfil_changes then update public.usuarios set perfil = v_perfil where codigo = p_user; end if;
  return jsonb_build_object('result','SUCCESS');
exception
  when insufficient_privilege then return jsonb_build_object('result','NOT_AUTHORIZED');
  when others then return jsonb_build_object('result','ERROR','code','WRITE_FAILED');
end;
$$;
revoke all on function public.forge_profile_apply(text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.forge_profile_apply(text,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
-- Rollback (only if newly introduced):
-- DROP FUNCTION public.forge_profile_apply(text,jsonb,jsonb);
-- NOTIFY pgrst, 'reload schema';

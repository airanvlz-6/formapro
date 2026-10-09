-- Build 8D — atomic, order-preserving append of one legacy Coach exchange to usuarios.historial.
-- Apply explicitly in the runtime project's SQL Editor (idempotent: create or replace). No table, column, index or data change.
--
-- WHY: runChatCoach saved history with `.eq('historial', JSON.stringify(before))` (whole-JSON compare through a PostgREST URL):
-- the same fragile pattern that produced the profile false 409 (jsonb<->text round trip, key order, size, unicode). It also made an
-- unrelated change to the history look like a conflict, and the exchange was then silently not saved.
-- NOW: the append runs under a row lock on the CURRENT historial, so
--   * two concurrent exchanges are both kept, in lock order (no lost update, chronological);
--   * no JSON text comparison happens anywhere;
--   * replaying the same exchange (last two turns already equal) is a no-op (ALREADY).
-- Only conversation turns (role user|assistant, string content) are kept, last 15, content cut at 12000 chars, as before.
-- p_user comes from the authenticated server athlete.
begin;
do $precondition$
begin
  if not exists (select 1 from pg_catalog.pg_attribute where attrelid='public.usuarios'::regclass and attname='historial' and not attisdropped
    and atttypid in ('jsonb'::regtype,'json'::regtype)) then
    raise exception 'CHAT_HISTORY_APPEND_JSON_REQUIRED';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_index i join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=i.indkey[0]
    where i.indrelid='public.usuarios'::regclass and a.attname='codigo' and a.atttypid='text'::regtype
      and i.indisunique and i.indisvalid and i.indisready and i.indimmediate and i.indnkeyatts=1 and i.indpred is null and i.indexprs is null
  ) then raise exception 'CHAT_HISTORY_APPEND_USER_UNIQUENESS_REQUIRED'; end if;
end;
$precondition$;

create or replace function public.forge_chat_history_append(p_user text, p_message text, p_answer text)
returns jsonb language plpgsql security invoker set search_path = pg_catalog as $$
declare
  u public.usuarios%rowtype;
  current_history jsonb;
  turns jsonb;
  next_history jsonb;
begin
  if p_user is null or p_message is null or p_answer is null or btrim(p_message) = '' then
    return jsonb_build_object('result','ERROR','code','INVALID_ARGUMENT');
  end if;
  select * into u from public.usuarios where codigo = p_user for update;
  if not found then return jsonb_build_object('result','NOT_FOUND'); end if;
  current_history := to_jsonb(u)->'historial';
  select coalesce(jsonb_agg(t.e order by t.ord), '[]'::jsonb) into turns from (
    select e || jsonb_build_object('content', left(e->>'content', 12000)) as e, ord
    from jsonb_array_elements(case when jsonb_typeof(current_history) = 'array' then current_history else '[]'::jsonb end) with ordinality as x(e, ord)
    where jsonb_typeof(e) = 'object' and e->>'role' in ('user','assistant') and jsonb_typeof(e->'content') = 'string'
    order by ord desc limit 15) t;
  -- Replay of the same exchange (last two turns identical) changes nothing.
  if jsonb_array_length(turns) >= 2
    and turns->(jsonb_array_length(turns)-2)->>'role' = 'user' and turns->(jsonb_array_length(turns)-2)->>'content' = left(p_message, 12000)
    and turns->(jsonb_array_length(turns)-1)->>'role' = 'assistant' and turns->(jsonb_array_length(turns)-1)->>'content' = left(p_answer, 12000) then
    return jsonb_build_object('result','ALREADY');
  end if;
  next_history := turns || jsonb_build_array(jsonb_build_object('role','user','content',left(p_message,12000)),
                                              jsonb_build_object('role','assistant','content',left(p_answer,12000)));
  select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) into next_history from (
    select e, ord from jsonb_array_elements(next_history) with ordinality as y(e, ord)
    order by ord desc limit 15) z;
  update public.usuarios set historial = next_history where codigo = p_user;
  return jsonb_build_object('result','SUCCESS');
exception
  when insufficient_privilege then return jsonb_build_object('result','NOT_AUTHORIZED');
  when others then return jsonb_build_object('result','ERROR','code','WRITE_FAILED');
end;
$$;
revoke all on function public.forge_chat_history_append(text,text,text) from public, anon, authenticated;
grant execute on function public.forge_chat_history_append(text,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
-- Rollback (only if newly introduced):
-- DROP FUNCTION public.forge_chat_history_append(text,text,text);
-- NOTIFY pgrst, 'reload schema';

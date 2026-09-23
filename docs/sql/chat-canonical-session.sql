-- Apply before deploying the application. No new tables or sports mutations.
-- All operations serialize on the existing athlete row, including absent-session
-- acquisition; takeover and conversation commit therefore have one linear order.
begin;
-- Require existing, immediate uniqueness on user_codigo alone. Never build an index.
do $precondition$
begin
  if not exists (
    select 1
    from pg_catalog.pg_index i
    join pg_catalog.pg_attribute a
      on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    where i.indrelid = 'public.active_sessions'::regclass
      and a.attname = 'user_codigo' and a.attnotnull and not a.attisdropped
      and i.indisunique and i.indisvalid and i.indisready and i.indimmediate
      and i.indnkeyatts = 1 and i.indpred is null and i.indexprs is null
  ) then
    raise exception 'CHAT_SESSION_UNIQUENESS_REQUIRED';
  end if;
end;
$precondition$;
-- Rollback before code deployment, only if this migration introduced the function:
-- DROP FUNCTION public.forge_conversation_session(text,text,text,jsonb);
-- NOTIFY pgrst, 'reload schema';
-- Preserve all existing indexes and data. If replacing a pre-existing function,
-- restore its previous definition and grants instead of dropping it.
create or replace function public.forge_conversation_session(
  p_user text, p_session text, p_operation text, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path = pg_catalog as $$
declare
  athlete public.usuarios%rowtype;
  owner public.active_sessions%rowtype;
  replacement public.active_sessions%rowtype;
  history jsonb; profile jsonb; turns jsonb; turn jsonb; entry jsonb;
  next_history jsonb; pair jsonb; stamp timestamptz;
  alive boolean; mine boolean; turn_id text; outcome text; persisted boolean := false;
begin
  if p_session is null or p_session !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok',false,'code','CHAT_SESSION_REQUIRED','persisted',false);
  end if;
  select * into athlete from public.usuarios where codigo = p_user for update;
  if not found then return jsonb_build_object('ok',false,'code','ATHLETE_NOT_FOUND'); end if;
  history := coalesce(athlete.historial::jsonb, '[]'::jsonb);
  profile := coalesce(athlete.perfil::jsonb, '{}'::jsonb);
  if jsonb_typeof(history) <> 'array' or jsonb_typeof(profile) <> 'object' then
    raise exception 'CHAT_STORAGE_INVALID';
  end if;
  select * into owner from public.active_sessions where user_codigo = p_user for update;
  stamp := clock_timestamp();
  mine := coalesce(owner.session_id::text = p_session, false);
  alive := coalesce(coalesce(owner.last_message_at, owner.owner_since) > stamp - interval '45 minutes', false);

  if p_operation in ('verify','acquire','takeover') then
    if p_operation = 'takeover' or (p_operation = 'acquire' and not alive) then
      -- Monotonic fencing token, including A -> B -> A and repeated takeover.
      stamp := greatest(stamp, coalesce(owner.owner_since, stamp) + interval '1 microsecond');
      replacement := jsonb_populate_record(null::public.active_sessions, jsonb_build_object(
        'user_codigo',p_user,'session_id',p_session,'owner_since',stamp,'updated_at',stamp));
      if owner.user_codigo is null then
        insert into public.active_sessions(user_codigo,session_id,owner_since,updated_at,last_message_at)
          values(replacement.user_codigo,replacement.session_id,replacement.owner_since,replacement.updated_at,null);
      else
        update public.active_sessions set session_id=replacement.session_id,owner_since=stamp,
          updated_at=stamp,last_message_at=null where user_codigo=p_user;
      end if;
      mine := true; alive := true;
    end if;
    return jsonb_build_object('ok',true,'owned',mine and alive,'haySesionActiva',not mine and alive,
      'sinDueñoRegistrado',not alive,'historial',history);
  end if;

  if p_operation = 'heartbeat' then
    if not mine then return jsonb_build_object('ok',false,'code','CHAT_NOT_OWNER'); end if;
    update public.active_sessions set updated_at=stamp where user_codigo=p_user;
    return jsonb_build_object('ok',true);
  end if;

  turns := coalesce(profile->'coach_first_turns','{}'::jsonb);
  turn_id := p_payload->>'id';
  turn := turns->turn_id;
  if p_operation = 'begin' then
    if not mine or not alive then return jsonb_build_object('ok',false,'status','rejected','code','CHAT_NOT_OWNER','persisted',false); end if;
    if turn is not null then
      if turn->>'digest' is distinct from p_payload->>'digest' then
        return jsonb_build_object('ok',false,'status','conflict','code','TURN_PAYLOAD_CONFLICT','persisted',false);
      end if;
      select value into entry from jsonb_array_elements(history) where value->>'turnId'=turn_id and value->>'role'='assistant' limit 1;
      return jsonb_build_object('ok',entry is not null and turn->>'status'='completed','status','already_claimed','code','TURN_NOT_REPLAYED',
        'journalStatus',turn->>'status',
        'persisted',coalesce((turn->>'persisted')::boolean,false),'recovered',entry is not null,
        'answer',entry->>'content','historial',history,'receipts',turn->'receipts');
    end if;
    if (select count(*) from jsonb_object_keys(turns)) >= 512 then
      return jsonb_build_object('ok',false,'status','rejected','code','COACH_FIRST_JOURNAL_CAP','persisted',false);
    end if;
    turns := turns || jsonb_build_object(turn_id,jsonb_build_object('digest',p_payload->>'digest','status','claimed','createdAt',stamp));
    update public.usuarios set perfil=jsonb_set(profile,'{coach_first_turns}',turns) where codigo=p_user;
    update public.active_sessions set last_message_at=stamp where user_codigo=p_user;
    return jsonb_build_object('ok',true,'status','committed','epoch',owner.owner_since,'historial',history);
  end if;

  if p_operation = 'finish' then
    if turn is null then return jsonb_build_object('ok',false,'status','unknown','persisted',false); end if;
    if turn->>'status' <> 'claimed' then
      return jsonb_build_object('ok',false,'status','already_claimed','persisted',coalesce((turn->>'persisted')::boolean,false));
    end if;
    outcome := p_payload->>'status';
    if not mine or owner.owner_since is distinct from (p_payload->>'epoch')::timestamptz then
      outcome := 'conflict';
    elsif history is distinct from p_payload->'before' then
      outcome := 'conflict';
    elsif outcome in ('completed','terminal') and jsonb_typeof(p_payload->'answer')='string' then
      pair := jsonb_build_array(jsonb_build_object('role','user','content',p_payload->>'message','turnId',turn_id),
        jsonb_build_object('role','assistant','content',p_payload->>'answer','turnId',turn_id));
      -- Preserve the existing limit: last 15 individual messages, not 15 turns.
      select coalesce(jsonb_agg(value order by ordinal),'[]'::jsonb) into next_history
        from jsonb_array_elements(history || pair) with ordinality as m(value,ordinal)
        where ordinal > jsonb_array_length(history || pair)-15;
      update public.usuarios set historial=next_history where codigo=p_user;
      history := next_history; persisted := true;
    end if;
    turns := turns || jsonb_build_object(turn_id,turn || jsonb_build_object('status',outcome,
      'persisted',persisted,'receipts',coalesce(p_payload->'receipts','[]'::jsonb),'finishedAt',stamp));
    update public.usuarios set perfil=jsonb_set(profile,'{coach_first_turns}',turns) where codigo=p_user;
    return jsonb_build_object('ok',persisted,'status',outcome,'persisted',persisted,'historial',history,
      'code',case when outcome='conflict' then 'CHAT_COMMIT_CONFLICT' when not persisted then 'TURN_UNKNOWN' else null end);
  end if;
  return jsonb_build_object('ok',false,'code','CHAT_OPERATION_INVALID');
end;
$$;
revoke all on function public.forge_conversation_session(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.forge_conversation_session(text,text,text,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;

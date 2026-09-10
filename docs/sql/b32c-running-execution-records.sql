-- Apply before deploying the B.3.2C reader/writer. Not executed by this change.
-- Dedicated immutable factual storage; no profile JSON lost-update or plan mutation.
create table public.running_execution_records (
  user_codigo text not null,
  execution_id text not null,
  content_digest text not null,
  record jsonb not null,
  signature text not null,
  created_at timestamptz not null default now(),
  primary key (user_codigo, execution_id, content_digest),
  check (jsonb_typeof(record) = 'object'),
  check (record->>'executionId' = execution_id),
  check (length(content_digest) = 64)
);
create index running_execution_user_created on public.running_execution_records(user_codigo, created_at desc);
alter table public.running_execution_records enable row level security;
revoke all on public.running_execution_records from anon, authenticated;
grant select, insert on public.running_execution_records to service_role;
revoke update, delete on public.running_execution_records from service_role;

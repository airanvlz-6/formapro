-- Apply before deploying the B.3.2C reader/writer. Not executed by this change.
-- One-time transactional deployment; existing objects must fail visibly.
-- Immutable append-only factual storage; no profile or plan mutation.
-- Roll back application code without deleting stored execution evidence.
BEGIN;

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
-- Ordinary clients receive no direct table privileges.
revoke all privileges
  on table public.running_execution_records
  from public, anon, authenticated, service_role;

-- service_role receives SELECT + INSERT only.
grant select, insert
  on table public.running_execution_records
  to service_role;

COMMIT;

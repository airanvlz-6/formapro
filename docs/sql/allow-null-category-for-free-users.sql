-- Build 8A/8B: Free identity-only users do not require a category.

begin;

alter table public.usuarios
alter column categoria drop not null;

commit;

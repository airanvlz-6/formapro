-- Build 8A/8B: disable legacy automatic Forge user creation.
-- New Forge identities are created explicitly after verified authentication.

begin;

drop trigger if exists on_auth_user_created on auth.users;

commit;

-- Grant table privileges required by the existing RLS and server clients.
-- This does not change the folders schema or any stored data.

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on table public.folders to authenticated;
grant all on table public.folders to service_role;

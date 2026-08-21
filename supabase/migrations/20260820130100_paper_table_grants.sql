-- Grant table privileges required by the existing papers RLS policies.
-- This changes privileges only; it does not change the papers schema or data.

grant select, insert, update, delete on table public.papers
  to authenticated;
grant all on table public.papers to service_role;

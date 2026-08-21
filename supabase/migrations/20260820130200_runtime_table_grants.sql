-- Runtime privileges for the existing RLS-protected PaperLens tables.
-- RLS remains enabled and continues to enforce authenticated ownership.
-- The service role is used only by the trusted processing worker.

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all privileges on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Audit history pages order by (at, id). With now() every event in one
-- transaction (bulk operations, several MCP calls in one transaction) shared a
-- timestamp, so order fell back to the random id. clock_timestamp() records
-- the actual statement order; existing rows are unchanged.
alter table public.audit_log alter column at set default clock_timestamp();

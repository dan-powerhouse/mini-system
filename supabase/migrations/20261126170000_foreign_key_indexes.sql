-- Covering indexes for foreign keys (Supabase advisor 0001_unindexed_foreign_keys).
-- Portable PostgreSQL; no data, grant or policy changes.
create index if not exists type_templates_updated_by_idx on public.type_templates(updated_by);
create index if not exists predicate_registry_created_by_idx on public.predicate_registry(created_by);
create index if not exists predicate_registry_updated_by_idx on public.predicate_registry(updated_by);
create index if not exists predicate_registry_symmetric_helper_idx on public.predicate_registry(workspace_id,symmetric_helper) where symmetric_helper is not null;
create index if not exists entity_created_by_idx on public.entity(created_by);
create index if not exists entity_updated_by_idx on public.entity(updated_by);
create index if not exists entity_template_idx on public.entity(workspace_id,kind,type);
create index if not exists relation_created_by_idx on public.relation(created_by);
create index if not exists relation_updated_by_idx on public.relation(updated_by);
create index if not exists relation_predicate_idx on public.relation(workspace_id,predicate);
create index if not exists process_kind_version_published_by_idx on public.process_kind_version(published_by);
create index if not exists process_kind_version_entity_idx on public.process_kind_version(workspace_id,process_kind_id,registry_kind);
create index if not exists process_assigned_agent_idx on public.process(workspace_id,assigned_agent_id,assigned_agent_kind) where assigned_agent_id is not null;
create index if not exists process_requested_by_idx on public.process(workspace_id,requested_by,requested_by_kind);
create index if not exists saved_view_owner_user_idx on public.saved_view(owner_user_id);
create index if not exists api_token_created_by_idx on private.api_token(created_by);
create index if not exists api_token_user_idx on private.api_token(user_id);
create index if not exists workspace_invitation_invited_by_idx on private.workspace_invitation(invited_by);
create index if not exists import_job_user_idx on private.import_job(user_id);
create index if not exists import_job_workspace_idx on private.import_job(workspace_id);
create index if not exists export_job_user_idx on private.export_job(user_id);
create index if not exists export_job_workspace_idx on private.export_job(workspace_id);
create index if not exists person_identity_link_linked_by_idx on private.person_identity_link(linked_by);
create index if not exists person_identity_link_revoked_by_idx on private.person_identity_link(revoked_by) where revoked_by is not null;
create index if not exists person_identity_link_user_idx on private.person_identity_link(user_id);

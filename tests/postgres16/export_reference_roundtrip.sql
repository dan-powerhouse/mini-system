\set ON_ERROR_STOP on
-- Acceptance 64 and 68. Exercise the native snapshot and import RPCs.
begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000301');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000301';
select (public.workspace_create('Export source', 'export-reference-source')).id as source \gset
select (public.workspace_create('Export destination', 'export-reference-destination')).id as destination \gset
select public.template_upsert(:'source', 'object', 'asset',
  '[{"name":"related","dataType":"entity_ref","entityRefKind":"object"}]');
select public.template_upsert(:'destination', 'object', 'asset',
  '[{"name":"related","dataType":"entity_ref","entityRefKind":"object"}]');
select (public.entity_create(:'source', '{"kind":"object","type":"asset","title":"Referenced"}')).id as dependency \gset
select (public.entity_create(:'source', jsonb_build_object(
  'kind', 'object', 'type', 'asset', 'title', 'Referencing',
  'attributes', jsonb_build_object('related', :'dependency')
))).id as referencing \gset
select public.entity_archive(:'source', :'dependency', 1);
select public.export_create(:'source', null, true)->>'exportId' as full_export \gset
select public.export_create(:'source')->>'exportId' as default_export \gset
reset role;

-- Fixtures are removed within the transaction to model a separate installation,
-- where the preserved UUIDs do not collide with the source rows.
delete from public.entity where workspace_id = :'source' and id in (:'dependency', :'referencing');
set local role service_role;
select public.exchange_stage_upload(
  :'destination', '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000302', repeat('a', 64), 1024,
  public.exchange_read_export(:'full_export', '00000000-0000-0000-0000-000000000301')
    - 'sourceWorkspaceId' - 'exportedAt'
);
select public.exchange_stage_upload(
  :'destination', '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000303', repeat('b', 64), 1024,
  public.exchange_read_export(:'default_export', '00000000-0000-0000-0000-000000000301')
    - 'sourceWorkspaceId' - 'exportedAt'
);
reset role;
set local role authenticated;
select set_config('test.destination', :'destination', true);
do $$
declare
  destination uuid := current_setting('test.destination')::uuid;
  preview jsonb;
begin
  preview := public.import_preview(destination, '00000000-0000-0000-0000-000000000302');
  if preview->'errors' is distinct from '[]'::jsonb or preview->>'validRows' is distinct from '2' then
    raise exception 'Complete export failed positive control: %', preview->'errors';
  end if;
  raise notice 'PASS: complete export previews successfully in a fresh destination';
  preview := public.import_preview(destination, '00000000-0000-0000-0000-000000000303');
  if preview->'errors' is distinct from '[]'::jsonb or (preview->>'validRows')::int < 1 then
    raise exception 'Default export is not portable to a fresh destination: %', preview->'errors';
  end if;
end $$;
rollback;

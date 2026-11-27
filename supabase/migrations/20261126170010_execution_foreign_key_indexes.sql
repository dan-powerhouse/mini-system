-- Covering indexes for the private execution tables (20261124202221_process_execution_private).
create index if not exists process_request_process_idx on private.process_request(workspace_id,process_id);
create index if not exists process_delivery_process_idx on private.process_delivery(workspace_id,process_id);
create index if not exists process_attempt_process_idx on private.process_attempt(workspace_id,process_id);

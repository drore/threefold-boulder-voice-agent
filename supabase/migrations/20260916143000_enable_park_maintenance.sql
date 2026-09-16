-- Both supported report types use the same scoped draft and ticket operation.
alter table app.request_drafts
  drop constraint request_drafts_request_type_check;
alter table app.request_drafts
  add constraint request_drafts_supported_request_type
  check (request_type in ('pothole', 'park_maintenance'));

-- Existing operations are pothole-only under the previous draft constraint.
alter table app.ticket_operations
  add column request_type text not null default 'pothole';
alter table app.ticket_operations
  add constraint ticket_operations_supported_request_type
  check (request_type in ('pothole', 'park_maintenance'));
alter table app.ticket_operations
  alter column request_type drop default;

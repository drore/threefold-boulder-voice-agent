-- Callers need a short spoken reference: Linear's human identifier (for example
-- DRO-5) alongside the internal issue UUID used for reconciliation. Rows created
-- before this column existed keep a null key; new creations always record one.

alter table app.ticket_operations
  add column provider_issue_key text;

alter table app.ticket_operations
  drop constraint ticket_operations_check;

alter table app.ticket_operations
  add constraint ticket_operations_check check (
    (state in ('ready', 'attempting') and provider_issue_id is null
      and provider_issue_key is null and provider_title is null
      and provider_description is null
      and provider_fetched_at is null and reason is null)
    or (state = 'created' and provider_issue_id is not null
      and provider_title is not null and provider_description is not null
      and provider_fetched_at is not null and reason is null)
    or (state = 'uncertain' and reason is not null
      and provider_issue_key is null
      and provider_title is null and provider_description is null
      and provider_fetched_at is null)
    or (state = 'rejected' and reason is not null
      and provider_issue_id is null and provider_issue_key is null
      and provider_title is null
      and provider_description is null and provider_fetched_at is null)
  );

grant update (provider_issue_key) on app.ticket_operations to app_runtime;

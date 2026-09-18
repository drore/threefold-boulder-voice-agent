-- Reconcile interrupted create attempts. A crash between claiming an attempt
-- (ready -> attempting) and persisting its outcome left the operation stuck in
-- `attempting` with no way to recover. Record when an attempt was claimed so a
-- stale `attempting` can be distinguished from an in-flight one, and tighten the
-- created-state check to require the human identifier the code always records.

alter table app.ticket_operations
  add column started_at timestamptz;

-- Non-ready operations already existed before this column; give them a claim
-- time so they are not mistaken for in-flight (they expire to uncertain).
update app.ticket_operations
  set started_at = coalesce(created_at, updated_at, now())
  where state <> 'ready';

-- Legacy created rows predate provider_issue_key. Backfill with the issue id as
-- a placeholder; the reconciliation path overwrites it with the real identifier
-- the next time Linear is read.
update app.ticket_operations
  set provider_issue_key = provider_issue_id
  where state = 'created' and provider_issue_key is null;

alter table app.ticket_operations
  drop constraint ticket_operations_check;

alter table app.ticket_operations
  add constraint ticket_operations_check check (
    (state in ('ready', 'attempting') and provider_issue_id is null
      and provider_issue_key is null and provider_title is null
      and provider_description is null
      and provider_fetched_at is null and reason is null)
    or (state = 'created' and provider_issue_id is not null
      and provider_issue_key is not null
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

grant update (started_at) on app.ticket_operations to app_runtime;

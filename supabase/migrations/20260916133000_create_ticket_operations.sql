-- Each draft can authorize at most one Linear create. The operation copies the
-- authorized details so a later draft correction cannot alter that attempt.
alter table app.request_drafts
  add constraint request_drafts_id_conversation_unique unique (id, conversation_id);

create table app.ticket_operations (
  id uuid primary key,
  conversation_id uuid not null,
  draft_id uuid not null unique,
  draft_revision integer not null check (draft_revision > 0),
  policy_revision integer not null check (policy_revision > 0),
  location_text text not null check (
    length(trim(location_text)) > 0 and length(location_text) <= 500
  ),
  description_text text not null check (
    length(trim(description_text)) > 0 and length(description_text) <= 500
  ),
  state text not null default 'ready' check (
    state in ('ready', 'attempting', 'created', 'uncertain', 'rejected')
  ),
  provider_issue_id text,
  provider_title text,
  provider_description text,
  provider_fetched_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (draft_id, conversation_id)
    references app.request_drafts (id, conversation_id),
  check (
    (state in ('ready', 'attempting') and provider_issue_id is null
      and provider_title is null and provider_description is null
      and provider_fetched_at is null and reason is null)
    or (state = 'created' and provider_issue_id is not null
      and provider_title is not null and provider_description is not null
      and provider_fetched_at is not null and reason is null)
    or (state = 'uncertain' and reason is not null
      and provider_title is null and provider_description is null
      and provider_fetched_at is null)
    or (state = 'rejected' and reason is not null
      and provider_issue_id is null and provider_title is null
      and provider_description is null and provider_fetched_at is null)
  )
);

revoke all on app.ticket_operations from public, anon, authenticated, service_role;
grant select, insert on app.ticket_operations to app_runtime;
grant update (
  state, provider_issue_id, provider_title, provider_description,
  provider_fetched_at, reason, updated_at
) on app.ticket_operations to app_runtime;

-- The browser and Supabase Data API do not access this schema. Only the Node
-- backend receives the app_runtime grants through an environment-specific login.
create schema app;
revoke all on schema app from public;

create table app.conversations (
  id uuid primary key,
  city_id text not null,
  admission_id uuid not null unique,
  created_at timestamptz not null default now()
);

create table app.observations (
  id uuid primary key,
  conversation_id uuid not null references app.conversations (id),
  channel text not null check (channel in ('voice', 'text')),
  observed_text text not null check (
    length(trim(observed_text)) > 0 and length(observed_text) <= 4000
  ),
  observed_at timestamptz not null default now(),
  unique (id, conversation_id)
);

create table app.request_drafts (
  id uuid primary key,
  conversation_id uuid not null references app.conversations (id),
  request_type text not null check (request_type = 'pothole'),
  revision integer not null check (revision > 0),
  location_text text check (
    location_text is null or
    (length(trim(location_text)) > 0 and length(location_text) <= 500)
  ),
  location_observation_id uuid,
  description_text text check (
    description_text is null or
    (length(trim(description_text)) > 0 and length(description_text) <= 500)
  ),
  description_observation_id uuid,
  updated_at timestamptz not null default now(),
  check ((location_text is null) = (location_observation_id is null)),
  check ((description_text is null) = (description_observation_id is null)),
  foreign key (location_observation_id, conversation_id)
    references app.observations (id, conversation_id),
  foreign key (description_observation_id, conversation_id)
    references app.observations (id, conversation_id)
);

-- Credentials are provisioned outside migrations. A login granted this role
-- can access only the three intake tables and cannot delete their records.
create role app_runtime nologin;
grant usage on schema app to app_runtime;
grant select, insert on app.conversations to app_runtime;
grant select, insert on app.observations to app_runtime;
grant select, insert, update on app.request_drafts to app_runtime;

revoke all on all tables in schema app from public, anon, authenticated, service_role;

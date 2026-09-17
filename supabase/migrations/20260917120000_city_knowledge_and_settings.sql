-- Move city-specific content out of code: display name and event source URL on
-- the policy row, and a reviewed knowledge corpus table.

alter table app.city_policies
  add column display_name text,
  add column events_listing_url text;

update app.city_policies
set
  display_name = 'Boulder',
  events_listing_url = 'https://bouldercolorado.gov/events'
where city_id = 'boulder-co';

alter table app.city_policies
  alter column display_name set not null,
  alter column events_listing_url set not null,
  add constraint city_policies_display_name_check
    check (length(trim(display_name)) > 0),
  add constraint city_policies_events_listing_url_check
    check (events_listing_url ~ '^https://');

create table app.city_knowledge (
  city_id text not null references app.city_policies (city_id) on delete cascade,
  topic_key text not null,
  tool text not null check (tool in ('lookupMunicipalCode', 'lookupCityInformation')),
  match jsonb not null,
  answer text not null,
  source_title text not null,
  source_url text not null,
  source_kind text not null check (source_kind in ('municipal_code', 'city_website')),
  source_note text not null,
  source_excerpt text,
  limitations jsonb not null default '[]'::jsonb,
  verified_on date not null,
  updated_at timestamptz not null default now(),
  primary key (city_id, topic_key),
  check (jsonb_typeof(match -> 'all') = 'array'),
  check (jsonb_typeof(match -> 'exclude') = 'array'),
  check (length(trim(answer)) > 0),
  check (source_url ~ '^https://'),
  check (jsonb_typeof(limitations) = 'array')
);

insert into app.city_knowledge (
  city_id, topic_key, tool, match, answer,
  source_title, source_url, source_kind, source_note, source_excerpt,
  limitations, verified_on
) values
(
  'boulder-co',
  'glass-containers-parks',
  'lookupMunicipalCode',
  '{
    "all": [["glass", "bottle", "8-3-9"], ["park", "open space", "recreation", "8-3-9"]],
    "exclude": ["repeal", "repealed", "amend", "amended", "changed", "current", "latest", "still"]
  }',
  'BRC 8-3-9 prohibits glass bottles and glass containers in city parks, parkways, recreation areas, and open space. The reviewed code includes an exception for a container holding prescription medication.',
  'Boulder Revised Code 8-3-9: Glass Bottles Prohibited',
  'https://library.municode.com/co/boulder/codes/municipal_code?nodeId=TIT8PAOPSPSTPUWA_CH3PAREPESPMOPA_8-3-9GLBOPR',
  'municipal_code',
  'Supplement 167 Update 3; ordinances effective through 2026-07-30.',
  'No person shall carry or possess any glass bottle or other glass container, except one containing prescription medication',
  '["This reviewed slice covers only BRC 8-3-9, not the full municipal code."]',
  '2026-09-16'
),
(
  'boulder-co',
  'pothole-reporting',
  'lookupCityInformation',
  '{
    "all": [["pothole"], ["report", "submit", "request"]],
    "exclude": ["claim", "claims", "who", "person", "staff", "handles"]
  }',
  'Boulder''s Transportation Maintenance page directs pothole reports through the city''s online request path and says to include the location, such as an address or intersection, and a description of the issue.',
  'City of Boulder Transportation Maintenance',
  'https://bouldercolorado.gov/services/transportation-maintenance',
  'city_website',
  'Official city service page reviewed for pothole intake guidance.',
  null,
  '["This is service guidance, not a municipal-code citation."]',
  '2026-09-16'
);

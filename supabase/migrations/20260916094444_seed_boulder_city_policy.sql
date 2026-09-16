create table app.city_policies (
  city_id text primary key,
  revision integer not null check (revision > 0),
  source_url text not null check (source_url ~ '^https://'),
  source_verified_at timestamptz not null,
  valid_through date not null,
  policy jsonb not null,
  updated_at timestamptz not null default now(),
  check (policy ? 'timeZone'),
  check (policy ? 'weeklySchedule'),
  check (policy ? 'dateOverrides'),
  check (policy ? 'alwaysOpenTicket'),
  check (policy ? 'departments'),
  check (policy ? 'requestTypes')
);

insert into app.city_policies (
  city_id,
  revision,
  source_url,
  source_verified_at,
  valid_through,
  policy
) values (
  'boulder-co',
  1,
  'https://bouldercolorado.gov/contact-us',
  '2026-09-16T00:00:00Z',
  '2027-01-01',
  '{
    "timeZone": "America/Denver",
    "weeklySchedule": {
      "monday": [{"opensAt": "08:00", "closesAt": "17:00"}],
      "tuesday": [{"opensAt": "08:00", "closesAt": "17:00"}],
      "wednesday": [{"opensAt": "08:00", "closesAt": "17:00"}],
      "thursday": [{"opensAt": "08:00", "closesAt": "17:00"}],
      "friday": [{"opensAt": "08:00", "closesAt": "17:00"}],
      "saturday": [],
      "sunday": []
    },
    "dateOverrides": {
      "2026-11-11": [],
      "2026-11-26": [],
      "2026-11-27": [],
      "2026-12-24": [],
      "2026-12-25": [],
      "2027-01-01": []
    },
    "holidaySourceUrl": "https://bouldercolorado.gov/event-series/city-holidays",
    "alwaysOpenTicket": false,
    "departments": {
      "transportation_mobility": {
        "name": "Transportation & Mobility Department",
        "mockDestination": "+13035550101",
        "sourceUrl": "https://bouldercolorado.gov/services/transportation-maintenance"
      },
      "parks_recreation": {
        "name": "Parks & Recreation",
        "mockDestination": "+13035550102",
        "sourceUrl": "https://bouldercolorado.gov/government/departments/parks-recreation/about"
      }
    },
    "requestTypes": {
      "pothole": "transportation_mobility",
      "park_maintenance": "parks_recreation"
    }
  }'::jsonb
);

grant select on app.city_policies to app_runtime;
revoke all on app.city_policies from public, anon, authenticated, service_role;

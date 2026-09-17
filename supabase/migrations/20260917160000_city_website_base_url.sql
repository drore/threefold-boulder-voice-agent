-- Dynamic website lookup needs the city's official site base URL; the sitemap
-- and page fetches are derived from it at runtime.

alter table app.city_policies
  add column website_base_url text;

update app.city_policies
set website_base_url = 'https://bouldercolorado.gov'
where city_id = 'boulder-co';

alter table app.city_policies
  alter column website_base_url set not null,
  add constraint city_policies_website_base_url_check
    check (website_base_url ~ '^https://[^/]+$');

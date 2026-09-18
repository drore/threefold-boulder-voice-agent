-- Conversation-scoped reads and referential integrity. Conversation-scoped
-- lookups (observations, drafts, operations) currently scan their tables; index
-- the FK columns. A conversations.city_id -> city_policies FK is intentionally
-- omitted: the service validates the configured city at startup, and admitting a
-- conversation for a city whose policy is later missing must still exercise the
-- fail-closed confirm path (policy_unavailable) rather than fail at admission.

create index observations_conversation_id_idx
  on app.observations (conversation_id);

create index request_drafts_conversation_id_idx
  on app.request_drafts (conversation_id);

create index ticket_operations_conversation_id_idx
  on app.ticket_operations (conversation_id);

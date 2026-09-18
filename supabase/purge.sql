-- Manual retention purge. Caller speech, conversations, drafts, and operations
-- are retained for 30 days for reconciliation and debugging (DECISIONS #26).
-- Run this as the database owner (the app_runtime role cannot delete):
--
--   psql "$DATABASE_URL" -f supabase/purge.sql
--
-- It removes records older than 30 days in dependency order.

begin;

delete from app.ticket_operations
  where conversation_id in (
    select id from app.conversations
    where created_at < now() - interval '30 days'
  );

delete from app.request_drafts
  where conversation_id in (
    select id from app.conversations
    where created_at < now() - interval '30 days'
  );

delete from app.observations
  where conversation_id in (
    select id from app.conversations
    where created_at < now() - interval '30 days'
  );

delete from app.conversations
  where created_at < now() - interval '30 days';

commit;

-- Correlate a caller turn with its server trace. Record the server run id on the
-- turn's observation so a stdout `reasoning_turn`/`tool_call` trace line and its
-- persisted evidence share one correlation id (OBS-003). Nullable for text-form
-- observations created before tracing was threaded through.
alter table app.observations add column run_id uuid;

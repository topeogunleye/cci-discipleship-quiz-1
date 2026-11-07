-- Bound execution time for progress RPCs. The browser calls these through the
-- Supabase Data API/PostgREST; this does not configure Supavisor pooling.
alter function public.get_user_progress() set statement_timeout = '5s';
alter function public.sync_user_progress(bigint, jsonb) set statement_timeout = '10s';

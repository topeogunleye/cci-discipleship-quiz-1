-- Phase 4: Database Index Hardening & Connection Pooling Safety

-- 1. Index on updated_at for time-ordered lookups, active learner metrics, and stale progress cleanups
create index if not exists idx_user_progress_updated_at
  on public.user_progress (updated_at desc);

-- 2. Composite index on (user_id, version) to optimize compare-and-set (CAS) updates and concurrent conflict checks
create index if not exists idx_user_progress_user_version
  on public.user_progress (user_id, version);

-- 3. Statement timeouts on SECURITY DEFINER RPCs to prevent connection pooler (Supavisor) exhaustion during peak class bursts
alter function public.get_user_progress() set statement_timeout = '5s';
alter function public.sync_user_progress(bigint, jsonb) set statement_timeout = '10s';

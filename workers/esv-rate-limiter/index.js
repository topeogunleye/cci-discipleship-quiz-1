// Private rate limiter shared by the Pages Functions that call paid or quota-limited
// upstream APIs. Each provider has its own per-IP limit key and its own upstream budget,
// so heavy use of one provider cannot exhaust the other.
//
// The upstream budget is a small set of hourly counters (never one entry per request):
//   - daily:  requests in the current hour plus the previous 24 hours (a 24-25 hour
//             rolling window, deliberately a little conservative);
//   - hourly: requests in the current clock hour (optional).
// ESV API published limits are 5,000/day and 1,000/hour; budgets stay below both.
const HOUR_MS = 60 * 60 * 1000;
const WINDOW_HOURS = 25;
const BUDGETS = {
  esv: { daily: 4000, hourly: 900 },
  youversion: { daily: 4000, hourly: null },
  apibible: { daily: 150, hourly: 30 }
};
const DEFAULT_SCOPE = 'esv'; // Legacy callers hit /check without a provider.
const LEGACY_TIMESTAMPS_KEY = 'request-timestamps';
const BUCKETS_KEY = 'hour-buckets';

export function pruneBuckets(stored, currentHour) {
  const buckets = {};
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const [hour, count] of Object.entries(stored)) {
      const index = Number(hour);
      if (Number.isInteger(index) && index > currentHour - WINDOW_HOURS && index <= currentHour && Number.isInteger(count) && count > 0) buckets[index] = count;
    }
  }
  return buckets;
}

export function admit(buckets, budget, now) {
  const currentHour = Math.floor(now / HOUR_MS);
  const total = Object.values(buckets).reduce((sum, count) => sum + count, 0);
  if (budget.hourly && (buckets[currentHour] || 0) >= budget.hourly) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil(((currentHour + 1) * HOUR_MS - now) / 1000)) };
  }
  if (total >= budget.daily) {
    const oldest = Math.min(...Object.keys(buckets).map(Number));
    return { allowed: false, retryAfter: Math.max(1, Math.ceil(((oldest + WINDOW_HOURS) * HOUR_MS - now) / 1000)) };
  }
  buckets[currentHour] = (buckets[currentHour] || 0) + 1;
  return { allowed: true };
}

export class EsvDailyQuota {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || DEFAULT_SCOPE;
    if (request.method !== 'POST' || url.pathname !== '/reserve' || !Object.hasOwn(BUDGETS, scope)) {
      return new Response(null, { status: 404 });
    }

    const now = Date.now();
    const currentHour = Math.floor(now / HOUR_MS);
    const admission = await this.state.storage.transaction(async transaction => {
      let stored = await transaction.get(BUCKETS_KEY);
      if (stored === undefined || stored === null) {
        // One-time migration from the former one-entry-per-request array: keep today's
        // usage instead of resetting the budget at deploy time.
        const legacy = await transaction.get(LEGACY_TIMESTAMPS_KEY);
        if (Array.isArray(legacy)) {
          stored = {};
          for (const timestamp of legacy) {
            if (!Number.isFinite(timestamp)) continue;
            const hour = Math.floor(timestamp / HOUR_MS);
            stored[hour] = (stored[hour] || 0) + 1;
          }
          await transaction.delete(LEGACY_TIMESTAMPS_KEY);
        }
      }
      const buckets = pruneBuckets(stored, currentHour);
      const result = admit(buckets, BUDGETS[scope], now);
      await transaction.put(BUCKETS_KEY, buckets);
      return result;
    });

    return new Response(null, {
      status: admission.allowed ? 204 : 429,
      headers: admission.allowed ? undefined : { 'Retry-After': String(admission.retryAfter) }
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = /^\/check(?:\/(esv|youversion|apibible))?$/.exec(url.pathname);
    if (request.method !== 'POST' || !match) {
      return new Response(null, { status: 404 });
    }
    const scope = match[1] || DEFAULT_SCOPE;

    const clientIp = request.headers.get('X-ESV-Client-IP');
    if (!clientIp || clientIp.length > 64) {
      return new Response(null, { status: 400 });
    }

    try {
      const result = await env.ESV_RATE_LIMITER.limit({ key: scope + ':' + clientIp });
      if (!result || result.success !== true) {
        return new Response(null, { status: 429, headers: { 'Retry-After': '60' } });
      }

      const quotaId = env.ESV_DAILY_QUOTA.idFromName(scope === 'esv' ? 'esv-passage-upstream' : scope + '-upstream');
      const quota = env.ESV_DAILY_QUOTA.get(quotaId);
      const reservation = await quota.fetch('https://esv-quota.internal/reserve?scope=' + scope, { method: 'POST' });
      return new Response(null, {
        status: reservation.status,
        headers: reservation.headers.get('Retry-After') ? { 'Retry-After': reservation.headers.get('Retry-After') } : undefined
      });
    } catch (error) {
      return new Response(null, { status: 503 });
    }
  }
};

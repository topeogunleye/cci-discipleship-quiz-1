// Private rate limiter shared by the Pages Functions that call paid or quota-limited
// upstream APIs. Each provider has its own per-IP limit key and its own upstream budget,
// so heavy use of one provider cannot exhaust the other.
//
// Bounded second/minute/hour buckets conservatively cover rolling provider windows.
// API.Bible instead uses a billing-cycle counter with 500 calls of monthly reserve.
const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * 60 * 1000;
const WINDOW_HOURS = 25;
const BUDGETS = {
  esv: { minute: 55, hourly: 900, daily: 4500 },
  youversion: { hourly: 9000 },
  apibible: { monthly: 4500 }
};
const DEFAULT_SCOPE = 'esv'; // Legacy callers hit /check without a provider.
const LEGACY_TIMESTAMPS_KEY = 'request-timestamps';
const BUCKETS_KEY = 'hour-buckets';

export function pruneBuckets(stored, currentHour, window = WINDOW_HOURS) {
  const buckets = {};
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const [hour, count] of Object.entries(stored)) {
      const index = Number(hour);
      if (Number.isInteger(index) && index > currentHour - window && index <= currentHour && Number.isInteger(count) && count > 0) buckets[index] = count;
    }
  }
  return buckets;
}

export function checkWindow(buckets, limit, unitMs, window, now) {
  const total = Object.values(buckets).reduce((sum, count) => sum + count, 0);
  if (total >= limit) {
    let remaining = total;
    for (const index of Object.keys(buckets).map(Number).sort((a, b) => a - b)) {
      remaining -= buckets[index];
      if (remaining < limit) return { allowed: false, retryAfter: Math.max(1, Math.ceil(((index + window) * unitMs - now) / 1000)) };
    }
  }
  return { allowed: true };
}

export function billingCycle(now, resetDay) {
  const date = new Date(now);
  const boundary = (year, month) => Date.UTC(year, month, Math.min(resetDay, new Date(Date.UTC(year, month + 1, 0)).getUTCDate()));
  const year = date.getUTCFullYear(), month = date.getUTCMonth();
  const thisMonth = boundary(year, month);
  return now >= thisMonth ? { start: thisMonth, end: boundary(year, month + 1) } : { start: boundary(year, month - 1), end: thisMonth };
}

export class EsvDailyQuota {
  constructor(state, env = {}) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || DEFAULT_SCOPE;
    if (request.method !== 'POST' || url.pathname !== '/reserve' || !Object.hasOwn(BUDGETS, scope)) {
      return new Response(null, { status: 404 });
    }

    const now = Date.now();
    const currentHour = Math.floor(now / HOUR_MS);
    const currentMinute = Math.floor(now / MINUTE_MS), currentSecond = Math.floor(now / SECOND_MS);
    const budget = BUDGETS[scope];
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
      let monthly;
      if (budget.monthly) {
        const resetDay = Number(this.env.APIBIBLE_BILLING_RESET_DAY);
        if (!Number.isInteger(resetDay) || resetDay < 1 || resetDay > 31) throw new Error('Billing reset day is not configured');
        const cycle = billingCycle(now, resetDay);
        monthly = await transaction.get('monthly-usage');
        if (!monthly || monthly.start !== cycle.start) {
          const seedStart = Date.parse(this.env.APIBIBLE_INITIAL_CYCLE_START || '');
          const initialUsage = Number(this.env.APIBIBLE_INITIAL_USAGE);
          if (!Number.isSafeInteger(initialUsage) || initialUsage < 0 || !Number.isFinite(seedStart)) throw new Error('Initial monthly usage is not configured');
          const tracked = Object.entries(buckets).filter(([hour]) => Number(hour) * HOUR_MS >= cycle.start).reduce((sum, [, count]) => sum + count, 0);
          monthly = { ...cycle, used: Math.max(tracked, seedStart === cycle.start ? initialUsage : 0) };
        }
        if (!Number.isSafeInteger(monthly.used) || monthly.used < 0) throw new Error('Invalid monthly counter');
        await transaction.put('monthly-usage', monthly);
        if (monthly.used >= budget.monthly) return { allowed: false, reason: 'monthly-budget', retryAfter: Math.max(1, Math.ceil((cycle.end - now) / 1000)) };
        monthly.used++;
        buckets[currentHour] = (buckets[currentHour] || 0) + 1;
        await transaction.put('monthly-usage', monthly);
        await transaction.put(BUCKETS_KEY, buckets);
        return { allowed: true };
      }
      let minuteStored = await transaction.get('minute-buckets');
      if (minuteStored == null) {
        // Preserve pre-deploy usage. An old hour's count is conservatively placed
        // at its end (or now for the current hour), never reset to zero.
        minuteStored = {};
        for (const [hour, count] of Object.entries(buckets)) minuteStored[Math.min(currentMinute, Number(hour) * 60 + 59)] = count;
      }
      const minutes = pruneBuckets(minuteStored, currentMinute, 61);
      let secondStored = await transaction.get('second-buckets');
      if (secondStored == null) secondStored = { [currentSecond]: Object.entries(minutes).filter(([minute]) => Number(minute) >= currentMinute - 1).reduce((sum, [, count]) => sum + count, 0) };
      const seconds = pruneBuckets(secondStored, currentSecond, 61);
      await transaction.put(BUCKETS_KEY, buckets);
      if (budget.minute) await transaction.put('second-buckets', seconds);
      if (budget.hourly) await transaction.put('minute-buckets', minutes);
      const windows = [
        { buckets: seconds, limit: budget.minute, unit: SECOND_MS, size: 61, reason: 'minute-budget' },
        { buckets: minutes, limit: budget.hourly, unit: MINUTE_MS, size: 61, reason: 'hourly-budget' },
        { buckets, limit: budget.daily, unit: HOUR_MS, size: 25, reason: 'daily-budget' }
      ];
      for (const window of windows) {
        if (!window.limit) continue;
        const result = checkWindow(window.buckets, window.limit, window.unit, window.size, now);
        if (!result.allowed) return { ...result, reason: window.reason };
      }
      if (budget.minute) seconds[currentSecond] = (seconds[currentSecond] || 0) + 1;
      if (budget.hourly) minutes[currentMinute] = (minutes[currentMinute] || 0) + 1;
      buckets[currentHour] = (buckets[currentHour] || 0) + 1;
      await transaction.put(BUCKETS_KEY, buckets);
      if (budget.minute) await transaction.put('second-buckets', seconds);
      if (budget.hourly) await transaction.put('minute-buckets', minutes);
      return { allowed: true };
    });

    return new Response(null, {
      status: admission.allowed ? 204 : 429,
      headers: admission.allowed ? undefined : { 'Retry-After': String(admission.retryAfter), 'X-Bible-Limit-Reason': admission.reason }
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
        return new Response(null, { status: 429, headers: { 'Retry-After': '60', 'X-Bible-Limit-Reason': 'client-burst' } });
      }

      const quotaId = env.ESV_DAILY_QUOTA.idFromName(scope === 'esv' ? 'esv-passage-upstream' : scope + '-upstream');
      const quota = env.ESV_DAILY_QUOTA.get(quotaId);
      const reservation = await quota.fetch('https://esv-quota.internal/reserve?scope=' + scope, { method: 'POST' });
      return new Response(null, {
        status: reservation.status,
        headers: reservation.headers.get('Retry-After') ? { 'Retry-After': reservation.headers.get('Retry-After'), 'X-Bible-Limit-Reason': reservation.headers.get('X-Bible-Limit-Reason') || 'provider-budget' } : undefined
      });
    } catch (error) {
      return new Response(null, { status: 503 });
    }
  }
};

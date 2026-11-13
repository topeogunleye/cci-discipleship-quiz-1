const ESV_DAILY_QUERY_BUDGET = 4000;
const ROLLING_DAY_MS = 24 * 60 * 60 * 1000;

export class EsvDailyQuota {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/reserve') {
      return new Response(null, { status: 404 });
    }

    const now = Date.now();
    const admission = await this.state.storage.transaction(async transaction => {
      const stored = await transaction.get('request-timestamps');
      const timestamps = (Array.isArray(stored) ? stored : []).filter(timestamp =>
        Number.isFinite(timestamp) && timestamp > now - ROLLING_DAY_MS
      );
      if (timestamps.length >= ESV_DAILY_QUERY_BUDGET) {
        return { allowed: false, retryAfter: Math.max(1, Math.ceil((timestamps[0] + ROLLING_DAY_MS - now) / 1000)) };
      }

      timestamps.push(now);
      await transaction.put('request-timestamps', timestamps);
      return { allowed: true };
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
    if (request.method !== 'POST' || url.pathname !== '/check') {
      return new Response(null, { status: 404 });
    }

    const clientIp = request.headers.get('X-ESV-Client-IP');
    if (!clientIp || clientIp.length > 64) {
      return new Response(null, { status: 400 });
    }

    try {
      const result = await env.ESV_RATE_LIMITER.limit({ key: 'esv-passage:' + clientIp });
      if (!result || result.success !== true) {
        return new Response(null, { status: 429, headers: { 'Retry-After': '60' } });
      }

      const quotaId = env.ESV_DAILY_QUOTA.idFromName('esv-passage-upstream');
      const quota = env.ESV_DAILY_QUOTA.get(quotaId);
      const reservation = await quota.fetch('https://esv-quota.internal/reserve', { method: 'POST' });
      return new Response(null, {
        status: reservation.status,
        headers: reservation.headers.get('Retry-After') ? { 'Retry-After': reservation.headers.get('Retry-After') } : undefined
      });
    } catch (error) {
      return new Response(null, { status: 503 });
    }
  }
};

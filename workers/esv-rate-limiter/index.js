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
      return new Response(null, { status: result && result.success === true ? 204 : 429 });
    } catch (error) {
      return new Response(null, { status: 503 });
    }
  }
};

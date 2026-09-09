import { env } from 'cloudflare:workers';
export const dynamic = 'force-dynamic';
async function proxy(request: Request) {
  const runtime = env as unknown as {
    API_BASE_URL?: string;
    API_PROXY_KEY?: string;
  };
  const base = runtime.API_BASE_URL ?? 'http://127.0.0.1:8787';
  const path = new URL(request.url);
  const target = new URL(path.pathname + path.search, base);
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.set(
    'x-forwarded-for',
    request.headers.get('CF-Connecting-IP') ?? '127.0.0.1',
  );
  if (runtime.API_PROXY_KEY)
    headers.set('X-Elsewhere-Proxy', runtime.API_PROXY_KEY);
  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
      signal: AbortSignal.timeout(35000),
    });
    return new Response(response.body, {
      status: response.status,
      headers: new Headers(response.headers),
    });
  } catch {
    return Response.json(
      {
        error: 'The chat service is reconnecting. Please try again shortly.',
        code: 'service_unavailable',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
export {
  proxy as GET,
  proxy as POST,
  proxy as PATCH,
  proxy as DELETE,
  proxy as OPTIONS,
};

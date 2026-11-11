import { serverEnv } from '../../config/env';

const JSON_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};

function json(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...Object.fromEntries(new Headers(extraHeaders).entries()) },
  });
}

export async function enforceApiRateLimit(request: Request, pathname: string): Promise<Response | null> {
  const redisUrl = serverEnv.upstashRedisUrl;
  const redisToken = serverEnv.upstashRedisToken;
  if (!redisUrl || !redisToken) return null;

  const isAuth = pathname.startsWith('/auth/') && pathname !== '/auth/config';
  const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  if (!isAuth && !isWrite) return null;

  const isExtraction = pathname === '/moms/extract';
  const limit = isExtraction ? 10 : isAuth ? 30 : 300;
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const identity = isExtraction ? request.headers.get('x-user-id') || forwardedFor || 'unknown' : forwardedFor || 'unknown';
  const window = Math.floor(Date.now() / (15 * 60 * 1000));
  const key = `rate:${isExtraction ? 'extraction' : isAuth ? 'auth' : 'write'}:${identity}:${window}`;

  try {
    const response = await fetch(`${redisUrl.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${redisToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, 900, 'NX'],
      ]),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Upstash returned ${response.status}`);
    const result = await response.json() as Array<{ result?: number }>;
    const count = Number(result[0]?.result || 0);
    if (count > limit) {
      return json({
        error: isAuth
          ? 'Too many authentication attempts. Please try again in a few minutes.'
          : 'Too many requests. Please try again in a few minutes.',
      }, 429, { 'Retry-After': '900' });
    }
  } catch (error) {
    console.error('[rate-limit] Upstash request failed; allowing request:', error);
  }

  return null;
}

// Platform boundary only. Never import application auth, analytics, or databases.
export const POLICY_ID = 'flower-mound-tx-v1';

function normalize(value) {
  if (typeof value !== 'string' || value.length > 160) return '';
  try { value = decodeURIComponent(value); } catch { return ''; }
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function locationFromHeaders(headers) {
  // Use Vercel's location for the connection, never client query/cookie/CF hints.
  return {
    city: headers.get('x-vercel-ip-city'),
    region: headers.get('x-vercel-ip-country-region'),
    country: headers.get('x-vercel-ip-country'),
  };
}

export function matchesFlowerMound(location = {}) {
  return normalize(location.city) === 'flower mound' &&
    ['tx', 'texas'].includes(normalize(location.region)) &&
    normalize(location.country) === 'us';
}

export function denyResponse(request) {
  const path = new URL(request.url).pathname;
  const machine = /^\/(?:api|_serverFn)(?:\/|$)/.test(path);
  const acceptsHtml = (request.headers.get('accept') || '').includes('text/html');
  const document = !machine && !/\.[a-z0-9]+$/i.test(path) && acceptsHtml;
  const message = 'Access to this site is restricted from your current network location.';
  const body = machine ? JSON.stringify({ error: 'location_restricted' }) : document
    ? `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Access unavailable — Torah For The Table</title></head><body><main><h1>Access unavailable</h1><p>${message}</p><p>If you believe this is an error, contact hello@torahforthetable.com.</p></main></body></html>`
    : `${message}\n`;
  return new Response(request.method === 'HEAD' ? null : body, {
    status: 403,
    headers: {
      'Content-Type': machine ? 'application/json; charset=utf-8' : document ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-TFTT-Protection': POLICY_ID,
      'X-TFTT-Decision': 'deny',
    },
  });
}

export function evaluateRequest(request, location = locationFromHeaders(request.headers)) {
  return matchesFlowerMound(location) ? denyResponse(request) : null;
}

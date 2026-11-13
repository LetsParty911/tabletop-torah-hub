import { next, rewrite } from '@vercel/functions';
import { evaluateRequest, POLICY_ID } from './protection/flower-mound.mjs';
import { previewResponse } from './protection/preview.mjs';

export const config = { runtime: 'nodejs', matcher: '/:path*' };

export default function middleware(request) {
  const verification = previewResponse(request, process.env.VERCEL_ENV);
  if (verification) return verification;
  const denied = evaluateRequest(request);
  if (denied) return denied;
  // Previews have no production-only app credentials. Read the public site
  // only AFTER the gate, without forwarding identity or allowing submissions.
  if (process.env.VERCEL_ENV === 'preview') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('This private website preview is read-only.', {
        status: 405,
        headers: { Allow: 'GET, HEAD', 'Cache-Control': 'private, no-store', 'X-TFTT-Protection': POLICY_ID },
      });
    }
    const incoming = new URL(request.url);
    const upstream = new URL('https://torahforthetable.com');
    upstream.pathname = incoming.pathname;
    upstream.search = incoming.search;
    upstream.searchParams.delete('_vercel_share');
    upstream.searchParams.delete('x-vercel-protection-bypass');
    const headers = new Headers();
    for (const name of ['accept', 'accept-language', 'user-agent', 'range', 'if-none-match', 'if-modified-since']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    return rewrite(upstream, {
      request: { headers },
      headers: { 'X-TFTT-Protection': POLICY_ID, 'X-TFTT-Decision': 'allow', 'X-TFTT-Preview': 'read-only' },
    });
  }
  return next({ headers: { 'X-TFTT-Protection': POLICY_ID, 'X-TFTT-Decision': 'allow' } });
}

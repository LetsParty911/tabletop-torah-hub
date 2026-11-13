import { next } from '@vercel/functions';
import { evaluateRequest, POLICY_ID } from './protection/flower-mound.mjs';
import { previewResponse } from './protection/preview.mjs';

export const config = { runtime: 'nodejs', matcher: '/:path*' };

export default function middleware(request) {
  const verification = previewResponse(request, process.env.VERCEL_ENV);
  if (verification) return verification;
  const denied = evaluateRequest(request);
  if (denied) return denied;
  return next({ headers: { 'X-TFTT-Protection': POLICY_ID, 'X-TFTT-Decision': 'allow' } });
}

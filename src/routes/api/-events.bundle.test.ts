import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  handler: null as null | ((input: { request: Request }) => Promise<Response>),
  persisted: new Map<string, Record<string, unknown>>(),
  upsert: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (options: { server: { handlers: { POST: typeof mocks.handler } } }) => { mocks.handler = options.server.handlers.POST; return options; } }));
vi.mock('@/lib/rate-limit.server', () => ({ checkRateLimit: async () => true }));
vi.mock('@/lib/request-telemetry.server', () => ({ isAdminPath: () => false, isAutomatedAgent: () => false, getRequestTelemetry: () => ({ userAgent: 'Mozilla/5.0 Chrome', ipAddress: null }) }));
vi.mock('@/lib/internal-marker.server', () => ({ isInternalRequest: async () => false }));
vi.mock('@/lib/ip-geo.server', () => ({ resolveApproximateGeo: async () => ({ country: 'US', region: null, city: null, postalCode: null, geoSource: 'country_only', provider: null, reliability: null, networkType: null }) }));
vi.mock('@/integrations/supabase/ext.server', () => ({ getSupabaseAdmin: () => ({ from: () => ({ upsert: mocks.upsert }) }) }));
import './events';
describe('bundle ingestion persistence contract with isolated storage', () => {
  it('persists distinct keys and edition/attribution once, preserving the same event ID across retries', async () => {
    mocks.upsert.mockImplementation(async (rows: Record<string, unknown>[], options: unknown) => {
      expect(options).toEqual({ onConflict: 'event_id', ignoreDuplicates: true });
      for (const row of rows) if (!mocks.persisted.has(String(row['event_id']))) mocks.persisted.set(String(row['event_id']), row);
      return { error: null };
    });
    const events = ['children', 'family', 'deeper'].map(key => ({ event_id: `bundle-${key}`, event_name: 'bundle_download', visitor_id: 'qualified-browser', session_id: 'existing-session', path: '/', occurred_at: '2026-11-26T04:08:00Z', parsha: 'Vayishlach', jewish_year: 5787, source_group: 'OurKehilla', metadata: { bundle_key: key, jewish_year: 5787 } }));
    const handler = mocks.handler;
    if (!handler) throw new Error('Missing POST handler');
    for (let retry = 0; retry < 2; retry++) {
      const response = await handler({ request: new Request('https://example.test/api/events', { method: 'POST', body: JSON.stringify({ events }) }) });
      expect(response.status).toBe(204);
    }
    expect(mocks.persisted.size).toBe(3);
    expect([...mocks.persisted.values()].map(row => (row['metadata'] as Record<string, unknown>)['bundle_key'])).toEqual(['children', 'family', 'deeper']);
    expect(mocks.persisted.get('bundle-children')).toMatchObject({ publication_id: null, publication_title: null, visitor_id: 'qualified-browser', session_id: 'existing-session', parsha: 'Vayishlach', jewish_year: 5787, occurred_at: '2026-11-26T04:08:00.000Z', source_group: 'OurKehilla' });
  });
  it('persists a diagnostic separately from a bundle download action', async () => {
    mocks.persisted.clear();
    mocks.upsert.mockImplementation(async (rows: Record<string, unknown>[]) => {
      for (const row of rows) mocks.persisted.set(String(row['event_id']), row);
      return { error: null };
    });
    const handler = mocks.handler;
    if (!handler) throw new Error('Missing POST handler');
    const event = { event_id: 'bundle-failure', event_name: 'bundle_diagnostic', visitor_id: 'qualified-browser', session_id: 'existing-session', path: '/', parsha: 'Vayishlach', jewish_year: 5787, metadata: { bundle_key: 'children', stage: 'prepare_failed', failure_code: 'http_error', http_status: 503, preparation_id: 'prep-1' } };
    const response = await handler({ request: new Request('https://example.test/api/events', { method: 'POST', body: JSON.stringify({ events: [event] }) }) });
    expect(response.status).toBe(204);
    expect(mocks.persisted.get('bundle-failure')).toMatchObject({ event_name: 'bundle_diagnostic', metadata: event.metadata });
  });
});
import { describe, expect, it } from 'vitest';
import { summarizeBundleDownloads } from './bundle-reporting';
const row = (key: string, id: string) => ({
  event_id: id, event_name: 'bundle_download', occurred_at: '2026-11-26T04:08:00Z',
  session_id: 'session', visitor_id: 'visitor', source_group: 'OurKehilla', parsha: 'Vayishlach',
  metadata: { bundle_key: key, jewish_year: 5787 },
});
describe('independent bundle download action reporting', () => {
  it('counts children, family and deeper independently and deduplicates only transport event IDs', () => {
    const first = row('children', 'one');
    const report = summarizeBundleDownloads([first, { ...first }, row('children', 'two'), row('family', 'three'), row('deeper', 'four')]);
    expect(report.bundles.map(b => b.count)).toEqual([2, 1, 1]);
    expect(report.actions).toHaveLength(4);
    expect(report.actions[0]).toMatchObject({ parsha: 'Vayishlach', year: 5787, sessionId: 'session', visitorId: 'visitor', source: 'OurKehilla', at: '2026-11-26T04:08:00Z' });
  });
  it('never counts prepares, failures or individual publication downloads as bundles', () => {
    const report = summarizeBundleDownloads(['bundle_prepare', 'error', 'pdf_open', 'download', 'publication_click'].map(event_name => ({ ...row('children', event_name), event_name })));
    expect(report.bundles.map(b => b.count)).toEqual([0, 0, 0]);
  });
  it('retains distinct edition totals without inventing a year for historical actions', () => {
    const report = summarizeBundleDownloads([row('family', 'current'), { ...row('family', 'older'), parsha: 'Vayetzei', metadata: { bundle_key: 'family', jewish_year: 5786 } }, { ...row('family', 'legacy'), metadata: { bundle_key: 'family' } }]);
    expect(report.bundles[1]?.editions).toEqual([{ parsha: 'Vayishlach', year: 5787, count: 1 }, { parsha: 'Vayetzei', year: 5786, count: 1 }, { parsha: 'Vayishlach', year: null, count: 1 }]);
  });
});
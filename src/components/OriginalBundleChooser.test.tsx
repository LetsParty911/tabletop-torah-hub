import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OriginalBundleChooser } from './OriginalBundleChooser';
import { currentOriginalBundles } from '@/lib/original-bundles';
import { ORIGINAL_PROMOTION_SERIES } from '@/lib/originals-promotion';
const { track, merge } = vi.hoisted(() => ({ track: vi.fn(), merge: vi.fn() }));
vi.mock('@/lib/first-party-analytics', () => ({ trackFp: track }));
vi.mock('@/lib/original-bundle-pdf', () => ({ mergeOriginalBundlePdf: merge }));
vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock('@/components/OriginalSeriesCover', () => ({ OriginalSeriesCover: () => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); delete window.__lovableEvents; });
const resources = ORIGINAL_PROMOTION_SERIES.map((series, i) => ({ id: `edition-${i}`, title: series.title, publication_id: series.publicationId, parsha_key: 'Vayishlach', jewish_year: 5787, url: 'https://example.test/source.pdf' }));
describe('bundle action tracking', () => {
  it('emits exactly one canonical action per ready download click with independent identity and edition', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:ready') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    merge.mockResolvedValue({ blob: new Blob(['pdf']), pageCount: 5 });
    const builtin = vi.fn(); window.__lovableEvents = { track: builtin };
    render(<OriginalBundleChooser bundles={currentOriginalBundles(resources, 'Vayishlach', false)} collectionLabel="Parshas Vayishlach" parshaKey="Vayishlach" />);
    for (const [key, name, count] of [['children', "Children's Bundle", 2], ['family', 'Family Bundle', 2], ['deeper', 'Deeper Learning Bundle', 3]] as const) {
      fireEvent.click(screen.getByRole('button', { name: `Get Bundle PDF: ${name} for Parshas Vayishlach` }));
      const link = await screen.findByRole('link', { name: `Download combined ${name} for Parshas Vayishlach` });
      const before = track.mock.calls.length;
      fireEvent.click(link);
      expect(track).toHaveBeenCalledTimes(before + 1);
      expect(track).toHaveBeenLastCalledWith('bundle_download', expect.objectContaining({ parsha: 'Vayishlach', jewish_year: 5787, metadata: expect.objectContaining({ bundle_key: key, bundle_name: name, jewish_year: 5787, constituent_count: count, constituent_ids: expect.any(Array) }) }));
    }
    expect(builtin).toHaveBeenCalledTimes(3);
    expect(track.mock.calls.map(call => call[0])).toEqual(['bundle_download', 'bundle_download', 'bundle_download']);
  });
  it('does not emit for failed preparation or incomplete bundles', async () => {
    merge.mockRejectedValue(new Error('Unavailable'));
    render(<OriginalBundleChooser bundles={currentOriginalBundles(resources, 'Vayishlach', false)} collectionLabel="Parshas Vayishlach" parshaKey="Vayishlach" />);
    fireEvent.click(screen.getByRole('button', { name: "Get Bundle PDF: Children's Bundle for Parshas Vayishlach" }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(track).not.toHaveBeenCalled();
    cleanup();
    render(<OriginalBundleChooser bundles={currentOriginalBundles([], 'Vayishlach', false)} collectionLabel="Parshas Vayishlach" parshaKey="Vayishlach" />);
    const button = screen.getByRole('button', { name: "Prepare combined Children's Bundle for Parshas Vayishlach" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button); expect(track).not.toHaveBeenCalled();
  });
});
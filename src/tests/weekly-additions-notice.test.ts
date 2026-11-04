import { describe, expect, it } from 'vitest';
import { weeklyAdditionsPhase } from '@/lib/weekly-additions-notice';

const base = {
  readingDate: '2026-11-07', isFallback: false, currentPublishedCount: 4,
  progressFillStep: 25, progressEta: '2026-11-05T20:00:00-05:00',
  visible: true, isYomTov: false, now: Date.parse('2026-11-04T10:00:00-05:00'),
};

describe('weekly additions announcement', () => {
  it('announces the Thursday release in advance', () => {
    expect(weeklyAdditionsPhase(base)).toBe('before-thursday');
  });
  it('switches copy at Thursday 8 PM Eastern, including standard time', () => {
    expect(weeklyAdditionsPhase({ ...base, now: Date.parse('2026-11-05T19:59:59-05:00') })).toBe('before-thursday');
    expect(weeklyAdditionsPhase({ ...base, now: Date.parse('2026-11-05T20:00:00-05:00') })).toBe('after-thursday');
  });
  it('respects the admin public-notice off control', () => {
    expect(weeklyAdditionsPhase({ ...base, visible: false })).toBeNull();
  });
  it('hides after verified current-week completion with published PDFs', () => {
    expect(weeklyAdditionsPhase({ ...base, progressFillStep: 100 })).toBeNull();
    expect(weeklyAdditionsPhase({ ...base, progressFillStep: 100, currentPublishedCount: 0 })).toBe('before-thursday');
  });
  it('does not borrow last week\'s completed progress', () => {
    expect(weeklyAdditionsPhase({ ...base, progressFillStep: 100, progressEta: '2026-10-29T20:00:00-04:00' })).toBe('before-thursday');
  });
  it('does not hide when the first PDF is published', () => {
    expect(weeklyAdditionsPhase({ ...base, currentPublishedCount: 1, progressFillStep: 25 })).toBe('before-thursday');
  });
  it('hides over a prior-week fallback collection, Yom Tov, and Shabbos', () => {
    expect(weeklyAdditionsPhase({ ...base, isFallback: true, currentPublishedCount: 0 })).toBeNull();
    expect(weeklyAdditionsPhase({ ...base, isYomTov: true })).toBeNull();
    expect(weeklyAdditionsPhase({ ...base, now: Date.parse('2026-11-07T12:00:00-05:00') })).toBeNull();
    expect(weeklyAdditionsPhase({ ...base, now: Date.parse('2026-10-31T22:00:00-04:00') })).toBeNull();
  });
  it('shows before release even if no current PDFs have yet been added', () => {
    expect(weeklyAdditionsPhase({ ...base, currentPublishedCount: 0 })).toBe('before-thursday');
  });
});

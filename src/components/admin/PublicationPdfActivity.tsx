import { useState } from 'react';
import { activityTotals, publicationActivityCsv, selectPublicationActivity, type PublicationPdfActivity as Activity } from '@/lib/publication-pdf-activity';

type CountMetric = 'deliberateOpens' | 'automaticLoads' | 'historicalDownloads' | 'historicalRedirects' | 'uniqueVisitors';
type Metric = CountMetric | 'ageAdjustedPerDay';
const metrics: [CountMetric, string][] = [['deliberateOpens', 'Deliberate open attempts'], ['automaticLoads', 'Automatic viewer loads'], ['historicalDownloads', 'Historical download actions'], ['historicalRedirects', 'Unpaired historical redirects'], ['uniqueVisitors', 'Unique activity visitors']];
export default function PublicationPdfActivity({ publications, missingPublication, windowStart, windowEnd }: { publications: Activity[]; missingPublication: number; windowStart: string; windowEnd: string }) {
  const [parsha, setParsha] = useState('');
  const [metric, setMetric] = useState<Metric>('deliberateOpens');
  const rows = selectPublicationActivity(publications, parsha, metric);
  const totals = activityTotals(rows);
  const totalRequests = rows.reduce((n, p) => n + p.deliberateOpens + p.historicalDownloads + p.historicalRedirects, 0);
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([publicationActivityCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `publication-pdf-activity-${parsha || 'all'}-${windowStart.slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return <section className="space-y-3 rounded-md border border-border p-3">
    <h3 className="font-semibold">Per-publication PDF activity</h3>
    <p className="text-xs text-muted-foreground">Reporting window: {windowStart} – {windowEnd} (UTC). Likely-human sessions with visitor IDs only. Automatic loads are previews, not verified reading. Download actions and redirects do not confirm completed downloads. Paired redirects are excluded. Visitors are distinct across all activity types; totals deduplicate across publications. Zero means no qualifying record in this window.</p>
    <div className="flex flex-wrap gap-3">
      <label>Parsha <select value={parsha} onChange={e => setParsha(e.target.value)}><option value="">All parshas</option>{[...new Set(publications.map(p => p.parsha || '__unknown'))].sort().map(p => <option key={p} value={p}>{p === '__unknown' ? 'Unknown parsha' : p}</option>)}</select></label>
      <label>Rank by <select value={metric} onChange={e => setMetric(e.target.value as Metric)}>{metrics.map(([key,label]) => <option key={key} value={key}>{label}</option>)}<option value="ageAdjustedPerDay">Deliberate requests per 24h since upload</option></select></label>
      <button type="button" className="underline" onClick={exportCsv}>Download activity CSV</button>
    </div>
    <p className="text-sm">{metrics.map(([key,label]) => `${label}: ${totals[key]}`).join(' · ')} · Total deliberate requests: {totalRequests}</p>
    <p className="text-xs text-muted-foreground">For a fairer post-Shabbos comparison, choose requests per 24 hours since upload. Upload time is not necessarily the public publication time. PDFs with less than 12 hours of possible exposure (or unknown upload time) have no normalized rate. Attempted opens are not confirmed reading or completed downloads.</p>
    {missingPublication > 0 && <p className="text-xs">{missingPublication} qualifying activity records lack publication IDs across this window and cannot be assigned to a parsha or publication.</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th>Rank</th><th>Publication</th><th>Parsha</th>{metrics.map(([key,label]) => <th key={key}>{label}</th>)}<th>Requests</th><th>Share</th><th>Exposure</th><th>Requests / 24h</th><th>Last activity (UTC)</th></tr></thead><tbody>{rows.map((p,i) => <tr key={p.publicationId}><td>{i+1}</td><td className="py-2">{p.title}</td><td>{p.parsha || 'Unknown'}</td>{metrics.map(([key]) => <td key={key}>{p[key]}</td>)}<td>{p.deliberateOpens + p.historicalDownloads + p.historicalRedirects}</td><td>{totalRequests ? (100 * (p.deliberateOpens + p.historicalDownloads + p.historicalRedirects) / totalRequests).toFixed(1) + '%' : '—'}</td><td>{p.availableHours === null ? '—' : p.availableHours.toFixed(1) + 'h'}</td><td>{p.ageAdjustedPerDay !== null ? p.ageAdjustedPerDay.toFixed(2) : p.availableHours !== null && p.availableHours < 12 ? 'Too new' : '—'}</td><td>{p.lastAt || '—'}</td></tr>)}</tbody></table></div>
    {!rows.length && <p>No publications match this selection.</p>}
  </section>;
}

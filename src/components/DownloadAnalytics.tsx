import { useCallback, useEffect, useMemo, useState } from "react";
import { adminDownloadStats } from "@/integrations/supabase/api.functions";
import { Loader2, RefreshCw, Search, X } from "lucide-react";

type Ev = { key: string; at: string; who: string | null; parsha: string | null; title: string };
type Stats = { days: number; total: number; byPdf: Array<{ id: string | null; title: string; count: number; last: string; key?: string }>; events?: Ev[]; parshas?: string[] };

export function DownloadAnalytics({ accessToken }: { accessToken: string }) {
  const [raw, setRaw] = useState<Stats | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null); const [search, setSearch] = useState(""); const [parsha, setParsha] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(null); try { setRaw(await adminDownloadStats({ data: { accessToken, days: 365 } }) as Stats); } catch (e) { setError(e instanceof Error ? e.message : "Failed to load download actions"); } finally { setLoading(false); } }, [accessToken]);
  useEffect(() => { void load(); }, [load]);
  const parshas = raw?.parshas ?? [];
  useEffect(() => { if (parsha === null && parshas.length) setParsha(parshas[0]!); }, [parsha, parshas]);
  const prevParsha = useMemo(() => { if (!parsha) return null; const i = parshas.indexOf(parsha); return i >= 0 && i + 1 < parshas.length ? parshas[i + 1]! : null; }, [parsha, parshas]);
  const currentEvents = useMemo(() => (raw?.events ?? []).filter((e) => parsha && e.parsha === parsha), [raw, parsha]);
  const previousEvents = useMemo(() => (raw?.events ?? []).filter((e) => prevParsha && e.parsha === prevParsha), [raw, prevParsha]);
  const count = (events: Ev[]) => { const m = new Map<string, number>(); for (const e of events) m.set(e.title, (m.get(e.title) ?? 0) + 1); return m; };
  const rows = useMemo(() => { const a=count(currentEvents), b=count(previousEvents); return [...a.entries()].map(([title,actions])=>({title,actions,previous:b.get(title)??0})).sort((x,y)=>y.actions-x.actions); }, [currentEvents, previousEvents]);
  const filtered = useMemo(() => { const q=search.trim().toLowerCase(); return q ? rows.filter(r=>r.title.toLowerCase().includes(q)) : rows; }, [rows, search]);

  return <div><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Raw download actions by collection</h2><p className="mt-1 text-xs text-muted-foreground">Legacy audit data grouped by the PDF's collection. These are actions, not people or a conversion rate.</p></div><div className="flex flex-wrap items-center gap-2"><label className="text-xs text-muted-foreground" htmlFor="parsha-select">Collection</label><select id="parsha-select" value={parsha ?? ""} onChange={(e)=>setParsha(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-sm">{parshas.length===0&&<option value="">No data</option>}{parshas.map(p=><option key={p} value={p}>{p}</option>)}</select><button type="button" onClick={()=>void load()} className="rounded-md border border-border px-2 py-1 text-xs" aria-label="Refresh">{loading?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<RefreshCw className="h-3.5 w-3.5"/>}</button></div></div>
    {error&&<p className="mb-3 text-sm text-destructive">{error}</p>}{raw&&<><p className="mb-4 text-sm text-muted-foreground"><b className="text-foreground">{currentEvents.length}</b> raw download actions attributed to <b className="text-foreground">{parsha ?? "—"}</b>.</p><div className="mb-3 relative max-w-sm"><Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Filter by PDF title…" className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-8 text-sm"/>{search&&<button onClick={()=>setSearch("")} aria-label="Clear filter" className="absolute right-2 top-1/2 -translate-y-1/2"><X className="h-3.5 w-3.5"/></button>}</div><div className="space-y-2">{filtered.length===0?<p className="text-sm text-muted-foreground">No download actions for this selection.</p>:filtered.map(r=><div key={r.title} className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-3 text-sm"><span className="font-medium">{r.title}</span><span className="shrink-0 text-right"><b className="text-primary">{r.actions}</b> selected<br/><span className="text-xs text-muted-foreground">{r.previous} {prevParsha ?? "previous collection"}</span></span></div>)}</div></>}
  </div>;
}

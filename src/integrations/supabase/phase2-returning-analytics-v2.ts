import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";

async function requireAdmin(accessToken: string) {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Server misconfigured");
  const cloud = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, storage: undefined }, global: { headers: { Authorization: `Bearer ${accessToken}` } } });
  const { data, error } = await cloud.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("Not authenticated");
  const email = (data.user.email ?? "").toLowerCase();
  const allow = (process.env.ADMIN_EMAILS ?? "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
  if (!email || !allow.includes(email)) throw new Error("Forbidden");
}

type Row = { event_name: string | null; occurred_at: string; visitor_id: string | null; session_id: string | null; path: string | null; landing_path: string | null; publication_id: string | null; publication_title: string | null; publication_series: string | null; publisher: string | null; parsha: string | null; device_type: string | null; source_group: string | null; metadata: Record<string, unknown> | null };
type Pub = { id: string; title: string; series: string | null; publisher: string | null; parsha: string | null };
type Sess = { id: string; visitorId: string; startedAt: string; lastAt: string; source: string; device: string; landingPath: string | null; pages: string[]; clicks: Map<string, Pub>; accesses: Map<string, Pub>; downloads: Map<string, Pub>; downloadEvents: number; firstDownloadAt: string | null; activeSeconds: number; activeInRange: boolean };
type Visitor = { id: string; sessions: Sess[]; firstDownloadAt: string | null; firstDownloadSessionNumber: number | null };

const nonempty = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
const pubOf = (r: Row): Pub | null => { const id = nonempty(r.publication_id); return id ? { id, title: nonempty(r.publication_title) ?? "Untitled", series: nonempty(r.publication_series), publisher: nonempty(r.publisher), parsha: nonempty(r.parsha) } : null; };
const hours = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3600000);
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2 ? s[m]! : (s[m-1]!+s[m]!)/2; };
const shortId = (id: string) => id.replace(/-/g, "").slice(0, 8).toUpperCase();

async function fetchRange(since: string): Promise<Row[]> {
  const admin = getSupabaseAdmin(); const out: Row[] = []; const size=1000;
  for (let off=0; off<100000; off+=size) { const {data,error}=await admin.from("analytics_events").select("event_name, occurred_at, visitor_id, session_id, path, landing_path, publication_id, publication_title, publication_series, publisher, parsha, device_type, source_group, metadata").gte("occurred_at",since).order("occurred_at",{ascending:true}).range(off,off+size-1); if(error) throw new Error(error.message); const page=(data??[]) as Row[]; out.push(...page); if(page.length<size) break; }
  return out;
}

async function fetchHistory(visitorIds: string[], since: string): Promise<Row[]> {
  const admin=getSupabaseAdmin(); const out: Row[]=[]; const size=1000;
  for(let i=0;i<visitorIds.length;i+=75){ const batch=visitorIds.slice(i,i+75); for(let off=0;off<50000;off+=size){ const {data,error}=await admin.from("analytics_events").select("event_name, occurred_at, visitor_id, session_id, path, landing_path, publication_id, publication_title, publication_series, publisher, parsha, device_type, source_group, metadata").in("visitor_id",batch).lt("occurred_at",since).order("occurred_at",{ascending:true}).range(off,off+size-1); if(error) throw new Error(error.message); const page=(data??[]) as Row[]; out.push(...page); if(page.length<size) break; } }
  return out;
}

function buildVisitors(rows: Row[], since: string): Visitor[] {
  const sessions=new Map<string,Sess>();
  for(const r of rows){ const vid=nonempty(r.visitor_id); const sid=nonempty(r.session_id); if(!vid||!sid) continue; let x=sessions.get(sid); if(!x){x={id:sid,visitorId:vid,startedAt:r.occurred_at,lastAt:r.occurred_at,source:nonempty(r.source_group)??"Direct",device:nonempty(r.device_type)??"unknown",landingPath:nonempty(r.landing_path),pages:[],clicks:new Map(),accesses:new Map(),downloads:new Map(),downloadEvents:0,firstDownloadAt:null,activeSeconds:0,activeInRange:r.occurred_at>=since};sessions.set(sid,x);} x.activeInRange ||= r.occurred_at>=since; if(r.occurred_at<x.startedAt)x.startedAt=r.occurred_at;if(r.occurred_at>x.lastAt)x.lastAt=r.occurred_at;if(x.source==="Direct"&&nonempty(r.source_group))x.source=nonempty(r.source_group)!;if(x.device==="unknown"&&nonempty(r.device_type))x.device=nonempty(r.device_type)!; const name=nonempty(r.event_name)??""; if(name==="page_view"&&r.path&&x.pages.length<8&&!x.pages.includes(r.path))x.pages.push(r.path); const p=pubOf(r); if(p){if(name==="publication_click")x.clicks.set(p.id,p);if(name==="pdf_open"||name==="download")x.accesses.set(p.id,p);if(name==="download"){x.downloads.set(p.id,p);x.downloadEvents++;if(!x.firstDownloadAt||r.occurred_at<x.firstDownloadAt)x.firstDownloadAt=r.occurred_at;}} if(name==="heartbeat"){const n=Number(r.metadata?.["active_seconds"]??0);if(Number.isFinite(n)&&n>0)x.activeSeconds+=Math.min(n,20);} }
  const map=new Map<string,Visitor>(); for(const s of sessions.values()){const v=map.get(s.visitorId)??{id:s.visitorId,sessions:[],firstDownloadAt:null,firstDownloadSessionNumber:null};v.sessions.push(s);map.set(s.visitorId,v);} const visitors=[...map.values()];
  for(const v of visitors){v.sessions.sort((a,b)=>a.startedAt.localeCompare(b.startedAt));for(let i=0;i<v.sessions.length;i++){const d=v.sessions[i]!.firstDownloadAt;if(d&&(!v.firstDownloadAt||d<v.firstDownloadAt)){v.firstDownloadAt=d;v.firstDownloadSessionNumber=i+1;}}}
  return visitors;
}

export const adminPhase2ReturningAnalyticsV2=createServerFn({method:"POST"})
.inputValidator((input:{accessToken:string;days?:number})=>z.object({accessToken:z.string().min(10),days:z.number().int().min(1).max(365).optional()}).parse(input))
.handler(async({data})=>{
  await requireAdmin(data.accessToken); const days=data.days??90; const since=new Date(Date.now()-days*86400000).toISOString();
  const inRange=await fetchRange(since); const activeIds=[...new Set(inRange.map(r=>nonempty(r.visitor_id)).filter((x):x is string=>Boolean(x)))]; const history=await fetchHistory(activeIds,since); const visitors=buildVisitors([...history,...inRange],since).filter(v=>v.sessions.some(s=>s.activeInRange));
  const returning=visitors.filter(v=>v.sessions.some(s=>s.startedAt<since));
  const converted=visitors.filter(v=>v.firstDownloadAt!==null);
  const repeatSessions=visitors.reduce((n,v)=>n+v.sessions.filter((s,i)=>s.activeInRange&&i>=1).length,0);
  const returnDelays=returning.map(v=>{const firstActive=v.sessions.find(s=>s.activeInRange)!;return hours(v.sessions[0]!.startedAt,firstActive.startedAt)/24;});
  const conversionHours=converted.map(v=>hours(v.sessions[0]!.startedAt,v.firstDownloadAt!));
  const repeatConversion=[{key:"1st lifetime session",min:1,max:1},{key:"2nd lifetime session",min:2,max:2},{key:"3rd+ lifetime sessions",min:3,max:999999}].map(b=>{let sessions=0,convertedSessions=0;for(const v of visitors)for(let i=0;i<v.sessions.length;i++){const ord=i+1,s=v.sessions[i]!;if(!s.activeInRange||ord<b.min||ord>b.max)continue;sessions++;if(s.downloadEvents>0)convertedSessions++;}return{key:b.key,sessions,convertedSessions,conversionRate:sessions?convertedSessions/sessions:0};});
  type Coh={source:string;visitors:number;returnedVisitors:number;convertedVisitors:number;sessions:number;downloads:number}; const cm=new Map<string,Coh>(); for(const v of visitors){const source=v.sessions[0]?.source??"Direct";const c=cm.get(source)??{source,visitors:0,returnedVisitors:0,convertedVisitors:0,sessions:0,downloads:0};c.visitors++;c.sessions+=v.sessions.filter(s=>s.activeInRange).length;c.downloads+=v.sessions.filter(s=>s.activeInRange).reduce((n,s)=>n+s.downloadEvents,0);if(v.sessions.some(s=>s.startedAt<since))c.returnedVisitors++;if(v.firstDownloadAt)c.convertedVisitors++;cm.set(source,c);} const cohorts=[...cm.values()].map(c=>({...c,returnRate:c.visitors?c.returnedVisitors/c.visitors:0,conversionRate:c.visitors?c.convertedVisitors/c.visitors:0,avgSessions:c.visitors?c.sessions/c.visitors:0})).sort((a,b)=>b.visitors-a.visitors);
  type Aff={id:string;title:string;series:string|null;publisher:string|null;parsha:string|null;visitors:Set<string>;repeatVisitors:Set<string>;accesses:number;downloads:number;sessionsByVisitor:Map<string,Set<string>>};const am=new Map<string,Aff>();for(const v of returning){for(const s of v.sessions.filter(x=>x.activeInRange)){const touched=new Map<string,Pub>();for(const [id,p] of s.accesses)touched.set(id,p);for(const [id,p] of s.downloads)touched.set(id,p);for(const [id,p] of touched){const a=am.get(id)??{id,title:p.title,series:p.series,publisher:p.publisher,parsha:p.parsha,visitors:new Set(),repeatVisitors:new Set(),accesses:0,downloads:0,sessionsByVisitor:new Map()};a.visitors.add(v.id);const set=a.sessionsByVisitor.get(v.id)??new Set<string>();set.add(s.id);a.sessionsByVisitor.set(v.id,set);if(set.size>=2)a.repeatVisitors.add(v.id);am.set(id,a);}for(const id of s.accesses.keys()){const a=am.get(id);if(a)a.accesses++;}for(const id of s.downloads.keys()){const a=am.get(id);if(a)a.downloads++;}}} const publicationAffinities=[...am.values()].map(a=>({id:a.id,title:a.title,series:a.series,publisher:a.publisher,parsha:a.parsha,returningVisitors:a.visitors.size,repeatVisitors:a.repeatVisitors.size,clicks:0,accesses:a.accesses,downloads:a.downloads})).sort((a,b)=>b.returningVisitors-a.returningVisitors||b.downloads-a.downloads).slice(0,30);
  const journeys=returning.map(v=>{const first=v.sessions[0]!,last=v.sessions[v.sessions.length-1]!;const active=v.sessions.filter(s=>s.activeInRange);return{visitor:shortId(v.id),firstSeenAt:first.startedAt,lastSeenAt:last.lastAt,source:first.source,firstDevice:first.device,sessions:v.sessions.length,daysSinceFirstVisit:hours(first.startedAt,last.lastAt)/24,totalDownloads:active.reduce((n,s)=>n+s.downloadEvents,0),totalActiveSeconds:Math.round(active.reduce((n,s)=>n+s.activeSeconds,0)),firstDownloadSessionNumber:v.firstDownloadSessionNumber,topPublications:[] as Array<{title:string;sessions:number}>,sessionJourney:v.sessions.slice(-6).map((s,i,arr)=>({sessionNumber:v.sessions.length-arr.length+i+1,startedAt:s.startedAt,source:s.source,device:s.device,landingPath:s.landingPath,pages:s.pages.slice(0,5),impressionCount:0,clicked:[...s.clicks.values()].map(p=>p.title).slice(0,4),accessed:[...s.accesses.values()].map(p=>p.title).slice(0,4),downloaded:[...s.downloads.values()].map(p=>p.title).slice(0,4),activeSeconds:Math.round(s.activeSeconds),inReportingRange:s.activeInRange}))};}).sort((a,b)=>b.sessions-a.sessions||b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0,20);
  return{ok:true as const,days,since,methodology:"Reporting range selects active visitors; prior canonical history is loaded for those visitors to determine lifetime first session, acquisition source, return status, and first download.",totals:{uniqueVisitors:visitors.length,returningVisitors:returning.length,returnRate:visitors.length?returning.length/visitors.length:0,totalSessions:visitors.reduce((n,v)=>n+v.sessions.filter(s=>s.activeInRange).length,0),repeatSessions,convertedVisitors:converted.length,visitorConversionRate:visitors.length?converted.length/visitors.length:0,medianDaysToReturn:median(returnDelays),medianHoursToFirstDownload:median(conversionHours)},timeToConversion:{firstSession:visitors.filter(v=>v.firstDownloadSessionNumber===1).length,laterSession:visitors.filter(v=>(v.firstDownloadSessionNumber??0)>1).length,noDownload:visitors.filter(v=>v.firstDownloadAt===null).length},repeatConversion,cohorts,publicationAffinities,journeys,rawEventCount:inRange.length,historicalEventCount:history.length};
});

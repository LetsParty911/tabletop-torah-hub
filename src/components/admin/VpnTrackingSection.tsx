import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { adminVpnTracking } from "@/lib/vpn-tracking.functions";
import { adminGetVpnMode, adminSetVpnMode } from "@/lib/vpn-mode.functions";
import { formatUaSummary, parseUserAgent } from "@/lib/ua-parse";

type VpnRow = {
 id:string;created_at:string;ip_address:string|null;country:string|null;region:string|null;city:string|null;
 vpn_operator:string|null;user_agent:string|null;referrer_host:string|null;request_path:string;
 utm_source:string|null;mode:string;decision:string;verdict:string;signals:string[];
 confidence:number|null;lookup_source:string;provider_status:string;lookup_ms:number|null;
 error_code:string|null;is_automated:boolean;
};
type Summary = {total?:number;unique_ips?:number;blocked?:number;unique_blocked_ips?:number;detected?:number;clean?:number;unknown?:number;skipped?:number;vpn?:number;proxy?:number;tor?:number;provider_queries?:number;cache_hits?:number;by_country?:Array<{country:string;attempts:number;blocked:number}>};
export default function VpnTrackingSection({accessToken}:{accessToken:string|null}){
 const query=useServerFn(adminVpnTracking);
 const [days,setDays]=useState(7),[page,setPage]=useState(0),[verdict,setVerdict]=useState("all"),[ip,setIp]=useState("");
 const [rows,setRows]=useState<VpnRow[]>([]),[summary,setSummary]=useState<Summary>({}),[count,setCount]=useState(0);
 const [loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null);
 const [mode,setMode]=useState<"off"|"monitor"|"block"|null>(null),[modeBusy,setModeBusy]=useState(false),[modeError,setModeError]=useState<string|null>(null);
 const [revision,setRevision]=useState(0);
 useEffect(()=>{if(!accessToken)return;let ignore=false;setLoading(true);setError(null);
  query({data:{accessToken,days,page,verdict:verdict as "all"|"clean"|"detected"|"unknown"|"skipped"|"blocked",ip:ip.trim()||undefined}})
   .then(r=>{if(!ignore){setRows(r.rows as VpnRow[]);setSummary(r.summary as Summary);setCount(r.count);}})
   .catch(e=>{if(!ignore)setError(e instanceof Error?e.message:"Unable to load");})
   .finally(()=>{if(!ignore)setLoading(false);});
  return ()=>{ignore=true;};
 // Query returned by useServerFn can change identity on re-render.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[accessToken,days,page,verdict,ip,revision]);
 useEffect(()=>{if(!accessToken)return;adminGetVpnMode({data:{accessToken}}).then(r=>setMode(r.mode)).catch(e=>setModeError(String(e)));},[accessToken]);
 const changeMode=async(next:"off"|"monitor"|"block")=>{
  if(!accessToken||mode===next)return;
  if(!window.confirm(next==="block"?"Enable LIVE VPN/proxy/Tor blocking? This may deny legitimate visitors.":"Change VPN mode to "+next+"?"))return;
  setModeBusy(true);setModeError(null);
  try{const r=await adminSetVpnMode({data:{accessToken,mode:next,confirm:"CHANGE_VPN_MODE"}});setMode(r.mode);}
  catch(e){setModeError(String(e));}
  finally{setModeBusy(false);}
 };
 const num=(n?:number)=>Number(n??0).toLocaleString();
 const cards=[["Checks",summary.total],["Unique IPs",summary.unique_ips],["Detected",summary.detected],["Denied",summary.blocked],["Clean",summary.clean],["Unknown",summary.unknown],["Skipped",summary.skipped],["API queries",summary.provider_queries],["Cached checks",summary.cache_hits]];
 const exportCsv=()=>{const headers=["Time","IP","City","Region","Country","Outcome","Verdict","Signals","Confidence","Source","Provider status","Latency ms","Path","Referrer host","UTM","Device","Automated","Operator","Error"];
 const values=rows.map(r=>[r.created_at,r.ip_address,r.city,r.region,r.country,r.decision,r.verdict,r.signals.join("+"),r.confidence,r.lookup_source,r.provider_status,r.lookup_ms,r.request_path,r.referrer_host,r.utm_source,r.user_agent,r.is_automated,r.vpn_operator,r.error_code]);
 const csv=[headers,...values].map(line=>line.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");
 const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download="vpn-audit-visible-page.csv";a.click();URL.revokeObjectURL(a.href);};
 return <section className="rounded-lg border bg-card p-6 space-y-5">
  <div className="flex flex-wrap justify-between items-center gap-3"><div><h2 className="font-serif text-2xl font-bold text-primary">VPN Connection Tracking</h2><p className="text-sm text-muted-foreground">Audits public document navigations. Provider errors are unknown, never clean. Admin and static/API routes are excluded. CSV exports the visible page only.</p></div>
   <div className="flex gap-2"><button className="rounded border px-3 py-2 text-sm" onClick={()=>setRevision(x=>x+1)}>Refresh</button><button className="rounded border px-3 py-2 text-sm" disabled={!rows.length} onClick={exportCsv}>CSV (this page)</button></div>
  </div>
  <div className="rounded-lg border p-4 space-y-3"><h3 className="font-semibold">VPN protection mode: {mode??"Loading…"}</h3><p className="text-sm text-muted-foreground">Off disables checks; Monitor records classifications but allows visits; Block denies confidently identified VPN/proxy/Tor traffic. Changes may take up to 10 seconds to reach every server.</p>
   <div className="flex flex-wrap gap-2">{(["off","monitor","block"] as const).map(x=><button key={x} type="button" disabled={modeBusy||!mode||mode===x} onClick={()=>changeMode(x)} className="rounded border px-3 py-2 text-sm disabled:opacity-50">{x==="off"?"Off":x==="monitor"?"Monitor":"Block"}</button>)}</div>{modeError&&<p className="text-sm text-destructive">{modeError}</p>}</div>
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">{cards.map(([label,val])=><div className="rounded-md border p-3" key={String(label)}><div className="text-xs text-muted-foreground">{label}</div><div className="font-semibold text-xl">{num(val as number)}</div></div>)}</div>
  <div className="flex flex-wrap gap-3 items-center">
   <label className="text-sm">Range <select className="ml-2 rounded border bg-background p-2" value={days} onChange={e=>{setDays(Number(e.target.value));setPage(0)}}><option value={1}>24 hours</option><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select></label>
   <label className="text-sm">Outcome <select className="ml-2 rounded border bg-background p-2" value={verdict} onChange={e=>{setVerdict(e.target.value);setPage(0)}}>{["all","blocked","detected","clean","unknown","skipped"].map(x=><option key={x} value={x}>{x}</option>)}</select></label>
   <label className="text-sm">IP <input className="ml-2 rounded border bg-background p-2" placeholder="Exact IP (optional)" value={ip} onChange={e=>{setIp(e.target.value);setPage(0)}} /></label>
  </div>
  {error&&<p className="text-sm text-destructive">{error}</p>}
  <div className="text-sm text-muted-foreground">{loading?"Loading…":`${num(count)} matching checks, showing ${rows.length} (page ${page+1})`}</div>
  <div className="overflow-x-auto"><table className="w-full text-sm min-w-[1100px]">
   <thead><tr className="border-b text-left text-muted-foreground">{["Time","IP","Location","Result","Signals / confidence","Lookup","Page / referrer","Device","Error"].map(x=><th key={x} className="py-2 px-2">{x}</th>)}</tr></thead>
   <tbody>{rows.map(r=><tr key={r.id} className="border-b align-top">
    <td className="py-2 px-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
    <td className="py-2 px-2 font-mono text-xs">{r.ip_address??"—"}</td>
    <td className="py-2 px-2">{[r.city,r.region,r.country].filter(Boolean).join(", ")||"—"}</td>
    <td className="py-2 px-2"><strong>{r.decision}</strong><div className="text-xs">{r.verdict} ({r.mode})</div></td>
    <td className="py-2 px-2">{r.signals.join("+")||"—"}<div className="text-xs">Confidence: {r.confidence??"Unknown"}</div><div className="text-xs">{r.vpn_operator??""}</div></td>
    <td className="py-2 px-2">{r.lookup_source}<div className="text-xs">{r.provider_status}, {r.lookup_ms??"—"}ms</div></td>
    <td className="py-2 px-2 max-w-[270px] break-all">{r.request_path}<div className="text-xs">{r.referrer_host??"—"}</div></td>
    <td className="py-2 px-2">{r.user_agent?formatUaSummary(parseUserAgent(r.user_agent)):"—"}{r.is_automated?" (automated)":""}</td>
    <td className="py-2 px-2">{r.error_code??"—"}</td>
   </tr>)}</tbody>
  </table></div>
  <div className="flex items-center gap-3"><button className="rounded border px-3 py-1.5 text-sm" disabled={page===0||loading} onClick={()=>setPage(x=>x-1)}>Previous</button><span className="text-sm">Page {page+1}</span><button className="rounded border px-3 py-1.5 text-sm" disabled={loading||(page+1)*100>=count} onClick={()=>setPage(x=>x+1)}>Next</button></div>
  <div><h3 className="font-semibold mb-2">Top Countries</h3><div className="flex gap-2 flex-wrap">{(summary.by_country??[]).map(x=><span key={x.country} className="border rounded px-2 py-1 text-sm">{x.country}: {num(x.attempts)} checks / {num(x.blocked)} denied</span>)}</div></div>
 </section>;
}

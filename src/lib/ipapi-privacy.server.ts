// Server-only secondary privacy provider. Never expose API credentials in URLs or logs.
// ipapi.is supports JSON POST, with 1,000 registered lookups/day.
export type IpapiVerdict = { vpn: boolean; proxy: boolean; tor: boolean; operator: string|null };
export type IpapiCheck = { value: IpapiVerdict|null; status: string; source:"provider"|"cache"|"skipped"; elapsed:number };
const cache=new Map<string,{result:IpapiCheck;expires:number}>();
const pending=new Map<string,Promise<IpapiCheck>>();
let keyVersion:string|null=null;
let pauseUntil=0;
const maxEntries=2500;
const bounded=(v:unknown,max=90)=>typeof v==="string"&&v.trim()?v.trim().slice(0,max):null;
export function parseIpapiResult(data:unknown,ip:string):IpapiVerdict|null {
 if(!data||typeof data!=="object")return null;
 const x=data as Record<string,unknown>;
 if(x.ip!==ip)return null;
 if(typeof x.is_vpn!=="boolean"&&typeof x.is_vpn!=="string"&&typeof x.is_proxy!=="boolean"&&typeof x.is_tor!=="boolean")return null;
 if(x.is_vpn===null||x.is_proxy===null||x.is_tor===null||x.is_proxy===undefined||x.is_tor===undefined||x.is_vpn===undefined)return null;
 const vpn=x.is_vpn===true||(typeof x.is_vpn==="string"&&x.is_vpn.length>0&&x.is_vpn!=="false");
 const operator=x.vpn&&typeof x.vpn==="object"?bounded((x.vpn as Record<string,unknown>).service):null;
 return {vpn,proxy:x.is_proxy===true,tor:x.is_tor===true,operator};
}
export function getIpapiKey(request:Request):string|null {
 const cf=(request as Request & {runtime?:{cloudflare?:{env?:Record<string,unknown>}}}).runtime?.cloudflare?.env?.["IPAPI_IS_API_KEY"];
 const node=typeof process==="undefined"?undefined:process.env["IPAPI_IS_API_KEY"];
 const selected=typeof cf==="string"&&cf.trim()?cf:node;
 return typeof selected==="string"&&selected.trim()?selected.trim():null;
}
export async function checkIpapi(ip:string,key:string|null):Promise<IpapiCheck>{
 if(!key)return {value:null,status:"not_configured",source:"skipped",elapsed:0};
 if(key!==keyVersion){cache.clear();pending.clear();pauseUntil=0;keyVersion=key;}
 const now=Date.now();
 if(now<pauseUntil)return {value:null,status:"quota_paused",source:"skipped",elapsed:0};
 const hit=cache.get(ip);
 if(hit&&hit.expires>now)return {...hit.result,source:"cache",elapsed:0};
 const inflight=pending.get(ip);
 if(inflight)return inflight.then(v=>({...v,source:"cache" as const}));
 const task:Promise<IpapiCheck>=(async()=>{
  const started=Date.now(),controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),1400);
  let value:IpapiVerdict|null=null,status="lookup_error";
  try {
   const res=await fetch("https://api.ipapi.is",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({q:ip,key}),signal:controller.signal});
   if(res.ok){value=parseIpapiResult(await res.json() as unknown,ip);status=value?"ok":"unclassified";}
   else {
    status=res.status===429?"quota_or_rate_limit":res.status===403?"access_denied":res.status>=500?"upstream_error":"http_"+res.status;
    if(res.status===429||res.status===403){
     const retry=Number(res.headers.get("Retry-After"));
     pauseUntil=Date.now()+(res.status===429&&Number.isFinite(retry)&&retry>0?Math.min(retry*1000,86400000):900000);
    }
   }
  }catch(e){status=e instanceof Error&&e.name==="AbortError"?"timeout":"lookup_error";}finally{clearTimeout(timer);}
  const result:IpapiCheck={value,status,source:"provider",elapsed:Date.now()-started};
  if(cache.size>=maxEntries)cache.delete(cache.keys().next().value!);
  cache.set(ip,{result,expires:Date.now()+(value?(value.vpn||value.proxy||value.tor?3600000:6*3600000):120000)});
  return result;
 })().finally(()=>pending.delete(ip));
 pending.set(ip,task);return task;
}
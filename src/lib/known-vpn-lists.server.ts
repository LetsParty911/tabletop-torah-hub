// Server-side public blocklists. Strict VPN CIDRs only; never use datacenter/ASN list.
// MIT-licensed source: https://github.com/X4BNet/lists_vpn (copyright X4B/Mathew Heard).
// Tor list: https://check.torproject.org/torbulkexitlist
const VPN_LIST="https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt";
const TOR_LIST="https://check.torproject.org/torbulkexitlist";
export type ListedNetwork="VPN"|"Tor";
type Range={base:number;mask:number};
type Snapshot={vpn:Range[];tor:Set<number>;updated:number;state:"ok"|"stale"|"unavailable"};
let snapshot:Snapshot={vpn:[],tor:new Set(),updated:0,state:"unavailable"};
let inProgress:Promise<void>|null=null;
const REFRESH=24*3600000;
const MAX_STALE=72*3600000;
export function ipv4Number(input:string):number|null{
 const octets=input.split(".");
 if(octets.length!==4||octets.some(o=>!/^\d{1,3}$/.test(o)||Number(o)>255))return null;
 return octets.reduce((n,o)=>((n*256)+Number(o))>>>0,0);
}
export function cidrRange(line:string):Range|null{
 const [ip,prefix,...rest]=line.split("/");
 if(rest.length||!ip)return null;
 const n=ipv4Number(ip);
 const bits=prefix===undefined?32:Number(prefix);
 if(n===null||!Number.isInteger(bits)||bits<8||bits>32)return null;
 const mask=bits===0?0:(0xffffffff<<(32-bits))>>>0;
 return {base:(n&mask)>>>0,mask};
}
export function listContains(ip:string,ranges:Range[]):boolean{
 const n=ipv4Number(ip);return n!==null&&ranges.some(r=>(n&r.mask)===r.base);
}
export function parseStrictVpnList(data:string):Range[]{
 const lines=data.split(/\r?\n/);
 if(lines.length>90000)throw Error("oversized_list");
 const out:Range[]=[];
 for(const raw of lines){
  const line=raw.trim();
  if(!line||line.startsWith("#"))continue;
  const x=cidrRange(line);
  if(x)out.push(x);
 }
 if(out.length<100)throw Error("undersized_list");
 return out;
}
export function parseTorExitList(data:string):Set<number>{
 const lines=data.split(/\r?\n/);
 if(lines.length>50000)throw Error("oversized_list");
 const out=new Set<number>();
 for(const raw of lines){const n=ipv4Number(raw.trim());if(n!==null)out.add(n);}
 if(out.size<100)throw Error("undersized_list");
 return out;
}
async function loadText(url:string,maxBytes:number):Promise<string>{
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),2500);
 try{
  const r=await fetch(url,{signal:controller.signal,headers:{Accept:"text/plain"}});
  if(!r.ok)throw Error("upstream");
  const text=await r.text();
  if(text.length>maxBytes)throw Error("large");
  return text;
 }finally{clearTimeout(timeout);}
}
async function refresh():Promise<void>{
 try{
  const [vpn,tor]=await Promise.all([
   loadText(VPN_LIST,2500000).then(parseStrictVpnList),
   loadText(TOR_LIST,1200000).then(parseTorExitList),
  ]);
  snapshot={vpn,tor,updated:Date.now(),state:"ok"};
 }catch{snapshot={...snapshot,state:snapshot.updated&&Date.now()-snapshot.updated<MAX_STALE?"stale":"unavailable"};}
}
export async function checkKnownNetwork(ip:string):Promise<{signal:ListedNetwork|null;status:string}>{
 // v4 only until a separately validated v6 list format is added.
 const num=ipv4Number(ip);
 if(num===null)return {signal:null,status:ip.includes(":")?"ipv6_unchecked":"invalid_ip"};
 if(Date.now()-snapshot.updated>REFRESH&&!inProgress)inProgress=refresh().finally(()=>{inProgress=null;});
 if(inProgress&&snapshot.state==="unavailable")await inProgress;
 const usable=snapshot.state!=="unavailable"&&Date.now()-snapshot.updated<MAX_STALE;
 if(!usable)return {signal:null,status:"lists_unavailable"};
 if(snapshot.tor.has(num))return {signal:"Tor",status:snapshot.state};
 if(listContains(ip,snapshot.vpn))return {signal:"VPN",status:snapshot.state};
 return {signal:null,status:snapshot.state};
}

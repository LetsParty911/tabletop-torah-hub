import { describe,expect,it } from "vitest";
import { parseIpapiResult } from "./ipapi-privacy.server";
import { ipv4Number,cidrRange,listContains,parseStrictVpnList,parseTorExitList } from "./known-vpn-lists.server";

describe("secondary VPN detection",()=>{
 const ip="203.0.113.77";
 it("accepts explicit flags and known provider without inventing confidence",()=>{
  expect(parseIpapiResult({ip,is_vpn:true,is_proxy:false,is_tor:false,
   vpn:{service:"Example VPN"},is_datacenter:true},ip))
   .toEqual({vpn:true,proxy:false,tor:false,operator:"Example VPN"});
  expect(parseIpapiResult({ip,is_vpn:"provider-flag",is_proxy:false,is_tor:false},ip)?.vpn).toBe(true);
 });
 it("does not treat anonymous responses with absent privacy flags as clean",()=>{
  expect(parseIpapiResult({ip,city:"New York"},ip)).toBeNull();
  expect(parseIpapiResult({ip,is_vpn:null,is_proxy:null,is_tor:null},ip)).toBeNull();
  expect(parseIpapiResult({ip:"198.51.100.9",is_vpn:true,is_proxy:false,is_tor:false},ip)).toBeNull();
 });
 it("never uses datacenter alone as a detection",()=>{
  expect(parseIpapiResult({ip,is_vpn:false,is_proxy:false,is_tor:false,is_datacenter:true},ip))
   .toEqual({vpn:false,proxy:false,tor:false,operator:null});
 });
 it("matches strict CIDR without swallowing unrelated ranges",()=>{
  expect(ipv4Number("256.1.2.3")).toBeNull();
  expect(cidrRange("203.0.113.0/24")).toEqual({base:ipv4Number("203.0.113.0"),mask:0xffffff00});
  const cidr=cidrRange("203.0.113.0/24")!;
  expect(listContains(ip,[cidr])).toBe(true);
  expect(listContains("198.51.100.7",[cidr])).toBe(false);
  expect(cidrRange("203.0.113.0/0")).toBeNull();
 });
 it("requires a sufficiently complete public list",()=>{
  expect(()=>parseStrictVpnList("203.0.113.0/24")).toThrow("undersized_list");
  expect(()=>parseTorExitList("203.0.113.77")).toThrow("undersized_list");
 });
});
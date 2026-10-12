import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const schema=z.object({accessToken:z.string().min(10)});
export const adminGetVpnMode=createServerFn({method:"POST"}).inputValidator((x:unknown)=>schema.parse(x)).handler(async({data})=>{
 const {verifyAdminAccessToken}=await import("./admin-auth.server");
 await verifyAdminAccessToken(data.accessToken);
 const {getSupabaseAdmin}=await import("@/integrations/supabase/ext.server");
 const {data:row,error}=await getSupabaseAdmin().from("vpn_block_settings").select("mode,updated_at,updated_by").eq("id",1).single();
 if(error)throw Error(error.message);
 return {mode:row.mode as "off"|"monitor"|"block",updatedAt:row.updated_at as string,updatedBy:row.updated_by as string|null};
});
export const adminSetVpnMode=createServerFn({method:"POST"}).inputValidator((x:unknown)=>schema.extend({mode:z.enum(["off","monitor","block"]),confirm:z.literal("CHANGE_VPN_MODE")}).parse(x)).handler(async({data})=>{
 const {verifyAdminAccessToken}=await import("./admin-auth.server");
 const email=await verifyAdminAccessToken(data.accessToken);
 const {getSupabaseAdmin}=await import("@/integrations/supabase/ext.server");
 const updatedAt=new Date().toISOString();
 const {error}=await getSupabaseAdmin().from("vpn_block_settings").update({mode:data.mode,updated_at:updatedAt,updated_by:email}).eq("id",1);
 if(error)throw Error(error.message);
 const {clearVpnModeCache}=await import("./vpn-block.server");
 clearVpnModeCache();
 return {mode:data.mode,updatedAt,updatedBy:email};
});

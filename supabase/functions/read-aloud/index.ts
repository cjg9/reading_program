import {createClient} from "npm:@supabase/supabase-js@2.112.3";
import {createNarrationHandler} from "./handler.ts";

const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{
  auth:{persistSession:false,autoRefreshToken:false},
});
const bucket=admin.storage.from("reading-narration");

Deno.serve(createNarrationHandler({
  env:name=>Deno.env.get(name),
  fetch,
  store:{
    reserve:async(key,user,characters)=>{
      const {data,error}=await admin.rpc("reserve_narration",{p_key:key,p_user:user,p_characters:characters});
      if(error)throw error;return data;
    },
    read:async path=>{
      const {data,error}=await bucket.download(path);
      if(error||!data)throw error??new Error("Recording unavailable");
      return JSON.parse(await data.text());
    },
    save:async(key,lease,recording)=>{
      const path=`${key}/${lease}.json`;
      const {error:uploadError}=await bucket.upload(path,JSON.stringify(recording),{contentType:"application/json",upsert:false});
      if(uploadError)throw uploadError;
      const {data,error}=await admin.from("narration_cache").update({status:"ready",object_path:path,updated_at:new Date().toISOString()})
        .eq("cache_key",key).eq("lease_id",lease).eq("status","pending").select("cache_key");
      if(error||!data?.length){await bucket.remove([path]);throw error??new Error("Recording lease expired");}
    },
    fail:async(key,lease)=>{
      const {error}=await admin.from("narration_cache").update({status:"failed"}).eq("cache_key",key).eq("lease_id",lease).eq("status","pending");
      if(error)throw error;
    },
  },
  authenticate:async jwt=>{
    const client=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{
      auth:{persistSession:false,autoRefreshToken:false},
    });
    // Gateway JWT verification is disabled for modern project keys; Auth still validates every caller.
    const {data:{user},error}=await client.auth.getUser(jwt);
    return error||!user?null:{id:user.id,confirmed:!!user.email_confirmed_at};
  },
}));

import {createClient} from "npm:@supabase/supabase-js@2.112.3";
import {createNarrationHandler,type RecordingStore} from "./handler.ts";
import {createPublicationHandler,type PassageContent} from "./publication.ts";

const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{
  auth:{persistSession:false,autoRefreshToken:false},
});
const bucket=admin.storage.from("reading-narration");

const store:RecordingStore={
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
  };
const caller=(jwt:string)=>createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{
  auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${jwt}`}},
});
async function authenticate(jwt:string){
    const client=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{
      auth:{persistSession:false,autoRefreshToken:false},
    });
    // Gateway JWT verification is disabled for modern project keys; Auth still validates every caller.
    const {data:{user},error}=await client.auth.getUser(jwt);
    return error||!user?null:{id:user.id,confirmed:!!user.email_confirmed_at};
}
async function contentHash(content:PassageContent){
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(content)));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");
}
Deno.serve(createPublicationHandler({
  authenticate,
  teacher:async(jwt,user)=>{
    const {data,error}=await caller(jwt).from("profiles").select("account_type").eq("id",user).maybeSingle();
    if(error)throw error;return data?.account_type==="teacher";
  },
  assignmentContent:async(jwt,id)=>{
    const {data,error}=await caller(jwt).from("exercise_assignments").select("content").eq("id",id).is("archived_at",null).maybeSingle();
    if(error)throw error;return data?.content??null;
  },
  exercise:async(jwt,id,user)=>{
    const {data,error}=await caller(jwt).from("reading_exercises").select("content").eq("id",id).eq("teacher_id",user).maybeSingle();
    if(error)throw error;return data?.content??null;
  },
  assigned:async(jwt,id)=>{
    const {data,error}=await caller(jwt).from("exercise_assignments").select("narration_id").eq("id",id).is("archived_at",null).maybeSingle();
    if(error)throw error;return data?.narration_id??null;
  },
  find:async(exerciseId,content)=>{
    const {data,error}=await admin.from("narration_publications").select("id,content,cache_key").eq("exercise_id",exerciseId).eq("content_hash",await contentHash(content)).maybeSingle();
    if(error)throw error;return data;
  },
  publication:async id=>{
    const {data,error}=await admin.from("narration_publications").select("id,content,cache_key").eq("id",id).maybeSingle();
    if(error)throw error;return data;
  },
  generate:async(text,user)=>{
    // Generation is limited to teacher previews, owned publication, or authorized assignment content.
    const generate=createNarrationHandler({store,fetch,authenticate:async()=>({id:user,confirmed:true}),
      env:name=>name==="ELEVENLABS_TRIAL_USER_IDS"?user:Deno.env.get(name)});
    return generate(new Request("https://internal.invalid/generate",{method:"POST",headers:{Authorization:"Bearer internal"},body:JSON.stringify({text})}));
  },
  save:async(exerciseId,content,key)=>{
    const {data,error}=await admin.from("narration_publications").upsert({exercise_id:exerciseId,content,content_hash:await contentHash(content),cache_key:key},
      {onConflict:"exercise_id,content_hash",ignoreDuplicates:true}).select("id,content,cache_key").maybeSingle();
    if(error)throw error;if(data)return data;
    const {data:existing,error:lookupError}=await admin.from("narration_publications").select("id,content,cache_key").eq("exercise_id",exerciseId).eq("content_hash",await contentHash(content)).single();
    if(lookupError)throw lookupError;return existing;
  },
  read:async key=>{
    const {data,error}=await admin.from("narration_cache").select("object_path").eq("cache_key",key).eq("status","ready").single();
    if(error||!data?.object_path)throw error??new Error("Missing recording");
    return store.read(data.object_path);
  },
}));

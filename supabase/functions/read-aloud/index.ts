import {createClient} from "npm:@supabase/supabase-js@2.112.3";
import {createNarrationHandler} from "./handler.ts";

Deno.serve(createNarrationHandler({
  env:name=>Deno.env.get(name),
  fetch,
  authenticate:async jwt=>{
    const client=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{
      auth:{persistSession:false,autoRefreshToken:false},
    });
    // Gateway JWT verification is disabled for modern project keys; Auth still validates every caller.
    const {data:{user},error}=await client.auth.getUser(jwt);
    return error||!user?null:{id:user.id,confirmed:!!user.email_confirmed_at};
  },
}));

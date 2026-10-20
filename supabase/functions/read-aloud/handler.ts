export interface Recording {audio_base64:string;alignment:unknown}
export type Reservation={status:"ready";path:string}|{status:"pending"|"limited"}|{status:"generate";lease:string};
export interface RecordingStore {
  reserve:(key:string,user:string,characters:number)=>Promise<Reservation>;
  read:(path:string)=>Promise<Recording>;
  save:(key:string,lease:string,recording:Recording)=>Promise<void>;
  fail:(key:string,lease:string)=>Promise<void>;
}
interface Dependencies {
  env:(name:string)=>string|undefined;
  authenticate:(jwt:string)=>Promise<{id:string;confirmed:boolean}|null>;
  fetch:typeof fetch;
  store:RecordingStore;
}
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(status:number,body:object)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});

function validAlignment(value:unknown,text:string):boolean {
  if(!value||typeof value!=="object")return false;
  const a=value as {characters?:unknown;character_start_times_seconds?:unknown;character_end_times_seconds?:unknown};
  const chars=a.characters,starts=a.character_start_times_seconds,ends=a.character_end_times_seconds;
  return Array.isArray(chars)&&chars.every(char=>typeof char==="string")&&chars.join("")===text
    &&Array.isArray(starts)&&Array.isArray(ends)&&starts.length===chars.length&&ends.length===chars.length
    &&starts.every((start,i)=>typeof start==="number"&&Number.isFinite(start)&&start>=0
      &&typeof ends[i]==="number"&&Number.isFinite(ends[i])&&ends[i]>=start&&(i===0||start>=starts[i-1]));
}

export function createNarrationHandler(deps:Dependencies){
  return async(request:Request)=>{
    if(request.method==="OPTIONS")return new Response("ok",{headers:cors});
    if(request.method!=="POST")return reply(405,{error:"Method not allowed."});
    try{
      const jwt=request.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
      const user=jwt?await deps.authenticate(jwt):null;
      if(!user?.confirmed)return reply(401,{error:"Sign in with a confirmed account to try ElevenLabs."});
      const allowed=(deps.env("ELEVENLABS_TRIAL_USER_IDS")??"").split(",").map(value=>value.trim()).filter(Boolean);
      if(!allowed.includes(user.id))return reply(403,{error:"The ElevenLabs trial is not enabled for this account. Use the browser voice for now."});
      const apiKey=deps.env("ELEVENLABS_API_KEY"),voice=deps.env("ELEVENLABS_VOICE_ID");
      if(!apiKey||!voice)return reply(503,{error:"The ElevenLabs trial is awaiting setup. Use the browser voice for now."});
      let body;
      try{body=await request.json();}catch{return reply(400,{error:"Enter a passage to read."});}
      if(typeof body?.text!=="string"||!body.text.trim()||body.text.length>5000)
        return reply(400,{error:"For this trial, choose a passage under 5,000 characters or use the browser voice."});
      const model=deps.env("ELEVENLABS_MODEL_ID")||"eleven_multilingual_v2";
      if(!["eleven_multilingual_v2","eleven_flash_v2_5","eleven_turbo_v2_5"].includes(model))return reply(503,{error:"The narration model needs configuration."});
      const settings={stability:0.65,similarity_boost:0.75,style:0,use_speaker_boost:true};
      const signature=JSON.stringify({version:1,provider:"elevenlabs",voice,model,settings,format:"mp3_44100_128",text:body.text});
      const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(signature));
      const key=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
      const reservation=await deps.store.reserve(key,user.id,body.text.length);
      if(reservation.status==="ready")return reply(200,{...await deps.store.read(reservation.path),cache_key:key});
      if(reservation.status==="pending")return reply(409,{error:"This recording is already being prepared. Please wait."});
      if(reservation.status==="limited")return reply(429,{error:"The new-recording limit has been reached. Saved recordings still work; use the browser voice for new text."});
      if(reservation.status!=="generate")throw new Error("Invalid reservation");
      try{
      const response=await deps.fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`,{
        method:"POST",headers:{"xi-api-key":apiKey,"Content-Type":"application/json"},signal:AbortSignal.timeout(60_000),
        body:JSON.stringify({text:body.text,model_id:model,voice_settings:settings}),
      });
      if(!response.ok){
        await deps.store.fail(key,reservation.lease);
        // Never expose the provider's raw response, which may contain account details.
        const error=response.status===402
          ?"ElevenLabs requires a paid plan or additional credits for this voice. The account owner must review billing; use the browser voice for now."
          :response.status===401||response.status===403
          ?"ElevenLabs denied access to this voice. The account owner should check the API key permissions and voice access."
          :response.status===429
          ?"The ElevenLabs trial is busy or at its usage limit. Try the browser voice."
          :"ElevenLabs could not create this recording. Try the browser voice.";
        return reply(response.status===429?429:502,{error});
      }
      const data=await response.json();
      if(typeof data.audio_base64!=="string"||!data.audio_base64||!validAlignment(data.alignment,body.text))throw new Error("Incomplete recording");
      const recording={audio_base64:data.audio_base64,alignment:data.alignment};
      await deps.store.save(key,reservation.lease,recording);
      return reply(200,{...recording,cache_key:key});
      }catch(cause){await deps.store.fail(key,reservation.lease);throw cause;}
    }catch{return reply(503,{error:"The recording service is unavailable. Try again or use the browser voice."});}
  };
}

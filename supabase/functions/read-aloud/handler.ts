interface Dependencies {
  env:(name:string)=>string|undefined;
  authenticate:(jwt:string)=>Promise<{id:string;confirmed:boolean}|null>;
  fetch:typeof fetch;
}
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(status:number,body:object)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});

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
      const response=await deps.fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`,{
        method:"POST",headers:{"xi-api-key":apiKey,"Content-Type":"application/json"},signal:AbortSignal.timeout(60_000),
        body:JSON.stringify({text:body.text,model_id:"eleven_multilingual_v2",voice_settings:{stability:0.65,similarity_boost:0.75,style:0,use_speaker_boost:true}}),
      });
      if(!response.ok)return reply(response.status===429?429:502,{error:response.status===429?"The ElevenLabs trial is busy or at its usage limit. Try the browser voice.":"ElevenLabs could not create this recording. Try the browser voice."});
      const data=await response.json();
      if(typeof data.audio_base64!=="string"||!data.audio_base64||!data.alignment)
        return reply(502,{error:"ElevenLabs did not return a timed recording. Try the browser voice."});
      return reply(200,{audio_base64:data.audio_base64,alignment:data.alignment});
    }catch{return reply(503,{error:"The recording service is unavailable. Try again or use the browser voice."});}
  };
}

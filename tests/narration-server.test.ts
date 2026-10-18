import {expect,it,vi} from "vitest";
import {createNarrationHandler,type Reservation,type Recording} from "../supabase/functions/read-aloud/handler";

function setup(overrides:Record<string,string|undefined>={}){
  const config:Record<string,string|undefined>={ELEVENLABS_API_KEY:"test-secret",ELEVENLABS_VOICE_ID:"voice-id",ELEVENLABS_TRIAL_USER_IDS:"teacher-id",...overrides};
  const authenticate=vi.fn(async()=>({id:"teacher-id",confirmed:true}));
  const fetch=vi.fn(async(_url:string|URL|Request,options?:RequestInit)=>{
    const text=JSON.parse(options?.body as string).text as string;
    const characters=Array.from(text);
    return new Response(JSON.stringify({audio_base64:"YXVkaW8=",alignment:{characters,character_start_times_seconds:characters.map((_,i)=>i/10),character_end_times_seconds:characters.map((_,i)=>(i+1)/10)}}));
  });
  const store={reserve:vi.fn(async():Promise<Reservation>=>({status:"generate",lease:"lease-id"})),read:vi.fn(async():Promise<Recording>=>({audio_base64:"saved",alignment:{}})),save:vi.fn(),fail:vi.fn()};
  const handler=createNarrationHandler({env:name=>config[name],authenticate,fetch,store});
  const request=(body:unknown={text:"Hello"},token="valid")=>new Request("https://example.test/read-aloud",{
    method:"POST",headers:token?{Authorization:`Bearer ${token}`}:{},body:JSON.stringify(body),
  });
  return {handler,authenticate,fetch,request,store};
}
it("rejects unauthenticated and unconfirmed callers before spending credits",async()=>{
  const {handler,authenticate,fetch,request}=setup();
  expect((await handler(request(undefined,""))).status).toBe(401);
  expect(authenticate).not.toHaveBeenCalled();
  authenticate.mockResolvedValue({id:"teacher-id",confirmed:false});
  expect((await handler(request())).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});
it.each([undefined,"","another-user"])("fails closed when trial allowlist is %s",async allowlist=>{
  const {handler,fetch,request}=setup({ELEVENLABS_TRIAL_USER_IDS:allowlist});
  expect((await handler(request())).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
it("returns a setup message when the key is missing",async()=>{
  const {handler,fetch,request}=setup({ELEVENLABS_API_KEY:undefined});
  expect((await handler(request())).status).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
});
it.each([null,{}, {text:" "},{text:"a".repeat(5001)}])("rejects invalid passage %j",async body=>{
  const {handler,fetch,request}=setup();
  expect((await handler(request(body))).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps credentials server-side and sends the exact puzzle text in one request",async()=>{
  const {handler,fetch,request}=setup();
  const response=await handler(request({text:"They were watch together.",voice_id:"untrusted-voice"}));
  expect(response.status).toBe(200);
  const [url,options]=fetch.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toContain("/voice-id/with-timestamps");
  expect(options.headers).toMatchObject({"xi-api-key":"test-secret"});
  expect(JSON.parse(options.body as string)).toMatchObject({text:"They were watch together.",model_id:"eleven_multilingual_v2",voice_settings:{style:0}});
  const returned=await response.text();
  expect(returned).not.toContain("test-secret");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("sanitizes provider failures",async()=>{
  const {handler,fetch,request}=setup();
  fetch.mockResolvedValue(new Response("provider secret details",{status:429}));
  const response=await handler(request());
  expect(response.status).toBe(429);
  expect(await response.text()).not.toContain("provider secret details");
});
it.each([[402,"paid plan"],[401,"permissions"],[403,"permissions"]])("explains provider configuration failure %s without exposing details",async(status,message)=>{
  const {handler,fetch,request,store}=setup();
  fetch.mockResolvedValue(new Response("private provider details",{status:Number(status)}));
  const response=await handler(request());
  const body=await response.text();
  expect(response.status).toBe(502);
  expect(body).toContain(message);
  expect(body).not.toContain("private provider details");
  expect(store.fail).toHaveBeenCalled();
  expect(store.save).not.toHaveBeenCalled();
});

it("serves saved audio without calling ElevenLabs",async()=>{
  const {handler,fetch,request,store}=setup();
  store.reserve.mockResolvedValue({status:"ready",path:"private-recording.json"});
  const response=await handler(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({audio_base64:"saved"});
  expect(fetch).not.toHaveBeenCalled();
});
it.each([['pending',409],['limited',429]] as const)("does not generate when reservation is %s",async(status,code)=>{
  const {handler,fetch,request,store}=setup();store.reserve.mockResolvedValue({status});
  expect((await handler(request())).status).toBe(code);
  expect(fetch).not.toHaveBeenCalled();
});
it("persists audio and timing before reporting success",async()=>{
  const {handler,request,store}=setup();
  expect((await handler(request())).status).toBe(200);
  expect(store.save).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/),"lease-id",expect.objectContaining({audio_base64:"YXVkaW8="}));
});
it("uses a different cache entry when text or voice changes",async()=>{
  const first=setup();await first.handler(first.request());
  const second=setup({ELEVENLABS_VOICE_ID:"other-voice"});await second.handler(second.request());
  expect(first.store.reserve.mock.calls[0][0]).not.toBe(second.store.reserve.mock.calls[0][0]);
  await first.handler(first.request({text:"Changed sentence."}));
  expect(first.store.reserve.mock.calls[0][0]).not.toBe(first.store.reserve.mock.calls[1][0]);
});

it("does not persist misaligned recordings and releases the failed lease",async()=>{
  const {handler,fetch,request,store}=setup();
  fetch.mockResolvedValue(new Response(JSON.stringify({audio_base64:'invalid',alignment:{characters:['wrong']}})));
  expect((await handler(request())).status).toBe(503);
  expect(store.save).not.toHaveBeenCalled();expect(store.fail).toHaveBeenCalled();
});

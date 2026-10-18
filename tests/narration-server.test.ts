import {expect,it,vi} from "vitest";
import {createNarrationHandler} from "../supabase/functions/read-aloud/handler";

function setup(overrides:Record<string,string|undefined>={}){
  const config:Record<string,string|undefined>={ELEVENLABS_API_KEY:"test-secret",ELEVENLABS_VOICE_ID:"voice-id",ELEVENLABS_TRIAL_USER_IDS:"teacher-id",...overrides};
  const authenticate=vi.fn(async()=>({id:"teacher-id",confirmed:true}));
  const fetch=vi.fn(async()=>new Response(JSON.stringify({audio_base64:"YXVkaW8=",alignment:{characters:["H"],character_start_times_seconds:[0],character_end_times_seconds:[0.1]}})));
  const handler=createNarrationHandler({env:name=>config[name],authenticate,fetch});
  const request=(body:unknown={text:"Hello"},token="valid")=>new Request("https://example.test/read-aloud",{
    method:"POST",headers:token?{Authorization:`Bearer ${token}`}:{},body:JSON.stringify(body),
  });
  return {handler,authenticate,fetch,request};
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

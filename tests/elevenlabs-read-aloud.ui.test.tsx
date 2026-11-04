// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {ElevenLabsReadAloud} from "../src/components/ElevenLabsReadAloud";
import {ReadAloud} from "../src/components/ReadAloud";
import {requestPublishedNarration,requestPreviewNarration,timedWords,type PublishedNarration} from "../src/lib/narration";

vi.mock("../src/lib/narration",async importOriginal=>({...await importOriginal<object>(),requestPublishedNarration:vi.fn(),requestPreviewNarration:vi.fn()}));
vi.mock("../src/lib/supabase",()=>({supabase:null}));
const parts=[{text:"Hello",index:0},{text:" ",index:1},{text:"readers.",index:2}];
function recording(text="Hello readers."):PublishedNarration {
  const characters=Array.from(text);
  return {parts,audio_base64:btoa("mock audio"),alignment:{characters,character_start_times_seconds:characters.map((_,i)=>i/10),character_end_times_seconds:characters.map((_,i)=>(i+1)/10)}};
}
class FakeAudio {
  static instances:FakeAudio[]=[];
  currentTime=0;playbackRate=1;preservesPitch=false;
  onended:(()=>void)|null=null;onerror:(()=>void)|null=null;onpause:(()=>void)|null=null;onplaying:(()=>void)|null=null;
  play=vi.fn(async()=>{this.onplaying?.();});
  pause=vi.fn(()=>{this.onpause?.();});
  load=vi.fn();removeAttribute=vi.fn();
  constructor(){FakeAudio.instances.push(this);}
}
let tick:FrameRequestCallback;
beforeEach(()=>{
  FakeAudio.instances=[];
  vi.stubGlobal("Audio",FakeAudio);
  vi.stubGlobal("requestAnimationFrame",vi.fn(callback=>{tick=callback;return 1;}));
  vi.stubGlobal("cancelAnimationFrame",vi.fn());
  vi.stubGlobal("URL",class extends URL {static createObjectURL=vi.fn(()=>"blob:test");static revokeObjectURL=vi.fn();});
  vi.mocked(requestPublishedNarration).mockReset().mockResolvedValue(recording());
  vi.mocked(requestPreviewNarration).mockReset().mockResolvedValue(recording());
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it("tracks audio time, pauses, changes speed without regenerating, and clears on end",async()=>{
  const onWord=vi.fn();render(<ElevenLabsReadAloud assignmentId="assignment" parts={parts} onWord={onWord}/>);
  fireEvent.click(screen.getByRole("button",{name:"Read aloud"}));
  await screen.findByRole("button",{name:"Pause reading"});
  const audio=FakeAudio.instances[0];
  act(()=>{audio.currentTime=0.7;tick(0);});
  expect(onWord).toHaveBeenLastCalledWith(2);
  fireEvent.click(screen.getByRole("button",{name:"Pause reading"}));
  fireEvent.change(screen.getByLabelText("Reading speed"),{target:{value:"1.5"}});
  expect(audio.playbackRate).toBe(1.5);
  expect(audio.preservesPitch).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"Resume reading"}));
  await screen.findByRole("button",{name:"Pause reading"});
  expect(requestPublishedNarration).toHaveBeenCalledOnce();
  act(()=>audio.onended?.());
  expect(onWord).toHaveBeenLastCalledWith(null);
  expect(audio.currentTime).toBe(0);
});
it("reuses the recording when replaying the same text",async()=>{
  render(<ElevenLabsReadAloud assignmentId="assignment" parts={parts}/>);
  fireEvent.click(screen.getByRole("button",{name:"Read aloud"}));
  await screen.findByRole("button",{name:"Pause reading"});
  fireEvent.click(screen.getByRole("button",{name:"Stop reading"}));
  fireEvent.click(screen.getByRole("button",{name:"Read aloud"}));
  await screen.findByRole("button",{name:"Pause reading"});
  expect(requestPublishedNarration).toHaveBeenCalledOnce();
});
it("cancels loading and ignores late responses after stopping",async()=>{
  let resolve!:(value:PublishedNarration)=>void;
  vi.mocked(requestPublishedNarration).mockReturnValue(new Promise(done=>{resolve=done;}));
  render(<ElevenLabsReadAloud assignmentId="assignment" parts={parts}/>);
  fireEvent.click(screen.getByRole("button",{name:"Read aloud"}));
  const signal=vi.mocked(requestPublishedNarration).mock.calls[0][1];
  fireEvent.click(screen.getByRole("button",{name:"Stop reading"}));
  await act(async()=>resolve(recording()));
  expect(signal.aborted).toBe(true);
  expect(FakeAudio.instances).toHaveLength(0);
});
it("stops and releases audio on unmount",async()=>{
  const {unmount}=render(<ElevenLabsReadAloud assignmentId="assignment" parts={parts}/>);
  fireEvent.click(screen.getByRole("button",{name:"Read aloud"}));
  await screen.findByRole("button",{name:"Pause reading"});
  unmount();expect(FakeAudio.instances[0].pause).toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalled();
});
it("shows service errors and keeps browser fallback selectable",async()=>{
  vi.stubEnv("VITE_ELEVENLABS_TRIAL","true");
  vi.mocked(requestPublishedNarration).mockRejectedValue(new Error("The trial is awaiting setup."));
  render(<ReadAloud assignmentId="assignment" parts={parts}/>);
  fireEvent.click(screen.getByRole("button",{name:"Read aloud"}));
  expect((await screen.findByRole("alert")).textContent).toContain("awaiting setup");
  expect(screen.queryByLabelText("Narrator")).toBeNull();
});

it("maps Unicode character offsets and refuses misaligned or invalid timestamps",()=>{
  const unicode=[{text:"👋",index:0},{text:" Hello",index:1}];
  expect(timedWords(unicode,recording("👋 Hello").alignment)).toEqual([{index:0,start:0,end:0.1},{index:1,start:0.2,end:0.7}]);
  expect(()=>timedWords(parts,recording("different").alignment)).toThrow(/matched/);
  const broken=recording();broken.alignment.character_start_times_seconds[0]=-1;
  expect(()=>timedWords(parts,broken.alignment)).toThrow(/timings/);
});


it("seeks to a sentence and arbitrary time using the same complete recording",async()=>{
 const sentenceParts=[{text:'Hello.',index:0},{text:' ',index:1},{text:'Welcome.',index:2}];
 vi.mocked(requestPublishedNarration).mockResolvedValue({...recording('Hello. Welcome.'),parts:sentenceParts});
 render(<ElevenLabsReadAloud assignmentId="assignment" parts={sentenceParts}/>);
 fireEvent.click(screen.getByRole('button',{name:'Read aloud'}));await screen.findByRole('button',{name:'Pause reading'});
 fireEvent.change(screen.getByLabelText('Play a sentence'),{target:{value:'1'}});
 await act(async()=>{});
 expect(FakeAudio.instances[0].currentTime).toBe(0.7);
 act(()=>{FakeAudio.instances[0].currentTime=1.7;tick(0);});
 expect(screen.getByRole('button',{name:'Resume reading'})).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Recording position'),{target:{value:'0.3'}});await act(async()=>{});
 expect(FakeAudio.instances[0].currentTime).toBe(0.3);
 expect(requestPublishedNarration).toHaveBeenCalledOnce();
 expect(requestPublishedNarration).toHaveBeenCalledWith('assignment',expect.any(AbortSignal));
});
it("plays a corrected sentence from its saved clip and reuses it on replay",async()=>{
 const corrections=[{sentenceStart:0,answers:{2:"readers"}}];
 const {rerender}=render(<ElevenLabsReadAloud assignmentId="assignment" parts={parts}/>);
 fireEvent.click(screen.getByRole('button',{name:'Read aloud'}));await screen.findByRole('button',{name:'Pause reading'});
 rerender(<ElevenLabsReadAloud assignmentId="assignment" parts={parts} corrections={corrections} sentence={{parts:[{text:'readers.',index:2}],requestId:1}}/>);
 await act(async()=>{});expect(FakeAudio.instances[1].currentTime).toBe(0.6);expect(requestPreviewNarration).toHaveBeenCalledOnce();
 expect(vi.mocked(requestPreviewNarration).mock.calls[0][0]).toEqual({action:"corrected",assignmentId:"assignment",content:undefined,sentenceStart:0,answers:{2:"readers"}});
 fireEvent.click(screen.getByRole("button",{name:"Re-read sentence"}));await act(async()=>{});
 expect(requestPreviewNarration).toHaveBeenCalledOnce();
 expect(requestPublishedNarration).toHaveBeenCalledOnce();
});
function clipFor(text:string,index:number):PublishedNarration {
  const characters=Array.from(text);
  return {parts:[{text,index}],audio_base64:btoa("clip"),alignment:{characters,character_start_times_seconds:characters.map((_,i)=>i/10),character_end_times_seconds:characters.map((_,i)=>(i+1)/10)}};
}
it("starts reading from a selected word in the saved recording",async()=>{
  const onWord=vi.fn();
  render(<ElevenLabsReadAloud assignmentId="assignment" parts={parts} onWord={onWord} listenFrom={{index:2,requestId:1}}/>);
  await screen.findByRole("button",{name:"Pause reading"});
  expect(FakeAudio.instances[0].currentTime).toBe(0.6);
  act(()=>{tick(0);});expect(onWord).toHaveBeenLastCalledWith(2);
  expect(requestPublishedNarration).toHaveBeenCalledOnce();
});
it("plays the full recording and saved corrected clip as one continuous passage",async()=>{
  vi.mocked(requestPreviewNarration).mockResolvedValue(clipFor("readers.",2));
  const onWord=vi.fn();
  render(<ElevenLabsReadAloud assignmentId="assignment" parts={parts} onWord={onWord} corrections={[{sentenceStart:0,answers:{2:"readers"}}]}/>);
  fireEvent.click(screen.getByRole("button",{name:"Read aloud"}));
  await screen.findByRole("button",{name:"Pause reading"});
  const [passage,corrected]=FakeAudio.instances as (FakeAudio&{volume:number})[];
  act(()=>{passage.currentTime=0.54;tick(0);});
  expect(passage.volume).toBeCloseTo(0.25,5); // fading out toward the join
  await act(async()=>{passage.currentTime=0.55;tick(0);});
  expect(passage.pause).toHaveBeenCalled();
  expect(corrected.play).toHaveBeenCalled();expect(corrected.currentTime).toBe(0);
  act(()=>{corrected.currentTime=0.3;tick(0);});expect(onWord).toHaveBeenLastCalledWith(2);
  act(()=>{corrected.currentTime=1.0;tick(0);});
  expect(onWord).toHaveBeenLastCalledWith(null);
  expect(screen.getByRole("button",{name:"Read aloud"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Read aloud"}));await screen.findByRole("button",{name:"Pause reading"});
  expect(requestPublishedNarration).toHaveBeenCalledOnce();expect(requestPreviewNarration).toHaveBeenCalledOnce();
});
it("falls back to the full recording when a corrected clip is unavailable",async()=>{
  vi.mocked(requestPreviewNarration).mockRejectedValue(new Error("limit reached"));
  render(<ElevenLabsReadAloud assignmentId="assignment" parts={parts} corrections={[{sentenceStart:0,answers:{2:"readers"}}]}/>);
  fireEvent.click(screen.getByRole("button",{name:"Read aloud"}));
  await screen.findByRole("button",{name:"Pause reading"});
  expect(FakeAudio.instances).toHaveLength(1);
  expect(screen.queryByRole("alert")).toBeNull();
});

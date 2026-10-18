// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {ReadAloud,speechChunks} from "../src/components/ReadAloud";
import {ExercisePlayer} from "../src/components/ExercisePlayer";
import {type ExerciseContent} from "../src/lib/exercises";

afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function speechMock(){
  const queued:SpeechSynthesisUtterance[]=[];
  const synth={getVoices:vi.fn(()=>[] as SpeechSynthesisVoice[]),addEventListener:vi.fn(),removeEventListener:vi.fn(),speak:vi.fn(u=>queued.push(u)),cancel:vi.fn(),pause:vi.fn(),resume:vi.fn()};
  vi.stubGlobal("speechSynthesis",synth);
  vi.stubGlobal("SpeechSynthesisUtterance",class {text:string;constructor(text:string){this.text=text;}});
  return {synth,queued};
}
it("reads, pauses, resumes and cancels speech when leaving the passage",()=>{
  const {synth,queued}=speechMock();const onWord=vi.fn();
  const {unmount}=render(<ReadAloud parts={[{text:"Hello readers.",index:2}]} onWord={onWord}/>);
  fireEvent.click(screen.getByRole("button",{name:"Read aloud"}));
  expect(queued[0].text).toBe("Hello readers.");
  act(()=>queued[0].onstart?.({} as SpeechSynthesisEvent));
  expect(onWord).toHaveBeenLastCalledWith(2);
  fireEvent.click(screen.getByRole("button",{name:"Pause reading"}));expect(synth.pause).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Resume reading"}));expect(synth.resume).toHaveBeenCalled();
  unmount();expect(synth.cancel).toHaveBeenCalled();
});
const endingContent:ExerciseContent={title:"Missing endings",passage:"The dogs were watching carefully while the children played together.",strategy:"endings",mode:"type",targetWords:["watching"],vocabulary:{}};
it("reads truncated endings in context and tracks them without selecting them",()=>{
  const {queued}=speechMock();
  render(<ExercisePlayer content={endingContent}/>);
  const word=screen.getByRole("button",{name:/Challenge 1/});
  expect(word.classList.contains("missing-ending")).toBe(true);
  expect(word.getAttribute("aria-pressed")).toBe("false");
  expect(screen.queryByLabelText(/Original word/)).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Read aloud"}));
  expect(queued[0].text).toBe(endingContent.passage.replace("watching","watch"));
  expect(queued).toHaveLength(1);
  act(()=>queued[0].onboundary?.({name:"word",charIndex:queued[0].text.indexOf("watch")} as SpeechSynthesisEvent));
  expect(word.classList.contains("is-spoken")).toBe(true);
  fireEvent.click(word);
  expect(word.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByLabelText(/Original word/)).toBeTruthy();
});
it("flips one entire sentence per paragraph, then restores a sentence when its words are solved",async()=>{
  const source={...endingContent,strategy:"upside" as const,passage:'Dogs play. Children enjoy reading together.\n\nBirds sing. People walk outside.',targetWords:[]};
  const {container}=render(<ExercisePlayer content={source}/>);
  expect([...container.querySelectorAll(".sentence-upside")].map(node=>node.textContent)).toEqual(["Dogs play.","Birds sing."]);
  expect(container.querySelector(".word-upside")).toBeNull();
  expect(screen.queryByLabelText(/Original word/)).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Challenge 1: Dogs"}));
  fireEvent.change(screen.getByLabelText(/Original word/),{target:{value:"dogs"}});
  fireEvent.click(screen.getByRole("button",{name:"Check answer"}));
  await screen.findByText(/Correct, you got it!/);
  expect(container.querySelectorAll(".sentence-upside")).toHaveLength(2);
  expect(screen.queryByRole("button",{name:/Next unsolved/})).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Challenge 2: play"}));
  fireEvent.change(screen.getByLabelText(/Original word/),{target:{value:"play"}});
  fireEvent.click(screen.getByRole("button",{name:"Check answer"}));
  await screen.findByText(/Correct, you got it!/);
  expect(container.querySelectorAll(".sentence-upside")).toHaveLength(1);
  expect(container.querySelector(".restored-sentence")?.textContent).toBe("Dogs play.");
  expect(Array.from(container.querySelectorAll(".practice-paragraph p"), paragraph=>paragraph.textContent).join("\n\n")).toBe(source.passage);
});
it("preserves existing word-level upside-down assignments and saved work",async()=>{
  const source={...endingContent,strategy:"upside" as const,passage:'The dogs were watching carefully. "Children" played together outside.',challenges:[{index:10,word:"children",shown:"children",effect:"upside" as const}]};
  const {container}=render(<ExercisePlayer content={source}/>);
  expect(container.querySelector(".word-upside")?.textContent).toBe("children");
  expect(container.querySelector(".sentence-upside")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:/Challenge 1/}));
  fireEvent.change(screen.getByLabelText(/Original word/),{target:{value:"children"}});
  fireEvent.click(screen.getByRole("button",{name:"Check answer"}));
  await screen.findByText(/Correct, you got it!/);
  expect(container.querySelector(".word-upside")).toBeNull();
  expect(Array.from(container.querySelectorAll(".practice-paragraph p"), paragraph=>paragraph.textContent).join("\n\n")).toBe(source.passage);
});
it("offers a count hint and keeps all puzzle words unselected at the start",()=>{
  const {container}=render(<ExercisePlayer content={{...endingContent,strategy:"scramble",targetWords:["watching","children"]}}/>);
  expect(container.querySelector(".is-selected")).toBeNull();
  expect(screen.queryByLabelText(/Original word/)).toBeNull();
  expect(screen.getAllByRole("button",{name:/Challenge/}).every(word=>word.getAttribute("aria-pressed")==="false")).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"How many puzzle words?"}));
  expect(screen.getByText("There are 2 puzzle words in this practice.")).toBeTruthy();
});
it("automatically re-reads the original sentence after saving a correct answer",async()=>{
  const {queued}=speechMock();
  const save=vi.fn().mockResolvedValue(undefined);
  render(<ExercisePlayer content={{...endingContent,strategy:"scramble"}} onSave={save}/>);
  fireEvent.click(screen.getByRole("button",{name:/Challenge 1/}));
  fireEvent.change(screen.getByLabelText(/Original word/),{target:{value:"watching"}});
  fireEvent.click(screen.getByRole("button",{name:"Check answer"}));
  await screen.findByText(/Correct, you got it!/);
  expect(save).toHaveBeenCalled();
  await waitFor(()=>expect(queued).toHaveLength(1));
  expect(queued[0].text).toBe(endingContent.passage);
  expect(screen.getByRole("button",{name:/Solved word: watching/}).getAttribute("aria-pressed")).toBe("true");
  expect(screen.queryByRole("button",{name:/Next unsolved/})).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Re-read sentence"}));
  expect(queued[1].text).toBe(endingContent.passage);
});
it("does not read a corrected sentence when saving the answer fails",async()=>{
  const {synth}=speechMock();
  render(<ExercisePlayer content={{...endingContent,strategy:"scramble"}} onSave={vi.fn().mockRejectedValue(new Error("offline"))}/>);
  fireEvent.click(screen.getByRole("button",{name:/Challenge 1/}));
  fireEvent.change(screen.getByLabelText(/Original word/),{target:{value:"watching"}});
  fireEvent.click(screen.getByRole("button",{name:"Check answer"}));
  await screen.findByRole("alert");
  expect(synth.speak).not.toHaveBeenCalled();
  expect(screen.queryByText(/Correct, you got it!/)).toBeNull();
});
it("keeps truncated words in context without artificial pauses",()=>{
  expect(speechChunks([{text:"They were ",index:0},{text:"watch",index:4},{text:" together.",index:6}]).map(c=>c.text)).toEqual(["They were watch together."]);
});

it("tracks ordinary words as well as puzzle words across the full passage",()=>{
  const {queued}=speechMock();
  const passage="Children explore gardens. Birds sing.\n\nPeople enjoy stories. Frogs jump.";
  const {container}=render(<ExercisePlayer content={{...endingContent,passage,strategy:"upside",targetWords:[]}}/>);
  expect(container.querySelector(".is-spoken")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Read aloud"}));
  const reading=queued[0];
  for(const text of ["Children","explore","Birds","People","stories","Frogs"]){
    act(()=>reading.onboundary?.({charIndex:reading.text.indexOf(text)} as SpeechSynthesisEvent));
    const highlighted=container.querySelectorAll(".reading-passage .is-spoken");
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].textContent?.replace(/[.!?]/g,"")).toBe(text);
  }
  fireEvent.click(screen.getByRole("button",{name:"Stop reading"}));
  expect(container.querySelector(".is-spoken")).toBeNull();
});

it.each([0.6,1,1.5])("uses reading speed %s on the actual speech utterance",rate=>{
  const {queued}=speechMock();
  render(<ReadAloud parts={[{text:"Hello readers.",index:0}]}/>);
  fireEvent.change(screen.getByLabelText("Reading speed"),{target:{value:String(rate)}});
  fireEvent.click(screen.getByRole("button",{name:"Read aloud"}));
  expect(queued[0].rate).toBe(rate);
});

it("immediately applies a new speed from the current word and ignores cancelled speech events",()=>{
  const {synth,queued}=speechMock();const onWord=vi.fn();
  render(<ReadAloud parts={[{text:"Hello",index:0},{text:" ",index:1},{text:"readers.",index:2}]} onWord={onWord}/>);
  fireEvent.click(screen.getByRole("button",{name:"Read aloud"}));
  act(()=>queued[0].onboundary?.({charIndex:6} as SpeechSynthesisEvent));
  fireEvent.change(screen.getByLabelText("Reading speed"),{target:{value:"1.5"}});
  expect(synth.cancel).toHaveBeenCalledOnce();
  expect(queued[1].text).toBe("readers.");
  expect(queued[1].rate).toBe(1.5);
  act(()=>queued[1].onstart?.({} as SpeechSynthesisEvent));
  expect(onWord).toHaveBeenLastCalledWith(2);
  act(()=>queued[0].onboundary?.({charIndex:0} as SpeechSynthesisEvent));
  act(()=>queued[0].onend?.({} as SpeechSynthesisEvent));
  expect(onWord).toHaveBeenLastCalledWith(2);
  expect(queued).toHaveLength(2);
});

it("keeps reading paused when changing speed and applies that speed on resume",()=>{
  const {queued}=speechMock();
  render(<ReadAloud parts={[{text:"Hello",index:0},{text:" ",index:1},{text:"readers.",index:2}]}/>);
  fireEvent.click(screen.getByRole("button",{name:"Read aloud"}));
  act(()=>queued[0].onboundary?.({charIndex:6} as SpeechSynthesisEvent));
  fireEvent.click(screen.getByRole("button",{name:"Pause reading"}));
  fireEvent.change(screen.getByLabelText("Reading speed"),{target:{value:"0.6"}});
  expect(queued).toHaveLength(1);
  fireEvent.click(screen.getByRole("button",{name:"Resume reading"}));
  expect(queued[1].rate).toBe(0.6);
  expect(queued[1].text).toBe("readers.");
});

it("uses the latest speed for later chunks and corrected-sentence playback",()=>{
  const {queued}=speechMock();
  const parts=[{text:"They were ",index:0},{text:"watch",index:4},{text:" together.",index:6}];
  const {rerender}=render(<ReadAloud parts={parts}/>);
  fireEvent.click(screen.getByRole("button",{name:"Read aloud"}));
  fireEvent.change(screen.getByLabelText("Reading speed"),{target:{value:"1.5"}});
  expect(queued[1].text).toBe("They were watch together.");
  expect(queued[1].rate).toBe(1.5);
  rerender(<ReadAloud parts={parts} sentence={{parts:[{text:"They were watching together.",index:0}],requestId:1}}/>);
  expect(queued[2].text).toBe("They were watching together.");
  expect(queued[2].rate).toBe(1.5);
});

it("loads voices asynchronously, prefers natural voices and allows personal choice",()=>{
  const {synth,queued}=speechMock();
  const basic={name:"Basic",lang:"en-US",voiceURI:"basic",default:true} as SpeechSynthesisVoice;
  const natural={name:"English Natural",lang:"en-US",voiceURI:"natural",default:false} as SpeechSynthesisVoice;
  const {unmount}=render(<ReadAloud parts={[{text:"Hello readers.",index:0}]}/>);
  synth.getVoices.mockReturnValue([basic,natural]);
  act(()=>{const listener=synth.addEventListener.mock.calls[0][1] as ()=>void;listener();});
  fireEvent.click(screen.getByRole("button",{name:"Read aloud"}));
  expect(queued[0].voice).toBe(natural);
  expect(queued[0].pitch).toBe(1);
  fireEvent.change(screen.getByLabelText("Reading voice"),{target:{value:"basic"}});
  expect(synth.cancel).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Read aloud"}));
  expect(queued[1].voice).toBe(basic);
  unmount();
  expect(synth.removeEventListener).toHaveBeenCalledWith("voiceschanged",synth.addEventListener.mock.calls[0][1]);
});


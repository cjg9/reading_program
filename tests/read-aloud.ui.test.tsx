// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {ReadAloud,speechChunks} from "../src/components/ReadAloud";
import {ExercisePlayer} from "../src/components/ExercisePlayer";
import {buildChallenges,type ExerciseContent} from "../src/lib/exercises";

afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function speechMock(){
  const queued:SpeechSynthesisUtterance[]=[];
  const synth={speak:vi.fn(u=>queued.push(u)),cancel:vi.fn(),pause:vi.fn(),resume:vi.fn()};
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
it("leaves endings unselected, reads their truncated form and reveals them as speech starts",()=>{
  const {queued}=speechMock();
  render(<ExercisePlayer content={endingContent}/>);
  const word=screen.getByRole("button",{name:/Challenge 1/});
  expect(word.classList.contains("missing-ending")).toBe(true);
  expect(word.getAttribute("aria-pressed")).toBe("false");
  expect(screen.queryByLabelText(/Original word/)).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Read aloud"}));
  act(()=>queued[0].onend?.({} as SpeechSynthesisEvent));
  expect(queued[1].text).toBe("watch");
  act(()=>queued[1].onstart?.({} as SpeechSynthesisEvent));
  expect(word.classList.contains("is-spoken")).toBe(true);
  fireEvent.click(word);
  expect(word.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByLabelText(/Original word/)).toBeTruthy();
});
it.each(["upside","mixed"] as const)("rotates only the saved target word in %s and restores it after a correct answer",async(strategy)=>{
  const source={...endingContent,strategy:"upside" as const,passage:'The dogs were watching carefully. "Children" played together outside.',sentenceNumbers:[2],targetWords:["children"]};
  const challenges=buildChallenges(source);
  const content={...source,strategy,challenges};
  const {container}=render(<ExercisePlayer content={content}/>);
  const rotated=container.querySelectorAll(".word-upside");
  expect(rotated).toHaveLength(1);
  expect(rotated[0].textContent).toBe("children");
  expect(rotated[0].parentElement?.tagName).toBe("BUTTON");
  expect(container.querySelector(".sentence-upside")).toBeNull();
  expect(container.querySelector(".reading-passage")?.textContent).toBe(source.passage.replace("Children","children"));
  expect(screen.getByLabelText(/Original word/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText(/Original word/),{target:{value:"children"}});
  fireEvent.click(screen.getByRole("button",{name:"Check answer"}));
  await screen.findByText(/You found it/);
  expect(container.querySelector(".word-upside")).toBeNull();
  expect(container.querySelector(".reading-passage")?.textContent).toBe(source.passage);
});
it("isolates truncated words so highlighting works without browser word-boundary events",()=>{
  expect(speechChunks([{text:"They were ",index:0},{text:"watch",index:4,isolate:true},{text:" together.",index:6}]).map(c=>c.text)).toEqual(["They were ","watch"," together."]);
});

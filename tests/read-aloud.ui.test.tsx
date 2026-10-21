// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {ExercisePlayer} from "../src/components/ExercisePlayer";
import {ReadAloud} from "../src/components/ReadAloud";
import type {ReadAloudProps} from "../src/components/ReadAloud";
import type {ExerciseContent} from "../src/lib/exercises";
let latest:ReadAloudProps;
vi.mock("../src/components/ElevenLabsReadAloud",()=>({ElevenLabsReadAloud:(props:ReadAloudProps)=>{latest=props;return <div>New narrator</div>;}}));
afterEach(cleanup);
it("uses the new narrator for previews without an assignment or browser voice selector",()=>{
 render(<ReadAloud parts={[]}/>);
 expect(screen.getByText("New narrator")).toBeTruthy();
 expect(screen.queryByLabelText("Reading voice")).toBeNull();
 expect(screen.queryByLabelText("Narrator")).toBeNull();
});
const content:ExerciseContent={title:"Practice",passage:"Dogs enjoy playing together.",strategy:"missing",mode:"type",targetWords:[],vocabulary:{},challenges:[{index:2,word:"enjoy",shown:"_____",effect:"missing"},{index:4,word:"playing",shown:"_______",effect:"missing"}]};
it("requests automatic sentence playback after saving a correct answer and sends only solved answers",async()=>{
 const save=vi.fn(async()=>{});render(<ExercisePlayer content={content} assignmentId="assignment" onSave={save}/>);
 fireEvent.click(screen.getByRole("button",{name:"Challenge 1: missing word"}));
 fireEvent.change(screen.getByLabelText(/Original word for challenge/i),{target:{value:"enjoy"}});
 fireEvent.click(screen.getByRole("button",{name:/Check answer/i}));
 await waitFor(()=>expect(latest.sentence).toBeDefined());
 expect(save).toHaveBeenCalledOnce();expect(latest.answers).toEqual({2:"enjoy"});
 expect(latest.sentence?.parts[0].index).toBe(0);
 expect(latest.content?.challenges).toHaveLength(2);
});

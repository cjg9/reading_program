// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {ExercisePlayer} from "../src/components/ExercisePlayer";
import {TeacherExercises} from "../src/components/TeacherExercises";
import {StudentExercises} from "../src/components/StudentExercises";
import {exercisePresets} from "../src/lib/exercise-presets";
import {buildChallenges,type ExerciseContent} from "../src/lib/exercises";

afterEach(cleanup);
const content:ExerciseContent={...exercisePresets[0].content,targetWords:["chaos"]};
const challenge=buildChallenges(content)[0];
it("checks original words, saves incorrect answers and hints, and finishes only after solving",async()=>{
  const save=vi.fn().mockResolvedValue(undefined);
  render(<ExercisePlayer content={content} onSave={save}/>);
  expect(screen.getByRole("button",{name:"Finish exercise"})).toHaveProperty("disabled",true);
  fireEvent.change(screen.getByLabelText(/Original word/),{target:{value:"wrong"}});
  fireEvent.click(screen.getByRole("button",{name:"Check answer"}));
  await screen.findByText(/Not quite yet/);
  expect(save).toHaveBeenLastCalledWith({answers:{[challenge.index]:"wrong"},hints:[]},false);
  fireEvent.click(screen.getByRole("button",{name:"Hint",exact:true}));
  await screen.findByText(/Starts with/);
  fireEvent.change(screen.getByLabelText(/Original word/),{target:{value:"CHAOS"}});
  fireEvent.click(screen.getByRole("button",{name:"Check answer"}));
  await screen.findByText(/You found it/);
  fireEvent.click(screen.getByRole("button",{name:"Finish exercise"}));
  await screen.findByText(/Quest complete/);
  expect(save).toHaveBeenLastCalledWith({answers:{[challenge.index]:"chaos"},hints:[challenge.index]},true);
});
it("restores saved answers and hints",()=>{
  render(<ExercisePlayer content={content} initialProgress={{answers:{[challenge.index]:"wrong"},hints:[challenge.index]}}/>);
  expect(screen.getByLabelText(/Original word/)).toHaveProperty("value","wrong");
  expect(screen.getByText(/Starts with/)).toBeTruthy();
});
it("keeps an answer available for retry after a failed save",async()=>{
  const save=vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  render(<ExercisePlayer content={content} onSave={save}/>);
  fireEvent.change(screen.getByLabelText(/Original word/),{target:{value:"chaos"}});
  fireEvent.click(screen.getByRole("button",{name:"Check answer"}));
  await screen.findByRole("alert");
  expect(screen.getByLabelText(/Original word/)).toHaveProperty("value","chaos");
  expect(screen.getByRole("button",{name:"Finish exercise"})).toHaveProperty("disabled",true);
  fireEvent.click(screen.getByRole("button",{name:"Check answer"}));
  await screen.findByText(/You found it/);
});
function query(data:unknown){const q={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),is:vi.fn().mockReturnThis(),in:vi.fn().mockResolvedValue({data,error:null}),order:vi.fn().mockResolvedValue({data,error:null})};return q;}
it("lets a teacher customize, save and assign a library exercise to the selected class",async()=>{
  const rpc=vi.fn().mockImplementation((name:string)=>Promise.resolve({data:name==="class_roster_named"?[]:"saved-id",error:null}));
  const client={rpc,from:(name:string)=>query(name==="reading_exercises"?[{id:"preset-id",teacher_id:null,preset_key:"dogs",content}]:[])} as unknown as SupabaseClient;
  render(<TeacherExercises client={client} classId={42}/>);
  await screen.findByText(/No exercises assigned yet/);
  fireEvent.click(screen.getByRole("button",{name:"Exercise library"}));
  fireEvent.click(screen.getByRole("button",{name:"Assign to class"}));
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith("assign_reading_exercise",{p_class_id:42,p_exercise_id:"preset-id"}));
  await screen.findByText(/is assigned to this class/);
  fireEvent.click(screen.getByRole("button",{name:"Customize"}));
  fireEvent.change(screen.getByLabelText("Title",{exact:true}),{target:{value:"My dog game"}});
  fireEvent.click(screen.getByRole("button",{name:"Save exercise"}));
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith("save_reading_exercise",{p_exercise_id:null,p_content:expect.objectContaining({title:"My dog game",challenges:expect.any(Array)})}));
});
it("loads student progress and sends saved work only for the selected assignment",async()=>{
  const rpc=vi.fn().mockResolvedValue({data:null,error:null});
  const record={assignment_id:"assignment",student_id:"student",progress:{answers:{[challenge.index]:"wrong"},hints:[]},completed_at:null};
  const client={rpc,from:(name:string)=>query(name==="exercise_assignments"?[{id:"assignment",class_id:42,content,archived_at:null}]:[record])} as unknown as SupabaseClient;
  render(<StudentExercises client={client} classId={42} studentId="student"/>);
  fireEvent.click(await screen.findByRole("button",{name:"Continue exercise"}));
  expect(screen.getByLabelText(/Original word/)).toHaveProperty("value","wrong");
  fireEvent.change(screen.getByLabelText(/Original word/),{target:{value:"chaos"}});
  fireEvent.click(screen.getByRole("button",{name:"Check answer"}));
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith("save_exercise_progress",{p_assignment_id:"assignment",p_progress:{answers:{[challenge.index]:"chaos"},hints:[]},p_complete:false}));
});

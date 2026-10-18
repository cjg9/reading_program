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
it("edits a saved practice in place, retains failed edits, and resets to create mode",async()=>{
  const saved={id:"saved",teacher_id:"teacher",preset_key:null,content:exercisePresets[0].content};
  const rpc=vi.fn().mockResolvedValueOnce({error:{message:"offline"}}).mockImplementation((_name:string,args:{p_content:ExerciseContent})=>{
    saved.content=args.p_content;return Promise.resolve({data:"saved",error:null});
  });
  const client={rpc,from:()=>query([saved])} as unknown as SupabaseClient;
  render(<TeacherExercises client={client} classes={[]}/>);
  fireEvent.click(await screen.findByRole("button",{name:"Edit practice",exact:true}));
  fireEvent.change(screen.getByLabelText("Title",{exact:true}),{target:{value:"Revised practice"}});
  fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Title",{exact:true})).toHaveProperty("value","Revised practice");
  fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
  await screen.findByText(/Practice updated/);
  expect(rpc).toHaveBeenLastCalledWith("save_reading_exercise",{p_exercise_id:"saved",p_content:expect.objectContaining({title:"Revised practice",challenges:expect.any(Array)})});
  expect(screen.getAllByRole("button",{name:"Edit practice",exact:true})).toHaveLength(1);
  fireEvent.click(screen.getByRole("button",{name:"Create practice",exact:true}));
  expect(screen.getByLabelText("Title",{exact:true})).toHaveProperty("value","");
  expect(screen.getByRole("button",{name:"Save practice",exact:true})).toBeTruthy();
});
it("confirms deletion, supports cancellation, and retains a practice after a failed delete",async()=>{
  const saved={id:"saved",teacher_id:"teacher",preset_key:null,content:exercisePresets[0].content};
  const rpc=vi.fn().mockResolvedValueOnce({error:{message:"offline"}}).mockResolvedValue({error:null});
  const client={rpc,from:()=>query([saved])} as unknown as SupabaseClient;
  render(<TeacherExercises client={client} classes={[]}/>);
  fireEvent.click(await screen.findByRole("button",{name:"Delete practice",exact:true}));
  expect(rpc).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Cancel",exact:true}));
  expect(screen.queryByRole("button",{name:"Confirm delete"})).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Delete practice",exact:true}));
  fireEvent.click(screen.getByRole("button",{name:"Confirm delete"}));
  await screen.findByText("We could not delete this practice. Please try again.");
  expect(screen.getByRole("button",{name:"Delete practice",exact:true})).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Confirm delete"}));
  await screen.findByText(/deleted from your saved practices/);
  expect(rpc).toHaveBeenLastCalledWith("delete_reading_exercise",{p_exercise_id:"saved"});
  expect(screen.queryByRole("button",{name:"Delete practice",exact:true})).toBeNull();
});
const content:ExerciseContent={...exercisePresets[0].content,targetWords:["chaos"]};
const challenge=buildChallenges(content)[0];
it("checks original words, saves incorrect answers and hints, and finishes only after solving",async()=>{
  const save=vi.fn().mockResolvedValue(undefined);
  render(<ExercisePlayer content={content} onSave={save}/>);
  fireEvent.click(screen.getByRole("button",{name:/Challenge 1:/}));
  expect(screen.getByRole("button",{name:"Finish practice"})).toHaveProperty("disabled",true);
  fireEvent.change(screen.getByLabelText(/Original word/),{target:{value:"wrong"}});
  fireEvent.click(screen.getByRole("button",{name:"Check answer"}));
  await screen.findByText(/Not quite yet/);
  expect(save).toHaveBeenLastCalledWith({answers:{[challenge.index]:"wrong"},hints:[]},false);
  fireEvent.click(screen.getByRole("button",{name:"Hint",exact:true}));
  await screen.findByText(/Starts with/);
  fireEvent.change(screen.getByLabelText(/Original word/),{target:{value:"CHAOS"}});
  fireEvent.click(screen.getByRole("button",{name:"Check answer"}));
  await screen.findByText(/Correct, you got it!/);
  fireEvent.click(screen.getByRole("button",{name:"Finish practice"}));
  await screen.findByText(/Quest complete/);
  expect(save).toHaveBeenLastCalledWith({answers:{[challenge.index]:"chaos"},hints:[challenge.index]},true);
});
it("restores saved answers and hints",()=>{
  render(<ExercisePlayer content={content} initialProgress={{answers:{[challenge.index]:"wrong"},hints:[challenge.index]}}/>);
  fireEvent.click(screen.getByRole("button",{name:/Challenge 1:/}));
  expect(screen.getByLabelText(/Original word/)).toHaveProperty("value","wrong");
  expect(screen.getByText(/Starts with/)).toBeTruthy();
});
it("keeps an answer available for retry after a failed save",async()=>{
  const save=vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  render(<ExercisePlayer content={content} onSave={save}/>);
  fireEvent.click(screen.getByRole("button",{name:/Challenge 1:/}));
  fireEvent.change(screen.getByLabelText(/Original word/),{target:{value:"chaos"}});
  fireEvent.click(screen.getByRole("button",{name:"Check answer"}));
  await screen.findByRole("alert");
  expect(screen.getByLabelText(/Original word/)).toHaveProperty("value","chaos");
  expect(screen.getByRole("button",{name:"Finish practice"})).toHaveProperty("disabled",true);
  fireEvent.click(screen.getByRole("button",{name:"Check answer"}));
  await screen.findByText(/Correct, you got it!/);
});
const classrooms=[{id:42,teacher_id:"teacher",name:"English 6",created_at:"2026-10-01",last_accessed_at:"2026-10-01"},{id:43,teacher_id:"teacher",name:"English 7",created_at:"2026-10-01",last_accessed_at:"2026-10-01"}];
function query(data:unknown){const q={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),is:vi.fn().mockReturnThis(),in:vi.fn().mockReturnThis(),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(resolve),order:vi.fn().mockResolvedValue({data,error:null})};return q;}
it("lets a teacher customize, save and assign a library exercise across selected classrooms",async()=>{
  const library=[{id:"preset-id",teacher_id:null as string|null,preset_key:"dogs" as string|null,content}];
  const rpc=vi.fn().mockImplementation((name:string,args:{p_content?:ExerciseContent})=>{
    if(name==="save_reading_exercise")library.push({id:library.length===1?"saved-id":`saved-${library.length}`,teacher_id:"teacher",preset_key:null,content:args.p_content!});
    return Promise.resolve({data:name==="class_roster_named"?[]:"saved-id",error:null});
  });
  const client={rpc,from:(name:string)=>query(name==="reading_exercises"?library:[])} as unknown as SupabaseClient;
  render(<TeacherExercises client={client} classes={classrooms}/>);
  await screen.findByText(/No practices assigned yet/);
  fireEvent.click(screen.getByRole("button",{name:"Customize"}));
  expect(document.activeElement).toBe(screen.getByRole("form",{name:"Practice editor"}));
  fireEvent.change(screen.getByLabelText("Title",{exact:true}),{target:{value:"My dog game"}});
  fireEvent.click(screen.getByRole("button",{name:"Save practice"}));
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith("save_reading_exercise",{p_exercise_id:null,p_content:expect.objectContaining({title:"My dog game",challenges:expect.any(Array)})}));
  expect(await screen.findByRole("button",{name:"Assign to selected classes"})).toHaveProperty("disabled",true);
  fireEvent.click(screen.getByRole("checkbox",{name:"English 6"}));
  fireEvent.click(screen.getByRole("checkbox",{name:"English 7"}));
  fireEvent.click(screen.getByRole("button",{name:"Assign to selected classes"}));
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith("assign_reading_exercise",{p_class_id:42,p_exercise_id:"saved-id"}));
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith("assign_reading_exercise",{p_class_id:43,p_exercise_id:"saved-id"}));
  await screen.findByText(/assigned to 2 classes/);
  expect(screen.getAllByText("Original passage")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button",{name:"Customize a copy"}));
  fireEvent.change(screen.getByLabelText("Title",{exact:true}),{target:{value:"Another dog game"}});
  fireEvent.click(screen.getByRole("button",{name:"Save practice"}));
  await screen.findByText("Another dog game");
  expect(rpc.mock.calls.filter(([name])=>name==="save_reading_exercise").every(([,args])=>args.p_exercise_id===null)).toBe(true);
  expect(library[0].content).toEqual(content);
  expect(library[1].content.title).toBe("My dog game");
});
it("loads student progress and sends saved work only for the selected assignment",async()=>{
  const rpc=vi.fn().mockResolvedValue({data:null,error:null});
  const record={assignment_id:"assignment",student_id:"student",progress:{answers:{[challenge.index]:"wrong"},hints:[]},completed_at:null};
  const client={rpc,from:(name:string)=>query(name==="exercise_assignments"?[{id:"assignment",class_id:42,content,archived_at:null}]:[record])} as unknown as SupabaseClient;
  render(<StudentExercises client={client} classId={42} studentId="student"/>);
  fireEvent.click(await screen.findByRole("button",{name:"Continue practice"}));
  fireEvent.click(screen.getByRole("button",{name:/Challenge 1:/}));
  expect(screen.getByLabelText(/Original word/)).toHaveProperty("value","wrong");
  fireEvent.change(screen.getByLabelText(/Original word/),{target:{value:"chaos"}});
  fireEvent.click(screen.getByRole("button",{name:"Check answer"}));
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith("save_exercise_progress",{p_assignment_id:"assignment",p_progress:{answers:{[challenge.index]:"chaos"},hints:[]},p_complete:false}));
});

it("allows creating practices before a teacher has classrooms",async()=>{
  const rpc=vi.fn().mockResolvedValue({data:"saved",error:null});
  const client={rpc,from:()=>query([])} as unknown as SupabaseClient;
  render(<TeacherExercises client={client} classes={[]}/>);
  await screen.findByText(/You can create and save practices now/);
  fireEvent.click(screen.getByRole("button",{name:"Create practice"}));
  fireEvent.change(screen.getByLabelText("Title",{exact:true}),{target:{value:"Independent practice"}});
  fireEvent.change(screen.getByLabelText("Reading passage"),{target:{value:content.passage}});
  fireEvent.click(screen.getByRole("button",{name:"Save practice"}));
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith("save_reading_exercise",expect.objectContaining({p_content:expect.objectContaining({title:"Independent practice"})})));
  expect(rpc.mock.calls.some(([name])=>name==="class_roster_named"||name==="assign_reading_exercise")).toBe(false);
});

it("reports partial distribution failures while keeping successful assignments",async()=>{
  const rpc=vi.fn().mockImplementation((name:string,args:{p_class_id:number})=>Promise.resolve({data:[],error:name==="assign_reading_exercise"&&args.p_class_id===43?{message:"offline"}:null}));
  const client={rpc,from:(name:string)=>query(name==="reading_exercises"?[{id:"saved",teacher_id:"teacher",preset_key:null,content}]:[])} as unknown as SupabaseClient;
  render(<TeacherExercises client={client} classes={classrooms}/>);
  await screen.findByRole("button",{name:"Assign to selected classes"});
  fireEvent.click(screen.getByRole("checkbox",{name:"English 6"}));
  fireEvent.click(screen.getByRole("checkbox",{name:"English 7"}));
  fireEvent.click(screen.getByRole("button",{name:"Assign to selected classes"}));
  await screen.findByText(/assigned to 1 class/);
  expect(screen.getByRole("alert").textContent).toContain("Could not assign to English 7");
  expect(rpc).toHaveBeenCalledWith("assign_reading_exercise",{p_class_id:42,p_exercise_id:"saved"});
  expect(rpc).toHaveBeenCalledWith("assign_reading_exercise",{p_class_id:43,p_exercise_id:"saved"});
});

it("keeps progress scoped to each assignment's classroom roster",async()=>{
  const rpc=vi.fn().mockImplementation((_name:string,args:{p_class_id:number})=>Promise.resolve({data:[{student_id:args.p_class_id===42?"alex":"sam",email:args.p_class_id===42?"alex@example.com":"sam@example.com",first_name:null,last_name:null}],error:null}));
  const assignments=classrooms.map(c=>({id:String(c.id),class_id:c.id,content,archived_at:null}));
  const records=[{assignment_id:"42",student_id:"sam",completed_at:"2026-10-01",progress:{answers:{},hints:[]}}];
  const client={rpc,from:(name:string)=>query(name==="reading_exercises"?[]:name==="exercise_assignments"?assignments:records)} as unknown as SupabaseClient;
  render(<TeacherExercises client={client} classes={classrooms}/>);
  await screen.findAllByRole("button",{name:"Student progress"});
  expect(screen.getAllByText("0 of 1 students finished")).toHaveLength(2);
  fireEvent.click(screen.getAllByRole("button",{name:"Student progress"})[0]);
  expect(screen.getByText("alex@example.com")).toBeTruthy();
  expect(screen.queryByText("sam@example.com")).toBeNull();
  fireEvent.click(screen.getAllByRole("button",{name:"Unassign",exact:true})[0]);
  fireEvent.click(screen.getByRole("button",{name:"Confirm unassign"}));
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith("unassign_reading_exercise",{p_assignment_id:"42"}));
});

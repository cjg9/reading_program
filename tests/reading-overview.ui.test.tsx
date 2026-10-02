// @vitest-environment jsdom
import {act,cleanup,renderHook,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {useReadingOverview} from "../src/lib/reading-overview";
import {exercisePresets} from "../src/lib/exercise-presets";

afterEach(cleanup);
function fixture(){
  const rpc=vi.fn().mockResolvedValue({data:[{student_id:"alex"},{student_id:"sam"}],error:null});
  const from=vi.fn((table:string)=>{
    if(table==="class_memberships")throw new Error("Teachers must use the roster RPC");
    const data=table==="exercise_assignments"?[{id:"quest",class_id:1,content:exercisePresets[0].content,archived_at:null}]:[
      {assignment_id:"quest",student_id:"alex",completed_at:"2026-10-01",progress:{answers:{},hints:[]}},
    ];
    const q={select:()=>q,in:()=>q,is:()=>q,then:(resolve:(r:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(resolve)};
    return q;
  });
  return {rpc,client:{rpc,from} as unknown as SupabaseClient};
}
it("loads actual teacher enrollment and completion and refreshes after roster changes",async()=>{
  const {rpc,client}=fixture();
  const {result}=renderHook(()=>useReadingOverview(client,[1]));
  await waitFor(()=>expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe("");
  expect(result.current.summary).toMatchObject({students:2,completed:1,expected:2,rate:50});
  rpc.mockResolvedValue({data:[{student_id:"sam"}],error:null});
  act(()=>result.current.refresh());
  await waitFor(()=>expect(result.current.summary.students).toBe(1));
  expect(result.current.summary).toMatchObject({completed:0,expected:1,rate:0});
});
it("reports roster lookup failure instead of presenting a successful zero count",async()=>{
  const {rpc,client}=fixture();
  rpc.mockResolvedValue({data:null,error:{message:"Class unavailable"}});
  const {result}=renderHook(()=>useReadingOverview(client,[1]));
  await waitFor(()=>expect(result.current.loading).toBe(false));
  expect(result.current.error).toContain("could not be loaded");
});

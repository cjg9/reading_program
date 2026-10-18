// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, within} from "@testing-library/react";
import {afterEach, expect, it, vi} from "vitest";
import type {SupabaseClient, User} from "@supabase/supabase-js";
import {TeacherDashboard} from "../src/components/TeacherDashboard";

vi.mock("../src/lib/reading-overview",()=>({
  useReadingOverview:()=>({loading:false,error:"",summary:{students:0,completed:0},members:[],assignments:[],progress:[],refresh:vi.fn()}),
  summarizeReading:()=>({rate:0}),
}));
afterEach(cleanup);

it("places My Practices below My Classrooms and opens the same library from a class",async()=>{
  const classroom={id:42,teacher_id:"teacher",name:"English 6",created_at:"2026-10-01",last_accessed_at:"2026-10-01"};
  const client={
    rpc:vi.fn().mockResolvedValue({data:[],error:null}),
    from:(table:string)=>{
      const result={data:table==="classes"?[classroom]:[],error:null};
      const q={select:()=>q,eq:()=>q,order:()=>q,update:()=>q,in:()=>q,is:()=>q,
        single:()=>Promise.resolve({data:classroom,error:null}),
        then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};
      return q;
    },
  } as unknown as SupabaseClient;
  render(<TeacherDashboard client={client} user={{id:"teacher",email:"teacher@example.com"} as User}/>);
  const navigation=screen.getByRole("complementary",{name:"Workspace navigation"});
  expect(within(navigation).getAllByRole("button").map(button=>button.textContent)).toEqual(["My Classrooms","My Practices"]);
  fireEvent.click(within(navigation).getByRole("button",{name:"My Practices"}));
  await screen.findByRole("heading",{name:"Your practice library"});
  expect(within(navigation).getByRole("button",{name:"My Practices"}).getAttribute("aria-current")).toBe("page");
  fireEvent.click(within(navigation).getByRole("button",{name:"My Classrooms"}));
  fireEvent.click(await screen.findByRole("button",{name:/English 6/}));
  expect(await screen.findByRole("heading",{name:"English 6"})).toBeTruthy();
  expect(screen.queryByRole("tab",{name:"Practices"})).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:/Open My Practices/}));
  await screen.findByRole("heading",{name:"Your practice library"});
  expect(screen.getByRole("checkbox",{name:"English 6"})).toBeTruthy();
});

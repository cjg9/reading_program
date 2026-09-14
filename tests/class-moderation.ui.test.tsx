// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { ClassPeople } from "../src/components/ClassPeople";

afterEach(cleanup);
const student = {student_id:"student-id",email:"alex@example.test",first_name:"Alex",last_name:"Rivera",joined_at:"2026-09-01"};
function setup(remove = vi.fn().mockResolvedValue({data:true,error:null})) {
  let removed = false;
  const rpc = vi.fn().mockImplementation(async (name:string, args:unknown) => {
    if (name === "remove_class_student") {
      const result = await remove(args);
      if (!result.error) removed = true;
      return result;
    }
    return {data:removed ? [] : [student],error:null};
  });
  const query = {select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),order:vi.fn().mockResolvedValue({data:[],error:null})};
  render(<ClassPeople client={{rpc,from:()=>query} as unknown as SupabaseClient} classId={42}/>);
  return {rpc,remove};
}
it("requires confirmation, supports cancel, and removes only the selected class member", async () => {
  const {remove} = setup();
  fireEvent.click(await screen.findByRole("button",{name:"Remove alex@example.test from class"}));
  expect(screen.getByText("Remove Alex Rivera?")).toBeTruthy();
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Cancel"}));
  expect(screen.queryByRole("button",{name:"Confirm removal"})).toBeNull();
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Remove alex@example.test from class"}));
  fireEvent.click(screen.getByRole("button",{name:"Confirm removal"}));
  await screen.findByText("No students have joined yet.");
  expect(remove).toHaveBeenCalledExactlyOnceWith({p_class_id:42,p_student_id:"student-id"});
  expect(screen.getByText("alex@example.test has been removed from this class.")).toBeTruthy();
  expect(screen.getByRole("heading",{name:"Students (0)"})).toBeTruthy();
});
it("keeps the student and confirmation available if removal fails, then allows retry", async () => {
  const remove = vi.fn().mockResolvedValueOnce({error:{message:"offline"}}).mockResolvedValueOnce({data:false,error:null});
  setup(remove);
  fireEvent.click(await screen.findByRole("button",{name:"Remove alex@example.test from class"}));
  fireEvent.click(screen.getByRole("button",{name:"Confirm removal"}));
  expect((await screen.findByText(/We could not confirm the removal/)).getAttribute("role")).toBe("alert");
  expect(screen.getByRole("button",{name:"Remove alex@example.test from class"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Confirm removal"}));
  await screen.findByText("No students have joined yet.");
  expect(remove).toHaveBeenCalledTimes(2);
});
it("disables repeated removal and invite sends while the request is pending", async () => {
  let finish!: (value:unknown) => void;
  const remove = vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  setup(remove);
  fireEvent.click(screen.getByRole("button",{name:"Invite students"}));
  fireEvent.click(await screen.findByRole("button",{name:"Remove alex@example.test from class"}));
  fireEvent.click(screen.getByRole("button",{name:"Confirm removal"}));
  expect(screen.getByRole("button",{name:"Removing..."})).toHaveProperty("disabled",true);
  expect(screen.getByRole("button",{name:"Send invitation"})).toHaveProperty("disabled",true);
  finish({data:true,error:null});
  await waitFor(() => expect(screen.queryByRole("button",{name:"Removing..."})).toBeNull());
});

// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InvitationPage } from "../src/components/InvitationPage";
import { AuthForm } from "../src/components/AuthForm";
import { ClassPeople } from "../src/components/ClassPeople";

const token = "a".repeat(64);
const preview = {class_name:"Reading Together",email:"student@example.test",expires_at:"2099-01-01"};
const user = {id:"student-id",email:preview.email} as User;
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  window.history.replaceState(null,"",`/student/invite?token=${token}`);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("preserves the invitation in the signup confirmation link and assigns a student profile", async () => {
  const signUp = vi.fn().mockResolvedValue({data:{session:null},error:null});
  render(<AuthForm client={{auth:{signUp}} as unknown as SupabaseClient} portal="student" invitation={{email:preview.email,token}} />);
  fireEvent.change(screen.getByLabelText("Password",{exact:true}),{target:{value:"test-password-123"}});
  fireEvent.change(screen.getByLabelText("Confirm password"),{target:{value:"test-password-123"}});
  fireEvent.click(screen.getByRole("button",{name:"Create student account"}));
  await waitFor(() => expect(signUp).toHaveBeenCalledWith(expect.objectContaining({email:preview.email,
    options:{data:{signup_portal:"student"},emailRedirectTo:`${window.location.origin}/student/invite?token=${token}`}})));
  expect(await screen.findByText(/Check your inbox for the confirmation link/)).toBeTruthy();
});

it("offers existing students sign-in without losing the invited email", async () => {
  const signInWithPassword = vi.fn().mockResolvedValue({error:null});
  render(<AuthForm client={{auth:{signInWithPassword}} as unknown as SupabaseClient} portal="student" invitation={{email:preview.email,token}} />);
  fireEvent.click(screen.getByRole("button",{name:"Sign in",exact:true}));
  fireEvent.change(screen.getByLabelText("Password",{exact:true}),{target:{value:"test-password-123"}});
  fireEvent.submit(screen.getByLabelText("Password",{exact:true}).closest("form")!);
  await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith({email:preview.email,password:"test-password-123"}));
  expect(window.location.search).toBe(`?token=${token}`);
});

it("requires an explicit Join action, then removes the token and offers the dashboard", async () => {
  const rpc = vi.fn().mockImplementation((name:string) => Promise.resolve({data:name === "preview_class_invitation" ? preview : 1,error:null}));
  render(<InvitationPage client={{rpc} as unknown as SupabaseClient} user={user} />);
  const join = await screen.findByRole("button",{name:"Join class"});
  expect(rpc.mock.calls.some(([name]) => name === "accept_class_invitation")).toBe(false);
  fireEvent.click(join);
  expect(await screen.findByRole("link",{name:"Open my classes"})).toBeTruthy();
  expect(window.location.search).toBe("");
});

it("keeps the invitation available when the server rejects the signed-in account", async () => {
  const rpc = vi.fn().mockImplementation((name:string) => Promise.resolve(name === "preview_class_invitation"
    ? {data:preview,error:null} : {data:null,error:{message:"Sign in with the email address this invitation was sent to."}}));
  render(<InvitationPage client={{rpc} as unknown as SupabaseClient} user={user} />);
  fireEvent.click(await screen.findByRole("button",{name:"Join class"}));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent","Sign in with the email address this invitation was sent to.");
  expect(screen.getByRole("button",{name:"Use another account"})).toBeTruthy();
  expect(window.location.search).toBe(`?token=${token}`);
});

it("does not show signup for an expired or revoked invitation", async () => {
  const rpc = vi.fn().mockResolvedValue({data:null,error:null});
  render(<InvitationPage client={{rpc} as unknown as SupabaseClient} />);
  expect(await screen.findByRole("alert")).toHaveProperty("textContent",expect.stringContaining("expired"));
  expect(screen.queryByLabelText("Password",{exact:true})).toBeNull();
});

it("teacher sends only the entered email and selected class, then shows delivery status", async () => {
  const invoke = vi.fn().mockResolvedValue({data:{sent:true},error:null});
  const query = {select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),order:vi.fn().mockResolvedValue({data:[],error:null})};
  const client = {rpc:vi.fn().mockResolvedValue({data:[],error:null}),from:()=>query,functions:{invoke}} as unknown as SupabaseClient;
  render(<ClassPeople client={client} classId={42} />);
  await screen.findByText("No students have joined yet.");
  fireEvent.change(screen.getByLabelText("Student email address"),{target:{value:"Student@Example.test"}});
  fireEvent.click(screen.getByRole("button",{name:"Send invitation"}));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("send-class-invitation",{body:{classId:42,email:"student@example.test"}}));
  expect(await screen.findByText(/Invitation sent to/)).toBeTruthy();
});

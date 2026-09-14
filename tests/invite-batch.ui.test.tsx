// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InviteTable } from "../src/components/InviteTable";
import { validateRecipients } from "../src/lib/invite-batch";
afterEach(cleanup);
it("imports a pasted spreadsheet for review without sending and keeps existing students", () => {
  const send = vi.fn();
  render(<InviteTable send={send} onComplete={vi.fn()} onBusyChange={vi.fn()} disabled={false} />);
  fill(1,"existing@example.test");
  fireEvent.change(screen.getByLabelText("Paste a student list"),{target:{value:"First name\tLast name\tEmail\nAlex\tRivera\talex@example.test\nSam\tChen\tsam@example.test"}});
  fireEvent.click(screen.getByText("Add list to table"));
  expect(screen.getByRole("button",{name:"Invitation table"}).getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByLabelText("Email address 1")).toHaveProperty("value","existing@example.test");
  expect(screen.getByLabelText("First name 2")).toHaveProperty("value","Alex");
  expect(screen.getByLabelText("Last name 3")).toHaveProperty("value","Chen");
  expect(screen.getByLabelText("Paste a student list")).toHaveProperty("value","");
  expect(send).not.toHaveBeenCalled();
});
it("accepts a multi-cell paste directly into a table cell", () => {
  render(<InviteTable send={vi.fn()} onComplete={vi.fn()} onBusyChange={vi.fn()} disabled={false} />);
  fireEvent.paste(screen.getByLabelText("First name 1"),{clipboardData:{getData:()=>"Alex\tRivera\talex@example.test\nSam\tChen\tsam@example.test"}});
  expect(screen.getByLabelText("First name 1")).toHaveProperty("value","Alex");
  expect(screen.getByLabelText("Email address 2")).toHaveProperty("value","sam@example.test");
});
it("keeps oversized paste text and all existing rows instead of truncating", () => {
  render(<InviteTable send={vi.fn()} onComplete={vi.fn()} onBusyChange={vi.fn()} disabled={false} />);
  fill(1,"existing@example.test");
  const text=Array.from({length:30},(_,i)=>`First\tLast\tstudent${i}@example.test`).join("\n");
  fireEvent.change(screen.getByLabelText("Paste a student list"),{target:{value:text}});
  fireEvent.click(screen.getByText("Add list to table"));
  expect(screen.getByRole("alert").textContent).toContain("31 rows");
  expect(screen.queryByLabelText("Email address 2")).toBeNull();
  expect(screen.getByLabelText("Paste a student list")).toHaveProperty("value",text);
});
it("does not send existing rows while pasted students are awaiting review", () => {
  const send=vi.fn();
  render(<InviteTable send={send} onComplete={vi.fn()} onBusyChange={vi.fn()} disabled={false} />);
  fill(1,"existing@example.test");
  fireEvent.change(screen.getByLabelText("Paste a student list"),{target:{value:"Alex Rivera alex@example.test"}});
  fireEvent.click(screen.getByText("Send invitation"));
  expect(send).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain("before sending");
});
function fill(index:number, email:string) {
  for (const [label,value] of [["First name","Sam"],["Last name","Reader"],["Email address",email]])
    fireEvent.change(screen.getByLabelText(`${label} ${index}`),{target:{value}});
}
it("blocks empty names and duplicate emails before sending", () => {
  expect(validateRecipients([{firstName:"",lastName:"Reader",email:"test@example.test"}])[0]).toContain("first and last name");
  const send = vi.fn();
  render(<InviteTable send={send} onComplete={vi.fn()} onBusyChange={vi.fn()} disabled={false} />);
  fill(1,"TEST@example.test"); fireEvent.click(screen.getByText("Add student")); fill(2,"test@example.test");
  fireEvent.click(screen.getByText("Send 2 invitations"));
  expect(screen.getAllByText("This email appears more than once in the table.")).toHaveLength(2);
  expect(send).not.toHaveBeenCalled();
});
it("sends multiple rows and retries only failures", async () => {
  const send = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Temporary failure")).mockResolvedValueOnce(undefined);
  render(<InviteTable send={send} onComplete={vi.fn().mockResolvedValue(undefined)} onBusyChange={vi.fn()} disabled={false} />);
  fill(1,"one@example.test"); fireEvent.click(screen.getByText("Add student")); fill(2,"two@example.test");
  fireEvent.click(screen.getByText("Send 2 invitations"));
  expect(await screen.findByText(/1 invitation sent. 1 need attention/)).toBeTruthy();
  expect(screen.getByText("Temporary failure")).toBeTruthy();
  fireEvent.click(screen.getByText("Retry invitation"));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(3));
  expect(send.mock.calls.map(([recipient])=>recipient.email)).toEqual(["one@example.test","two@example.test","two@example.test"]);
  await waitFor(() => expect(screen.getAllByText("Sent")).toHaveLength(2));
});
it("removes rows and caps batches at thirty students", () => {
  render(<InviteTable send={vi.fn()} onComplete={vi.fn()} onBusyChange={vi.fn()} disabled={false} />);
  for (let i=1;i<30;i++) fireEvent.click(screen.getByText("Add student"));
  expect(screen.getByText("Add student")).toHaveProperty("disabled",true);
  fireEvent.click(screen.getByLabelText("Remove student 30"));
  expect(screen.getByText("Add student")).toHaveProperty("disabled",false);
  expect(screen.queryByLabelText("First name 30")).toBeNull();
});

// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, expect, it, vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {ClassWorkspace} from "../src/components/ClassWorkspace";

afterEach(cleanup);
function fixture() {
  const rpc = vi.fn().mockResolvedValue({data: [], error: null});
  const query = {select: () => query, eq: () => query, is: () => query,
    order: () => Promise.resolve({data: [], error: null}),
    in: () => query, then: (resolve: (value: unknown) => unknown) => Promise.resolve({data: [], error: null}).then(resolve)};
  return {rpc, client: {rpc, from: () => query} as unknown as SupabaseClient};
}

it("opens the global practice library and preserves invitation drafts between class sections", async () => {
  const {client} = fixture();
  const openPractices=vi.fn();
  render(<ClassWorkspace client={client} classId={42} onOpenPractices={openPractices}/>);
  expect(screen.queryByRole("tab",{name:"Practices"})).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:/Open My Practices/}));
  expect(openPractices).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("tab", {name: "Students"}));
  await screen.findByText("No students have joined yet.");
  fireEvent.change(screen.getByLabelText("First name 1"), {target: {value: "Alex"}});
  fireEvent.click(screen.getByRole("tab", {name: "Overview"}));
  fireEvent.click(screen.getByRole("tab", {name: "Students"}));
  await waitFor(()=>expect(screen.getByLabelText("First name 1")).toHaveProperty("value", "Alex"));
});

it("supports keyboard tab navigation with a single selected tab and a matching panel", async () => {
  const {client} = fixture();
  render(<ClassWorkspace client={client} classId={42} onOpenPractices={vi.fn()}/>);
  fireEvent.keyDown(screen.getByRole("tab", {name: "Overview"}), {key: "ArrowRight"});
  const students = screen.getByRole("tab", {name: "Students", selected: true});
  expect(document.activeElement).toBe(students);
  expect(screen.getByRole("tabpanel")).toHaveProperty("id", students.getAttribute("aria-controls"));
  fireEvent.keyDown(students, {key: "End"});
  expect(screen.getByRole("tab", {name: "Statistics", selected: true})).toHaveProperty("tabIndex", 0);
  await screen.findByRole("region", {name: "Class statistics"});
  fireEvent.keyDown(screen.getByRole("tab", {name: "Statistics"}), {key: "ArrowRight"});
  expect(screen.getByRole("tab", {name: "Overview", selected: true})).toBe(document.activeElement);
});

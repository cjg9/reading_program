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

it("preserves invitation and exercise drafts while changing sections and refreshes the roster on return", async () => {
  const {client, rpc} = fixture();
  render(<ClassWorkspace client={client} classId={42}/>);
  fireEvent.click(screen.getByRole("tab", {name: "Students"}));
  await screen.findByText("No students have joined yet.");
  fireEvent.change(screen.getByLabelText("First name 1"), {target: {value: "Alex"}});
  fireEvent.click(screen.getByRole("tab", {name: "Exercises"}));
  await screen.findByText(/No exercises assigned yet/);
  fireEvent.click(screen.getByRole("button", {name: "Create exercise"}));
  fireEvent.change(screen.getByLabelText("Title", {exact: true}), {target: {value: "Our word quest"}});
  const before = rpc.mock.calls.length;
  fireEvent.click(screen.getByRole("tab", {name: "Students"}));
  await waitFor(() => expect(rpc.mock.calls.length).toBeGreaterThan(before));
  expect(screen.getByLabelText("First name 1")).toHaveProperty("value", "Alex");
  fireEvent.click(screen.getByRole("tab", {name: "Exercises"}));
  expect(screen.getByLabelText("Title", {exact: true})).toHaveProperty("value", "Our word quest");
});

it("supports keyboard tab navigation with a single selected tab and a matching panel", async () => {
  const {client} = fixture();
  render(<ClassWorkspace client={client} classId={42}/>);
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

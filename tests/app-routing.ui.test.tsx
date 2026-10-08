// @vitest-environment jsdom
import {cleanup, render, screen} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import type {ReactNode} from "react";
import App from "../src/App";

const { authState, callback } = vi.hoisted(() => ({
  authState: {client: {}, error: null as string | null, loading: false, session: null as null | {user: {id: string}}, profileState: {status: "idle", accountType: "student", userId: ""}, passwordRecovery: false},
  callback: {requested: false, failed: false},
}));
vi.mock("../src/lib/supabase", () => ({initialRecoveryCallback: callback}));

vi.mock("../src/auth/AuthProvider", () => ({
  AuthProvider: ({children}: {children: ReactNode}) => children,
  useAuth: () => authState,
}));
beforeEach(() => {
  authState.session = null;
  authState.error = null;
  authState.loading = false;
  authState.profileState = {status: "idle", accountType: "student", userId: ""};
  authState.passwordRecovery = false;
  callback.failed = false;
});
afterEach(cleanup);

it("opens the public homepage at the base URL with separate login links", () => {
  window.history.replaceState(null, "", "/");
  render(<App/>);
  expect(screen.getByRole("heading", {level: 1}).textContent).toContain("Where reading");
  expect(screen.getByRole("link", {name: "Teacher Sign In", exact: true}).getAttribute("href")).toBe("/teacher");
  expect(screen.getByRole("link", {name: "Student Sign In", exact: true}).getAttribute("href")).toBe("/student");
  expect(screen.queryByLabelText("Password", {exact: true})).toBeNull();
});

it.each(["student", "teacher"])("opens the %s login on its own path", portal => {
  window.history.replaceState(null, "", `/${portal}`);
  render(<App/>);
  expect(screen.getByRole("heading", {level: 1}).textContent.toLowerCase()).toBe(`${portal} sign in`);
  expect(screen.getByLabelText("Email address", {exact: true})).toBeTruthy();
  expect(screen.getByRole("link", {name: "About Dot Reading"}).getAttribute("href")).toBe("/");
});

it("opens account creation from the homepage's teacher signup URL", () => {
  window.history.replaceState(null, "", "/teacher?mode=sign-up");
  render(<App/>);
  expect(screen.getByRole("heading", {level: 1}).textContent).toBe("Create a teacher account");
  expect(screen.getByLabelText("Confirm password")).toBeTruthy();
});

it.each(["student", "teacher"])("opens %s recovery before checking account profiles", portal => {
  window.history.replaceState(null, "", `/${portal}/reset-password`);
  authState.session = {user: {id: "recovered-user"}};
  render(<App/>);
  expect(screen.getByLabelText("New password")).toBeTruthy();
});

it("routes a recovery event on the site root to the password form", () => {
  window.history.replaceState(null, "", "/");
  authState.passwordRecovery = true;
  authState.session = {user: {id: "recovered-user"}};
  render(<App/>);
  expect(screen.getByLabelText("New password")).toBeTruthy();
});

it("rejects an expired callback even when a different account is already signed in", () => {
  window.history.replaceState(null, "", "/student/reset-password");
  callback.failed = true;
  authState.session = {user: {id: "existing-user"}};
  render(<App/>);
  expect(screen.getByRole("heading", {name: "Reset link unavailable"})).toBeTruthy();
  expect(screen.queryByLabelText("New password")).toBeNull();
});

it("uses the recovered account role for the completion destination", () => {
  window.history.replaceState(null, "", "/student/reset-password");
  authState.session = {user: {id: "teacher-user"}};
  authState.profileState = {status: "ready", accountType: "teacher", userId: "teacher-user"};
  render(<App/>);
  expect(screen.getByRole("link", {name: "Back to teacher sign in"}).getAttribute("href")).toBe("/teacher");
});

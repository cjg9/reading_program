// @vitest-environment jsdom
import {cleanup, render, screen} from "@testing-library/react";
import {afterEach, expect, it, vi} from "vitest";
import type {ReactNode} from "react";
import App from "../src/App";

vi.mock("../src/auth/AuthProvider", () => ({
  AuthProvider: ({children}: {children: ReactNode}) => children,
  useAuth: () => ({client: {}, error: null, loading: false, session: null, profileState: {status: "idle"}}),
}));
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

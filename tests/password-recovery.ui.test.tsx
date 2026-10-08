// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PasswordRecovery } from "../src/components/PasswordRecovery";
import { AuthForm } from "../src/components/AuthForm";

afterEach(cleanup);
function clientWith(auth: object) { return { auth } as SupabaseClient; }

it.each(["teacher", "student"] as const)("offers recovery from the %s sign-in page", (portal) => {
  window.history.replaceState(null, "", `/${portal}`);
  render(<AuthForm client={clientWith({})} portal={portal} />);
  expect(screen.getByRole("link", { name: "Forgot password?" }).getAttribute("href")).toBe(`/${portal}/forgot-password`);
});

it.each(["teacher", "student"] as const)("requests a %s reset with a neutral confirmation and permits resend", async (portal) => {
  const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
  render(<PasswordRecovery client={clientWith({resetPasswordForEmail})} portal={portal} mode="request" canReset={false} />);
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: " reader@example.org " } });
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
  expect(await screen.findByRole("status")).toHaveProperty("textContent", expect.stringContaining("If an account exists"));
  expect(resetPasswordForEmail).toHaveBeenCalledWith("reader@example.org", { redirectTo: `${window.location.origin}/${portal}/reset-password` });
  fireEvent.click(screen.getByRole("button", {name: "Send another link"}));
  await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledTimes(2));
});

it("validates email before contacting the service", () => {
  const resetPasswordForEmail = vi.fn();
  render(<PasswordRecovery client={clientWith({resetPasswordForEmail})} portal="teacher" mode="request" canReset={false} />);
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "invalid" } });
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
  expect(screen.getByRole("alert").textContent).toContain("valid email");
  expect(resetPasswordForEmail).not.toHaveBeenCalled();
});

it("prevents duplicate submissions and recovers from rate limiting", async () => {
  let resolve!: (result: object) => void;
  const resetPasswordForEmail = vi.fn().mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<PasswordRecovery client={clientWith({resetPasswordForEmail})} portal="student" mode="request" canReset={false} />);
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "reader@example.org" } });
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
  expect((screen.getByRole("button", {name: "Sending link..."}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.submit(screen.getByLabelText("Email address").closest("form")!);
  expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
  resolve({error: {code: "over_email_send_rate_limit"}});
  expect((await screen.findByRole("alert")).textContent).toContain("Wait a few minutes");
  expect((screen.getByRole("button", {name: "Send reset link"}) as HTMLButtonElement).disabled).toBe(false);
});

it.each(["teacher", "student"] as const)("updates the recovered %s account only after matching valid passwords", async (portal) => {
  const updateUser = vi.fn().mockResolvedValue({error: null});
  render(<PasswordRecovery client={clientWith({updateUser})} portal={portal} mode="reset" canReset />);
  const password = screen.getByLabelText("New password");
  const confirmation = screen.getByLabelText("Confirm new password");
  fireEvent.change(password, {target: {value: "short"}});
  fireEvent.change(confirmation, {target: {value: "short"}});
  fireEvent.click(screen.getByRole("button", {name: "Update password"}));
  expect(screen.getByRole("alert").textContent).toContain("at least 8");
  fireEvent.change(password, {target: {value: "new-password-123"}});
  fireEvent.click(screen.getByRole("button", {name: "Update password"}));
  expect(screen.getByRole("alert").textContent).toContain("do not match");
  expect(updateUser).not.toHaveBeenCalled();
  fireEvent.change(confirmation, {target: {value: "new-password-123"}});
  fireEvent.click(screen.getByRole("button", {name: "Update password"}));
  expect(await screen.findByRole("heading", {name: "Password updated"})).toBeTruthy();
  expect(updateUser).toHaveBeenCalledWith({password: "new-password-123"});
  expect(screen.queryByLabelText("New password")).toBeNull();
  expect(screen.getByRole("link", {name: "Continue to your account"}).getAttribute("href")).toBe(`/${portal}`);
});

it("handles a rejected password update without losing the retry path", async () => {
  const updateUser = vi.fn().mockResolvedValue({error: {code: "same_password"}});
  render(<PasswordRecovery client={clientWith({updateUser})} portal="student" mode="reset" canReset />);
  fireEvent.change(screen.getByLabelText("New password"), {target: {value: "new-password-123"}});
  fireEvent.change(screen.getByLabelText("Confirm new password"), {target: {value: "new-password-123"}});
  fireEvent.click(screen.getByRole("button", {name: "Update password"}));
  expect((await screen.findByRole("alert")).textContent).toContain("different from your current");
  expect(screen.queryByText("Password updated")).toBeNull();
  expect(screen.getByRole("link", {name: "Request a new reset link"})).toBeTruthy();
});

it("does not offer a password update for an invalid or missing recovery session", () => {
  const updateUser = vi.fn();
  render(<PasswordRecovery client={clientWith({updateUser})} portal="teacher" mode="reset" canReset={false} />);
  expect(screen.getByRole("heading", {name: "Reset link unavailable"})).toBeTruthy();
  expect(screen.queryByLabelText("New password")).toBeNull();
  expect(screen.getByRole("link", {name: "Request a new reset link"}).getAttribute("href")).toBe("/teacher/forgot-password");
  expect(updateUser).not.toHaveBeenCalled();
});

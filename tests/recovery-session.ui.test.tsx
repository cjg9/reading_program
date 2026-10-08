// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../src/App";

const mock = vi.hoisted(() => ({
  initialize: vi.fn(), getSession: vi.fn(), unsubscribe: vi.fn(),
  callback: null as null | ((event: string, session: object | null) => void),
  session: {user: {id: "existing-user", email: "reader@example.org"}},
}));
vi.mock("../src/lib/supabase", () => ({
  initialRecoveryCallback: {requested: false, failed: false},
  supabaseConfigurationError: null,
  supabase: {
    auth: {
      initialize: mock.initialize,
      getSession: mock.getSession,
      onAuthStateChange: (callback: typeof mock.callback) => {
        mock.callback = callback;
        return {data: {subscription: {unsubscribe: mock.unsubscribe}}};
      },
    },
    from: () => ({select: () => ({eq: () => ({single: () => Promise.resolve({data: {id: "existing-user", account_type: "student"}, error: null})})})}),
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/student/reset-password");
  mock.initialize.mockResolvedValue({error: null});
  mock.getSession.mockResolvedValue({data: {session: mock.session}, error: null});
});
afterEach(cleanup);

it("blocks malformed token callbacks even if getSession returns an older valid session", async () => {
  mock.initialize.mockResolvedValue({error: new Error("Invalid token")});
  render(<App />);
  expect(await screen.findByRole("heading", {name: "Reset link unavailable"})).toBeTruthy();
  await act(async () => { mock.callback?.("INITIAL_SESSION", mock.session); });
  expect(screen.queryByLabelText("New password")).toBeNull();
});

it("waits for callback validation before rendering a restored session", async () => {
  let finish!: (result: object) => void;
  mock.initialize.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  render(<App />);
  await act(async () => { mock.callback?.("INITIAL_SESSION", mock.session); });
  expect(screen.queryByLabelText("New password")).toBeNull();
  finish({error: null});
  expect(await screen.findByLabelText("New password")).toBeTruthy();
});

it("handles PASSWORD_RECOVERY on the default site URL", async () => {
  window.history.replaceState(null, "", "/");
  render(<App />);
  await waitFor(() => expect(mock.getSession).toHaveBeenCalled());
  await act(async () => { mock.callback?.("PASSWORD_RECOVERY", mock.session); });
  expect(await screen.findByLabelText("New password")).toBeTruthy();
});

it("shows a fresh-link action if session initialization rejects", async () => {
  mock.initialize.mockRejectedValue(new Error("Network unavailable"));
  render(<App />);
  expect(await screen.findByRole("link", {name: "Request a new reset link"})).toBeTruthy();
  expect(screen.queryByLabelText("New password")).toBeNull();
});

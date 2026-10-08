import { expect, it } from "vitest";
import { recoveryCallbackState, recoveryRoute } from "./password-recovery";

it("recognizes recovery routes without accepting arbitrary redirects", () => {
  expect(recoveryRoute("/teacher/reset-password/")).toEqual({portal: "teacher", mode: "reset"});
  expect(recoveryRoute("/student/forgot-password")).toEqual({portal: "student", mode: "request"});
  expect(recoveryRoute("//evil.example/reset-password")).toBeNull();
  expect(recoveryRoute("/student")).toBeNull();
});

it("captures invalid callback markers in either URL format", () => {
  expect(recoveryCallbackState("#type=recovery&access_token=example", "")).toEqual({requested: true, failed: false});
  expect(recoveryCallbackState("#error=access_denied&error_code=otp_expired", "").failed).toBe(true);
  expect(recoveryCallbackState("", "?error_code=otp_expired").failed).toBe(true);
  expect(recoveryCallbackState("", "")).toEqual({requested: false, failed: false});
});

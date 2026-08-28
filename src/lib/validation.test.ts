import { describe, expect, it } from "vitest";
import { validateCredentials } from "./validation";

describe("validateCredentials", () => {
  it("accepts a valid sign-in", () => {
    expect(
      validateCredentials({
        mode: "sign-in",
        email: "reader@example.com",
        password: "bookcase123",
      }),
    ).toBeNull();
  });

  it("allows an existing teacher to attempt sign-in with a short password", () => {
    expect(
      validateCredentials({
        mode: "sign-in",
        email: "teacher@example.com",
        password: "legacy",
      }),
    ).toBeNull();
  });

  it("requires a password for sign-in", () => {
    expect(
      validateCredentials({
        mode: "sign-in",
        email: "teacher@example.com",
        password: "",
      }),
    ).toBe("Enter your password.");
  });

  it("rejects an invalid email", () => {
    expect(
      validateCredentials({
        mode: "sign-in",
        email: "not-an-email",
        password: "bookcase123",
      }),
    ).toBe("Enter a valid email address.");
  });

  it("requires an eight-character password", () => {
    expect(
      validateCredentials({
        mode: "sign-up",
        email: "reader@example.com",
        password: "short",
        passwordConfirmation: "short",
      }),
    ).toBe("Password must be at least 8 characters.");
  });

  it("requires matching passwords during sign-up", () => {
    expect(
      validateCredentials({
        mode: "sign-up",
        email: "reader@example.com",
        password: "bookcase123",
        passwordConfirmation: "bookcase124",
      }),
    ).toBe("Passwords do not match.");
  });
});

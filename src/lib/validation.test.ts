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

import { describe, expect, it } from "vitest";
import { isAccountType, resolvePortal } from "./portal";

describe("resolvePortal", () => {
  it.each([
    ["/", "teacher"],
    ["/student", "student"],
    ["/student/", "student"],
    ["/student///", "student"],
  ])("maps %s to the %s portal", (pathname, portal) => {
    expect(resolvePortal(pathname)).toBe(portal);
  });

  it.each(["/teacher", "/students", "/student/classes", ""])(
    "rejects the unsupported path %s",
    (pathname) => {
      expect(resolvePortal(pathname)).toBeNull();
    },
  );
});

describe("isAccountType", () => {
  it("only accepts supported account types", () => {
    expect(isAccountType("teacher")).toBe(true);
    expect(isAccountType("student")).toBe(true);
    expect(isAccountType("admin")).toBe(false);
    expect(isAccountType(null)).toBe(false);
  });
});

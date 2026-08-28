import { describe, expect, it } from "vitest";
import {
  formatRelativeTime,
  sortClassesByLastAccessed,
  validateClassName,
  type TeacherClass,
} from "./classes";

const now = Date.parse("2026-08-27T18:00:00.000Z");

function makeClass(
  id: number,
  lastAccessedAt: string,
  name = `Class ${id}`,
): TeacherClass {
  return {
    id,
    teacher_id: "teacher-id",
    name,
    created_at: "2026-08-01T12:00:00.000Z",
    last_accessed_at: lastAccessedAt,
  };
}

describe("formatRelativeTime", () => {
  it.each([
    ["2026-08-27T17:59:55.000Z", "just now"],
    ["2026-08-27T17:59:35.000Z", "25 seconds ago"],
    ["2026-08-27T17:59:00.000Z", "1 minute ago"],
    ["2026-08-27T16:00:00.000Z", "2 hours ago"],
    ["2026-08-20T18:00:00.000Z", "1 week ago"],
  ])("formats %s as %s", (timestamp, expected) => {
    expect(formatRelativeTime(timestamp, now)).toBe(expected);
  });

  it("handles future and invalid timestamps defensively", () => {
    expect(formatRelativeTime("2026-08-27T18:01:00.000Z", now)).toBe("just now");
    expect(formatRelativeTime("not-a-date", now)).toBe("recently");
  });
});

describe("sortClassesByLastAccessed", () => {
  it("sorts newest access first and uses newest id to break ties", () => {
    const classes = [
      makeClass(1, "2026-08-27T16:00:00.000Z"),
      makeClass(2, "2026-08-27T17:00:00.000Z"),
      makeClass(3, "2026-08-27T17:00:00.000Z"),
    ];

    expect(sortClassesByLastAccessed(classes).map(({ id }) => id)).toEqual([
      3, 2, 1,
    ]);
    expect(classes.map(({ id }) => id)).toEqual([1, 2, 3]);
  });
});

describe("validateClassName", () => {
  it("accepts a normal name", () => {
    expect(validateClassName("  English 9  ")).toBeNull();
  });

  it("rejects blank and overly long names", () => {
    expect(validateClassName("   ")).toBe("Enter a class name.");
    expect(validateClassName("a".repeat(81))).toBe(
      "Class names must be 80 characters or fewer.",
    );
  });
});

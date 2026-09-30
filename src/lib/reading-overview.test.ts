import {expect, it} from "vitest";
import {summarizeReading} from "./reading-overview";
import {exercisePresets} from "./exercise-presets";
import type {Assignment, ProgressRecord} from "./exercises";

function assignment(id: string, classId: number, archived = false): Assignment {
  return {id, class_id: classId, content: exercisePresets[0].content,
    created_at: "2026-09-01", archived_at: archived ? "2026-09-02" : null};
}
function progress(assignmentId: string, studentId: string, complete = true): ProgressRecord {
  return {assignment_id: assignmentId, student_id: studentId,
    progress: {answers: {}, hints: []}, completed_at: complete ? "2026-09-03" : null};
}

it("counts each student once across classes but each assigned student activity separately", () => {
  const result = summarizeReading([
    {class_id: 1, student_id: "alex"}, {class_id: 1, student_id: "sam"},
    {class_id: 2, student_id: "alex"},
  ], [assignment("a", 1), assignment("b", 1), assignment("c", 2)], [
    progress("a", "alex"), progress("b", "sam", false), progress("c", "alex"),
  ]);
  expect(result).toEqual({students: 2, assignments: 3, completed: 2, expected: 5, started: 3, rate: 40});
});

it("excludes archived work and work from students no longer in the assignment's class", () => {
  const result = summarizeReading([
    {class_id: 1, student_id: "alex"}, {class_id: 2, student_id: "former"},
  ], [assignment("a", 1), assignment("old", 1, true)], [
    progress("a", "alex"), progress("a", "former"), progress("old", "alex"), progress("unknown", "alex"),
  ]);
  expect(result).toMatchObject({assignments: 1, completed: 1, expected: 1, started: 1, rate: 100});
});

it("handles classrooms with no students or assignments without invalid percentages", () => {
  expect(summarizeReading([], [assignment("a", 1)], [])).toMatchObject({expected: 0, rate: 0});
  expect(summarizeReading([{class_id: 1, student_id: "alex"}], [], [])).toMatchObject({students: 1, expected: 0, rate: 0});
});

import { describe, expect, it } from "vitest";
import { parseInviteList } from "./parse-invite-list";
const alex = {firstName:"Alex",lastName:"Rivera",email:"alex@example.test"};
describe("pasted student lists", () => {
  it("reads spreadsheet cells with optional headers, blank lines and CRLF", () => {
    expect(parseInviteList("\uFEFFFirst name\tLast name\tEmail address\r\nAlex\tRivera\tALEX@example.test\r\n\r\n")).toEqual([alex]);
  });
  it("uses header names to map reordered columns", () => {
    expect(parseInviteList("Email,Surname,Given name\nalex@example.test,Rivera,Alex")).toEqual([alex]);
  });
  it("reads quoted CSV fields, including commas in full names", () => {
    expect(parseInviteList('Name,Email\n"Rivera, Alex",alex@example.test')).toEqual([alex]);
    expect(parseInviteList('"Alex ""AJ""",Rivera,alex@example.test')[0].firstName).toBe('Alex "AJ"');
  });
  it("supports plain-text full names, angle brackets, and email-first lists", () => {
    for (const line of ["Alex Rivera alex@example.test","Alex Rivera <alex@example.test>","alex@example.test Alex Rivera","Alex Rivera,alex@example.test","alex@example.test\tAlex Rivera"])
      expect(parseInviteList(line)).toEqual([alex]);
  });
  it("preserves compound surnames and non-English characters for review", () => {
    expect(parseInviteList("Zoë de la Cruz zoe@example.test")[0]).toMatchObject({firstName:"Zoë",lastName:"de la Cruz"});
    expect(parseInviteList("Mary Jane\tO'Neil\tmary@example.test")[0]).toMatchObject({firstName:"Mary Jane",lastName:"O'Neil"});
  });
  it("retains missing and invalid fields for editing", () => {
    expect(parseInviteList("alex@example.test")).toEqual([{firstName:"",lastName:"",email:alex.email}]);
    expect(parseInviteList("Alex\t\twrong")).toEqual([{firstName:"Alex",lastName:"",email:"wrong"}]);
  });
  it("rejects ambiguous structure without returning a partial list", () => {
    expect(() => parseInviteList('Alex,Rivera,alex@example.test\n"Sam,Chen,sam@example.test')).toThrow("Line 2");
    expect(() => parseInviteList("Name,Email\nAlex,Rivera,alex@example.test")).toThrow("columns");
    expect(() => parseInviteList("Alex Rivera alex@example.test sam@example.test")).toThrow("one student per line");
  });
  it("rejects empty, header-only and excessively large lists", () => {
    expect(() => parseInviteList(" \n")).toThrow("Paste a student list");
    expect(() => parseInviteList("First name,Last name,Email")).toThrow("no students");
    expect(() => parseInviteList("x".repeat(100_001))).toThrow("too large");
  });
});

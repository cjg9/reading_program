import { describe, expect, it } from "vitest";
import { hashInviteToken, invitationStatus, inviteRedirect, type ClassInvitation } from "./invitations";

describe("invitation links", () => {
  it("preserves the token through confirmation on the expected origin and route", () => {
    expect(inviteRedirect("https://dotreading.com", "a".repeat(64))).toBe(`https://dotreading.com/student/invite?token=${"a".repeat(64)}`);
  });
  it("rejects arbitrary redirect content and malformed tokens", async () => {
    expect(() => inviteRedirect("https://dotreading.com", "https://evil.test")).toThrow();
    await expect(hashInviteToken("short")).rejects.toThrow();
  });
  it("uses a SHA-256 digest rather than sending the raw token to the database", async () => {
    expect(await hashInviteToken("a".repeat(64))).toBe("ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb");
  });
  it("shows lifecycle state ahead of delivery state", () => {
    const invite: ClassInvitation = {id:"id",email:"student@example.test",expires_at:"2020-01-01",revoked_at:null,accepted_at:null,delivery_status:"failed"};
    expect(invitationStatus(invite)).toBe("Expired");
    expect(invitationStatus({...invite,revoked_at:"date"})).toBe("Revoked");
    expect(invitationStatus({...invite,accepted_at:"date"})).toBe("Joined");
  });
});

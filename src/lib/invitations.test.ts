import { describe, expect, it } from "vitest";
import { MembershipStatus } from "@prisma/client";
import { getInvitationCreationConflict } from "@/lib/invitations";

describe("getInvitationCreationConflict", () => {
  it("rejects invitations for active members", () => {
    expect(
      getInvitationCreationConflict({
        membershipStatus: MembershipStatus.ACTIVE,
        hasPendingInvitation: false
      })
    ).toBe("This user is already an active member of the company");
  });

  it("rejects unexpired pending invitations", () => {
    expect(
      getInvitationCreationConflict({
        hasPendingInvitation: true,
        pendingInvitationExpiresAt: new Date("2026-04-01T00:00:00.000Z"),
        now: new Date("2026-03-27T00:00:00.000Z")
      })
    ).toBe("A pending invitation already exists for this email");
  });

  it("allows new invitations once older pending invites have expired", () => {
    expect(
      getInvitationCreationConflict({
        hasPendingInvitation: true,
        pendingInvitationExpiresAt: new Date("2026-03-01T00:00:00.000Z"),
        now: new Date("2026-03-27T00:00:00.000Z")
      })
    ).toBeNull();
  });
});

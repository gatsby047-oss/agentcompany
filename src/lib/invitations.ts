import { MembershipStatus } from "@prisma/client";

export function getInvitationCreationConflict(input: {
  membershipStatus?: MembershipStatus | null;
  hasPendingInvitation: boolean;
  now?: Date;
  pendingInvitationExpiresAt?: Date | null;
}) {
  if (input.membershipStatus === MembershipStatus.ACTIVE) {
    return "This user is already an active member of the company";
  }

  if (
    input.hasPendingInvitation &&
    input.pendingInvitationExpiresAt &&
    input.pendingInvitationExpiresAt >= (input.now ?? new Date())
  ) {
    return "A pending invitation already exists for this email";
  }

  return null;
}

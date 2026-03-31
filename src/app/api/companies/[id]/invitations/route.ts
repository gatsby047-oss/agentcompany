import { InvitationStatus, MembershipMemberType, MembershipRole, MembershipStatus } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ensureCompanyAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { conflict, parseJson, toErrorResponse } from "@/lib/http";
import { getInvitationCreationConflict } from "@/lib/invitations";
import { createOpaqueToken } from "@/lib/security";

export const runtime = "nodejs";

const invitationSchema = z.object({
  inviteeEmail: z.string().email(),
  role: z.enum([MembershipRole.ADMIN, MembershipRole.MEMBER]).default(MembershipRole.MEMBER),
  expiresInDays: z.coerce.number().min(1).max(30).default(7)
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser(request);
    await ensureCompanyAccess(user.id, params.id, [MembershipRole.ADMIN]);
    const input = await parseJson(request, invitationSchema);
    const inviteeEmail = input.inviteeEmail.toLowerCase();
    const now = new Date();

    const existingMembership = await prisma.membership.findFirst({
      where: {
        companyId: params.id,
        memberType: MembershipMemberType.HUMAN,
        status: MembershipStatus.ACTIVE,
        user: {
          email: inviteeEmail
        }
      },
      select: {
        status: true
      }
    });

    await prisma.invitation.updateMany({
      where: {
        companyId: params.id,
        inviteeEmail,
        status: InvitationStatus.PENDING,
        expiresAt: {
          lt: now
        }
      },
      data: {
        status: InvitationStatus.EXPIRED
      }
    });

    const existingPendingInvitation = await prisma.invitation.findFirst({
      where: {
        companyId: params.id,
        inviteeEmail,
        status: InvitationStatus.PENDING
      },
      select: {
        expiresAt: true
      }
    });

    const conflictMessage = getInvitationCreationConflict({
      membershipStatus: existingMembership?.status,
      hasPendingInvitation: Boolean(existingPendingInvitation),
      pendingInvitationExpiresAt: existingPendingInvitation?.expiresAt ?? null,
      now
    });

    if (conflictMessage) {
      throw conflict(conflictMessage);
    }

    const invitation = await prisma.invitation.create({
      data: {
        companyId: params.id,
        inviterUserId: user.id,
        inviteeEmail,
        role: input.role ?? MembershipRole.MEMBER,
        token: createOpaqueToken(),
        expiresAt: new Date(now.getTime() + (input.expiresInDays ?? 7) * 24 * 60 * 60 * 1000)
      }
    });

    return Response.json({
      data: invitation
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

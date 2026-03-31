import { requireUser } from "@/lib/auth";
import { conflict, toErrorResponse } from "@/lib/http";
import { prisma } from "@/lib/db";
import { InvitationStatus, MembershipStatus, MembershipRole, MembershipMemberType } from "@prisma/client";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { token: string } }
) {
  try {
    const user = await requireUser(request);

    const invitation = await prisma.invitation.findUnique({
      where: { token: params.token },
      include: { company: true }
    });

    if (!invitation) {
      return Response.json(
        { error: { message: "Invalid invitation token" } },
        { status: 404 }
      );
    }

    if (invitation.expiresAt < new Date()) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED }
      });
      return Response.json(
        { error: { message: "Invitation has expired" } },
        { status: 400 }
      );
    }

    if (invitation.inviteeEmail.toLowerCase() !== user.email.toLowerCase()) {
      return Response.json(
        { error: { message: "This invitation was sent to a different email address" } },
        { status: 403 }
      );
    }

    const existingMembership = await prisma.membership.findFirst({
      where: {
        companyId: invitation.companyId,
        userId: user.id
      }
    });

    if (existingMembership?.status === MembershipStatus.ACTIVE) {
      if (invitation.status === InvitationStatus.PENDING) {
        await prisma.invitation.update({
          where: { id: invitation.id },
          data: {
            status: InvitationStatus.ACCEPTED
          }
        });
      }

      return Response.json({
        data: {
          message: "You are already a member of this company",
          company: {
            id: invitation.company.id,
            name: invitation.company.name,
            slug: invitation.company.slug
          }
        }
      });
    }

    if (existingMembership) {
      throw conflict("Your membership already exists but is not active. Please contact a company admin.");
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      return Response.json(
        { error: { message: `Invitation is ${invitation.status.toLowerCase()}` } },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      prisma.membership.create({
        data: {
          companyId: invitation.companyId,
          userId: user.id,
          memberType: MembershipMemberType.HUMAN,
          role: invitation.role as MembershipRole,
          status: MembershipStatus.ACTIVE
        }
      }),
      prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.ACCEPTED }
      })
    ]);

    return Response.json({
      data: {
        message: "Successfully joined the company",
        company: {
          id: invitation.company.id,
          name: invitation.company.name,
          slug: invitation.company.slug
        }
      }
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

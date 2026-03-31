import { InvitationStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { toErrorResponse } from "@/lib/http";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: { token: string } }
) {
  try {
    const user = await getCurrentUser(request);

    const invitation = await prisma.invitation.findUnique({
      where: { token: params.token },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        inviter: {
          select: {
            email: true
          }
        }
      }
    });

    if (!invitation) {
      return Response.json(
        { error: { message: "Invalid invitation token" } },
        { status: 404 }
      );
    }

    const isExpired =
      invitation.status === InvitationStatus.PENDING && invitation.expiresAt < new Date();

    if (isExpired) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.EXPIRED
        }
      });
    }

    return Response.json({
      data: {
        companyId: invitation.company.id,
        companyName: invitation.company.name,
        inviterEmail: invitation.inviter.email,
        inviteeEmail: invitation.inviteeEmail,
        role: invitation.role,
        status: isExpired ? InvitationStatus.EXPIRED : invitation.status,
        expiresAt: invitation.expiresAt.toISOString(),
        viewer: user
          ? {
              email: user.email,
              displayName: user.displayName
            }
          : null
      }
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

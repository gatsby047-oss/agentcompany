import { requireUser } from "@/lib/auth";
import { ensureCompanyAdmin } from "@/lib/access";
import { toErrorResponse } from "@/lib/http";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { MembershipRole } from "@prisma/client";

export const runtime = "nodejs";

const updateMemberSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"]).optional(),
  department: z.string().optional()
});

const memberIdSchema = z.object({
  memberId: z.string()
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser(request);
    await ensureCompanyAdmin(user.id, params.id);

    const body = await request.json();
    const { role, department } = updateMemberSchema.parse(body);

    // Find membership
    const membership = await prisma.membership.findFirst({
      where: {
        id: body.memberId,
        companyId: params.id
      }
    });

    if (!membership) {
      return Response.json(
        { error: { message: "Member not found" } },
        { status: 404 }
      );
    }

    // Cannot modify own admin role
    if (membership.userId === user.id && role && role !== "ADMIN") {
      return Response.json(
        { error: { message: "Cannot change your own admin role" } },
        { status: 400 }
      );
    }

    const updated = await prisma.membership.update({
      where: { id: membership.id },
      data: {
        role: role as MembershipRole,
        ...(department !== undefined && { department })
      }
    });

    return Response.json({
      data: {
        id: updated.id,
        role: updated.role,
        department: updated.department,
        status: updated.status
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: { message: error.errors[0].message } },
        { status: 400 }
      );
    }
    return toErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser(request);
    await ensureCompanyAdmin(user.id, params.id);

    const url = new URL(request.url);
    const memberId = url.searchParams.get("memberId");

    if (!memberId) {
      return Response.json(
        { error: { message: "memberId is required" } },
        { status: 400 }
      );
    }

    // Find membership
    const membership = await prisma.membership.findFirst({
      where: {
        id: memberId,
        companyId: params.id
      }
    });

    if (!membership) {
      return Response.json(
        { error: { message: "Member not found" } },
        { status: 404 }
      );
    }

    // Cannot remove yourself
    if (membership.userId === user.id) {
      return Response.json(
        { error: { message: "Cannot remove yourself from the company" } },
        { status: 400 }
      );
    }

    await prisma.membership.delete({
      where: { id: membership.id }
    });

    return Response.json({
      data: { success: true }
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

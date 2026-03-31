import { requireUser } from "@/lib/auth";
import { ensureCompanyAccess } from "@/lib/access";
import { toErrorResponse } from "@/lib/http";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser(request);
    await ensureCompanyAccess(user.id, params.id);

    const memberships = await prisma.membership.findMany({
      where: { companyId: params.id },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            avatarUrl: true
          }
        },
        agentInstance: {
          select: {
            id: true,
            displayName: true,
            provider: true,
            status: true
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    const members = memberships.map((membership) => ({
      id: membership.id,
      role: membership.role,
      status: membership.status,
      department: membership.department,
      createdAt: membership.createdAt.toISOString(),
      memberType: membership.memberType,
      user: membership.user,
      agentInstance: membership.agentInstance
    }));

    return Response.json({
      data: {
        companyId: params.id,
        members
      }
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

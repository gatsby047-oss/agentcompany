import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ensureTaskAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { badRequest, parseJson, toErrorResponse } from "@/lib/http";
import { assignTaskRun } from "@/lib/workflow/engine";

export const runtime = "nodejs";

const assignmentSchema = z.object({
  membershipId: z.string().min(1)
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser(request);
    const { project } = await ensureTaskAccess(user.id, params.id);
    const input = await parseJson(request, assignmentSchema);

    const membership = await prisma.membership.findUnique({
      where: { id: input.membershipId }
    });

    if (!membership || membership.companyId !== project.companyId) {
      throw badRequest("Membership must belong to the same company as the project");
    }

    const taskRun = await assignTaskRun(params.id, input.membershipId);
    return Response.json({
      data: taskRun
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

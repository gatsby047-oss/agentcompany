import { ensureProjectAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildProjectEvaluationSummary } from "@/lib/evaluation";
import { jsonOk, toErrorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser(request);
    await ensureProjectAccess(user.id, params.id);

    const taskRuns = await prisma.taskRun.findMany({
      where: {
        projectId: params.id
      },
      select: {
        id: true,
        workflowRunId: true,
        workflowNodeId: true,
        status: true,
        runNo: true,
        queuedAt: true,
        startedAt: true,
        completedAt: true,
        outputJson: true,
        assignedAgentInstance: {
          select: {
            provider: true
          }
        }
      }
    });

    return jsonOk(buildProjectEvaluationSummary(taskRuns));
  } catch (error) {
    return toErrorResponse(error);
  }
}

import { requireUser } from "@/lib/auth";
import { ensureTaskAccess } from "@/lib/access";
import { toErrorResponse } from "@/lib/http";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser(request);
    await ensureTaskAccess(user.id, params.id);

    const taskRun = await prisma.taskRun.findUnique({
      where: { id: params.id },
      include: {
        workflowNode: true,
        workflowRun: true,
        assignedAgentInstance: {
          select: {
            id: true,
            displayName: true,
            provider: true
          }
        },
        assignedUser: {
          select: {
            id: true,
            displayName: true,
            email: true
          }
        }
      }
    });

    if (!taskRun) {
      return Response.json(
        { error: { message: "Task run not found" } },
        { status: 404 }
      );
    }

    return Response.json({
      data: {
        id: taskRun.id,
        projectId: taskRun.projectId,
        workflowRunId: taskRun.workflowRunId,
        workflowNodeId: taskRun.workflowNodeId,
        nodeTitle: taskRun.workflowNode.title,
        nodeKey: taskRun.workflowNode.nodeKey,
        runNo: taskRun.runNo,
        status: taskRun.status,
        progressPercent: taskRun.progressPercent,
        inputJson: taskRun.inputJson,
        outputJson: taskRun.outputJson,
        logObjectKey: taskRun.logObjectKey,
        artifactManifestJson: taskRun.artifactManifestJson,
        assignedAgentInstanceId: taskRun.assignedAgentInstanceId,
        assignedAgentInstance: taskRun.assignedAgentInstance,
        assignedUserId: taskRun.assignedUserId,
        assignedUser: taskRun.assignedUser,
        lastError: taskRun.workflowNode.lastError,
        queuedAt: taskRun.queuedAt.toISOString(),
        startedAt: taskRun.startedAt?.toISOString() ?? null,
        completedAt: taskRun.completedAt?.toISOString() ?? null,
        createdAt: taskRun.createdAt.toISOString()
      }
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

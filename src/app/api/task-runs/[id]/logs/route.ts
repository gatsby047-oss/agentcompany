import { requireUser } from "@/lib/auth";
import { ensureTaskAccess } from "@/lib/access";
import { toErrorResponse } from "@/lib/http";
import { prisma } from "@/lib/db";
import { getJsonObject } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser(request);
    await ensureTaskAccess(user.id, params.id);

    const taskRun = await prisma.taskRun.findUnique({
      where: { id: params.id }
    });

    if (!taskRun) {
      return Response.json(
        { error: { message: "Task run not found" } },
        { status: 404 }
      );
    }

    if (!taskRun.logObjectKey) {
      return Response.json({
        data: {
          taskRunId: params.id,
          logs: null,
          message: "No logs available for this task run"
        }
      });
    }

    try {
      const logs = await getJsonObject(taskRun.logObjectKey);
      return Response.json({
        data: {
          taskRunId: params.id,
          logs,
          logObjectKey: taskRun.logObjectKey
        }
      });
    } catch {
      return Response.json({
        data: {
          taskRunId: params.id,
          logs: null,
          message: "Logs could not be retrieved"
        }
      });
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}

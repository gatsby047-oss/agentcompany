import { requireUser } from "@/lib/auth";
import { ensureTaskAccess } from "@/lib/access";
import { toErrorResponse } from "@/lib/http";
import { prisma } from "@/lib/db";
import { getJsonObject } from "@/lib/storage";
import { getArtifactStorageKey, normalizeArtifactList } from "@/lib/artifacts";

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

    if (!taskRun.artifactManifestJson) {
      return Response.json({
        data: {
          taskRunId: params.id,
          artifacts: [],
          message: "No artifacts available for this task run"
        }
      });
    }

    let artifacts = normalizeArtifactList(taskRun.artifactManifestJson);
    const storageKey = getArtifactStorageKey(taskRun.artifactManifestJson);

    if (artifacts.length === 0 && storageKey) {
      try {
        const storedArtifacts = await getJsonObject(storageKey);
        artifacts = normalizeArtifactList(storedArtifacts);
      } catch {
        artifacts = [];
      }
    }

    return Response.json({
      data: {
        taskRunId: params.id,
        artifacts,
        artifactManifestJson: taskRun.artifactManifestJson,
        storageKey
      }
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

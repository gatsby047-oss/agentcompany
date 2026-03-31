import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ensureProjectAccess, ensureWorkflowAccess } from "@/lib/access";
import { parseJson, toErrorResponse } from "@/lib/http";
import { workflowDefinitionSchema } from "@/lib/workflow/graph";
import { upsertWorkflowDefinition } from "@/lib/workflow/engine";

export const runtime = "nodejs";

const workflowPayloadSchema = z.object({
  workflowId: z.string().optional(),
  projectId: z.string().min(1),
  definition: workflowDefinitionSchema
});

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await parseJson(request, workflowPayloadSchema);
    const definition = {
      ...input.definition,
      edges: input.definition.edges ?? []
    };

    if (input.workflowId) {
      await ensureWorkflowAccess(user.id, input.workflowId);
    } else {
      await ensureProjectAccess(user.id, input.projectId);
    }

    const workflow = await upsertWorkflowDefinition({
      workflowId: input.workflowId,
      projectId: input.projectId,
      definition
    });

    return Response.json({
      data: workflow
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

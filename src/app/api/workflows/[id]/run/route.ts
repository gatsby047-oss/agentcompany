import { requireUser } from "@/lib/auth";
import { ensureWorkflowAccess } from "@/lib/access";
import { toErrorResponse } from "@/lib/http";
import { runWorkflow } from "@/lib/workflow/engine";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser(request);
    await ensureWorkflowAccess(user.id, params.id);

    const result = await runWorkflow(params.id);
    return Response.json({
      data: result
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

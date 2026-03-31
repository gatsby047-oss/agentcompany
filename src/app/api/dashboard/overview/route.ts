import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  buildDashboardOverview,
  createAnonymousDashboardOverview
} from "@/lib/dashboard";
import { jsonOk, toErrorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const searchSchema = z.object({
  projectId: z.string().min(1).optional()
});

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return jsonOk(createAnonymousDashboardOverview());
    }

    const url = new URL(request.url);
    const query = searchSchema.parse({
      projectId: url.searchParams.get("projectId") ?? undefined
    });

    const overview = await buildDashboardOverview({
      user,
      projectId: query.projectId
    });

    return jsonOk(overview);
  } catch (error) {
    return toErrorResponse(error);
  }
}

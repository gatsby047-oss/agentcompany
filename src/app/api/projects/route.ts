import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ensureCompanyAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { parseJson, toErrorResponse } from "@/lib/http";

export const runtime = "nodejs";

const createProjectSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(2),
  summary: z.string().max(2_000).optional()
});

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await parseJson(request, createProjectSchema);
    await ensureCompanyAccess(user.id, input.companyId);

    const project = await prisma.project.create({
      data: {
        companyId: input.companyId,
        name: input.name,
        summary: input.summary
      }
    });

    return Response.json({
      data: project
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

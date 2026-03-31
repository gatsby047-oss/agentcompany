import { MembershipMemberType, MembershipRole } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseJson, toErrorResponse } from "@/lib/http";
import { createUniqueCompanySlug } from "@/lib/slug";

export const runtime = "nodejs";

const createCompanySchema = z.object({
  name: z.string().min(2),
  description: z.string().max(500).optional()
});

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await parseJson(request, createCompanySchema);
    const slug = await createUniqueCompanySlug(input.name);

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          founderUserId: user.id,
          name: input.name,
          slug,
          description: input.description
        }
      });

      const membership = await tx.membership.create({
        data: {
          companyId: company.id,
          memberType: MembershipMemberType.HUMAN,
          userId: user.id,
          role: MembershipRole.ADMIN,
          department: "Leadership"
        }
      });

      return {
        company,
        membership
      };
    });

    return Response.json({
      data: result
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

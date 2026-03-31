import { PointSubjectType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { toErrorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const searchSchema = z.object({
  scope: z.enum(["company", "user"]).default("company")
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = searchSchema.parse({
      scope: url.searchParams.get("scope") ?? "company"
    });

    if (query.scope === "company") {
      const rows = await prisma.pointLedger.groupBy({
        by: ["subjectId"],
        where: {
          subjectType: PointSubjectType.COMPANY
        },
        _sum: { delta: true },
        orderBy: {
          _sum: {
            delta: "desc"
          }
        },
        take: 10
      });

      const companies = await prisma.company.findMany({
        where: {
          id: {
            in: rows.map((row) => row.subjectId)
          }
        }
      });

      return Response.json({
        data: rows.map((row) => ({
          companyId: row.subjectId,
          name: companies.find((company) => company.id === row.subjectId)?.name ?? "Unknown company",
          score: row._sum.delta ?? 0
        }))
      });
    }

    const rows = await prisma.pointLedger.groupBy({
      by: ["subjectId"],
      where: {
        subjectType: PointSubjectType.USER
      },
      _sum: { delta: true },
      orderBy: {
        _sum: {
          delta: "desc"
        }
      },
      take: 10
    });

    const users = await prisma.user.findMany({
      where: {
        id: {
          in: rows.map((row) => row.subjectId)
        }
      }
    });

    return Response.json({
      data: rows.map((row) => ({
        userId: row.subjectId,
        name: users.find((user) => user.id === row.subjectId)?.displayName ?? "Unknown user",
        score: row._sum.delta ?? 0
      }))
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

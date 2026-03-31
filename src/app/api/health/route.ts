import { prisma } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { toErrorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [dbResult, redisResult] = await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      getRedis().ping()
    ]);

    return Response.json({
      data: {
        ok: true,
        db: Array.isArray(dbResult),
        redis: redisResult === "PONG"
      }
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

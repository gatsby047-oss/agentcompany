import { getCurrentUser } from "@/lib/auth";
import { jsonOk, toErrorResponse } from "@/lib/http";
import { serializeUser } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    return jsonOk({
      user: user ? serializeUser(user) : null
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

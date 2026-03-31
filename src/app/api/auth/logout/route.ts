import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";
import { toErrorResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function POST() {
  try {
    return clearSession(
      NextResponse.json({
        data: {
          ok: true
        }
      })
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

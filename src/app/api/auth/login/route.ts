import { NextResponse } from "next/server";
import { z } from "zod";
import { attachSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseJson, toErrorResponse, unauthorized } from "@/lib/http";
import { serializeUser } from "@/lib/serializers";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, loginSchema);
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() }
    });

    if (!user) {
      throw unauthorized("Invalid credentials");
    }

    const isValid = await verifyPassword(input.password, user.passwordHash);
    if (!isValid) {
      throw unauthorized("Invalid credentials");
    }

    const response = NextResponse.json({
      data: {
        user: serializeUser(user)
      }
    });

    return attachSession(response, user.id);
  } catch (error) {
    return toErrorResponse(error);
  }
}

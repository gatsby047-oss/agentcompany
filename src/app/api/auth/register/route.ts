import { NextResponse } from "next/server";
import { z } from "zod";
import { attachSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { conflict, parseJson, toErrorResponse } from "@/lib/http";
import { serializeUser } from "@/lib/serializers";

export const runtime = "nodejs";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  locale: z.string().min(2).default("zh-HK")
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, registerSchema);
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() }
    });

    if (existingUser) {
      throw conflict("Email is already registered");
    }

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash: await hashPassword(input.password),
        displayName: input.displayName,
        locale: input.locale
      }
    });

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

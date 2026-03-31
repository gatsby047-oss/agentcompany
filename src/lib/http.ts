import { NextResponse } from "next/server";
import { ZodError, ZodSchema } from "zod";

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
    public details?: unknown
  ) {
    super(message);
  }
}

export function badRequest(message: string, details?: unknown) {
  return new ApiError(message, 400, details);
}

export function unauthorized(message = "Unauthorized") {
  return new ApiError(message, 401);
}

export function forbidden(message = "Forbidden") {
  return new ApiError(message, 403);
}

export function notFound(message = "Not found") {
  return new ApiError(message, 404);
}

export function conflict(message: string) {
  return new ApiError(message, 409);
}

export async function parseJson<T>(request: Request, schema: ZodSchema<T>) {
  const json = await request.json();
  return schema.parse(json);
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function toErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          message: "Validation failed",
          details: error.flatten()
        }
      },
      { status: 400 }
    );
  }

  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          message: error.message,
          details: error.details
        }
      },
      { status: error.status }
    );
  }

  console.error(error);

  return NextResponse.json(
    {
      error: {
        message: "Internal server error"
      }
    },
    { status: 500 }
  );
}

import { existsSync, readFileSync } from "fs";
import path from "path";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  APP_URL: z.string().url().default("http://127.0.0.1:3001"),
  AUTH_SECRET: z.string().default("dev-only-auth-secret-change-me"),
  AGENT_CALLBACK_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().default("dev-only-encryption-key-change-me-32chars"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1/responses"),
  OPENAI_MODEL: z.string().default("gpt-5-mini"),
  OPENAI_MODEL_PRICING_JSON: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().url().default("https://api.anthropic.com/v1/messages"),
  ANTHROPIC_API_VERSION: z.string().default("2023-06-01"),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),
  ANTHROPIC_MODEL_PRICING_JSON: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  HEARTBEAT_INTERVAL_SECONDS: z.coerce.number().default(20),
  HEARTBEAT_TTL_SECONDS: z.coerce.number().default(40),
  WORKER_CONCURRENCY: z.coerce.number().default(5),
  TASK_MAX_RETRIES: z.coerce.number().default(2)
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;
let didLoadDotEnv = false;

function loadDotEnvIfPresent() {
  if (didLoadDotEnv) {
    return;
  }

  didLoadDotEnv = true;

  const envFilePath = path.join(process.cwd(), ".env");
  if (!existsSync(envFilePath)) {
    return;
  }

  const fileContents = readFileSync(envFilePath, "utf8");
  const lines = fileContents.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    const isWrappedInQuotes =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));

    if (isWrappedInQuotes) {
      value = value.slice(1, -1);
    }

    process.env[key] = value.replace(/\\n/g, "\n");
  }
}

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    loadDotEnvIfPresent();
    cachedEnv = envSchema.parse(process.env);
  }

  return cachedEnv;
}

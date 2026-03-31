import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getEnv } from "@/lib/env";

let s3Client: S3Client | null = null;

function getS3Client() {
  if (!s3Client) {
    const env = getEnv();
    s3Client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials:
        env.S3_ACCESS_KEY && env.S3_SECRET_KEY
          ? {
              accessKeyId: env.S3_ACCESS_KEY,
              secretAccessKey: env.S3_SECRET_KEY
            }
          : undefined
    });
  }

  return s3Client;
}

async function storeLocally(key: string, body: string) {
  const fullPath = path.join(process.cwd(), "var", "storage", key);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, body, "utf8");
  return key;
}

async function storeInS3(key: string, body: string) {
  const env = getEnv();

  if (!env.S3_BUCKET) {
    throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
  }

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: "application/json"
    })
  );

  return key;
}

export async function putJsonObject(key: string, payload: unknown) {
  const env = getEnv();
  const body = JSON.stringify(payload, null, 2);

  if (env.STORAGE_DRIVER === "s3") {
    return storeInS3(key, body);
  }

  return storeLocally(key, body);
}

async function getLocally(key: string): Promise<unknown> {
  const fullPath = path.join(process.cwd(), "var", "storage", key);
  const content = await readFile(fullPath, "utf8");
  return JSON.parse(content);
}

async function getFromS3(key: string): Promise<unknown> {
  const env = getEnv();

  if (!env.S3_BUCKET) {
    throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
  }

  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key
    })
  );

  if (!response.Body) {
    throw new Error(`Object not found: ${key}`);
  }

  const content = await response.Body.transformToString();
  return JSON.parse(content);
}

export async function getJsonObject(key: string): Promise<unknown> {
  const env = getEnv();

  if (env.STORAGE_DRIVER === "s3") {
    return getFromS3(key);
  }

  return getLocally(key);
}

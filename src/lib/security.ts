import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { getEnv } from "@/lib/env";

function getEncryptionKey() {
  return createHash("sha256").update(getEnv().ENCRYPTION_KEY).digest();
}

export function encryptSecret(plainText: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptSecret(cipherText: string) {
  const raw = Buffer.from(cipherText, "base64url");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function createOpaqueToken(size = 24) {
  return randomBytes(size).toString("base64url");
}

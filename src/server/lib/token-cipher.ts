import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1:";
const IV_LENGTH = 12;

function masterKey(): Buffer {
  const secret =
    process.env.GOOGLE_CLASSROOM_TOKEN_ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET || "";
  if (!secret) {
    throw new Error("GOOGLE_CLASSROOM_TOKEN_ENCRYPTION_KEY or BETTER_AUTH_SECRET is required");
  }
  return createHash("sha256").update(`schedly-token-cipher:${secret}`).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecret(value: string): string {
  if (!value.startsWith(PREFIX)) throw new Error("Unsupported token format");
  const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted token");
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
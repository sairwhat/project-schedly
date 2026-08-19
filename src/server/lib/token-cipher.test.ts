import { describe, it, expect, beforeEach } from "vitest";
import { encryptSecret, decryptSecret } from "@/server/lib/token-cipher";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.GOOGLE_CLASSROOM_TOKEN_ENCRYPTION_KEY = "test-encryption-key";
});

describe("token cipher", () => {
  it("round-trips a token", () => {
    const encrypted = encryptSecret("ya29.super-secret-access-token");
    expect(encrypted).toContain("v1:");
    expect(encrypted).not.toContain("ya29.super-secret-access-token");
    expect(decryptSecret(encrypted)).toBe("ya29.super-secret-access-token");
  });

  it("produces different ciphertexts for the same token (random IV)", () => {
    const a = encryptSecret("same-token");
    const b = encryptSecret("same-token");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same-token");
    expect(decryptSecret(b)).toBe("same-token");
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptSecret("token");
    const tampered = encrypted.slice(0, -4) + "AAAA";
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("rejects values with an unknown format", () => {
    expect(() => decryptSecret("plain-token")).toThrow();
  });

  it("fails to decrypt with a different key", () => {
    const encrypted = encryptSecret("token");
    process.env.GOOGLE_CLASSROOM_TOKEN_ENCRYPTION_KEY = "different-key";
    expect(() => decryptSecret(encrypted)).toThrow();
  });
});
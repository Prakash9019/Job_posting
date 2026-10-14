import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard 96-bit IV for AES-GCM

function parseKey(secret: string): Buffer {
  // If secret is 64 hex characters (32 bytes), parse as hex
  if (/^[0-9a-fA-F]{64}$/.test(secret)) {
    return Buffer.from(secret, "hex");
  }
  // Otherwise derive a 32-byte key using SHA-256
  return crypto.createHash("sha256").update(secret).digest();
}

export function getEncryptionKey(secretOverride?: string): Buffer {
  const secret = secretOverride || process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error("ENCRYPTION_SECRET environment variable is missing.");
  }
  return parseKey(secret);
}

/**
 * Encrypt plaintext string using AES-256-GCM.
 * Output format: iv:ciphertext:authTag in base64
 */
export function encrypt(plaintext: string, secretOverride?: string): string {
  if (!plaintext) return "";
  const key = getEncryptionKey(secretOverride);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${encrypted.toString("base64")}:${tag.toString("base64")}`;
}

/**
 * Decrypt ciphertext string encrypted with AES-256-GCM.
 * Supports fallback to OLD_ENCRYPTION_SECRET for zero-downtime key rotation.
 */
export function decrypt(encryptedPayload: string, secretOverride?: string): string {
  if (!encryptedPayload) return "";
  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format.");
  }

  const [ivB64, ciphertextB64, tagB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const tag = Buffer.from(tagB64, "base64");

  // Attempt primary key
  try {
    const key = getEncryptionKey(secretOverride);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch (primaryError) {
    // If a fallback OLD_ENCRYPTION_SECRET exists and no manual secretOverride was passed, try fallback
    const oldSecret = process.env.OLD_ENCRYPTION_SECRET;
    if (!secretOverride && oldSecret && oldSecret !== process.env.ENCRYPTION_SECRET) {
      try {
        const fallbackKey = parseKey(oldSecret);
        const decipher = crypto.createDecipheriv(ALGORITHM, fallbackKey, iv);
        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([
          decipher.update(ciphertext),
          decipher.final(),
        ]);

        return decrypted.toString("utf8");
      } catch {
        // Fallback also failed, rethrow primary error
      }
    }

    throw new Error(
      `Decryption failed: Token may have been encrypted with a different key or data was corrupted. (${primaryError instanceof Error ? primaryError.message : String(primaryError)})`
    );
  }
}

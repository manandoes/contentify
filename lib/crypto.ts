/**
 * Application-layer encryption for the OAuth tokens stored in
 * platform_connections (Rules.md §1.6 — tokens never live in plaintext, and
 * never reach the browser).
 *
 * The Phase 1 migration named those columns `*_encrypted` and left the
 * encryption to the application; this is that layer. AES-256-GCM, so a
 * tampered ciphertext fails to decrypt rather than yielding garbage that
 * would be sent to a platform API as if it were a token.
 *
 * The stored value is `base64(iv ‖ authTag ‖ ciphertext)` — one
 * self-contained string per column, no separate IV column to keep in sync.
 */
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "./config";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM's standard nonce length
const TAG_BYTES = 16;

function key(): Buffer {
  // lib/config.ts already validated this is 64 hex chars = 32 bytes.
  return Buffer.from(config.tokenEncryptionKey, "hex");
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decryptSecret(encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  if (raw.length <= IV_BYTES + TAG_BYTES) {
    throw new Error("Stored secret is malformed — re-authenticate the connection.");
  }

  const iv = raw.subarray(0, IV_BYTES);
  const authTag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

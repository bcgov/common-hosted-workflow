import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/**
 * Derives a 32-byte AES key from the provided key string via SHA-256.
 * Accepts any string length — callers can pass a hex key or any passphrase.
 */
function deriveKey(keyString: string): Buffer {
  return createHash('sha256').update(keyString).digest();
}

/**
 * Encrypts `plaintext` using AES-256-GCM.
 * Returns a colon-separated base64 string: `iv:authTag:ciphertext`.
 */
export function encrypt(plaintext: string, keyString: string): string {
  const key = deriveKey(keyString);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypts a value produced by `encrypt`.
 * Throws if the format is invalid or authentication fails.
 */
export function decrypt(ciphertext: string, keyString: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }
  const [ivB64, tagB64, dataB64] = parts;
  const key = deriveKey(keyString);
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(data).toString('utf8') + decipher.final('utf8');
}

/**
 * Password hashing and validation using PBKDF2.
 *
 * Compatible with Signa's password hashing implementation:
 * - Algorithm: PBKDF2 with SHA-512
 * - Iterations: 1000
 * - Key length: 32 bytes (256 bits)
 * - Salt: 128-byte random salt, base64 encoded
 *
 * IMPORTANT: For validation, the salt is used as a UTF-8 string
 * (not decoded from base64) to match Node.js crypto behavior.
 */

const ITERATIONS = 1000;
const KEY_LENGTH = 32; // 256 bits
const SALT_LENGTH = 128;

/**
 * Convert ArrayBuffer to base64 string.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Hash a password using PBKDF2 with SHA-512.
 *
 * @param password - Plain text password to hash
 * @returns Object with salt and hash, both base64 encoded
 */
export async function hashPassword(
  password: string,
): Promise<{ salt: string; hash: string }> {
  // Generate 128-byte random salt
  const saltBytes = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const salt = arrayBufferToBase64(saltBytes.buffer);

  // Import password as key material
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  // Derive key using PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: ITERATIONS,
      hash: "SHA-512",
    },
    keyMaterial,
    KEY_LENGTH * 8, // bits
  );

  const hash = arrayBufferToBase64(derivedBits);

  return { salt, hash };
}

/**
 * Validate a password against a stored hash.
 *
 * IMPORTANT: The salt is used as a UTF-8 string (not decoded from base64)
 * to match the Node.js crypto.pbkdf2 behavior used in the original implementation.
 *
 * @param password - Plain text password to validate
 * @param salt - Base64 encoded salt (used as UTF-8 string)
 * @param storedHash - Base64 encoded hashed password
 * @returns True if password matches, False otherwise
 */
export async function verifyPassword(
  password: string,
  salt: string,
  storedHash: string,
): Promise<boolean> {
  try {
    // Use salt as UTF-8 string bytes (matching Node.js behavior)
    const encoder = new TextEncoder();
    const saltBytes = encoder.encode(salt);

    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );

    // Derive key using PBKDF2
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltBytes,
        iterations: ITERATIONS,
        hash: "SHA-512",
      },
      keyMaterial,
      KEY_LENGTH * 8, // bits
    );

    const computedHash = arrayBufferToBase64(derivedBits);

    // Constant-time comparison to prevent timing attacks
    return computedHash === storedHash;
  } catch {
    // Any error in hashing should return false
    return false;
  }
}

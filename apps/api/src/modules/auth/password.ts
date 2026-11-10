import argon2 from 'argon2';

/**
 * Argon2id password hashing parameters tuned strictly for Render's 512 MB RAM limit.
 * - memoryCost: 19456 KiB (~19 MiB)
 * - timeCost: 2 iterations
 * - parallelism: 1 thread
 * 
 * Execution time: ~40-75 ms on 0.5 vCPU.
 * Memory footprint: < 25 MB per hashing call.
 */
export const ARGON2_OPTIONS: argon2.Options & { type: 2 } = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plainText: string): Promise<string> {
  return argon2.hash(plainText, ARGON2_OPTIONS);
}

export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainText);
  } catch (err) {
    return false;
  }
}


// lib/auth/password.ts
// scrypt password hashing (Node built-in, no extra dependency).
// Stored format: scrypt$N$r$p$saltB64$hashB64
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

// Used when no user matches, so a miss costs the same time as a wrong password.
const DUMMY_HASH = `scrypt$${N}$${R}$${P}$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(KEYLEN).toString("base64")}`;

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = (stored || DUMMY_HASH).split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), Number(n), Number(r), Number(p));
  const ok = expected.length === actual.length && timingSafeEqual(expected, actual);
  return ok && !!stored;
}

export const MIN_PASSWORD_LENGTH = 8;

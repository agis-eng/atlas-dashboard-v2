import "server-only";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { getRedis, REDIS_KEYS, type User } from "@/lib/redis";

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createUser(params: {
  email: string;
  name: string;
  password: string;
  profile: "erik" | "anton";
}): Promise<User> {
  const redis = getRedis();
  const email = params.email.toLowerCase().trim();

  // Check for duplicate
  const existing = await redis.get(REDIS_KEYS.userByEmail(email));
  if (existing) {
    throw new Error("A user with that email already exists");
  }

  const user: User = {
    id: randomUUID(),
    email,
    name: params.name,
    passwordHash: await hashPassword(params.password),
    profile: params.profile,
    createdAt: Date.now(),
  };

  await redis.set(REDIS_KEYS.user(user.id), user);
  await redis.set(REDIS_KEYS.userByEmail(email), user.id);

  return user;
}

export async function getUserById(userId: string): Promise<User | null> {
  const redis = getRedis();
  return redis.get<User>(REDIS_KEYS.user(userId));
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const redis = getRedis();
  const userId = await redis.get<string>(
    REDIS_KEYS.userByEmail(email.toLowerCase().trim())
  );
  if (!userId) return null;
  return redis.get<User>(REDIS_KEYS.user(userId));
}

export async function validateCredentials(
  email: string,
  password: string
): Promise<User | null> {
  const user = await getUserByEmail(email);
  if (!user) return null;
  const valid = await verifyPassword(password, user.passwordHash);
  return valid ? user : null;
}

// Safe user object — no passwordHash
export type PublicUser = Omit<User, "passwordHash">;

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _, ...pub } = user;
  return pub;
}

// Get session user from request headers (for use in API routes)
export async function getSessionUserFromRequest(
  request: Request
): Promise<PublicUser | null> {
  const { decryptSession } = await import("@/lib/session");
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/atlas_session=([^;]+)/);
  if (!match) return null;
  const payload = await decryptSession(match[1]);
  if (!payload) return null;

  // Verify session still in Redis
  const redis = getRedis();
  const { REDIS_KEYS: KEYS } = await import("@/lib/redis");
  const session = await redis.get(KEYS.session(payload.sessionId));
  if (!session) return null;

  return {
    id: payload.userId,
    email: payload.email,
    name: payload.name,
    profile: payload.profile,
    createdAt: 0,
  };
}

import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getRedis, REDIS_KEYS, type Session } from "@/lib/redis";
import { randomUUID } from "crypto";

const COOKIE_NAME = "atlas_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SESSION_DURATION_SECS = 7 * 24 * 60 * 60;

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  sessionId: string;
  name: string;
  email: string;
  profile: "erik" | "anton";
}

export async function encryptSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecretKey());
}

export async function decryptSession(
  token: string | undefined
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const sessionId = randomUUID();
  const expiresAt = Date.now() + SESSION_DURATION_MS;

  // Store session record in Redis for server-side invalidation
  const redis = getRedis();
  const sessionRecord: Session = {
    id: sessionId,
    userId: payload.userId,
    createdAt: Date.now(),
    expiresAt,
  };
  await redis.set(REDIS_KEYS.session(sessionId), sessionRecord, {
    ex: SESSION_DURATION_SECS,
  });

  // Encrypt JWT with sessionId embedded
  const token = await encryptSession({ ...payload, sessionId });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_SECS,
    path: "/",
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await decryptSession(token);
  if (!payload) return null;

  // Verify session still exists in Redis (not invalidated)
  const redis = getRedis();
  const sessionRecord = await redis.get<Session>(
    REDIS_KEYS.session(payload.sessionId)
  );
  if (!sessionRecord) return null;

  return payload;
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token) {
    const payload = await decryptSession(token);
    if (payload?.sessionId) {
      const redis = getRedis();
      await redis.del(REDIS_KEYS.session(payload.sessionId));
    }
  }

  cookieStore.delete(COOKIE_NAME);
}

// For use in proxy.ts — reads cookie from request without Next.js headers()
export async function decryptSessionFromCookie(
  cookieValue: string | undefined
): Promise<SessionPayload | null> {
  return decryptSession(cookieValue);
}

/**
 * Seed initial users (Erik and Anton) into Redis.
 *
 * Usage:
 *   node scripts/seed-users.mjs
 *
 * Override default passwords via env vars:
 *   ERIK_PASSWORD=... ANTON_PASSWORD=... node scripts/seed-users.mjs
 *
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env.local
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Load .env.local manually
const envPath = resolve(ROOT, ".env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  const val = trimmed.slice(eqIdx + 1).replace(/^["']|["']$/g, "");
  process.env[key] = val;
}

// Dynamically import bcryptjs and @upstash/redis after env is loaded
const bcrypt = await import("bcryptjs");
const { Redis } = await import("@upstash/redis");

const redis = Redis.fromEnv();

const BCRYPT_ROUNDS = 12;

async function seedUser({ id, email, name, password, profile }) {
  const emailKey = `user:email:${email.toLowerCase()}`;
  const userKey = `user:${id}`;

  const existing = await redis.get(emailKey);
  if (existing) {
    console.log(`  ⚠  ${name} (${email}) already exists — skipping`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = {
    id,
    email,
    name,
    passwordHash,
    profile,
    createdAt: Date.now(),
  };

  await redis.set(userKey, user);
  await redis.set(emailKey, id);

  console.log(`  ✓  Created ${name} (${email})`);
}

const ERIK_PASSWORD = process.env.ERIK_PASSWORD ?? "changeme123";
const ANTON_PASSWORD = process.env.ANTON_PASSWORD ?? "changeme123";

console.log("\nSeeding users into Redis…\n");

await seedUser({
  id: "user_erik",
  email: "erik@rcmn.com",
  name: "Erik",
  password: ERIK_PASSWORD,
  profile: "erik",
});

await seedUser({
  id: "user_anton",
  email: "anton@rcmn.com",
  name: "Anton",
  password: ANTON_PASSWORD,
  profile: "anton",
});

console.log("\nDone.\n");
console.log("Default passwords: changeme123");
console.log("Override with: ERIK_PASSWORD=... ANTON_PASSWORD=... node scripts/seed-users.mjs\n");

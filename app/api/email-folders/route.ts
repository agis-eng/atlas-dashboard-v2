// @ts-nocheck
import { NextRequest } from "next/server";
import Imap from "imap";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

function getImapConfig(account: any) {
  return {
    user: account.email,
    password: account.smtp?.password || "",
    host: account.smtp?.host || "mail.privateemail.com",
    port: 993,
    tls: true,
  };
}

function flattenBoxes(boxes: any, prefix = "") {
  const folders: string[] = [];
  for (const [name, box] of Object.entries(boxes || {})) {
    const delimiter = (box as any).delimiter || "/";
    const path = prefix ? `${prefix}${delimiter}${name}` : name;
    folders.push(path);
    folders.push(...flattenBoxes((box as any).children, path));
  }
  return folders;
}

async function withAccount(request: NextRequest) {
  const { getSessionUserFromRequest } = await import("@/lib/auth");
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const redis = getRedis();
  const settings = await redis.get(REDIS_KEYS.emailSettings(user.profile));
  const accounts = (settings as any)?.accounts || [];
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId");
  const account = accountId
    ? accounts.find((a: any) => a.id === accountId)
    : accounts.find((a: any) => a.type === "smtp");

  if (!account) {
    return { error: Response.json({ error: "Account not found" }, { status: 404 }) };
  }

  return { user, account };
}

function listFolders(config: any) {
  return new Promise<string[]>((resolve, reject) => {
    const imap = new Imap({
      ...config,
      tlsOptions: { rejectUnauthorized: false },
    });

    imap.once("ready", () => {
      imap.getBoxes((err, boxes) => {
        imap.end();
        if (err) return reject(err);
        resolve(flattenBoxes(boxes).sort((a, b) => a.localeCompare(b)));
      });
    });

    imap.once("error", reject);
    imap.connect();
  });
}

function createFolder(config: any, folderName: string) {
  return new Promise<void>((resolve, reject) => {
    const imap = new Imap({
      ...config,
      tlsOptions: { rejectUnauthorized: false },
    });

    imap.once("ready", () => {
      imap.addBox(folderName, (err) => {
        imap.end();
        if (err) return reject(err);
        resolve();
      });
    });

    imap.once("error", reject);
    imap.connect();
  });
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await withAccount(request);
    if (ctx.error) return ctx.error;

    const folders = await listFolders(getImapConfig(ctx.account));
    return Response.json({ folders });
  } catch (error: any) {
    return Response.json({ error: error.message || "Failed to list folders" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await withAccount(request);
    if (ctx.error) return ctx.error;

    const body = await request.json();
    const name = (body?.name || "").trim();
    if (!name) {
      return Response.json({ error: "Folder name is required" }, { status: 400 });
    }

    await createFolder(getImapConfig(ctx.account), name);
    const folders = await listFolders(getImapConfig(ctx.account));
    return Response.json({ success: true, folders });
  } catch (error: any) {
    return Response.json({ error: error.message || "Failed to create folder" }, { status: 500 });
  }
}

// @ts-nocheck
import { NextRequest } from "next/server";
import Imap from "imap";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

interface EmailAction {
  emailIds: string[]; // Message IDs or UIDs
  action: "delete" | "archive" | "mark-read" | "mark-unread" | "star" | "unstar" | "move";
  accountId?: string;
  targetFolder?: string;
}

async function performImapAction(config: {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
}, action: EmailAction) {
  return new Promise<{ success: boolean; message: string }>((resolve, reject) => {
    const imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      tlsOptions: { rejectUnauthorized: false },
    });

    imap.once("ready", () => {
      imap.openBox("INBOX", false, (err) => {
        if (err) {
          reject(err);
          return;
        }

        const uids = action.emailIds.map((id) => parseInt(id, 10)).filter(Boolean);

        const finalize = (cb: (done: (err?: Error | null, result?: { success: boolean; message: string }) => void) => void) => {
          cb((err, result) => {
            imap.end();
            if (err) reject(err);
            else resolve(result || { success: true, message: "Done" });
          });
        };

        switch (action.action) {
          case "delete":
            finalize((done) => {
              imap.addFlags(uids, "\\Deleted", (flagErr) => {
                if (flagErr) return done(flagErr);
                imap.expunge((expungeErr) => {
                  if (expungeErr) done(expungeErr);
                  else done(null, { success: true, message: `Deleted ${uids.length} email(s)` });
                });
              });
            });
            break;

          case "archive":
            finalize((done) => {
              imap.move(uids, "Archive", (moveErr) => {
                if (!moveErr) {
                  return done(null, { success: true, message: `Archived ${uids.length} email(s)` });
                }
                imap.addBox("Archive", (addErr) => {
                  if (addErr) return done(new Error("Archive folder doesn't exist and couldn't be created"));
                  imap.move(uids, "Archive", (retryErr) => {
                    if (retryErr) done(retryErr);
                    else done(null, { success: true, message: `Archived ${uids.length} email(s)` });
                  });
                });
              });
            });
            break;

          case "move":
            finalize((done) => {
              if (!action.targetFolder) return done(new Error("Target folder is required"));
              imap.move(uids, action.targetFolder, (moveErr) => {
                if (moveErr) return done(moveErr);
                done(null, { success: true, message: `Moved ${uids.length} email(s) to ${action.targetFolder}` });
              });
            });
            break;

          case "mark-read":
            finalize((done) => {
              imap.addFlags(uids, "\\Seen", (flagErr) => {
                if (flagErr) done(flagErr);
                else done(null, { success: true, message: `Marked ${uids.length} email(s) as read` });
              });
            });
            break;

          case "mark-unread":
            finalize((done) => {
              imap.delFlags(uids, "\\Seen", (flagErr) => {
                if (flagErr) done(flagErr);
                else done(null, { success: true, message: `Marked ${uids.length} email(s) as unread` });
              });
            });
            break;

          case "star":
            finalize((done) => {
              imap.addFlags(uids, "\\Flagged", (flagErr) => {
                if (flagErr) done(flagErr);
                else done(null, { success: true, message: `Starred ${uids.length} email(s)` });
              });
            });
            break;

          case "unstar":
            finalize((done) => {
              imap.delFlags(uids, "\\Flagged", (flagErr) => {
                if (flagErr) done(flagErr);
                else done(null, { success: true, message: `Unstarred ${uids.length} email(s)` });
              });
            });
            break;

          default:
            imap.end();
            reject(new Error(`Unknown action: ${action.action}`));
        }
      });
    });

    imap.once("error", reject);
    imap.connect();
  });
}

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: EmailAction = await request.json();

    if (!body.emailIds || body.emailIds.length === 0) {
      return Response.json({ error: "No email IDs provided" }, { status: 400 });
    }

    if (!body.action) {
      return Response.json({ error: "No action specified" }, { status: 400 });
    }

    const redis = getRedis();
    const settings = await redis.get(REDIS_KEYS.emailSettings(user.profile));

    if (!settings || typeof settings !== "object") {
      return Response.json({ error: "No email accounts configured" }, { status: 400 });
    }

    const emailSettings = settings as any;
    const accounts = emailSettings.accounts || [];

    if (accounts.length === 0) {
      return Response.json({ error: "No email accounts found" }, { status: 400 });
    }

    const account = body.accountId
      ? accounts.find((a: any) => a.id === body.accountId)
      : accounts.find((a: any) => a.type === "smtp");

    if (!account) {
      return Response.json({ error: "Account not found" }, { status: 404 });
    }

    const result = await performImapAction({
      user: account.email,
      password: account.smtp?.password || "",
      host: account.smtp?.host || "mail.privateemail.com",
      port: 993,
      tls: true,
    }, body);

    const cacheKey = `email:inbox:${user.profile}:${body.accountId || "all"}`;
    await redis.del(cacheKey);
    await redis.del(`email:inbox:${user.profile}:all`);

    return Response.json(result);
  } catch (error: any) {
    console.error("Email action error:", error);
    return Response.json(
      { error: error.message || "Failed to perform action" },
      { status: 500 }
    );
  }
}

// @ts-nocheck
import { NextRequest } from "next/server";
import Imap from "imap";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

interface EmailAction {
  emailIds: string[]; // Message IDs or UIDs
  action: "delete" | "archive" | "mark-read" | "mark-unread" | "star" | "unstar";
  accountId?: string;
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

        // Convert email IDs to UIDs (IDs are UIDs from fetch)
        const uids = action.emailIds.map(id => parseInt(id));

        switch (action.action) {
          case "delete":
            // Mark as deleted and expunge
            imap.addFlags(uids, "\\Deleted", (flagErr) => {
              if (flagErr) {
                reject(flagErr);
                return;
              }
              imap.expunge((expungeErr) => {
                imap.end();
                if (expungeErr) {
                  reject(expungeErr);
                } else {
                  resolve({ success: true, message: `Deleted ${uids.length} email(s)` });
                }
              });
            });
            break;

          case "archive":
            // Move to Archive folder (or create if doesn't exist)
            imap.move(uids, "Archive", (moveErr) => {
              imap.end();
              if (moveErr) {
                // Try creating Archive folder first
                imap.addBox("Archive", (addErr) => {
                  if (addErr) {
                    reject(new Error("Archive folder doesn't exist and couldn't be created"));
                  } else {
                    resolve({ success: true, message: "Created Archive folder" });
                  }
                });
              } else {
                resolve({ success: true, message: `Archived ${uids.length} email(s)` });
              }
            });
            break;

          case "mark-read":
            imap.addFlags(uids, "\\Seen", (flagErr) => {
              imap.end();
              if (flagErr) {
                reject(flagErr);
              } else {
                resolve({ success: true, message: `Marked ${uids.length} email(s) as read` });
              }
            });
            break;

          case "mark-unread":
            imap.delFlags(uids, "\\Seen", (flagErr) => {
              imap.end();
              if (flagErr) {
                reject(flagErr);
              } else {
                resolve({ success: true, message: `Marked ${uids.length} email(s) as unread` });
              }
            });
            break;

          case "star":
            imap.addFlags(uids, "\\Flagged", (flagErr) => {
              imap.end();
              if (flagErr) {
                reject(flagErr);
              } else {
                resolve({ success: true, message: `Starred ${uids.length} email(s)` });
              }
            });
            break;

          case "unstar":
            imap.delFlags(uids, "\\Flagged", (flagErr) => {
              imap.end();
              if (flagErr) {
                reject(flagErr);
              } else {
                resolve({ success: true, message: `Unstarred ${uids.length} email(s)` });
              }
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
    // Get logged-in user
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

    // Get email settings (filtered by user profile)
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

    // Use first SMTP account (or specific account if provided)
    const account = body.accountId
      ? accounts.find((a: any) => a.id === body.accountId)
      : accounts.find((a: any) => a.type === "smtp");

    if (!account) {
      return Response.json({ error: "Account not found" }, { status: 404 });
    }

    // Perform IMAP action
    const result = await performImapAction({
      user: account.email,
      password: account.smtp?.password || "",
      host: account.smtp?.host || "mail.privateemail.com",
      port: 993,
      tls: true,
    }, body);

    // Invalidate cache after successful action
    const cacheKey = `email:inbox:${user.profile}:${body.accountId || "all"}`;
    await redis.del(cacheKey);

    return Response.json(result);
  } catch (error: any) {
    console.error("Email action error:", error);
    return Response.json(
      { error: error.message || "Failed to perform action" },
      { status: 500 }
    );
  }
}

// @ts-nocheck
import { NextRequest } from "next/server";
import Imap from "imap";
import { simpleParser } from "mailparser";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

function getBrainsKey(userId: string) {
  return `brains:${userId}`;
}

function normalizeSender(sender: string) {
  const match = sender.match(/<([^>]+)>/);
  return (match?.[1] || sender).trim().toLowerCase();
}

interface EmailMessage {
  id: string;
  uid: number;
  from: string;
  to: string;
  cc?: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  htmlBody?: string;
  messageId?: string;
  references?: string[];
  read: boolean;
  starred: boolean;
  labels: string[];
  account: string;
  brainMatches?: string[];
}

async function archiveEmailsViaIMAP(config: {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
}, uids: number[]) {
  if (uids.length === 0) return;

  return new Promise<void>((resolve, reject) => {
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

        imap.move(uids, "Archive", (moveErr) => {
          if (!moveErr) {
            imap.end();
            resolve();
            return;
          }

          imap.addBox("Archive", (addErr) => {
            if (addErr) {
              imap.end();
              reject(moveErr);
              return;
            }

            imap.move(uids, "Archive", (retryErr) => {
              imap.end();
              if (retryErr) reject(retryErr);
              else resolve();
            });
          });
        });
      });
    });

    imap.once("error", reject);
    imap.connect();
  });
}

async function fetchEmailsViaIMAP(config: {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
}) {
  return new Promise<EmailMessage[]>((resolve, reject) => {
    const imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      tlsOptions: { rejectUnauthorized: false },
    });

    const emails: EmailMessage[] = [];

    imap.once("ready", () => {
      imap.openBox("INBOX", false, (err, box) => {
        if (err) {
          reject(err);
          return;
        }

        // Fetch last 50 emails
        const total = box.messages.total;
        const fetchRange = `${Math.max(1, total - 49)}:${total}`;

        const fetch = imap.seq.fetch(fetchRange, {
          bodies: "",
          struct: true,
        });

        const emailData: Map<number, any> = new Map();
        
        fetch.on("message", (msg, seqno) => {
          let msgUid = seqno;
          
          msg.once("attributes", (attrs) => {
            msgUid = attrs.uid;
            if (!emailData.has(msgUid)) {
              emailData.set(msgUid, {});
            }
            emailData.get(msgUid)!.flags = attrs.flags || [];
          });
          
          msg.on("body", (stream) => {
            simpleParser(stream, (err, parsed) => {
              if (err) return;
              
              if (!emailData.has(msgUid)) {
                emailData.set(msgUid, {});
              }
              emailData.get(msgUid)!.parsed = parsed;
            });
          });
        });

        fetch.once("end", () => {
          // Combine all email data
          emailData.forEach((data, uid) => {
            if (!data.parsed) return; // Skip if parsing failed
            
            const flags = data.flags || [];
            const isRead = flags.includes('\\Seen');
            const isStarred = flags.includes('\\Flagged');
            
            // Debug: log first 3 emails to check flags
            if (emails.length < 3) {
              console.log(`Email UID ${uid}: flags=${JSON.stringify(flags)}, isRead=${isRead}`);
            }

            // Extract attachments
            const attachments = data.parsed.attachments?.map((att: any) => ({
              filename: att.filename || 'untitled',
              contentType: att.contentType || 'application/octet-stream',
              size: att.size || 0,
            })) || [];

            emails.push({
              id: `${uid}`,
              uid: uid,
              from: data.parsed.from?.text || "",
              to: data.parsed.to?.text || "",
              cc: data.parsed.cc?.text || "",
              subject: data.parsed.subject || "(no subject)",
              date: data.parsed.date?.toISOString() || new Date().toISOString(),
              snippet: data.parsed.text?.substring(0, 200) || "",
              body: data.parsed.text || "",
              htmlBody: data.parsed.html || undefined,
              messageId: data.parsed.messageId || undefined,
              references: data.parsed.references || undefined,
              read: isRead,
              starred: isStarred,
              labels: [],
              account: config.user,
              attachments: attachments.length > 0 ? attachments : undefined,
            });
          });
          
          imap.end();
          resolve(emails.reverse()); // Newest first
        });

        fetch.once("error", reject);
      });
    });

    imap.once("error", reject);
    imap.connect();
  });
}

export async function GET(request: NextRequest) {
  try {
    // Get logged-in user
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("account");
    const forceRefresh = searchParams.get("refresh") === "true";

    // Get email settings from Redis (filtered by user profile)
    const redis = getRedis();
    
    // Check cache first (unless force refresh)
    const cacheKey = `email:inbox:${user.profile}:${accountId || "all"}`;
    if (!forceRefresh) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const emails = typeof cached === "string" ? JSON.parse(cached) : cached;
        return Response.json({ emails, count: emails.length, cached: true });
      }
    }
    
    const settings = await redis.get(REDIS_KEYS.emailSettings(user.profile));
    const brainsData = await redis.get(getBrainsKey(user.profile));
    
    if (!settings || typeof settings !== "object") {
      return Response.json({ 
        error: "No email accounts configured. Please add an email account in Settings.",
        emails: [],
        count: 0
      }, { status: 200 }); // Return 200 with empty array instead of 400
    }

    const emailSettings = settings as any;
    const accounts = emailSettings.accounts || [];
    const brains = (brainsData && typeof brainsData === 'object' ? (brainsData as any).brains || [] : []) as any[];
    let brainsUpdated = false;
    const normalizedBrainSources = new Map<string, string[]>();
    brains.forEach((brain: any) => {
      (brain.email_sources || []).forEach((source: string) => {
        const normalized = normalizeSender(source);
        const existing = normalizedBrainSources.get(normalized) || [];
        existing.push(brain.name);
        normalizedBrainSources.set(normalized, existing);
      });
    });

    if (accounts.length === 0) {
      return Response.json({ 
        error: "No email accounts found. Please add an email account in Settings.",
        emails: [],
        count: 0
      }, { status: 200 }); // Return 200 with empty array instead of 400
    }

    // Fetch from specific account or all accounts
    const accountsToFetch = accountId
      ? accounts.filter((a: any) => a.id === accountId)
      : accounts.filter((a: any) => a.type === "smtp"); // Only SMTP for now

    const allEmails: EmailMessage[] = [];

    for (const account of accountsToFetch) {
      if (account.type !== "smtp") continue; // Skip Google for now

      try {
        const config = {
          user: account.email,
          password: account.smtp?.password || "",
          host: account.smtp?.host || "mail.privateemail.com",
          port: 993,
          tls: true,
        };

        const emails = await fetchEmailsViaIMAP(config);
        const autoArchiveUids: number[] = [];
        const visibleEmails: EmailMessage[] = [];

        for (const email of emails) {
          const normalizedFrom = normalizeSender(email.from);
          const matches = normalizedBrainSources.get(normalizedFrom) || [];
          if (matches.length > 0) {
            email.brainMatches = matches;
            autoArchiveUids.push(email.uid);

            brains.forEach((brain: any) => {
              const brainSources = (brain.email_sources || []).map((source: string) => normalizeSender(source));
              if (!brainSources.includes(normalizedFrom)) return;

              if (!brain.recent_emails) brain.recent_emails = [];
              const recentEmail = {
                id: email.id,
                from: email.from,
                subject: email.subject,
                date: email.date,
                snippet: email.snippet,
                body: email.body,
                account: email.account,
              };
              brain.recent_emails = [recentEmail, ...brain.recent_emails.filter((item: any) => item.id !== email.id)].slice(0, 50);
              brain.lastUpdated = new Date().toISOString().split('T')[0];
              brainsUpdated = true;
            });
          } else {
            visibleEmails.push(email);
          }
        }

        if (autoArchiveUids.length > 0) {
          try {
            await archiveEmailsViaIMAP(config, autoArchiveUids);
          } catch (archiveErr) {
            console.error(`Failed to auto-archive brain-linked emails for ${account.email}:`, archiveErr);
            visibleEmails.push(...emails.filter((email) => autoArchiveUids.includes(email.uid)));
          }
        }

        allEmails.push(...visibleEmails);
      } catch (err) {
        console.error(`Failed to fetch from ${account.email}:`, err);
      }
    }

    // Sort by date (newest first)
    allEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (brainsUpdated) {
      await redis.set(getBrainsKey(user.profile), { brains });
    }

    // Cache in Redis for 1 hour (3600 seconds)
    await redis.set(cacheKey, allEmails, { ex: 3600 });

    return Response.json({ emails: allEmails, count: allEmails.length, cached: false });
  } catch (error: any) {
    console.error("Email fetch error:", error);
    
    // Check if it's a quota/rate limit error
    const isQuotaError = error.message?.toLowerCase().includes('quota') || 
                         error.message?.toLowerCase().includes('rate limit') ||
                         error.message?.toLowerCase().includes('too many');
    
    if (isQuotaError) {
      // Return cached data if available, even if stale
      const redis = getRedis();
      const user = await getSessionUserFromRequest(request);
      if (user) {
        const cacheKey = `email:inbox:${user.profile}:all`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          const emails = typeof cached === "string" ? JSON.parse(cached) : cached;
          return Response.json({ 
            emails, 
            count: emails.length, 
            cached: true,
            warning: "Using cached emails due to server rate limit. Try refreshing in a few minutes."
          });
        }
      }
    }
    
    return Response.json(
      { 
        error: isQuotaError 
          ? "Email server rate limit exceeded. Please try again in a few minutes." 
          : error.message || "Failed to fetch emails",
        emails: [],
        count: 0
      },
      { status: isQuotaError ? 429 : 500 }
    );
  }
}

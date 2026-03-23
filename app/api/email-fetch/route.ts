// @ts-nocheck
import { NextRequest } from "next/server";
import Imap from "imap";
import { simpleParser } from "mailparser";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

interface EmailMessage {
  id: string;
  uid: number;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  htmlBody?: string;
  read: boolean;
  starred: boolean;
  labels: string[];
  account: string;
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

        fetch.on("message", (msg, seqno) => {
          let msgUid = seqno;
          
          msg.once("attributes", (attrs) => {
            msgUid = attrs.uid;
          });
          
          msg.on("body", (stream) => {
            simpleParser(stream, (err, parsed) => {
              if (err) return;

              emails.push({
                id: `${msgUid}`, // Use UID as ID for easy IMAP operations
                uid: msgUid,
                from: parsed.from?.text || "",
                to: parsed.to?.text || "",
                subject: parsed.subject || "(no subject)",
                date: parsed.date?.toISOString() || new Date().toISOString(),
                snippet: parsed.text?.substring(0, 200) || "",
                body: parsed.text || "",
                htmlBody: parsed.html || undefined,
                read: false,
                starred: false,
                labels: [],
                account: config.user,
              });
            });
          });
        });

        fetch.once("end", () => {
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
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("account");
    const forceRefresh = searchParams.get("refresh") === "true";

    // Get email settings from Redis
    const redis = getRedis();
    
    // Check cache first (unless force refresh)
    const cacheKey = `email:inbox:default:${accountId || "all"}`;
    if (!forceRefresh) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const emails = typeof cached === "string" ? JSON.parse(cached) : cached;
        return Response.json({ emails, count: emails.length, cached: true });
      }
    }
    
    const settings = await redis.get(REDIS_KEYS.emailSettings("default"));
    
    if (!settings || typeof settings !== "object") {
      return Response.json({ error: "No email accounts configured" }, { status: 400 });
    }

    const emailSettings = settings as any;
    const accounts = emailSettings.accounts || [];

    if (accounts.length === 0) {
      return Response.json({ error: "No email accounts found" }, { status: 400 });
    }

    // Fetch from specific account or all accounts
    const accountsToFetch = accountId
      ? accounts.filter((a: any) => a.id === accountId)
      : accounts.filter((a: any) => a.type === "smtp"); // Only SMTP for now

    const allEmails: EmailMessage[] = [];

    for (const account of accountsToFetch) {
      if (account.type !== "smtp") continue; // Skip Google for now

      try {
        const emails = await fetchEmailsViaIMAP({
          user: account.email,
          password: account.smtp?.password || "",
          host: account.smtp?.host || "mail.privateemail.com",
          port: 993, // IMAP always uses 993, not SMTP port
          tls: true, // IMAP always uses TLS
        });

        allEmails.push(...emails);
      } catch (err) {
        console.error(`Failed to fetch from ${account.email}:`, err);
      }
    }

    // Sort by date (newest first)
    allEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Cache in Redis for 5 minutes
    await redis.set(cacheKey, allEmails, { ex: 300 });

    return Response.json({ emails: allEmails, count: allEmails.length, cached: false });
  } catch (error: any) {
    console.error("Email fetch error:", error);
    return Response.json(
      { error: error.message || "Failed to fetch emails" },
      { status: 500 }
    );
  }
}

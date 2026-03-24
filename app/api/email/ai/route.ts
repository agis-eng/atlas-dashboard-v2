import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

interface EmailAction {
  action: "archive" | "delete" | "mark_read" | "categorize";
  emailIds?: string[];
  sender?: string;
  category?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { message } = await request.json();

    if (!message) {
      return new Response(JSON.stringify({ error: "Message required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Fetch user's emails
    const emailsRes = await fetch(`${request.nextUrl.origin}/api/email-fetch`, {
      headers: {
        cookie: request.headers.get('cookie') || '',
      },
    });
    const emailsData = await emailsRes.json();
    const emails = emailsData.emails || [];

    // Create streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          // Call Claude to understand the request and determine action
          const aiStream = await anthropic.messages.create({
            model: "claude-haiku-4-6",
            max_tokens: 2000,
            stream: true,
            messages: [
              {
                role: "user",
                content: `You are an email management assistant. The user has ${emails.length} emails.

Here are the first 20 emails (id, from, subject):
${emails.slice(0, 20).map((e: any) => `- ${e.id} | From: ${e.from} | Subject: ${e.subject}`).join('\n')}

User request: "${message}"

Analyze the request and respond with:
1. A friendly confirmation of what you'll do
2. The specific action (archive/delete/mark_read)
3. Which emails will be affected

If the request involves a sender (e.g., "archive all emails from X"), find matching emails by sender.
If it's about a category (spam, newsletter), look for keywords in the subject or sender.

Format your response as:
✅ Action confirmation
📧 Number of emails affected
📝 List of affected email subjects (max 5)

Then on a new line, output a JSON object with the action details:
ACTION_JSON: {"action": "archive|delete|mark_read", "emailIds": ["id1", "id2"], "reason": "explanation"}`,
              },
            ],
          });

          let fullResponse = "";
          let actionJson: any = null;

          for await (const event of aiStream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const text = event.delta.text;
              fullResponse += text;
              controller.enqueue(encoder.encode(text));

              // Extract action JSON if present
              const match = fullResponse.match(/ACTION_JSON:\s*({.*})/);
              if (match) {
                try {
                  actionJson = JSON.parse(match[1]);
                } catch (e) {
                  // Invalid JSON, will try again
                }
              }
            }
          }

          // Execute the action if we have valid JSON
          if (actionJson && actionJson.emailIds && actionJson.emailIds.length > 0) {
            const actionRes = await fetch(`${request.nextUrl.origin}/api/email-action`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                cookie: request.headers.get('cookie') || '',
              },
              body: JSON.stringify({
                emailIds: actionJson.emailIds,
                action: actionJson.action,
              }),
            });

            if (actionRes.ok) {
              controller.enqueue(encoder.encode('\n\n✅ Action completed successfully!'));
            } else {
              controller.enqueue(encoder.encode('\n\n⚠️ Action failed. Please try again.'));
            }
          }

          controller.close();
        } catch (error: any) {
          console.error("Email AI error:", error);
          controller.enqueue(encoder.encode(`\n\nError: ${error.message}`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error: any) {
    console.error("Email AI error:", error);
    return new Response(JSON.stringify({ error: "Failed to process request" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

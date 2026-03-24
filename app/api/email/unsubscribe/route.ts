import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = 'nodejs'; // Required for exec

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { emailBody, emailHtml } = await request.json();

    if (!emailBody && !emailHtml) {
      return NextResponse.json({ error: "Email content required" }, { status: 400 });
    }

    // Use AI to extract unsubscribe link
    const content = emailHtml || emailBody;
    
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-6",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Find the unsubscribe link in this email. Look for:
- Links with "unsubscribe" text
- Links in footers
- mailto: links with "unsubscribe" in subject
- List-Unsubscribe headers
- Preference center links

Email content:
${content.substring(0, 5000)}

Return ONLY the unsubscribe URL, nothing else. If no unsubscribe link found, return "NOT_FOUND".`,
        },
      ],
    });

    const aiText = response.content[0].type === "text" ? response.content[0].text : "";
    const unsubscribeUrl = aiText.trim();

    if (unsubscribeUrl === "NOT_FOUND" || !unsubscribeUrl.startsWith("http")) {
      return NextResponse.json({ 
        success: false, 
        message: "No unsubscribe link found in this email" 
      });
    }

    // Return the URL to open in the user's browser
    return NextResponse.json({
      success: true,
      message: "Click the unsubscribe button on the page that just opened.",
      url: unsubscribeUrl,
    });
  } catch (error: any) {
    console.error("Unsubscribe error:", error);
    return NextResponse.json(
      { error: "Failed to process unsubscribe request" },
      { status: 500 }
    );
  }
}

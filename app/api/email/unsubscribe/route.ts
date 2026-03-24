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

    // Use OpenClaw browser automation to fully automate unsubscribe
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Step 1: Open the unsubscribe URL in browser
      const openCmd = `openclaw browser open --url "${unsubscribeUrl}" --target host`;
      await execAsync(openCmd);

      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Step 2: Take snapshot to see what's on the page
      const snapshotCmd = `openclaw browser snapshot --target host --format aria`;
      const snapshotResult = await execAsync(snapshotCmd);
      const snapshotOutput = snapshotResult.stdout;

      // Step 3: Use AI to find the unsubscribe button
      const buttonResponse = await anthropic.messages.create({
        model: "claude-haiku-4-6",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: `You are looking at an unsubscribe confirmation page. Find the button that confirms unsubscription.

Page snapshot:
${snapshotOutput.substring(0, 4000)}

Common button texts: 
- "Unsubscribe"
- "Confirm"
- "Remove me"
- "Unsubscribe from all"
- "Yes, unsubscribe"
- "Continue"
- "Submit"

Look for the ARIA ref (like [button "Unsubscribe"][23]) and return ONLY the number in brackets.
If you find it, return just the number (e.g., "23").
If no button found, return "NOT_FOUND".`,
          },
        ],
      });

      const buttonRef = buttonResponse.content[0].type === "text" 
        ? buttonResponse.content[0].text.trim() 
        : "";

      if (buttonRef !== "NOT_FOUND" && !isNaN(parseInt(buttonRef))) {
        // Step 4: Click the unsubscribe button
        const clickCmd = `openclaw browser act --target host --kind click --ref "${buttonRef}"`;
        await execAsync(clickCmd);

        // Wait for confirmation
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Take final snapshot to verify
        const finalSnapshotResult = await execAsync(snapshotCmd);
        const finalOutput = finalSnapshotResult.stdout.toLowerCase();

        // Check for success indicators
        const successIndicators = [
          'unsubscribed',
          'removed',
          'updated your preferences',
          'successfully',
          'confirmation',
          'no longer receive',
        ];

        const wasSuccessful = successIndicators.some(indicator => 
          finalOutput.includes(indicator)
        );

        if (wasSuccessful) {
          return NextResponse.json({
            success: true,
            message: "✅ Successfully unsubscribed! The browser automatically clicked the confirmation button.",
            url: unsubscribeUrl,
            automated: true,
          });
        } else {
          return NextResponse.json({
            success: true,
            message: "✅ Clicked unsubscribe button. Check the browser to verify completion.",
            url: unsubscribeUrl,
            automated: true,
            needsVerification: true,
          });
        }
      } else {
        // No button found, leave browser open for manual action
        return NextResponse.json({
          success: true,
          message: "⚠️ Opened unsubscribe page, but couldn't find the button automatically. Please click to complete.",
          url: unsubscribeUrl,
          manualAction: true,
        });
      }
    } catch (browserError: any) {
      console.error("Browser automation failed:", browserError);
      
      // Fallback: open in new tab
      return NextResponse.json({
        success: true,
        message: "⚠️ Automation failed. Opening unsubscribe link in new tab for manual completion.",
        url: unsubscribeUrl,
        manualAction: true,
        error: browserError.message,
      });
    }
  } catch (error: any) {
    console.error("Unsubscribe error:", error);
    return NextResponse.json(
      { error: "Failed to process unsubscribe request" },
      { status: 500 }
    );
  }
}

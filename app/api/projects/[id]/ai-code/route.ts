import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { request: userRequest, repoUrl, branch } = body;

    if (!userRequest || !repoUrl) {
      return NextResponse.json(
        { error: "Missing request or repository URL" },
        { status: 400 }
      );
    }

    // Extract repo owner and name from URL
    const repoMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!repoMatch) {
      return NextResponse.json(
        { error: "Invalid GitHub URL" },
        { status: 400 }
      );
    }

    const [, owner, repo] = repoMatch;
    const cleanRepo = repo.replace(/\.git$/, '');

    // Use Claude to generate code changes
    const prompt = `You are a helpful coding assistant. The user wants to make changes to their website.

Project: ${cleanRepo}
Repository: ${owner}/${cleanRepo}
Branch: ${branch || 'main'}

User request: "${userRequest}"

Generate a specific, actionable plan to make these changes. Include:
1. Which files need to be modified
2. What changes to make in each file
3. The exact code to add/modify

Keep it concise and practical.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const response = message.content[0].type === 'text' 
      ? message.content[0].text 
      : 'Unable to generate changes';

    // For now, return the AI's plan
    // TODO: Integrate with GitHub API to actually create PR
    return NextResponse.json({
      success: true,
      plan: response,
      message: `AI generated a plan. GitHub integration coming soon!`,
      prUrl: null,
    });

  } catch (error: any) {
    console.error("AI code error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process request" },
      { status: 500 }
    );
  }
}

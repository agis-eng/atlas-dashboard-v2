import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

// Bot API token (set in env)
const BOT_TOKEN = process.env.AGIS_BOT_TOKEN || 'agis-bot-secure-token-2026';

export async function POST(request: NextRequest) {
  try {
    // Verify bot token
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    if (token !== BOT_TOKEN) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid bot token" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { projectId, request: userRequest, repoUrl, branch } = body;

    if (!projectId || !userRequest) {
      return NextResponse.json(
        { error: "Missing projectId or request" },
        { status: 400 }
      );
    }

    // Extract repo info if provided
    let owner = '';
    let repo = '';
    if (repoUrl) {
      const repoMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (repoMatch) {
        [, owner, repo] = repoMatch;
        repo = repo.replace(/\.git$/, '');
      }
    }

    // Use Claude to generate code changes
    const prompt = `You are a helpful coding assistant. The user wants to make changes to their website.

Project ID: ${projectId}
Repository: ${owner}/${repo}
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

    return NextResponse.json({
      success: true,
      plan: response,
      message: `AI generated a plan for project ${projectId}`,
      projectId,
      repoUrl,
    });

  } catch (error: any) {
    console.error("Bot API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process request" },
      { status: 500 }
    );
  }
}

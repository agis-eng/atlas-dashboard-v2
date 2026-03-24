import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import yaml from "yaml";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

const BRAINS_FILE = path.join(process.cwd(), "data", "brains.yaml");

function readBrains() {
  if (!fs.existsSync(BRAINS_FILE)) {
    return { brains: [] };
  }
  const content = fs.readFileSync(BRAINS_FILE, "utf-8");
  return yaml.parse(content) || { brains: [] };
}

function loadBrainContext(brainId: string, brain: any) {
  let context = `You are an AI assistant with access to the "${brain.name}" knowledge Brain.
Description: ${brain.description}

You have access to the following information:

`;

  // Load email sources
  if (brain.email_sources && brain.email_sources.length > 0) {
    context += `## Email Sources:\n`;
    brain.email_sources.forEach((source: string) => {
      context += `- ${source}\n`;
    });
    context += '\n';
  }

  // Load summaries
  const summariesDir = path.join(process.cwd(), "data", "brains", brainId, "summaries");
  if (fs.existsSync(summariesDir)) {
    const summaryFiles = fs.readdirSync(summariesDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse()
      .slice(0, 5); // Last 5 summaries

    if (summaryFiles.length > 0) {
      context += `## Recent Summaries:\n\n`;
      summaryFiles.forEach(file => {
        const content = fs.readFileSync(path.join(summariesDir, file), 'utf-8');
        context += content + '\n\n';
      });
    }
  }

  // Load links
  if (brain.links && brain.links.length > 0) {
    context += `## Saved Links:\n`;
    brain.links.forEach((link: any) => {
      context += `- ${link.title}: ${link.url}\n`;
    });
    context += '\n';
  }

  // Load notes
  if (brain.notes && brain.notes.length > 0) {
    context += `## Manual Notes:\n`;
    brain.notes.forEach((note: any) => {
      context += `${note.content}\n\n`;
    });
  }

  // Load knowledge base file
  const knowledgeBaseFile = path.join(process.cwd(), "data", "brains", brainId, "knowledge-base.md");
  if (fs.existsSync(knowledgeBaseFile)) {
    const kb = fs.readFileSync(knowledgeBaseFile, 'utf-8');
    context += `## Knowledge Base:\n${kb}\n\n`;
  }

  context += `\nAnswer questions based on this knowledge. If you don't know something from the context, say so. Be concise and helpful.`;

  return context;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { message, history } = await request.json();

    if (!message) {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Load brain
    const data = readBrains();
    const brain = data.brains.find((b: any) => b.id === id);

    if (!brain) {
      return new Response(
        JSON.stringify({ error: "Brain not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build context
    const systemContext = loadBrainContext(id, brain);

    // Build messages
    const messages: Anthropic.MessageParam[] = [];
    
    // Add history if provided
    if (history && Array.isArray(history)) {
      history.forEach((msg: any) => {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      });
    }

    // Add current message
    messages.push({
      role: "user",
      content: message
    });

    // Stream response
    const stream = await anthropic.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 2000,
      system: systemContext,
      messages: messages,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && 
                chunk.delta.type === 'text_delta') {
              const text = chunk.delta.text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("Brain chat error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Chat failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

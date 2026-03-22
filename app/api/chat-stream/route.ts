import Anthropic from "@anthropic-ai/sdk";
import { getRedis, REDIS_KEYS, type ChatMessage } from "@/lib/redis";
import {
  searchProjects,
  getProjectDetails,
  getTasks,
  searchData,
  analyzeWorkload,
} from "@/lib/data";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

const SYSTEM_PROMPT = `You are Atlas, a smart assistant for the Atlas Dashboard — a project and task management tool used by a small digital agency (Erik and Anton).

You have access to tools that let you search projects, tasks, and analyze workload from the dashboard data. Use these tools to answer questions accurately.

When answering:
- Be concise and direct
- Format data clearly using markdown tables or lists when appropriate
- If you find matching data, present the key details (don't dump raw JSON)
- For project questions, mention name, owner, stage, status, and any relevant URLs
- For task questions, mention title, assignee, status, priority, and due dates
- If no results match, say so clearly and suggest alternative searches
- Today's date is ${new Date().toISOString().split("T")[0]}
- When asked about "my" projects/tasks, assume the user is Erik unless context says otherwise`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_projects",
    description:
      "Search projects by name, owner, stage, or client. Use this when the user asks about projects, clients, or what someone is working on.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Free text search across project name, status, summary, tags",
        },
        owner: {
          type: "string",
          description: "Filter by project owner (e.g. Erik, Anton)",
        },
        stage: {
          type: "string",
          description: "Filter by stage (Client, Internal, Contractor, Lead, Partner)",
        },
        client: {
          type: "string",
          description: "Filter by client name or ID",
        },
      },
    },
  },
  {
    name: "get_project_details",
    description:
      "Get full details for a specific project by ID or name. Use this when the user asks about a specific project.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "The project ID",
        },
        project_name: {
          type: "string",
          description: "The project name (partial match supported)",
        },
      },
    },
  },
  {
    name: "get_tasks",
    description:
      "Get tasks filtered by status, assignee, priority, type, or project. Use this when the user asks about tasks, to-dos, or what needs to be done.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          description: "Filter by status: in-progress, backlog, recurring, completed",
        },
        assignee: {
          type: "string",
          description: "Filter by assignee (e.g. Erik, Anton)",
        },
        priority: {
          type: "string",
          description: "Filter by priority: high, medium, low",
        },
        type: {
          type: "string",
          description:
            "Filter by type: marketing, strategy, website, ecommerce, content, internal, admin",
        },
        project: {
          type: "string",
          description: "Filter by project or client name",
        },
        query: {
          type: "string",
          description: "Free text search across task title, notes, tags",
        },
      },
    },
  },
  {
    name: "search_data",
    description:
      "General search across both projects and tasks. Use this for broad questions that could involve either.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query to match against projects and tasks",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "analyze_workload",
    description:
      "Analyze and compare workload between team members. Shows task counts by status, priority, type, overdue tasks, and project counts.",
    input_schema: {
      type: "object" as const,
      properties: {
        user1: {
          type: "string",
          description: "First user to analyze (e.g. Erik)",
        },
        user2: {
          type: "string",
          description: "Optional second user to compare against",
        },
      },
      required: ["user1"],
    },
  },
];

async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (name) {
      case "search_projects":
        return JSON.stringify(await searchProjects(input as Parameters<typeof searchProjects>[0]));
      case "get_project_details":
        return JSON.stringify(
          await getProjectDetails(input as Parameters<typeof getProjectDetails>[0])
        );
      case "get_tasks":
        return JSON.stringify(await getTasks(input as Parameters<typeof getTasks>[0]));
      case "search_data":
        return JSON.stringify(await searchData(input as Parameters<typeof searchData>[0]));
      case "analyze_workload":
        return JSON.stringify(
          await analyzeWorkload(input as Parameters<typeof analyzeWorkload>[0])
        );
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({ error: `Tool execution failed: ${(err as Error).message}` });
  }
}

async function tryStoreMessage(sessionId: string, msg: ChatMessage) {
  try {
    const redis = getRedis();
    await redis.rpush(REDIS_KEYS.chatMessages(sessionId), JSON.stringify(msg));
  } catch (err) {
    console.warn("Redis storage failed (non-fatal):", err);
  }
}

async function tryUpdateSession(sessionId: string, profile: string, title: string) {
  try {
    const redis = getRedis();
    const sessionMeta = {
      id: sessionId,
      title,
      profile,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 1,
    };
    await redis.set(REDIS_KEYS.chatSessionMeta(sessionId), JSON.stringify(sessionMeta));
    await redis.sadd(REDIS_KEYS.chatSessions(profile), sessionId);
  } catch (err) {
    console.warn("Redis session update failed (non-fatal):", err);
  }
}

function sendSSE(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: string) {
  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
}

export async function POST(request: Request) {
  try {
    const { message, sessionId, profile = "erik" } = await request.json();

    if (!message || !sessionId) {
      return Response.json({ error: "Missing message or sessionId" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 503 });
    }

    const client = new Anthropic({ apiKey });

    // Store user message
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: message,
      timestamp: Date.now(),
      sessionId,
    };
    tryStoreMessage(sessionId, userMsg);
    tryUpdateSession(sessionId, profile, message.slice(0, 50));

    // Load conversation history from Redis for context
    let conversationHistory: Anthropic.MessageParam[] = [];
    try {
      const redis = getRedis();
      const stored = await redis.lrange(REDIS_KEYS.chatMessages(sessionId), 0, -1);
      if (stored && stored.length > 0) {
        const parsed = stored
          .map((s) => {
            const m = typeof s === "string" ? JSON.parse(s) : s;
            return m as ChatMessage;
          })
          .filter((m) => m.role === "user" || m.role === "assistant");

        // Keep last 20 messages for context
        const recent = parsed.slice(-20);
        conversationHistory = recent.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));
      }
    } catch {
      // No history available — that's fine
    }

    // If history doesn't include the current message, add it
    const lastMsg = conversationHistory[conversationHistory.length - 1];
    if (!lastMsg || lastMsg.role !== "user" || lastMsg.content !== message) {
      conversationHistory.push({ role: "user", content: message });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let fullText = "";

        try {
          let messages = [...conversationHistory];
          let continueLoop = true;

          while (continueLoop) {
            continueLoop = false;

            const response = await client.messages.create({
              model: "claude-haiku-4-6-20250514",
              max_tokens: 4096,
              system: SYSTEM_PROMPT,
              tools: TOOLS,
              messages,
              stream: true,
            });

            let toolUseBlocks: Array<{
              id: string;
              name: string;
              input: string;
            }> = [];
            let currentToolId = "";
            let currentToolName = "";
            let currentToolInput = "";
            let stopReason: string | null = null;

            for await (const event of response) {
              if (event.type === "content_block_start") {
                if (event.content_block.type === "text") {
                  // Text block starting
                } else if (event.content_block.type === "tool_use") {
                  currentToolId = event.content_block.id;
                  currentToolName = event.content_block.name;
                  currentToolInput = "";
                  // Send a thinking indicator
                  sendSSE(
                    controller,
                    encoder,
                    JSON.stringify({ type: "tool_start", tool: currentToolName })
                  );
                }
              } else if (event.type === "content_block_delta") {
                if (event.delta.type === "text_delta") {
                  fullText += event.delta.text;
                  sendSSE(
                    controller,
                    encoder,
                    JSON.stringify({ content: event.delta.text })
                  );
                } else if (event.delta.type === "input_json_delta") {
                  currentToolInput += event.delta.partial_json;
                }
              } else if (event.type === "content_block_stop") {
                if (currentToolId) {
                  toolUseBlocks.push({
                    id: currentToolId,
                    name: currentToolName,
                    input: currentToolInput,
                  });
                  currentToolId = "";
                }
              } else if (event.type === "message_delta") {
                stopReason = event.delta.stop_reason;
              }
            }

            // If the model wants to use tools, execute them and continue
            if (stopReason === "tool_use" && toolUseBlocks.length > 0) {
              // Build the assistant message with all content blocks
              const assistantContent: Anthropic.ContentBlockParam[] = [];

              // Add any text that was generated before tool use
              if (fullText) {
                assistantContent.push({ type: "text", text: fullText });
              }

              // Add tool use blocks
              for (const tool of toolUseBlocks) {
                let parsedInput = {};
                try {
                  parsedInput = JSON.parse(tool.input);
                } catch {
                  // empty input
                }
                assistantContent.push({
                  type: "tool_use",
                  id: tool.id,
                  name: tool.name,
                  input: parsedInput,
                });
              }

              // Execute all tools and build tool results
              const toolResults: Anthropic.ToolResultBlockParam[] = [];
              for (const tool of toolUseBlocks) {
                let parsedInput = {};
                try {
                  parsedInput = JSON.parse(tool.input);
                } catch {
                  // empty input
                }
                const result = await executeTool(
                  tool.name,
                  parsedInput as Record<string, unknown>
                );
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: tool.id,
                  content: result,
                });

                sendSSE(
                  controller,
                  encoder,
                  JSON.stringify({ type: "tool_done", tool: tool.name })
                );
              }

              // Add to conversation and continue
              messages = [
                ...messages,
                { role: "assistant", content: assistantContent },
                { role: "user", content: toolResults },
              ];

              // Reset for next iteration
              fullText = "";
              continueLoop = true;
            }
          }
        } catch (err) {
          console.error("Claude API error:", err);
          const errorText = "\n\n[Error communicating with Claude API]";
          fullText += errorText;
          sendSSE(controller, encoder, JSON.stringify({ content: errorText }));
        }

        // Store assistant response
        if (fullText) {
          tryStoreMessage(sessionId, {
            id: `msg_${Date.now()}_assistant`,
            role: "assistant",
            content: fullText.trim(),
            timestamp: Date.now(),
            sessionId,
          });
        }

        sendSSE(controller, encoder, "[DONE]");
        controller.close();
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  } catch (error) {
    console.error("Chat stream error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

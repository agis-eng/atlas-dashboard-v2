import Anthropic from "@anthropic-ai/sdk";
import { getRedis } from "@/lib/redis";
import { getProjectDetails, getTasks } from "@/lib/data";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

const chatKey = (projectId: string) => `project-chat:messages:${projectId}`;

interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "create_task",
    description:
      "Create a new task for this project. Use when the user explicitly asks to create, add, or log a task.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Task title" },
        assignee: {
          type: "string",
          description: "Assignee name (Erik or Anton)",
        },
        status: {
          type: "string",
          description:
            "Task status: backlog, in-progress, recurring, completed. Default: backlog",
        },
        priority: {
          type: "string",
          description: "Priority: high, medium, low. Default: medium",
        },
        type: {
          type: "string",
          description:
            "Task type: marketing, strategy, website, ecommerce, content, internal, admin",
        },
        notes: { type: "string", description: "Optional task notes or details" },
        due_date: {
          type: "string",
          description: "Due date in YYYY-MM-DD format",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "update_project",
    description:
      "Update project fields like status, summary, owner, or stage. Use when the user asks to update or change a project detail.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", description: "New project status" },
        summary: { type: "string", description: "New project summary/description" },
        owner: { type: "string", description: "New owner: Erik or Anton" },
        stage: {
          type: "string",
          description:
            "New stage: Client, Internal, Lead, Contractor, Live, Design, QA, Partner, Active",
        },
      },
    },
  },
];

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  projectId: string,
  origin: string
): Promise<string> {
  try {
    if (name === "create_task") {
      const res = await fetch(`${origin}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: input.title,
          assignee: input.assignee || "Erik",
          status: input.status || "backlog",
          priority: input.priority || "medium",
          type: input.type || "internal",
          notes: input.notes || "",
          due_date: input.due_date || null,
          project: projectId,
        }),
      });
      const data = await res.json();
      if (res.ok && data.task) {
        return JSON.stringify({
          success: true,
          message: `Task "${data.task.title}" created successfully (ID: ${data.task.id}).`,
          task: data.task,
        });
      }
      return JSON.stringify({ error: data.error || "Failed to create task" });
    }

    if (name === "update_project") {
      const res = await fetch(`${origin}/api/projects/${encodeURIComponent(projectId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (res.ok && data.project) {
        return JSON.stringify({
          success: true,
          message: "Project updated successfully.",
          project: data.project,
        });
      }
      return JSON.stringify({ error: data.error || "Failed to update project" });
    }

    return JSON.stringify({ error: `Unknown tool: ${name}` });
  } catch (err) {
    return JSON.stringify({
      error: `Tool execution failed: ${(err as Error).message}`,
    });
  }
}

async function storeMessage(projectId: string, msg: StoredMessage) {
  try {
    const redis = getRedis();
    await redis.rpush(chatKey(projectId), JSON.stringify(msg));
    await redis.ltrim(chatKey(projectId), -100, -1);
  } catch (err) {
    console.warn("Failed to store project chat message (non-fatal):", err);
  }
}

async function getProjectVoiceMemos(projectId: string): Promise<Array<Record<string, unknown>>> {
  try {
    const redis = getRedis();
    const memos = ((await redis.get("voice-memos:processed")) as any[]) || [];
    return memos.filter(
      (m: any) => m.projectMatch === projectId || m.clientMatch === projectId
    );
  } catch {
    return [];
  }
}

function buildSystemPrompt(
  project: Record<string, unknown> | null,
  tasks: Array<Record<string, unknown>>,
  voiceMemos: Array<Record<string, unknown>> = []
): string {
  if (!project) {
    return `You are Atlas AI, an assistant for project management. The project could not be loaded.`;
  }

  const brain = project.brain as Record<string, unknown> | undefined;
  const brainLinks = (brain?.links as Array<{ url: string; label: string }>) || [];
  const brainNotes = (brain?.notes as string[]) || [];
  const tags = (project.tags as string[]) || [];

  const pendingTasks = tasks.filter((t) => t.status !== "completed");
  const completedTasks = tasks.filter((t) => t.status === "completed");

  return `You are Atlas AI, an intelligent assistant embedded directly in the project page for "${project.name}".

## Project: ${project.name}
- **ID:** ${project.id}
- **Owner:** ${project.owner || "Unknown"}
- **Stage:** ${project.stage || "Unknown"}
- **Status:** ${project.status || "Unknown"}
- **Summary:** ${project.summary || "No description provided"}
- **Last Update:** ${project.lastUpdate || "N/A"}
- **Live URL:** ${project.liveUrl || "None"}
- **Preview URL:** ${project.previewUrl || "None"}
- **Repo URL:** ${project.repoUrl || "None"}
- **Tags:** ${tags.length ? tags.join(", ") : "None"}
${project.clientId ? `- **Client:** ${project.clientId}` : ""}
${project.priority ? `- **Priority:** ${project.priority}` : ""}

${
  brainNotes.length || brainLinks.length
    ? `## Brain / Knowledge
${brainNotes.length ? `**Notes:**\n${brainNotes.map((n) => `- ${n}`).join("\n")}` : ""}
${brainLinks.length ? `**Links:**\n${brainLinks.map((l) => `- [${l.label}](${l.url})`).join("\n")}` : ""}`
    : ""
}

${
  voiceMemos.length
    ? `## Voice Memos (${voiceMemos.length})
${voiceMemos
  .map(
    (m) =>
      `### ${m.title} (${(m.date as string || "").split("T")[0]})
- **Speakers:** ${m.speakers || "Unknown"}
- **Summary:** ${m.summary}
${(m.actionItems as string[] || []).length ? `- **Action Items:** ${(m.actionItems as string[]).map((a) => `\n  - ${a}`).join("")}` : ""}
${(m.keyDecisions as string[] || []).length ? `- **Key Decisions:** ${(m.keyDecisions as string[]).map((d) => `\n  - ${d}`).join("")}` : ""}
`
  )
  .join("\n\n")}`
    : ""
}

## Tasks (${tasks.length} total)
${
  pendingTasks.length
    ? `**Active/Pending (${pendingTasks.length}):**
${pendingTasks
  .map(
    (t) =>
      `- [${t.status}] ${t.title}${t.assignee ? ` @${t.assignee}` : ""}${t.priority ? ` [${t.priority}]` : ""}${t.due_date ? ` due ${t.due_date}` : ""}`
  )
  .join("\n")}`
    : "No active tasks."
}
${
  completedTasks.length
    ? `\n**Completed (${completedTasks.length}):**
${completedTasks.map((t) => `- ✓ ${t.title}`).join("\n")}`
    : ""
}

## Instructions
- You are embedded in the project page — keep responses concise and focused on this project.
- Use markdown formatting (bold, lists, code) when it improves clarity.
- When asked to create a task, use the create_task tool. Confirm success after.
- When asked to update the project, use the update_project tool.
- For questions about project details, tasks, or status — answer from the context above.
- If context doesn't have the answer, say so clearly.
- Today's date: ${new Date().toISOString().split("T")[0]}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return Response.json({ error: "Missing projectId" }, { status: 400 });
  }

  try {
    const redis = getRedis();
    const stored = await redis.lrange(chatKey(projectId), -50, -1);
    const messages = (stored || []).map((s: unknown) =>
      typeof s === "string" ? JSON.parse(s) : s
    );
    return Response.json({ messages });
  } catch {
    return Response.json({ messages: [] });
  }
}

export async function POST(request: Request) {
  try {
    const { message, projectId } = await request.json();

    if (!message || !projectId) {
      return Response.json(
        { error: "Missing message or projectId" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY is not configured" },
        { status: 503 }
      );
    }

    const client = new Anthropic({ apiKey });
    const origin = new URL(request.url).origin;

    // Load project context, tasks, and voice memos in parallel
    const [project, tasks, voiceMemos] = await Promise.all([
      getProjectDetails({ project_id: projectId }).catch(() => null),
      getTasks({ project: projectId }).catch(() => []),
      getProjectVoiceMemos(projectId),
    ]);

    const systemPrompt = buildSystemPrompt(
      project as Record<string, unknown> | null,
      (tasks || []) as Array<Record<string, unknown>>,
      voiceMemos
    );

    // Store user message
    const userMsg: StoredMessage = {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: message,
      timestamp: Date.now(),
    };
    storeMessage(projectId, userMsg);

    // Load conversation history
    let history: Anthropic.MessageParam[] = [];
    try {
      const redis = getRedis();
      const stored = await redis.lrange(chatKey(projectId), -20, -1);
      if (stored?.length) {
        const parsed = (stored as unknown[])
          .map((s) => (typeof s === "string" ? JSON.parse(s) : s))
          .filter(
            (m: StoredMessage) => m.role === "user" || m.role === "assistant"
          ) as StoredMessage[];
        history = parsed.map((m) => ({ role: m.role, content: m.content }));
      }
    } catch {
      // No history — start fresh
    }

    // Ensure current message is at the end
    const lastMsg = history[history.length - 1];
    if (!lastMsg || lastMsg.role !== "user" || lastMsg.content !== message) {
      history.push({ role: "user", content: message });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (data: object | string) =>
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );

        let fullText = "";

        try {
          let messages = [...history];
          let continueLoop = true;

          while (continueLoop) {
            continueLoop = false;

            const response = await client.messages.create({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 4096,
              system: systemPrompt,
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
                if (event.content_block.type === "tool_use") {
                  currentToolId = event.content_block.id;
                  currentToolName = event.content_block.name;
                  currentToolInput = "";
                  send({ type: "tool_start", tool: currentToolName });
                }
              } else if (event.type === "content_block_delta") {
                if (event.delta.type === "text_delta") {
                  fullText += event.delta.text;
                  send({ content: event.delta.text });
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

            if (stopReason === "tool_use" && toolUseBlocks.length > 0) {
              const assistantContent: Anthropic.ContentBlockParam[] = [];
              if (fullText) {
                assistantContent.push({ type: "text", text: fullText });
              }

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

              const toolResults: Anthropic.ToolResultBlockParam[] = [];
              for (const tool of toolUseBlocks) {
                let parsedInput: Record<string, unknown> = {};
                try {
                  parsedInput = JSON.parse(tool.input);
                } catch {
                  // empty input
                }
                const result = await executeTool(
                  tool.name,
                  parsedInput,
                  projectId,
                  origin
                );
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: tool.id,
                  content: result,
                });
                send({ type: "tool_done", tool: tool.name });
              }

              messages = [
                ...messages,
                { role: "assistant", content: assistantContent },
                { role: "user", content: toolResults },
              ];

              fullText = "";
              continueLoop = true;
            }
          }
        } catch (err) {
          console.error("Project chat stream error:", err);
          const errText = "\n\n[Error communicating with AI. Please try again.]";
          fullText += errText;
          send({ content: errText });
        }

        if (fullText) {
          storeMessage(projectId, {
            id: `msg_${Date.now()}_assistant`,
            role: "assistant",
            content: fullText.trim(),
            timestamp: Date.now(),
          });
        }

        send("[DONE]");
        controller.close();
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  } catch (error) {
    console.error("Project chat error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

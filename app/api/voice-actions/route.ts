import { NextRequest, NextResponse } from "next/server";
import { getProjectDetails } from "@/lib/data";

type VoiceAction = "create_task" | "update_project" | "request_website_change";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body?.action || "") as VoiceAction;
    const projectId = String(body?.projectId || "").trim();
    const args = (body?.args || {}) as Record<string, unknown>;

    if (!action || !projectId) {
      return NextResponse.json(
        { error: "Missing action or projectId" },
        { status: 400 }
      );
    }

    const origin = new URL(request.url).origin;
    const internalHeaders = {
      "Content-Type": "application/json",
      ...(process.env.ATLAS_INTERNAL_API_KEY
        ? { "x-atlas-internal-key": process.env.ATLAS_INTERNAL_API_KEY }
        : {}),
    };

    if (action === "create_task") {
      const res = await fetch(`${origin}/api/tasks`, {
        method: "POST",
        headers: internalHeaders,
        body: JSON.stringify({
          title: args.title,
          assignee: args.assignee || "Erik",
          status: args.status || "backlog",
          priority: args.priority || "medium",
          type: args.type || "website",
          notes: args.notes || "",
          due_date: args.due_date || null,
          project: projectId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(
        res.ok
          ? {
              success: true,
              message: `Task created: ${data.task?.title || args.title}`,
              task: data.task || null,
            }
          : { error: data.error || "Failed to create task" },
        { status: res.ok ? 200 : res.status }
      );
    }

    if (action === "update_project") {
      const res = await fetch(`${origin}/api/projects/${encodeURIComponent(projectId)}`, {
        method: "PUT",
        headers: internalHeaders,
        body: JSON.stringify(args),
      });
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(
        res.ok
          ? {
              success: true,
              message: "Project updated successfully.",
              project: data.project || null,
            }
          : { error: data.error || "Failed to update project" },
        { status: res.ok ? 200 : res.status }
      );
    }

    if (action === "request_website_change") {
      const project = await getProjectDetails({ project_id: projectId });
      if (!project?.repoUrl) {
        return NextResponse.json(
          { error: "This project does not have a repository URL configured." },
          { status: 400 }
        );
      }

      const changeRequest = String(args.request || "").trim();
      if (!changeRequest) {
        return NextResponse.json(
          { error: "Missing website change request." },
          { status: 400 }
        );
      }

      const res = await fetch(`${origin}/api/projects/${encodeURIComponent(projectId)}/ai-code`, {
        method: "POST",
        headers: internalHeaders,
        body: JSON.stringify({
          request: changeRequest,
          repoUrl: project.repoUrl,
          branch: (args.branch as string) || "main",
        }),
      });
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(
        res.ok
          ? {
              success: true,
              message: data.message || "Website change request processed.",
              prUrl: data.prUrl || null,
              prNumber: data.prNumber || null,
              branchName: data.branchName || null,
            }
          : { error: data.error || "Failed to process website change request" },
        { status: res.ok ? 200 : res.status }
      );
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Voice action failed." },
      { status: 500 }
    );
  }
}

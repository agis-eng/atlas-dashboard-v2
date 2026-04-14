import { readOrchestratorData } from "@/lib/orchestrator";

export async function GET() {
  try {
    const data = await readOrchestratorData();
    return Response.json(data);
  } catch (error) {
    console.error("[Orchestrator API] Failed to read ACTIVE.md", error);
    return Response.json(
      { error: "Failed to read orchestrator tracker" },
      { status: 500 }
    );
  }
}

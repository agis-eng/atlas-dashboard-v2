import {
  computeRecordingStats,
  loadBrainOptions,
  loadPartnerOptions,
  loadProjectOptions,
  loadRecordingsStore,
} from "@/lib/recordings-store";

export async function GET() {
  try {
    const [store, projects, partners, brains] = await Promise.all([
      loadRecordingsStore(),
      loadProjectOptions(),
      loadPartnerOptions(),
      loadBrainOptions(),
    ]);

    const recordings = [...store.recordings].sort((a, b) =>
      b.occurredAt.localeCompare(a.occurredAt)
    );

    return Response.json({
      updatedAt: store.updatedAt,
      recordings,
      stats: computeRecordingStats(recordings),
      projects,
      partners,
      brains,
    });
  } catch (error: any) {
    console.error("Recordings API error:", error);
    return Response.json(
      {
        error: "Failed to load recordings",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}

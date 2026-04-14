import {
  loadBrainOptions,
  loadPartnerOptions,
  loadProjectOptions,
  loadRecordingsStore,
  saveRecordingsStore,
} from "@/lib/recordings-store";

interface RecordingPatchBody {
  manualProjectId?: string | null;
  manualPartnerId?: string | null;
  manualBrainId?: string | null;
  reviewStatus?: "needs_review" | "manual_reviewed" | "linked" | "ignored";
  reviewNotes?: string;
  assignedBy?: string | null;
}

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/recordings/[id]">
) {
  try {
    const { id } = await ctx.params;
    const body = (await request.json()) as RecordingPatchBody;
    const [store, projects, partners, brains] = await Promise.all([
      loadRecordingsStore(),
      loadProjectOptions(),
      loadPartnerOptions(),
      loadBrainOptions(),
    ]);

    const recording = store.recordings.find((item) => item.id === id);

    if (!recording) {
      return Response.json({ error: "Recording not found" }, { status: 404 });
    }

    if (body.manualProjectId !== undefined) {
      const project =
        projects.find((item) => item.id === body.manualProjectId) || null;
      recording.project.manual = {
        id: project?.id || null,
        label: project?.name || null,
      };
    }

    if (body.manualPartnerId !== undefined) {
      const partner =
        partners.find((item) => item.id === body.manualPartnerId) || null;
      recording.partner.manual = {
        id: partner?.id || null,
        label: partner?.name || null,
      };
    }

    if (body.manualBrainId !== undefined) {
      const brain = brains.find((item) => item.id === body.manualBrainId) || null;
      recording.brain.manual = {
        id: brain?.id || null,
        label: brain?.name || null,
      };
    }

    if (body.reviewStatus) {
      recording.review.status = body.reviewStatus;
    }

    if (body.reviewNotes !== undefined) {
      recording.review.notes = body.reviewNotes;
    }

    recording.metadata.manualFields = {
      projectRequired: !(recording.project.manual.id || recording.project.suggested.id),
      partnerRequired: !(recording.partner.manual.id || recording.partner.suggested.id),
      brainRequired: !(recording.brain.manual.id || recording.brain.suggested.id),
    };
    recording.review.assignedBy = body.assignedBy || recording.review.assignedBy;
    recording.review.assignedAt = new Date().toISOString();
    recording.metadata.ingestion.updatedAt = new Date().toISOString();

    await saveRecordingsStore(store);

    return Response.json({ recording });
  } catch (error: any) {
    console.error("Recording update API error:", error);
    return Response.json(
      {
        error: "Failed to update recording",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}

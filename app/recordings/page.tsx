"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  FileAudio,
  Link2,
  Loader2,
  Mic,
  Video,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ReviewStatus = "needs_review" | "manual_reviewed" | "linked" | "ignored";

interface AssignmentOption {
  id: string;
  name: string;
}

interface RecordingItem {
  id: string;
  source: "voice_memo" | "fathom";
  kind: "voice_memo" | "call";
  title: string;
  occurredAt: string;
  participants: string[];
  project: {
    suggested: {
      id: string | null;
      label: string | null;
      confidence: string;
      reason: string | null;
    };
    manual: {
      id: string | null;
      label: string | null;
    };
  };
  partner: {
    suggested: {
      id: string | null;
      label: string | null;
      confidence: string;
      reason: string | null;
    };
    manual: {
      id: string | null;
      label: string | null;
    };
  };
  brain: {
    suggested: {
      id: string | null;
      label: string | null;
      confidence: string;
      reason: string | null;
    };
    manual: {
      id: string | null;
      label: string | null;
    };
  };
  review: {
    status: ReviewStatus;
    notes: string;
  };
  content: {
    summary: string;
    keyPoints: string[];
    actionItems: string[];
  };
  links: {
    sourceUrl: string | null;
    shareUrl: string | null;
    notionUrl: string | null;
    audioPath: string | null;
  };
  metadata: {
    manualFields: {
      projectRequired: boolean;
      partnerRequired: boolean;
      brainRequired: boolean;
    };
  };
}

interface RecordingsStats {
  total: number;
  voiceMemos: number;
  fathomCalls: number;
  needsReview: number;
  linked: number;
  unresolvedAssignments: number;
}

const statusTone: Record<ReviewStatus, string> = {
  needs_review: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  manual_reviewed: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  linked: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  ignored: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
};

const statusOptions: ReviewStatus[] = [
  "needs_review",
  "manual_reviewed",
  "linked",
  "ignored",
];

function AssignmentRow(props: {
  label: string;
  icon: React.ReactNode;
  suggestedLabel: string | null;
  suggestedReason: string | null;
  manualValue: string;
  options: AssignmentOption[];
  onChange: (value: string) => void;
}) {
  const { label, icon, suggestedLabel, suggestedReason, manualValue, options, onChange } = props;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        <span>{label}</span>
      </div>
      <div className="rounded-lg border border-border/70 bg-background/60 p-3">
        <p className="text-sm">
          Suggested:{" "}
          <span className="font-medium">
            {suggestedLabel || "No suggestion"}
          </span>
        </p>
        {suggestedReason ? (
          <p className="mt-1 text-xs text-muted-foreground">{suggestedReason}</p>
        ) : null}
        <select
          className="mt-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={manualValue}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">No manual assignment</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function RecordingCard(props: {
  recording: RecordingItem;
  projects: AssignmentOption[];
  partners: AssignmentOption[];
  brains: AssignmentOption[];
  onSaved: (nextRecording: RecordingItem) => void;
}) {
  const { recording, projects, partners, brains, onSaved } = props;
  const [manualProjectId, setManualProjectId] = useState(recording.project.manual.id || "");
  const [manualPartnerId, setManualPartnerId] = useState(recording.partner.manual.id || "");
  const [manualBrainId, setManualBrainId] = useState(recording.brain.manual.id || "");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>(recording.review.status);
  const [reviewNotes, setReviewNotes] = useState(recording.review.notes || "");
  const [saving, setSaving] = useState(false);
  const resolvedProject = recording.project.manual.label || recording.project.suggested.label;
  const resolvedPartner = recording.partner.manual.label || recording.partner.suggested.label;
  const resolvedBrain = recording.brain.manual.label || recording.brain.suggested.label;

  async function saveAssignments() {
    setSaving(true);
    try {
      const response = await fetch(`/api/recordings/${recording.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manualProjectId: manualProjectId || null,
          manualPartnerId: manualPartnerId || null,
          manualBrainId: manualBrainId || null,
          reviewStatus,
          reviewNotes,
          assignedBy: "dashboard",
        }),
      });

      const data = await response.json();
      if (response.ok && data.recording) {
        onSaved(data.recording);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-border/70">
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                {recording.kind === "voice_memo" ? (
                  <Mic className="h-3 w-3" />
                ) : (
                  <Video className="h-3 w-3" />
                )}
                {recording.source === "voice_memo" ? "Voice memo" : "Fathom"}
              </Badge>
              <Badge
                variant="outline"
                className={statusTone[reviewStatus]}
              >
                {reviewStatus.replaceAll("_", " ")}
              </Badge>
            </div>
            <CardTitle className="text-xl">{recording.title}</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>{new Date(recording.occurredAt).toLocaleString()}</span>
              <span>{recording.participants.join(", ") || "No participants"}</span>
            </div>
          </div>
          <div className="grid gap-2 text-sm">
            <div className="rounded-lg border border-border/70 px-3 py-2">
              <span className="text-muted-foreground">Resolved project: </span>
              <span className="font-medium">{resolvedProject || "Unassigned"}</span>
            </div>
            <div className="rounded-lg border border-border/70 px-3 py-2">
              <span className="text-muted-foreground">Resolved partner: </span>
              <span className="font-medium">{resolvedPartner || "Unassigned"}</span>
            </div>
            <div className="rounded-lg border border-border/70 px-3 py-2">
              <span className="text-muted-foreground">Resolved brain: </span>
              <span className="font-medium">{resolvedBrain || "Unassigned"}</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <AssignmentRow
            label="Project"
            icon={<Link2 className="h-4 w-4 text-orange-600" />}
            suggestedLabel={recording.project.suggested.label}
            suggestedReason={recording.project.suggested.reason}
            manualValue={manualProjectId}
            options={projects}
            onChange={setManualProjectId}
          />
          <AssignmentRow
            label="Partner"
            icon={<Link2 className="h-4 w-4 text-orange-600" />}
            suggestedLabel={recording.partner.suggested.label}
            suggestedReason={recording.partner.suggested.reason}
            manualValue={manualPartnerId}
            options={partners}
            onChange={setManualPartnerId}
          />
          <AssignmentRow
            label="Brain"
            icon={<Brain className="h-4 w-4 text-orange-600" />}
            suggestedLabel={recording.brain.suggested.label}
            suggestedReason={recording.brain.suggested.reason}
            manualValue={manualBrainId}
            options={brains}
            onChange={setManualBrainId}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[220px,1fr]">
          <div>
            <label className="mb-2 block text-sm font-medium">Review status</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={reviewStatus}
              onChange={(event) => setReviewStatus(event.target.value as ReviewStatus)}
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Manual notes</label>
            <Textarea
              value={reviewNotes}
              onChange={(event) => setReviewNotes(event.target.value)}
              placeholder="Review notes, routing rationale, or follow-up detail"
              className="min-h-24"
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
          <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <FileAudio className="h-4 w-4 text-orange-600" />
              Summary
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {recording.content.summary || "No summary available yet."}
            </p>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <div className="mb-2 text-sm font-medium">Action items</div>
              {recording.content.actionItems.length ? (
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {recording.content.actionItems.slice(0, 5).map((item) => (
                    <li key={item} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No action items captured.</p>
              )}
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <div className="mb-2 text-sm font-medium">Links</div>
              <div className="space-y-2 text-sm">
                {recording.links.sourceUrl ? (
                  <a className="block text-orange-600 underline-offset-4 hover:underline" href={recording.links.sourceUrl} target="_blank" rel="noreferrer">
                    Source link
                  </a>
                ) : null}
                {recording.links.shareUrl ? (
                  <a className="block text-orange-600 underline-offset-4 hover:underline" href={recording.links.shareUrl} target="_blank" rel="noreferrer">
                    Share link
                  </a>
                ) : null}
                {recording.links.notionUrl ? (
                  <a className="block text-orange-600 underline-offset-4 hover:underline" href={recording.links.notionUrl} target="_blank" rel="noreferrer">
                    Notion note
                  </a>
                ) : null}
                {recording.links.audioPath ? (
                  <div className="text-muted-foreground">{recording.links.audioPath}</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <Button onClick={saveAssignments} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save review
        </Button>
      </CardContent>
    </Card>
  );
}

export default function RecordingsPage() {
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [projects, setProjects] = useState<AssignmentOption[]>([]);
  const [partners, setPartners] = useState<AssignmentOption[]>([]);
  const [brains, setBrains] = useState<AssignmentOption[]>([]);
  const [stats, setStats] = useState<RecordingsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadRecordings();
  }, []);

  async function loadRecordings() {
    setLoading(true);
    try {
      const response = await fetch("/api/recordings", { cache: "no-store" });
      const data = await response.json();
      setRecordings(data.recordings || []);
      setProjects(data.projects || []);
      setPartners(data.partners || []);
      setBrains(data.brains || []);
      setStats(data.stats || null);
    } finally {
      setLoading(false);
    }
  }

  const filteredRecordings = recordings.filter((recording) => {
    const haystack = [
      recording.title,
      recording.content.summary,
      recording.project.suggested.label,
      recording.project.manual.label,
      recording.partner.suggested.label,
      recording.partner.manual.label,
      recording.brain.suggested.label,
      recording.brain.manual.label,
      ...recording.participants,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(query.toLowerCase());
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6 md:p-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Recordings Review</h1>
          <p className="mt-1 text-muted-foreground">
            Unified queue for local voice memos and Fathom meetings, with suggested routing into projects, partners, and brains.
          </p>
        </div>
        <div className="w-full md:w-80">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, summary, participant, project, partner"
          />
        </div>
      </div>

      {stats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total", value: stats.total },
            { label: "Voice memos", value: stats.voiceMemos },
            { label: "Fathom calls", value: stats.fathomCalls },
            { label: "Needs review", value: stats.needsReview },
          ].map((item) => (
            <Card key={item.label} className="border-border/70">
              <CardContent className="space-y-1 py-5">
                <div className="text-sm text-muted-foreground">{item.label}</div>
                <div className="text-2xl font-semibold">{item.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading recordings
          </CardContent>
        </Card>
      ) : filteredRecordings.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-12 text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            No recordings found for the current filter.
          </CardContent>
        </Card>
      ) : (
        filteredRecordings.map((recording) => (
          <RecordingCard
            key={recording.id}
            recording={recording}
            projects={projects}
            partners={partners}
            brains={brains}
            onSaved={(nextRecording) => {
              setRecordings((current) =>
                current.map((item) =>
                  item.id === nextRecording.id ? nextRecording : item
                )
              );
            }}
          />
        ))
      )}
    </div>
  );
}

import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";

const RECORDINGS_PATH = join(process.cwd(), "data", "recordings.json");
const PROJECTS_PATH = join(process.cwd(), "data", "projects.yaml");
const PARTNERS_PATH = join(process.cwd(), "data", "partners.yaml");
const BRAINS_PATH = join(process.cwd(), "data", "brains.yaml");

export type RecordingSource = "voice_memo" | "fathom";
export type RecordingKind = "voice_memo" | "call";
export type ReviewStatus =
  | "needs_review"
  | "manual_reviewed"
  | "linked"
  | "ignored";

export interface AssignmentSuggestion {
  id: string | null;
  label: string | null;
  confidence: "high" | "medium" | "low" | "unknown";
  reason: string | null;
}

export interface ManualAssignment {
  id: string | null;
  label: string | null;
}

export interface RecordingItem {
  id: string;
  source: RecordingSource;
  kind: RecordingKind;
  sourceId: string;
  dedupeKey: string;
  title: string;
  occurredAt: string;
  recordedOn: string;
  participants: string[];
  project: {
    suggested: AssignmentSuggestion;
    manual: ManualAssignment;
  };
  partner: {
    suggested: AssignmentSuggestion;
    manual: ManualAssignment;
  };
  brain: {
    suggested: AssignmentSuggestion;
    manual: ManualAssignment;
  };
  review: {
    status: ReviewStatus;
    notes: string;
    assignedBy: string | null;
    assignedAt: string | null;
  };
  content: {
    summary: string;
    keyPoints: string[];
    actionItems: string[];
    transcript: string | null;
  };
  links: {
    sourceUrl: string | null;
    shareUrl: string | null;
    notionUrl: string | null;
    audioPath: string | null;
  };
  metadata: {
    importedFrom: string;
    matchedBy: string | null;
    legacyProjectMatch: string | null;
    ingestion: {
      importedAt: string;
      updatedAt: string;
      runId: string | null;
    };
    manualFields: {
      projectRequired: boolean;
      partnerRequired: boolean;
      brainRequired: boolean;
    };
  };
}

export interface RecordingsStore {
  version: number;
  updatedAt: string;
  recordings: RecordingItem[];
}

export interface ProjectOption {
  id: string;
  name: string;
}

export interface BrainOption {
  id: string;
  name: string;
}

export interface PartnerOption {
  id: string;
  name: string;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function loadYamlFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return yaml.load(raw, { schema: yaml.JSON_SCHEMA }) as T;
}

export async function loadRecordingsStore(): Promise<RecordingsStore> {
  const store = await readJsonFile<RecordingsStore>(RECORDINGS_PATH);
  return {
    ...store,
    recordings: (store.recordings || []).map(normalizeRecordingItem),
  };
}

export async function saveRecordingsStore(store: RecordingsStore) {
  const nextStore: RecordingsStore = {
    ...store,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(RECORDINGS_PATH, `${JSON.stringify(nextStore, null, 2)}\n`, "utf8");
}

export async function loadProjectOptions(): Promise<ProjectOption[]> {
  const data = await loadYamlFile<{ projects?: ProjectOption[] }>(PROJECTS_PATH);
  return (data.projects || []).map((project) => ({
    id: project.id,
    name: project.name,
  }));
}

export async function loadPartnerOptions(): Promise<PartnerOption[]> {
  const data = await loadYamlFile<{ partners?: PartnerOption[] }>(PARTNERS_PATH);
  return (data.partners || []).map((partner) => ({
    id: partner.id,
    name: partner.name,
  }));
}

export async function loadBrainOptions(): Promise<BrainOption[]> {
  const data = await loadYamlFile<{ brains?: BrainOption[] }>(BRAINS_PATH);
  return (data.brains || []).map((brain) => ({
    id: brain.id,
    name: brain.name,
  }));
}

function normalizeAssignmentSuggestion(
  assignment?: Partial<AssignmentSuggestion> | null
): AssignmentSuggestion {
  return {
    id: assignment?.id || null,
    label: assignment?.label || null,
    confidence: assignment?.confidence || "unknown",
    reason: assignment?.reason || null,
  };
}

function normalizeManualAssignment(
  assignment?: Partial<ManualAssignment> | null
): ManualAssignment {
  return {
    id: assignment?.id || null,
    label: assignment?.label || null,
  };
}

function normalizeRecordingItem(recording: any): RecordingItem {
  return {
    ...recording,
    participants: Array.isArray(recording?.participants) ? recording.participants : [],
    project: {
      suggested: normalizeAssignmentSuggestion(recording?.project?.suggested),
      manual: normalizeManualAssignment(recording?.project?.manual),
    },
    partner: {
      suggested: normalizeAssignmentSuggestion(recording?.partner?.suggested),
      manual: normalizeManualAssignment(recording?.partner?.manual),
    },
    brain: {
      suggested: normalizeAssignmentSuggestion(recording?.brain?.suggested),
      manual: normalizeManualAssignment(recording?.brain?.manual),
    },
    review: {
      status: recording?.review?.status || "needs_review",
      notes: recording?.review?.notes || "",
      assignedBy: recording?.review?.assignedBy || null,
      assignedAt: recording?.review?.assignedAt || null,
    },
    content: {
      summary: recording?.content?.summary || "",
      keyPoints: Array.isArray(recording?.content?.keyPoints)
        ? recording.content.keyPoints
        : [],
      actionItems: Array.isArray(recording?.content?.actionItems)
        ? recording.content.actionItems
        : [],
      transcript: recording?.content?.transcript || null,
    },
    links: {
      sourceUrl: recording?.links?.sourceUrl || null,
      shareUrl: recording?.links?.shareUrl || null,
      notionUrl: recording?.links?.notionUrl || null,
      audioPath: recording?.links?.audioPath || null,
    },
    metadata: {
      importedFrom: recording?.metadata?.importedFrom || "unknown",
      matchedBy: recording?.metadata?.matchedBy || null,
      legacyProjectMatch: recording?.metadata?.legacyProjectMatch || null,
      ingestion: {
        importedAt: recording?.metadata?.ingestion?.importedAt || new Date(0).toISOString(),
        updatedAt: recording?.metadata?.ingestion?.updatedAt || new Date(0).toISOString(),
        runId: recording?.metadata?.ingestion?.runId || null,
      },
      manualFields: {
        projectRequired: Boolean(recording?.metadata?.manualFields?.projectRequired),
        partnerRequired: Boolean(recording?.metadata?.manualFields?.partnerRequired),
        brainRequired: Boolean(recording?.metadata?.manualFields?.brainRequired),
      },
    },
  };
}

import { promises as fs } from "fs";
import path from "path";

export type OrchestratorSection = "active" | "recent";

export interface OrchestratorEntry {
  id: string;
  title: string;
  section: OrchestratorSection;
  status: string | null;
  goal: string | null;
  latestSignal: string | null;
  blocker: string | null;
  nextAction: string | null;
  workstream: string | null;
  agent: string | null;
  model: string | null;
  service: string | null;
  url: string | null;
  sessionId: string | null;
  notes: string[];
  lastUpdated: string | null;
}

export interface OrchestratorData {
  sourcePath: string;
  lastUpdated: string | null;
  active: OrchestratorEntry[];
  blocked: OrchestratorEntry[];
  recentlyCompleted: OrchestratorEntry[];
  counts: {
    active: number;
    blocked: number;
    recentlyCompleted: number;
    totalTracked: number;
  };
}

const ACTIVE_TRACKER_PATH = path.resolve(process.cwd(), "..", "tasks", "ACTIVE.md");

function normalizeKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, "_");
}

function cleanValue(value: string): string {
  return value.trim().replace(/^`|`$/g, "");
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function createEntry(title: string, section: OrchestratorSection, lastUpdated: string | null): OrchestratorEntry {
  return {
    id: slugify(`${section}-${title}`),
    title: title.replace(/^\d+\)\s*/, "").trim(),
    section,
    status: null,
    goal: null,
    latestSignal: null,
    blocker: null,
    nextAction: null,
    workstream: null,
    agent: null,
    model: null,
    service: null,
    url: null,
    sessionId: null,
    notes: [],
    lastUpdated,
  };
}

export async function readOrchestratorData(): Promise<OrchestratorData> {
  const raw = await fs.readFile(ACTIVE_TRACKER_PATH, "utf8");
  const lines = raw.split(/\r?\n/);

  let lastUpdated: string | null = null;
  let section: OrchestratorSection | null = null;
  let current: OrchestratorEntry | null = null;
  const entries: OrchestratorEntry[] = [];

  for (const line of lines) {
    if (line.startsWith("Last updated:")) {
      lastUpdated = line.replace("Last updated:", "").trim();
      continue;
    }

    if (line.startsWith("## Active Tasks")) {
      section = "active";
      current = null;
      continue;
    }

    if (line.startsWith("## Recently Completed")) {
      section = "recent";
      current = null;
      continue;
    }

    if (!section) {
      continue;
    }

    if (line.startsWith("### ")) {
      current = createEntry(line.replace(/^###\s+/, ""), section, lastUpdated);
      entries.push(current);
      continue;
    }

    if (!current || !line.trim().startsWith("- ")) {
      continue;
    }

    const bullet = line.trim().slice(2).trim();
    const richField = bullet.match(/^\*\*(.+?)\*\*:\s*(.+)$/);

    if (richField) {
      const key = normalizeKey(richField[1]);
      const value = cleanValue(richField[2]);

      switch (key) {
        case "status":
          current.status = value;
          break;
        case "goal":
          current.goal = value;
          break;
        case "latest_signal":
          current.latestSignal = value;
          break;
        case "blocker":
          current.blocker = value;
          break;
        case "next_action":
          current.nextAction = value;
          break;
        case "workstream":
          current.workstream = value;
          break;
        case "agent":
          current.agent = value;
          break;
        case "model":
          current.model = value;
          break;
        case "service":
          current.service = value;
          break;
        case "url":
          current.url = value;
          break;
        case "session":
        case "session_id":
          current.sessionId = value;
          break;
        case "last_updated":
          current.lastUpdated = value;
          break;
        default:
          current.notes.push(`${richField[1]}: ${value}`);
          break;
      }
      continue;
    }

    current.notes.push(cleanValue(bullet));
  }

  const active = entries.filter(
    (entry) => entry.section === "active" && entry.status !== "blocked"
  );
  const blocked = entries.filter((entry) => entry.section === "active" && entry.status === "blocked");
  const recentlyCompleted = entries.filter((entry) => entry.section === "recent");

  return {
    sourcePath: ACTIVE_TRACKER_PATH,
    lastUpdated,
    active,
    blocked,
    recentlyCompleted,
    counts: {
      active: active.length,
      blocked: blocked.length,
      recentlyCompleted: recentlyCompleted.length,
      totalTracked: entries.length,
    },
  };
}

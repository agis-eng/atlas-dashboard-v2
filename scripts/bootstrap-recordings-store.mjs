import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import yaml from "js-yaml";

const root = process.cwd();
const voiceMemosPath = join(root, "data", "voice_memos.yaml");
const callNotesPath = join(root, "data", "call-notes.yaml");
const projectsPath = join(root, "data", "projects.yaml");
const partnersPath = join(root, "data", "partners.yaml");
const outputPath = join(root, "data", "recordings.json");

function toSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function compact(values) {
  return values.filter(Boolean);
}

function buildEntityMap(items) {
  return new Map((items || []).map((item) => [item.id, item]));
}

function buildProjectNameIndex(projects) {
  const index = new Map();
  for (const project of projects || []) {
    for (const variant of compact([
      project.id,
      project.name,
      project.clientId,
      String(project.id || "").replace(/-/g, " "),
    ])) {
      index.set(normalizeText(variant).toLowerCase(), project);
    }
  }
  return index;
}

function resolveProject(projectNameIndex, rawValue) {
  const candidate = normalizeText(rawValue).toLowerCase();
  if (!candidate) return null;
  const direct = projectNameIndex.get(candidate);
  if (direct) return direct;

  for (const [key, project] of projectNameIndex.entries()) {
    if (key.includes(candidate) || candidate.includes(key)) {
      return project;
    }
  }

  return null;
}

function resolvePartnerByProject(partners, projectId) {
  if (!projectId) return null;
  const matches = (partners || []).filter((partner) =>
    Array.isArray(partner.projectIds) && partner.projectIds.includes(projectId)
  );
  return matches.length === 1 ? matches[0] : null;
}

function mapVoiceMemo(item, projectNameIndex, partners) {
  const occurredAt = item.date || new Date().toISOString();
  const project = resolveProject(projectNameIndex, item.project_id || item.project_match);
  const partner = resolvePartnerByProject(partners, project?.id || null);
  return {
    id: `voice-memo:${item.id}`,
    source: "voice_memo",
    kind: "voice_memo",
    sourceId: item.id,
    dedupeKey: `voice_memo:${item.id}`,
    title: item.title || "Untitled voice memo",
    occurredAt,
    recordedOn: occurredAt.slice(0, 10),
    participants: String(item.speakers || "Unknown")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    project: {
      suggested: {
        id: project?.id || null,
        label: project?.name || item.project_match || null,
        confidence: project ? "medium" : "unknown",
        reason: item.project_match
          ? "Imported from legacy voice memo project_match field."
          : null,
      },
      manual: {
        id: null,
        label: null,
      },
    },
    partner: {
      suggested: {
        id: partner?.id || null,
        label: partner?.name || null,
        confidence: partner ? "low" : "unknown",
        reason: partner ? "Inferred from matched project relationship." : null,
      },
      manual: {
        id: null,
        label: null,
      },
    },
    brain: {
      suggested: {
        id: null,
        label: null,
        confidence: "unknown",
        reason: null,
      },
      manual: {
        id: null,
        label: null,
      },
    },
    review: {
      status: item.project_match ? "manual_reviewed" : "needs_review",
      notes: "",
      assignedBy: null,
      assignedAt: null,
    },
    content: {
      summary: item.summary || "",
      keyPoints: Array.isArray(item.topics) ? item.topics : [],
      actionItems: Array.isArray(item.action_items) ? item.action_items : [],
      transcript: null,
    },
    links: {
      sourceUrl: null,
      shareUrl: null,
      notionUrl: item.notion_url || null,
      audioPath: null,
    },
    metadata: {
      importedFrom: "voice_memos.yaml",
      matchedBy: item.project_match ? "legacy_project_match" : null,
      legacyProjectMatch: item.project_match || null,
      ingestion: {
        importedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        runId: "bootstrap-recordings-store",
      },
      manualFields: {
        projectRequired: !project,
        partnerRequired: !partner,
        brainRequired: true,
      },
    },
  };
}

function mapCall(call, projectMap, partnerMap) {
  const occurredAt = call.date
    ? `${call.date}T12:00:00.000Z`
    : new Date().toISOString();
  const project = call.project_id ? projectMap.get(call.project_id) : null;
  const partner = call.partner_id
    ? partnerMap.get(call.partner_id)
    : resolvePartnerByProject([...partnerMap.values()], project?.id || null);

  return {
    id: `fathom:${call.recording_id}`,
    source: "fathom",
    kind: "call",
    sourceId: String(call.recording_id),
    dedupeKey: `fathom:${call.recording_id}`,
    title: call.title || call.meeting_name || "Untitled call",
    occurredAt,
    recordedOn: occurredAt.slice(0, 10),
    participants: Array.isArray(call.participants) ? call.participants : [],
    project: {
      suggested: {
        id: call.project_id || null,
        label: project?.name || call.project_id || null,
        confidence: call.project_id ? "high" : "unknown",
        reason: call.project_id
          ? "Imported from existing call-notes project_id field."
          : null,
      },
      manual: {
        id: null,
        label: null,
      },
    },
    partner: {
      suggested: {
        id: partner?.id || null,
        label: partner?.name || call.partner_id || null,
        confidence: partner ? "high" : "unknown",
        reason: partner
          ? (call.partner_id
            ? "Imported from existing call-notes partner_id field."
            : "Inferred from matched project relationship.")
          : null,
      },
      manual: {
        id: null,
        label: null,
      },
    },
    brain: {
      suggested: {
        id: null,
        label: null,
        confidence: "unknown",
        reason: null,
      },
      manual: {
        id: null,
        label: null,
      },
    },
    review: {
      status: call.project_id ? "linked" : "needs_review",
      notes: "",
      assignedBy: null,
      assignedAt: null,
    },
    content: {
      summary: "",
      keyPoints: Array.isArray(call.key_takeaways) ? call.key_takeaways : [],
      actionItems: Array.isArray(call.next_steps) ? call.next_steps : [],
      transcript: null,
    },
    links: {
      sourceUrl: call.fathom_url || null,
      shareUrl: call.share_url || null,
      notionUrl: null,
      audioPath: null,
    },
    metadata: {
      importedFrom: "call-notes.yaml",
      matchedBy: call.project_id ? "legacy_call_notes" : null,
      legacyProjectMatch: call.project_id || null,
      ingestion: {
        importedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        runId: "bootstrap-recordings-store",
      },
      manualFields: {
        projectRequired: !call.project_id,
        partnerRequired: !partner,
        brainRequired: true,
      },
    },
  };
}

const voiceMemosRaw = await readFile(voiceMemosPath, "utf8");
const callNotesRaw = await readFile(callNotesPath, "utf8");

const voiceMemoData = yaml.load(voiceMemosRaw, { schema: yaml.JSON_SCHEMA }) || {};
const callNotesData = yaml.load(callNotesRaw, { schema: yaml.JSON_SCHEMA }) || {};
const projectsData = yaml.load(await readFile(projectsPath, "utf8"), { schema: yaml.JSON_SCHEMA }) || {};
const partnersData = yaml.load(await readFile(partnersPath, "utf8"), { schema: yaml.JSON_SCHEMA }) || {};
const projects = projectsData.projects || [];
const partners = partnersData.partners || [];
const projectMap = buildEntityMap(projects);
const partnerMap = buildEntityMap(partners);
const projectNameIndex = buildProjectNameIndex(projects);

const recordings = [
  ...(voiceMemoData.voice_memos || []).map((item) =>
    mapVoiceMemo(item, projectNameIndex, partners)
  ),
  ...(callNotesData.calls || []).map((call) => mapCall(call, projectMap, partnerMap)),
].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

const store = {
  version: 1,
  updatedAt: new Date().toISOString(),
  recordings,
};

await writeFile(outputPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
console.log(`Wrote ${recordings.length} recordings to ${outputPath}`);

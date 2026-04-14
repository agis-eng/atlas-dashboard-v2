import { readFile, writeFile } from "fs/promises";
import path from "path";
import yaml from "js-yaml";

const DATA_DIR = path.join(process.cwd(), "data");

function yamlPath(filename) {
  return path.join(DATA_DIR, filename);
}

export async function readYamlFile(filename, fallback = {}) {
  try {
    const raw = await readFile(yamlPath(filename), "utf8");
    return (yaml.load(raw, { schema: yaml.JSON_SCHEMA }) || fallback);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function writeYamlFile(filename, data) {
  const raw = yaml.dump(data, {
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });
  await writeFile(yamlPath(filename), raw, "utf8");
}

function compact(values) {
  return values.filter(Boolean);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toISOString();
}

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value].filter(Boolean);
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildProjectNameIndex(projects) {
  const index = new Map();
  for (const project of projects) {
    const variants = compact([
      project.id,
      project.name,
      project.clientId,
      String(project.id || "").replace(/-/g, " "),
    ]);
    for (const variant of variants) {
      index.set(variant.toLowerCase(), project);
    }
  }
  return index;
}

function resolveVoiceMemoProjectId(projectNameIndex, memo) {
  const raw = normalizeText(memo.project_id || memo.project_match);
  if (!raw) return null;
  const direct = projectNameIndex.get(raw.toLowerCase());
  if (direct) return direct.id;

  const lowered = raw.toLowerCase();
  for (const [key, project] of projectNameIndex.entries()) {
    if (key.includes(lowered) || lowered.includes(key)) {
      return project.id;
    }
  }
  return null;
}

function buildEntityMap(items, key = "id") {
  return new Map((items || []).map((item) => [item[key], item]));
}

function normalizeCallRecording(call, projectMap, partnerMap) {
  const project = call.project_id ? projectMap.get(call.project_id) : null;
  const partner = call.partner_id ? partnerMap.get(call.partner_id) : null;
  return {
    id: `fathom-${call.recording_id || slugify(`${call.date}-${call.title}`)}`,
    source: "fathom",
    sourceType: "call-note",
    title: call.title || call.meeting_name || "Untitled call",
    date: normalizeDate(call.date),
    displayDate: call.date || null,
    summary: normalizeText((call.key_takeaways || []).join(" ")) || null,
    projectId: call.project_id || null,
    projectName: project?.name || null,
    partnerId: call.partner_id || null,
    partnerName: partner?.name || null,
    participants: toArray(call.participants),
    speakers: toArray(call.participants).join(", "),
    tags: compact([project?.name, partner?.name]),
    actionItems: toArray(call.next_steps),
    keyTakeaways: toArray(call.key_takeaways),
    urls: compact([call.share_url, call.fathom_url]),
    primaryUrl: call.share_url || call.fathom_url || null,
    recordingId: call.recording_id || null,
    metadata: {
      meetingName: call.meeting_name || null,
      processedAt: call.processed_at || null,
    },
  };
}

function normalizeVoiceMemoRecording(memo, projectMap, projectNameIndex) {
  const projectId = resolveVoiceMemoProjectId(projectNameIndex, memo);
  const project = projectId ? projectMap.get(projectId) : null;
  return {
    id: memo.id || `voice-memo-${slugify(`${memo.date}-${memo.title}`)}`,
    source: "voice-memo",
    sourceType: "voice-memo",
    title: memo.title || "Untitled memo",
    date: normalizeDate(memo.date),
    displayDate: memo.date || null,
    summary: normalizeText(memo.summary),
    projectId,
    projectName: project?.name || normalizeText(memo.project_match) || null,
    partnerId: null,
    partnerName: null,
    participants: toArray(memo.speakers ? String(memo.speakers).split(",").map((item) => item.trim()) : []),
    speakers: normalizeText(memo.speakers),
    tags: toArray(memo.topics),
    actionItems: toArray(memo.action_items),
    keyTakeaways: [],
    urls: compact([memo.notion_url]),
    primaryUrl: memo.notion_url || null,
    recordingId: null,
    metadata: {
      memoType: memo.type || null,
    },
  };
}

export async function loadSharedRecordings(options = {}) {
  const limit = Number.isFinite(options.limit) ? options.limit : null;
  const [{ calls = [] }, { voice_memos: voiceMemos = [] }, { projects = [] }, { partners = [] }] =
    await Promise.all([
      readYamlFile("call-notes.yaml", { calls: [] }),
      readYamlFile("voice_memos.yaml", { voice_memos: [] }),
      readYamlFile("projects.yaml", { projects: [] }),
      readYamlFile("partners.yaml", { partners: [] }),
    ]);

  const projectMap = buildEntityMap(projects);
  const partnerMap = buildEntityMap(partners);
  const projectNameIndex = buildProjectNameIndex(projects);

  const recordings = [
    ...calls.map((call) => normalizeCallRecording(call, projectMap, partnerMap)),
    ...voiceMemos.map((memo) =>
      normalizeVoiceMemoRecording(memo, projectMap, projectNameIndex)
    ),
  ].sort((a, b) => {
    const aTime = a.date ? new Date(a.date).getTime() : 0;
    const bTime = b.date ? new Date(b.date).getTime() : 0;
    return bTime - aTime;
  });

  const sliced = limit ? recordings.slice(0, limit) : recordings;
  const stats = {
    total: recordings.length,
    fathomCalls: recordings.filter((item) => item.source === "fathom").length,
    voiceMemos: recordings.filter((item) => item.source === "voice-memo").length,
    linkedToProject: recordings.filter((item) => item.projectId).length,
    unlinked: recordings.filter((item) => !item.projectId && !item.partnerId).length,
  };

  return { recordings: sliced, stats };
}

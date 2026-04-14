import { readFile } from "fs/promises";
import path from "path";
import { readYamlFile, writeYamlFile } from "./recordings.mjs";

function compact(values) {
  return values.filter(Boolean);
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKeyword(value) {
  return normalizeText(value).toLowerCase();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/\n|•|;+/)
      .map((item) => item.replace(/^[-*\d.)\s]+/, "").trim())
      .filter(Boolean);
  }
  return [value].filter(Boolean);
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function dateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function parseSectionedSummary(text) {
  if (!text) return { keyTakeaways: [], nextSteps: [] };
  const normalized = String(text).replace(/\r/g, "");
  const sections = {
    keyTakeaways: [],
    nextSteps: [],
  };
  const blocks = normalized.split(/\n(?=#{0,3}\s*(?:Key Takeaways|Action Items|Next Steps))/i);

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    const header = lines[0].toLowerCase();
    const content = toArray(lines.slice(1).join("\n"));
    if (header.includes("action") || header.includes("next")) {
      sections.nextSteps.push(...content);
    } else if (header.includes("takeaway") || header.includes("summary")) {
      sections.keyTakeaways.push(...content);
    }
  }

  if (!sections.keyTakeaways.length && !sections.nextSteps.length) {
    sections.keyTakeaways = toArray(text).slice(0, 8);
  }

  return sections;
}

function extractMeetingArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.calls)) return payload.calls;
  if (Array.isArray(payload?.meetings)) return payload.meetings;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function collectSummaryPayload(meeting) {
  return (
    meeting.summary ||
    meeting.ai_summary ||
    meeting.summary_data ||
    meeting.notes ||
    meeting.call_summary ||
    {}
  );
}

function extractParticipants(meeting) {
  const raw = meeting.participants || meeting.attendees || meeting.people || [];
  return toArray(raw)
    .map((person) => {
      if (typeof person === "string") return normalizeText(person);
      return normalizeText(
        person.name || person.full_name || person.display_name || person.email
      );
    })
    .filter(Boolean);
}

function extractSummaryFields(meeting) {
  const summaryPayload = collectSummaryPayload(meeting);
  const summaryText = firstString(
    summaryPayload.text,
    summaryPayload.markdown,
    summaryPayload.overview,
    summaryPayload.summary,
    meeting.summary_text,
    meeting.summary_markdown
  );

  const parsedSections = parseSectionedSummary(summaryText);
  const keyTakeaways = compact([
    ...toArray(
      summaryPayload.key_takeaways ||
        summaryPayload.takeaways ||
        summaryPayload.summary_points ||
        meeting.key_takeaways
    ),
    ...parsedSections.keyTakeaways,
  ]);
  const nextSteps = compact([
    ...toArray(
      summaryPayload.next_steps ||
        summaryPayload.action_items ||
        meeting.next_steps ||
        meeting.action_items
    ),
    ...parsedSections.nextSteps,
  ]);

  return {
    summaryText: normalizeText(summaryText),
    keyTakeaways: [...new Set(keyTakeaways.map(normalizeText).filter(Boolean))].slice(0, 12),
    nextSteps: [...new Set(nextSteps.map(normalizeText).filter(Boolean))].slice(0, 12),
  };
}

function buildCandidateKeywords(entity, explicitKeywords = []) {
  const values = compact([
    entity.name,
    entity.slug,
    entity.id,
    String(entity.id || "").replace(/-/g, " "),
    ...explicitKeywords,
  ]);
  return [...new Set(values.map(normalizeKeyword).filter((item) => item.length >= 3))];
}

function buildMatcherEntries(configItems, entities, idKey, includeAllEntities = false) {
  const entityMap = new Map((entities || []).map((entity) => [entity.id, entity]));
  const entries = [];
  const seenEntities = new Set();

  for (const item of configItems || []) {
    const entityId = item[idKey];
    const entity = entityMap.get(entityId);
    if (!entity) continue;
    seenEntities.add(entityId);
    for (const keyword of buildCandidateKeywords(entity, item.keywords || [])) {
      entries.push({
        id: entityId,
        label: entity.name || entityId,
        keyword,
        length: keyword.length,
      });
    }
  }

  if (includeAllEntities) {
    for (const entity of entities || []) {
      if (seenEntities.has(entity.id)) continue;
      for (const keyword of buildCandidateKeywords(entity, [])) {
        entries.push({
          id: entity.id,
          label: entity.name || entity.id,
          keyword,
          length: keyword.length,
        });
      }
    }
  }

  return entries.sort((a, b) => b.length - a.length || a.label.localeCompare(b.label));
}

function longestKeywordMatch(text, entries) {
  const haystack = normalizeKeyword(text);
  if (!haystack) return null;
  for (const entry of entries) {
    if (haystack.includes(entry.keyword)) {
      return entry;
    }
  }
  return null;
}

function buildExistingCallIndex(calls) {
  const keys = new Set();
  for (const call of calls || []) {
    const titleKey = normalizeKeyword(call.title || call.meeting_name);
    const dateKey = dateOnly(call.date);
    if (call.recording_id) keys.add(`id:${call.recording_id}`);
    if (call.share_url) keys.add(`share:${call.share_url}`);
    if (call.fathom_url) keys.add(`fathom:${call.fathom_url}`);
    if (titleKey && dateKey) keys.add(`title-date:${titleKey}:${dateKey}`);
  }
  return keys;
}

function buildDeduplicationKeys(meeting, normalizedTitle) {
  const keys = [];
  const id = meeting.recording_id || meeting.recordingId || meeting.id || meeting.call_id;
  const shareUrl = meeting.share_url || meeting.shareUrl || meeting.public_url;
  const fathomUrl = meeting.fathom_url || meeting.fathomUrl || meeting.url;
  const dateKey = dateOnly(
    meeting.date || meeting.start_time || meeting.started_at || meeting.recorded_at
  );
  if (id) keys.push(`id:${id}`);
  if (shareUrl) keys.push(`share:${shareUrl}`);
  if (fathomUrl) keys.push(`fathom:${fathomUrl}`);
  if (normalizedTitle && dateKey) keys.push(`title-date:${normalizeKeyword(normalizedTitle)}:${dateKey}`);
  return keys;
}

function normalizeMeeting(meeting, matchers) {
  const title = firstString(
    meeting.title,
    meeting.topic,
    meeting.name,
    meeting.subject,
    meeting.meeting_name,
    "Untitled Fathom meeting"
  );
  const meetingName = firstString(
    meeting.meeting_name,
    meeting.name,
    meeting.topic,
    title
  );
  const participants = extractParticipants(meeting);
  const { summaryText, keyTakeaways, nextSteps } = extractSummaryFields(meeting);
  const sourceText = compact([
    title,
    meetingName,
    summaryText,
    participants.join(" "),
  ]).join(" ");
  const projectMatch = longestKeywordMatch(sourceText, matchers.projectEntries);
  const partnerMatch = longestKeywordMatch(sourceText, matchers.partnerEntries);
  const date = dateOnly(
    meeting.date || meeting.start_time || meeting.started_at || meeting.recorded_at
  );

  return {
    call: {
      recording_id: meeting.recording_id || meeting.recordingId || meeting.id || null,
      title,
      meeting_name: meetingName,
      date,
      participants,
      project_id: projectMatch?.id || null,
      partner_id: partnerMatch?.id || null,
      key_takeaways:
        keyTakeaways.length > 0
          ? keyTakeaways
          : summaryText
          ? [summaryText]
          : [],
      next_steps: nextSteps,
      fathom_url: meeting.fathom_url || meeting.fathomUrl || meeting.url || null,
      share_url: meeting.share_url || meeting.shareUrl || meeting.public_url || null,
      processed_at: dateOnly(new Date().toISOString()),
    },
    matchContext: {
      projectKeyword: projectMatch?.keyword || null,
      partnerKeyword: partnerMatch?.keyword || null,
      summaryText,
    },
  };
}

async function fetchFathomMeetings(config) {
  if (config.sourceFile) {
    const raw = await readFile(path.resolve(config.sourceFile), "utf8");
    return extractMeetingArray(JSON.parse(raw));
  }

  if (!config.apiKey) {
    throw new Error("Missing FATHOM_API_KEY");
  }

  const url = new URL(config.meetingsPath || "/v1/calls", config.baseUrl || "https://api.fathom.video");
  if (config.since) url.searchParams.set("since", config.since);
  if (config.limit) url.searchParams.set("limit", String(config.limit));

  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Fathom API request failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  return extractMeetingArray(payload);
}

async function loadMatchers() {
  const [{ projects = [] }, { partners = [] }, config] = await Promise.all([
    readYamlFile("projects.yaml", { projects: [] }),
    readYamlFile("partners.yaml", { partners: [] }),
    readYamlFile("recording-keywords.yaml", {
      settings: {},
      projects: [],
      partners: [],
    }),
  ]);

  return {
    projectEntries: buildMatcherEntries(
      config.projects || [],
      projects,
      "project_id",
      Boolean(config.settings?.derive_project_keywords_from_data)
    ),
    partnerEntries: buildMatcherEntries(
      config.partners || [],
      partners,
      "partner_id",
      Boolean(config.settings?.derive_partner_keywords_from_data)
    ),
  };
}

function buildDigest(newCalls) {
  if (!newCalls.length) {
    return "No new Fathom meetings found.";
  }

  const lines = [`New Fathom meetings: ${newCalls.length}`, ""];
  for (const call of newCalls) {
    const entity = compact([
      call.project_id ? `project=${call.project_id}` : null,
      call.partner_id ? `partner=${call.partner_id}` : null,
    ]).join(" | ");
    lines.push(`- ${call.date || "unknown date"} | ${call.title}${entity ? ` | ${entity}` : ""}`);
    if (call.next_steps.length) {
      lines.push(`  next: ${call.next_steps.slice(0, 2).join(" ; ")}`);
    }
  }
  return lines.join("\n");
}

export async function prepareFathomSync(options = {}) {
  const [existingData, matchers] = await Promise.all([
    readYamlFile("call-notes.yaml", { calls: [] }),
    loadMatchers(),
  ]);
  const existingCalls = existingData.calls || [];
  const existingIndex = buildExistingCallIndex(existingCalls);
  const meetings = await fetchFathomMeetings(options);

  const preparedCalls = [];
  const skipped = [];

  for (const meeting of meetings) {
    const normalizedTitle = firstString(
      meeting.title,
      meeting.topic,
      meeting.name,
      meeting.subject,
      meeting.meeting_name
    );
    const dedupeKeys = buildDeduplicationKeys(meeting, normalizedTitle);
    const isDuplicate = dedupeKeys.some((key) => existingIndex.has(key));
    if (isDuplicate) {
      skipped.push({ reason: "duplicate", title: normalizedTitle || "Untitled" });
      continue;
    }

    const normalized = normalizeMeeting(meeting, matchers);
    preparedCalls.push(normalized);
    for (const key of dedupeKeys) existingIndex.add(key);
  }

  const newCalls = preparedCalls.map((item) => item.call);
  const updatedData = {
    calls: [...newCalls, ...existingCalls].sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : 0;
      const bTime = b.date ? new Date(b.date).getTime() : 0;
      return bTime - aTime;
    }),
  };

  return {
    meetingsFetched: meetings.length,
    newCalls,
    skipped,
    updatedData,
    digest: buildDigest(newCalls),
  };
}

export async function writePreparedFathomSync(result) {
  await writeYamlFile("call-notes.yaml", result.updatedData);
}

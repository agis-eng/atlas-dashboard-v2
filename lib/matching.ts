import { readFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";

interface Client {
  id: string;
  name: string;
  contact?: string;
}

interface ProjectEntry {
  id: string;
  name: string;
  clientId?: string;
  stage?: string;
  archived?: boolean;
  lastUpdate?: string;
}

// Internal team members to exclude from matching — these people are on every call
const INTERNAL_NAMES = [
  "erik laine",
  "anton hocking",
];

// Internal email domains — names that are emails from these domains get filtered
const INTERNAL_DOMAINS = ["manifestbot.ai", "manifestic.com"];

function isInternalName(name: string): boolean {
  const lower = name.toLowerCase().trim();
  // Filter known internal team members
  if (INTERNAL_NAMES.some((internal) => lower === internal || lower.includes(internal) || internal.includes(lower))) {
    return true;
  }
  // Filter names that are actually internal email addresses (Fathom sometimes uses email as name)
  if (INTERNAL_DOMAINS.some((d) => lower.includes(d))) {
    return true;
  }
  // Filter generic names like "Unknown"
  if (lower === "unknown" || lower.length < 2) {
    return true;
  }
  return false;
}

async function loadYaml<T>(filename: string): Promise<T> {
  const filePath = join(process.cwd(), "data", filename);
  const contents = await readFile(filePath, "utf8");
  return yaml.load(contents) as T;
}

export async function suggestProjectForRecording(
  attendeeEmails: string[],
  attendeeNames: string[]
): Promise<{ projectId: string; projectName: string; confidence: "high" | "medium" } | null> {
  const { clients } = await loadYaml<{ clients: Client[] }>("clients.yaml");
  const { projects } = await loadYaml<{ projects: ProjectEntry[] }>("projects.yaml");

  // Filter out internal team members from attendee names
  const externalNames = attendeeNames.filter((n) => !isInternalName(n));

  const activeProjects = projects.filter(
    (p) => !p.archived && p.stage !== "done"
  );

  // Build client -> projects lookup
  const clientProjects = new Map<string, ProjectEntry[]>();
  for (const proj of activeProjects) {
    if (proj.clientId) {
      const existing = clientProjects.get(proj.clientId) || [];
      existing.push(proj);
      clientProjects.set(proj.clientId, existing);
    }
  }

  // Strategy 1: Match attendee names against client names (high confidence)
  // Uses exact word-part matching (not substring) to avoid false positives
  for (const name of externalNames) {
    const nameLower = name.toLowerCase().trim();
    if (!nameLower || nameLower.length < 3) continue;

    for (const client of clients) {
      const clientNameLower = client.name.toLowerCase();
      const nameParts = nameLower.split(/\s+/);
      const clientParts = clientNameLower.split(/\s+/);

      // Require exact match on at least one name part (not substring)
      const match = nameParts.some(
        (part) => part.length >= 3 && clientParts.some((cp) => cp === part)
      );

      if (match) {
        const projs = clientProjects.get(client.id);
        if (projs && projs.length > 0) {
          // Pick most recently updated project for this client
          const best = projs.sort((a, b) =>
            (b.lastUpdate || "").localeCompare(a.lastUpdate || "")
          )[0];
          return { projectId: best.id, projectName: best.name, confidence: "high" };
        }
      }
    }
  }

  // Strategy 2: Match attendee names against project names (medium confidence)
  for (const name of externalNames) {
    const nameLower = name.toLowerCase().trim();
    if (!nameLower || nameLower.length < 3) continue;

    const nameParts = nameLower.split(/\s+/);
    for (const proj of activeProjects) {
      const projNameLower = proj.name.toLowerCase();
      const projParts = projNameLower.split(/\s+/);
      // Require exact word match against project name parts
      const match = nameParts.some(
        (part) => part.length >= 3 && projParts.some((pp) => pp === part)
      );
      if (match) {
        return { projectId: proj.id, projectName: proj.name, confidence: "medium" };
      }
    }
  }

  // Strategy 3: Match attendee emails against client contacts (high confidence)
  for (const email of attendeeEmails) {
    for (const client of clients) {
      if (
        client.contact &&
        client.contact.toLowerCase().includes(email.toLowerCase())
      ) {
        const projs = clientProjects.get(client.id);
        if (projs && projs.length > 0) {
          const best = projs.sort((a, b) =>
            (b.lastUpdate || "").localeCompare(a.lastUpdate || "")
          )[0];
          return { projectId: best.id, projectName: best.name, confidence: "high" };
        }
      }
    }
  }

  return null;
}

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
  // This is the most reliable since client contacts are mostly internal emails
  for (const name of attendeeNames) {
    const nameLower = name.toLowerCase().trim();
    if (!nameLower || nameLower.length < 3) continue;

    for (const client of clients) {
      const clientNameLower = client.name.toLowerCase();
      // Check if attendee name appears in client name or vice versa
      const nameParts = nameLower.split(/\s+/);
      const clientParts = clientNameLower.split(/\s+/);

      const match = nameParts.some(
        (part) => part.length >= 3 && clientParts.some((cp) => cp.includes(part) || part.includes(cp))
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
  for (const name of attendeeNames) {
    const nameLower = name.toLowerCase().trim();
    if (!nameLower || nameLower.length < 3) continue;

    const nameParts = nameLower.split(/\s+/);
    for (const proj of activeProjects) {
      const projNameLower = proj.name.toLowerCase();
      const match = nameParts.some(
        (part) => part.length >= 3 && projNameLower.includes(part)
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

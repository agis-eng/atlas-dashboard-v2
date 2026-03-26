import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";

interface Client {
  id: string;
  name: string;
  slug: string;
  contact?: string;
  email?: string;
  phone?: string;
  notes?: string;
  summary?: string;
  requestUrl?: string;
}

interface Project {
  id: string;
  name: string;
  clientId?: string;
  status?: string;
  stage?: string;
  priority?: string;
}

export async function GET() {
  try {
    const clientsPath = path.join(process.cwd(), "data", "clients.yaml");
    const projectsPath = path.join(process.cwd(), "data", "projects.yaml");
    const [clientsRaw, projectsRaw] = await Promise.all([
      fs.readFile(clientsPath, "utf-8"),
      fs.readFile(projectsPath, "utf-8"),
    ]);

    const clientsData = yaml.load(clientsRaw) as { clients: Client[] };
    const projectsData = yaml.load(projectsRaw) as { projects: Project[] };
    const projects = projectsData.projects || [];

    const clients = (clientsData.clients || []).map((client) => {
      const linkedProjects = projects.filter((project) => project.clientId === client.id);
      return {
        ...client,
        email: client.email || client.contact,
        projectCount: linkedProjects.length,
        projects: linkedProjects,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ clients });
  } catch (error) {
    console.error("Failed to load clients:", error);
    return NextResponse.json({ error: "Failed to load clients" }, { status: 500 });
  }
}

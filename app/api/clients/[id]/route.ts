import { NextRequest, NextResponse } from "next/server";
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clientsPath = path.join(process.cwd(), "data", "clients.yaml");
    const projectsPath = path.join(process.cwd(), "data", "projects.yaml");
    const [raw, projectsRaw] = await Promise.all([
      fs.readFile(clientsPath, "utf-8"),
      fs.readFile(projectsPath, "utf-8"),
    ]);
    const data = yaml.load(raw) as { clients: Client[] };
    const projectsData = yaml.load(projectsRaw) as { projects: any[] };
    
    const client = data.clients.find(c => c.id === id || c.slug === id);
    
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    
    const linkedProjects = (projectsData.projects || []).filter((project) => project.clientId === client.id);
    return NextResponse.json({
      ...client,
      email: client.email || client.contact,
      projects: linkedProjects,
    });
  } catch (error) {
    console.error("Failed to load client:", error);
    return NextResponse.json({ error: "Failed to load client" }, { status: 500 });
  }
}

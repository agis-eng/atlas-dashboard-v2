import { mkdir, writeFile, unlink } from "fs/promises";
import { join } from "path";
import { readFile } from "fs/promises";
import yaml from "js-yaml";

interface BrainFile {
  name: string;
  path: string;
  size: number;
  type: string;
  uploadedAt: string;
}

interface YamlProject {
  id: string;
  brain?: {
    links?: { url: string; label: string }[];
    notes?: string[];
    files?: BrainFile[];
  };
  [key: string]: unknown;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const projectId = formData.get("projectId") as string;
    const files = formData.getAll("files") as File[];

    if (!projectId) {
      return Response.json({ error: "Missing projectId" }, { status: 400 });
    }
    if (!files.length) {
      return Response.json({ error: "No files provided" }, { status: 400 });
    }

    const uploadDir = join(process.cwd(), "public", "uploads", "projects", projectId);
    await mkdir(uploadDir, { recursive: true });

    const uploaded: BrainFile[] = [];

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Sanitize filename
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = join(uploadDir, safeName);
      await writeFile(filePath, buffer);

      uploaded.push({
        name: file.name,
        path: `/uploads/projects/${projectId}/${safeName}`,
        size: file.size,
        type: file.type,
        uploadedAt: new Date().toISOString().split("T")[0],
      });
    }

    // Update project YAML brain.files
    const projectsPath = join(process.cwd(), "data", "projects.yaml");
    const fileContents = await readFile(projectsPath, "utf8");
    const data = yaml.load(fileContents) as { projects: YamlProject[] };

    const project = data.projects.find((p) => p.id === projectId);
    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.brain) project.brain = {};
    if (!project.brain.files) project.brain.files = [];
    project.brain.files.push(...uploaded);

    const yamlStr = yaml.dump(data, {
      lineWidth: -1,
      noRefs: true,
      forceQuotes: false,
      quotingType: '"',
    });
    await writeFile(projectsPath, yamlStr, "utf8");

    return Response.json({ success: true, files: uploaded });
  } catch (error) {
    console.error("Upload error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { projectId, filePath } = await request.json();

    if (!projectId || !filePath) {
      return Response.json({ error: "Missing projectId or filePath" }, { status: 400 });
    }

    // Remove physical file
    const fullPath = join(process.cwd(), "public", filePath);
    try {
      await unlink(fullPath);
    } catch {
      // File may already be gone
    }

    // Update YAML
    const projectsPath = join(process.cwd(), "data", "projects.yaml");
    const fileContents = await readFile(projectsPath, "utf8");
    const data = yaml.load(fileContents) as { projects: YamlProject[] };

    const project = data.projects.find((p) => p.id === projectId);
    if (project?.brain?.files) {
      project.brain.files = project.brain.files.filter((f) => f.path !== filePath);
    }

    const yamlStr = yaml.dump(data, {
      lineWidth: -1,
      noRefs: true,
      forceQuotes: false,
      quotingType: '"',
    });
    await writeFile(projectsPath, yamlStr, "utf8");

    return Response.json({ success: true });
  } catch (error) {
    console.error("Delete file error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 500 }
    );
  }
}

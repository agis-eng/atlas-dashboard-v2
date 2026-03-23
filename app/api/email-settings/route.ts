import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";

const SETTINGS_PATH = join(process.cwd(), "data", "email-settings.yaml");

interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  secure: boolean;
}

interface EmailAccount {
  id: string;
  name: string;
  email: string;
  type: "smtp" | "google";
  smtp?: SmtpConfig;
  connected: boolean;
  created_at: string;
}

interface CategorizationRule {
  id: string;
  name: string;
  description: string;
  pattern: string;
  match_field: "subject" | "from" | "to" | "snippet";
  category: "topOfMind" | "fyi" | "newsletters";
  enabled: boolean;
}

interface DigestSettings {
  enabled: boolean;
  times: string[];
  delivery_method: "dashboard" | "slack" | "email";
  categorization_rules: CategorizationRule[];
}

interface EmailSettings {
  accounts: EmailAccount[];
  digest: DigestSettings;
  updated_at: string;
}

async function loadSettings(): Promise<EmailSettings> {
  const fileContents = await readFile(SETTINGS_PATH, "utf8");
  return yaml.load(fileContents) as EmailSettings;
}

async function saveSettings(data: EmailSettings): Promise<void> {
  const yamlStr = yaml.dump(data, { lineWidth: -1, noRefs: true });
  await writeFile(SETTINGS_PATH, yamlStr, "utf8");
}

export async function GET() {
  try {
    const settings = await loadSettings();
    return Response.json(settings);
  } catch (error: any) {
    console.error("Email settings GET error:", error);
    return Response.json(
      { error: "Failed to load email settings", details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const settings = await loadSettings();

    // Update accounts if provided
    if (body.accounts !== undefined) {
      settings.accounts = body.accounts;
    }

    // Update digest settings if provided
    if (body.digest !== undefined) {
      settings.digest = { ...settings.digest, ...body.digest };
    }

    settings.updated_at = new Date().toISOString();
    await saveSettings(settings);
    return Response.json(settings);
  } catch (error: any) {
    console.error("Email settings PUT error:", error);
    return Response.json(
      { error: "Failed to save email settings", details: error.message },
      { status: 500 }
    );
  }
}

// POST — add a new account
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.name?.trim() || !body.email?.trim()) {
      return Response.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    const settings = await loadSettings();
    const newAccount: EmailAccount = {
      id: `acct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: body.name.trim(),
      email: body.email.trim(),
      type: body.type || "smtp",
      connected: false,
      created_at: new Date().toISOString(),
    };

    if (newAccount.type === "smtp") {
      newAccount.smtp = {
        host: body.smtp?.host || "",
        port: body.smtp?.port || 587,
        username: body.smtp?.username || "",
        password: body.smtp?.password || "",
        secure: body.smtp?.secure ?? true,
      };
    }

    settings.accounts.push(newAccount);
    settings.updated_at = new Date().toISOString();
    await saveSettings(settings);
    return Response.json({ account: newAccount }, { status: 201 });
  } catch (error: any) {
    console.error("Email settings POST error:", error);
    return Response.json(
      { error: "Failed to add account", details: error.message },
      { status: 500 }
    );
  }
}

// DELETE — remove an account by id
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return Response.json(
        { error: "Account ID is required" },
        { status: 400 }
      );
    }

    const settings = await loadSettings();
    const idx = settings.accounts.findIndex((a) => a.id === id);
    if (idx === -1) {
      return Response.json({ error: "Account not found" }, { status: 404 });
    }

    settings.accounts.splice(idx, 1);
    settings.updated_at = new Date().toISOString();
    await saveSettings(settings);
    return Response.json({ success: true });
  } catch (error: any) {
    console.error("Email settings DELETE error:", error);
    return Response.json(
      { error: "Failed to delete account", details: error.message },
      { status: 500 }
    );
  }
}

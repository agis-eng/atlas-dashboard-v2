import { getRedis, REDIS_KEYS } from "@/lib/redis";

const USER_ID = "default";

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  useCount: number;
}

const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    id: "tpl-followup",
    name: "Follow-up",
    subject: "Following up: {{original_subject}}",
    body: `Hi {{name}},

I wanted to follow up on my previous message regarding {{topic}}.

Please let me know if you have any questions or need additional information.

Best regards,
Erik`,
    tags: ["follow-up", "general"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    useCount: 0,
  },
  {
    id: "tpl-proposal",
    name: "Proposal Response",
    subject: "Re: {{original_subject}}",
    body: `Hi {{name}},

Thank you for reaching out. I'd be happy to discuss this further.

Based on what you've described, I think we can help. I'll send over a more detailed proposal within 24 hours.

In the meantime, feel free to reply with any questions.

Best,
Erik`,
    tags: ["proposal", "sales"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    useCount: 0,
  },
  {
    id: "tpl-acknowledge",
    name: "Quick Acknowledgment",
    subject: "Re: {{original_subject}}",
    body: `Hi {{name}},

Got it — thanks for letting me know. I'll take a look and get back to you shortly.

Erik`,
    tags: ["quick", "acknowledgment"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    useCount: 0,
  },
  {
    id: "tpl-meeting",
    name: "Schedule a Call",
    subject: "Re: {{original_subject}}",
    body: `Hi {{name}},

Thanks for reaching out! I'd love to connect.

Are you available for a 30-minute call this week? Here are a few times that work for me:
- [Time slot 1]
- [Time slot 2]
- [Time slot 3]

Or feel free to grab a time on my calendar: [calendar link]

Looking forward to chatting,
Erik`,
    tags: ["meeting", "scheduling"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    useCount: 0,
  },
];

async function loadTemplates(): Promise<EmailTemplate[]> {
  const redis = getRedis();
  const data = await redis.get<EmailTemplate[]>(REDIS_KEYS.emailTemplates(USER_ID));
  if (data && data.length > 0) return data;
  // Seed defaults on first load
  await redis.set(REDIS_KEYS.emailTemplates(USER_ID), DEFAULT_TEMPLATES);
  return DEFAULT_TEMPLATES;
}

async function saveTemplates(templates: EmailTemplate[]): Promise<void> {
  const redis = getRedis();
  await redis.set(REDIS_KEYS.emailTemplates(USER_ID), templates);
}

// GET — list all templates
export async function GET() {
  try {
    const templates = await loadTemplates();
    return Response.json({ templates });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// POST — create a new template
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.name?.trim() || !body.body?.trim()) {
      return Response.json(
        { error: "name and body are required" },
        { status: 400 }
      );
    }

    const templates = await loadTemplates();
    const newTemplate: EmailTemplate = {
      id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: body.name.trim(),
      subject: body.subject || "",
      body: body.body.trim(),
      tags: body.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      useCount: 0,
    };

    templates.push(newTemplate);
    await saveTemplates(templates);
    return Response.json({ template: newTemplate }, { status: 201 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// PUT — update a template (also increments useCount if action=use)
export async function PUT(request: Request) {
  try {
    const body = await request.json();

    if (!body.id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const templates = await loadTemplates();
    const idx = templates.findIndex((t) => t.id === body.id);

    if (idx === -1) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }

    if (body.action === "use") {
      templates[idx].useCount = (templates[idx].useCount || 0) + 1;
    } else {
      if (body.name !== undefined) templates[idx].name = body.name;
      if (body.subject !== undefined) templates[idx].subject = body.subject;
      if (body.body !== undefined) templates[idx].body = body.body;
      if (body.tags !== undefined) templates[idx].tags = body.tags;
      templates[idx].updatedAt = new Date().toISOString();
    }

    await saveTemplates(templates);
    return Response.json({ template: templates[idx] });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — remove a template
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const templates = await loadTemplates();
    const idx = templates.findIndex((t) => t.id === id);

    if (idx === -1) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }

    templates.splice(idx, 1);
    await saveTemplates(templates);
    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";
import Anthropic from "@anthropic-ai/sdk";

const REPORTS_PATH = join(process.cwd(), "data", "seoReports.yaml");
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

async function loadYaml<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, "utf8");
    return (yaml.load(raw, { schema: yaml.JSON_SCHEMA }) as T) || fallback;
  } catch { return fallback; }
}

// GET /api/seo-audit/fix?reportId=seo-XXX — return findingIds for a report
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reportId = searchParams.get("reportId");
  if (!reportId) return Response.json({ error: "reportId required" }, { status: 400 });

  const data = await loadYaml<{ seoReports: any[] }>(REPORTS_PATH, { seoReports: [] });
  const report = (data.seoReports || []).find((r) => r.id === reportId);
  if (!report) return Response.json({ error: "Report not found" }, { status: 404 });

  return Response.json({
    reportId,
    title: report.title,
    url: report.url,
    findings: (report.findings || []).map((f: any, idx: number) => ({
      id: `finding-${idx}`,
      priority: f.priority,
      category: f.category,
      issue: f.issue,
      evidence: f.evidence,
      fixPrompt: f.fixPrompt,
    })),
  });
}

// POST /api/seo-audit/fix — generate expanded implementation plans for selected findings
export async function POST(request: Request) {
  try {
    const { reportId, selectedIds, applyAll, stack } = await request.json();
    if (!reportId) return Response.json({ error: "reportId required" }, { status: 400 });

    const data = await loadYaml<{ seoReports: any[] }>(REPORTS_PATH, { seoReports: [] });
    const reportIdx = (data.seoReports || []).findIndex((r) => r.id === reportId);
    if (reportIdx === -1) return Response.json({ error: "Report not found" }, { status: 404 });

    const report = data.seoReports[reportIdx];
    const allFindings = (report.findings || []).map((f: any, idx: number) => ({ ...f, id: `finding-${idx}` }));

    const targetFindings = applyAll ? allFindings : allFindings.filter((f: any) => (selectedIds || []).includes(f.id));

    if (targetFindings.length === 0) {
      return Response.json({ error: "No findings selected" }, { status: 400 });
    }

    const stackNote = stack ? `\nSite stack: ${stack}` : '';
    let fixPlans = targetFindings.map((f: any) => ({
      id: f.id,
      issue: f.issue,
      category: f.category,
      priority: f.priority,
      fixPrompt: f.fixPrompt,
      implementationPlan: [f.fixPrompt],
      code: null,
    }));

    if (anthropic) {
      try {
        const msg = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2600,
          messages: [{
            role: "user",
            content: `You are Herald, a professional SEO consultant. Generate concrete implementation plans and where applicable actual code or markup for these SEO issues found on ${report.url}.${stackNote}\n\nFindings to fix:\n${targetFindings.map((f: any) => `- [${f.priority}] ${f.issue}\n  Evidence: ${f.evidence}\n  Base fix prompt: ${f.fixPrompt}`).join('\n\n')}\n\nReturn strict JSON with key "fixes" being an array of objects with keys: id, implementationPlan (array of strings), code (string or null). Include real code/markup whenever the fix is structural and a standard stack can implement it.`
          }],
        });
        const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed.fixes)) {
            const byId = new Map(parsed.fixes.map((f: any) => [f.id, f]));
            fixPlans = fixPlans.map((fp: any) => {
              const enhanced: any = byId.get(fp.id);
              return {
                ...fp,
                implementationPlan: Array.isArray(enhanced?.implementationPlan) ? enhanced.implementationPlan : fp.implementationPlan,
                code: typeof enhanced?.code === 'string' ? enhanced.code : fp.code,
              };
            });
          }
        }
      } catch (err) {
        console.error("Fix plan generation failed, using base prompts:", err);
      }
    }

    // Store fix plans in the report record
    data.seoReports[reportIdx].fixPlans = [
      ...(data.seoReports[reportIdx].fixPlans || []).filter((fp: any) => !fixPlans.some((nfp: any) => nfp.id === fp.id)),
      ...fixPlans,
    ];
    data.seoReports[reportIdx].updatedAt = new Date().toISOString();
    await writeFile(REPORTS_PATH, yaml.dump(data, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false }), "utf8");

    return Response.json({ success: true, fixes: fixPlans });
  } catch (err: any) {
    return Response.json({ error: err.message || "Failed to generate fix plans" }, { status: 500 });
  }
}

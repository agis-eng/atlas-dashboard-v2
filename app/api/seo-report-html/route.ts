import { readFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";
import { NextResponse } from "next/server";

const REPORTS_PATH = join(process.cwd(), "data", "seoReports.yaml");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const raw = await readFile(REPORTS_PATH, "utf8");
    const data = yaml.load(raw) as { seoReports: any[] };
    const report = (data?.seoReports || []).find((r) => r.id === id);
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new Response(report.reportHtml || "<p>No HTML report</p>", {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

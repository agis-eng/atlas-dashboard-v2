import { readFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";

const REPORTS_PATH = join(process.cwd(), "data", "seoReports.yaml");

async function loadReports() {
  try {
    const raw = await readFile(REPORTS_PATH, 'utf8');
    const data = (yaml.load(raw) as { seoReports: any[] }) || { seoReports: [] };
    return data.seoReports || [];
  } catch {
    return [];
  }
}

export default async function SeoReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reports = await loadReports();
  const report = reports.find((r) => r.id === id);
  if (!report) return <div className="p-10">Report not found.</div>;
  return <iframe title={report.title} srcDoc={report.reportHtml} className="w-full min-h-screen border-0 bg-black" />;
}

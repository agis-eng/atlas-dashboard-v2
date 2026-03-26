"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, ExternalLink } from "lucide-react";

export default function SeoPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/seo-audit').then(r => r.json()).then(d => setReports(d.reports || [])).catch(() => {});
  }, []);

  async function runAudit() {
    if (!url.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/seo-audit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to run audit');
      setReport(data.report);
      setReports((prev) => [data.report, ...prev]);
      setUrl('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">SEO Audit</h1>
        <p className="text-muted-foreground mt-1">Run a traditional SEO + AISO audit on any site and generate a dark client-ready report.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Run Audit</CardTitle>
          <CardDescription>Enter any site URL. This generates a combined SEO/AISO report with fix prompts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
          <Button onClick={runAudit} disabled={loading || !url.trim()}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}Run SEO Audit
          </Button>
          {report && (
            <div className="rounded-md border border-border p-3 text-sm space-y-2">
              <div><span className="font-medium">Latest:</span> {report.title}</div>
              <div><span className="font-medium">Score:</span> {report.combinedScore}/100 ({report.combinedGrade})</div>
              <div><span className="font-medium">SEO:</span> {report.seoScore} • <span className="font-medium">AISO:</span> {report.aisoScore}</div>
              <Link href={`/seo-reports/${report.id}`} className="inline-flex items-center gap-2 text-cyan-400 hover:underline">Open report <ExternalLink className="h-4 w-4" /></Link>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recent Reports</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {reports.slice(0, 12).map((r) => (
            <div key={r.id} className="rounded-md border border-border p-3 text-sm flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{r.title}</div>
                <div className="text-muted-foreground">{r.combinedScore}/100 • {r.createdAt}</div>
              </div>
              <Link href={`/seo-reports/${r.id}`} className="text-cyan-400 hover:underline">View</Link>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

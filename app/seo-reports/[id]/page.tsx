"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, CheckSquare, Square } from "lucide-react";

interface Finding {
  id: string;
  priority: "critical" | "high" | "medium" | "low";
  category: string;
  issue: string;
  evidence: string;
  fixPrompt: string;
}

interface FixPlan {
  id: string;
  issue: string;
  priority: string;
  implementationPlan: string[];
  code?: string;
}

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_COLOR: Record<string, string> = {
  critical: "text-red-500 bg-red-500/10 border-red-500/20",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  low: "text-blue-400 bg-blue-500/10 border-blue-500/20",
};

export default function SeoReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [report, setReport] = useState<any>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [fixPlans, setFixPlans] = useState<FixPlan[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stack, setStack] = useState("");
  const [generatingFixes, setGeneratingFixes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showHtml, setShowHtml] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/seo-audit/fix?reportId=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load report");
        setReport(data);
        setFindings(data.findings || []);
        setFixPlans(data.fixPlans || []);
      } catch (err: any) {
        setError(err.message || "Failed to load report");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const sorted = [...findings].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));

  const toggleAll = () => {
    if (selectedIds.size === findings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(findings.map((f) => f.id)));
    }
  };

  const toggle = (fid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      return next;
    });
  };

  const generateFixes = async (applyAll = false) => {
    const ids = applyAll ? findings.map((f) => f.id) : [...selectedIds];
    if (ids.length === 0) return;
    setGeneratingFixes(true);
    try {
      const res = await fetch(`/api/seo-audit/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: id, selectedIds: ids, applyAll, stack }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setFixPlans(data.fixes || []);
    } finally {
      setGeneratingFixes(false);
    }
  };

  if (loading) return <div className="p-10 text-muted-foreground">Loading report...</div>;
  if (error) return <div className="p-10 text-red-500">{error}</div>;
  if (!report) return <div className="p-10 text-muted-foreground">Report not found.</div>;

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/seo" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />Back to SEO
        </Link>
        <Button size="sm" variant="outline" onClick={() => setShowHtml((v) => !v)}>
          {showHtml ? "Show interactive view" : "View full HTML report"}
        </Button>
      </div>

      {showHtml ? (
        <iframe title={report.title} src={`/api/seo-report-html?id=${id}`} className="w-full h-screen border-0 rounded-lg bg-black" />
      ) : (
        <>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{report.title}</h1>
            <p className="text-muted-foreground mt-1">{report.url}</p>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Apply Fixes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={stack} onChange={(e) => setStack(e.target.value)} placeholder="Optional: describe your stack (e.g. Next.js/Tailwind/Vercel)" />
              <div className="flex items-center gap-3 flex-wrap">
                <Button size="sm" variant="outline" onClick={toggleAll}>
                  {selectedIds.size === findings.length ? "Deselect all" : "Select all"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => generateFixes(false)} disabled={generatingFixes || selectedIds.size === 0}>
                  {generatingFixes ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Generate fix plans ({selectedIds.size} selected)
                </Button>
                <Button size="sm" onClick={() => generateFixes(true)} disabled={generatingFixes}>
                  {generatingFixes ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Apply all fixes ({findings.length} findings)
                </Button>
              </div>
            </CardContent>
          </Card>

          {fixPlans.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Implementation Plans</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {fixPlans.map((fp) => (
                  <div key={fp.id} className="rounded-md border border-border p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs rounded-full px-2 py-0.5 border font-medium ${PRIORITY_COLOR[fp.priority] || ""}`}>{fp.priority}</span>
                      <span className="font-medium text-sm">{fp.issue}</span>
                    </div>
                    {fp.implementationPlan.map((step, idx) => (
                      <div key={idx} className="text-sm text-muted-foreground">• {step}</div>
                    ))}
                    {fp.code && (
                      <pre className="text-xs bg-black/80 border border-border rounded-md p-3 text-green-300 overflow-auto whitespace-pre-wrap">{fp.code}</pre>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            <div className="font-medium text-sm">{findings.length} findings</div>
            {sorted.map((f) => (
              <div
                key={f.id}
                className="rounded-md border border-border p-4 space-y-2 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => toggle(f.id)}
              >
                <div className="flex items-center gap-3">
                  <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground">
                    {selectedIds.has(f.id) ? <CheckSquare className="h-4 w-4 text-orange-500" /> : <Square className="h-4 w-4" />}
                  </button>
                  <span className={`text-xs rounded-full px-2 py-0.5 border font-medium ${PRIORITY_COLOR[f.priority]}`}>{f.priority}</span>
                  <span className="text-xs text-muted-foreground uppercase">{f.category}</span>
                  <span className="font-medium text-sm">{f.issue}</span>
                </div>
                <div className="pl-7 text-sm text-muted-foreground">{f.evidence}</div>
                <div className="pl-7 text-xs text-cyan-300/80">{f.fixPrompt}</div>
                {fixPlans.find((fp) => fp.id === f.id) && (
                  <div className="pl-7 text-xs text-green-400">✓ Implementation plan generated</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

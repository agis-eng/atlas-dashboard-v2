"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

interface Brain {
  id: string;
  name: string;
}

export default function QuickAddPage() {
  const [brains, setBrains] = useState<Brain[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [brainId, setBrainId] = useState("ai-tech-brain");
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{ title: string; brainName: string } | null>(null);

  useEffect(() => {
    fetch("/api/brain")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.brains)) {
          setBrains(data.brains.map((b: any) => ({ id: b.id, name: b.name })));
        }
      })
      .catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!videoUrl.trim()) return;
    setSubmitting(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/brain/transcribe-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: videoUrl.trim(), brainId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed");
      toast.success(`Added to ${data.brainName}`);
      setLastResult({ title: data.title, brainName: data.brainName });
      setVideoUrl("");
    } catch (err: any) {
      toast.error(err.message || "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-orange-600" />
          Quick Add to Brain
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste a video URL. I'll transcribe it and drop it into the brain you pick.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium block mb-1.5">Video URL</label>
              <Input
                type="url"
                inputMode="url"
                placeholder="https://..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                required
                autoFocus
                className="text-base"
              />
            </div>

            <div>
              <label className="text-xs font-medium block mb-1.5">Brain</label>
              <select
                value={brainId}
                onChange={(e) => setBrainId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-base"
              >
                {brains.length === 0 ? (
                  <option value="ai-tech-brain">AI / Tech Brain</option>
                ) : (
                  brains.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <Button
              type="submit"
              disabled={submitting || !videoUrl.trim()}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white h-11"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Transcribing…
                </>
              ) : (
                "Add to Brain"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {lastResult && (
        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="p-3 text-xs">
            <p className="font-medium text-green-700 dark:text-green-400">
              Added to {lastResult.brainName}
            </p>
            <p className="text-muted-foreground mt-1 line-clamp-3">{lastResult.title}</p>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Tip: tap Safari's Share → Add to Home Screen to keep this one tap away.
      </p>
    </div>
  );
}

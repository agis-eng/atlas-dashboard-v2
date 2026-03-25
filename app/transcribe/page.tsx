"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Video, Loader2, Download, Brain as BrainIcon, FolderOpen } from "lucide-react";
import { toast } from "sonner";

export default function TranscribePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [saveTarget, setSaveTarget] = useState<"none" | "brain" | "project">("none");
  const [selectedBrain, setSelectedBrain] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [brains, setBrains] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  async function transcribeVideo() {
    if (!url.trim()) {
      toast.error("Please enter a YouTube URL");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/transcribe/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Transcription failed');
      }

      const data = await res.json();
      setResult(data);
      toast.success("Transcription complete!");

      // Load brains and projects for save options
      if (saveTarget !== "none") {
        await loadSaveTargets();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to transcribe video");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadSaveTargets() {
    try {
      // Load brains
      const brainsRes = await fetch('/api/brain');
      if (brainsRes.ok) {
        const brainsData = await brainsRes.json();
        setBrains(brainsData.brains || []);
      }

      // Load projects
      const projectsRes = await fetch('/api/projects');
      if (projectsRes.ok) {
        const projectsData = await projectsRes.json();
        setProjects(projectsData.projects || []);
      }
    } catch (err) {
      console.error('Failed to load save targets:', err);
    }
  }

  async function saveTranscript() {
    if (!result) return;

    try {
      if (saveTarget === "brain" && selectedBrain) {
        // Save to Brain as a document
        const formData = new FormData();
        const blob = new Blob([`# ${result.title}\n\n${result.summary}\n\n---\n\n## Full Transcript\n\n${result.transcript}`], { type: 'text/markdown' });
        formData.append('file', blob, `${result.title.substring(0, 50)}.md`);

        const res = await fetch(`/api/brain/${selectedBrain}/documents`, {
          method: 'POST',
          body: formData
        });

        if (res.ok) {
          toast.success("Saved to Brain!");
        } else {
          throw new Error('Failed to save to Brain');
        }
      } else if (saveTarget === "project" && selectedProject) {
        // Save to project notes/documentation
        // TODO: Add project notes API endpoint
        toast.success("Saved to Project!");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  }

  function downloadTranscript() {
    if (!result) return;

    const content = `# ${result.title}\n\n**URL:** ${url}\n\n## AI Summary\n\n${result.summary}\n\n---\n\n## Full Transcript\n\n${result.transcript}`;
    const blob = new Blob([content], { type: 'text/markdown' });
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${result.title.substring(0, 50).replace(/[^a-z0-9]/gi, '-')}.md`;
    a.click();
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Video className="h-8 w-8" />
          YouTube Transcriber
        </h1>
        <p className="text-muted-foreground mt-1">
          Transcribe YouTube videos with AI summaries
        </p>
      </div>

      {/* Input Card */}
      <Card>
        <CardHeader>
          <CardTitle>Transcribe Video</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && transcribeVideo()}
              disabled={loading}
            />
            <Button onClick={transcribeVideo} disabled={loading || !url.trim()}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Transcribing...
                </>
              ) : (
                'Transcribe'
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Paste a YouTube URL to transcribe. Processing time depends on video length.
          </p>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* Summary Card */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle>{result.title}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Duration: {Math.floor(result.duration / 60)}:{String(result.duration % 60).padStart(2, '0')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={downloadTranscript}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">AI Summary</h3>
                  <div className="whitespace-pre-wrap text-sm bg-muted/50 p-4 rounded-lg">
                    {result.summary}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Full Transcript</h3>
                  <Textarea
                    value={result.transcript}
                    readOnly
                    className="min-h-[300px] font-mono text-xs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Save Options */}
          <Card>
            <CardHeader>
              <CardTitle>Save Transcript</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Select value={saveTarget} onValueChange={(v: any) => {
                  setSaveTarget(v);
                  if (v !== "none") loadSaveTargets();
                }}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Save to..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Don't save</SelectItem>
                    <SelectItem value="brain">
                      <div className="flex items-center gap-2">
                        <BrainIcon className="h-4 w-4" />
                        Save to Brain
                      </div>
                    </SelectItem>
                    <SelectItem value="project">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4" />
                        Save to Project
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>

                {saveTarget === "brain" && (
                  <Select value={selectedBrain} onValueChange={setSelectedBrain}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select Brain..." />
                    </SelectTrigger>
                    <SelectContent>
                      {brains.map(brain => (
                        <SelectItem key={brain.id} value={brain.id}>
                          {brain.icon} {brain.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {saveTarget === "project" && (
                  <Select value={selectedProject} onValueChange={setSelectedProject}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select Project..." />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map(project => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {saveTarget !== "none" && (
                  <Button 
                    onClick={saveTranscript}
                    disabled={
                      (saveTarget === "brain" && !selectedBrain) ||
                      (saveTarget === "project" && !selectedProject)
                    }
                  >
                    Save
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Mic,
  Upload,
  Play,
  Pause,
  Trash2,
  FileAudio,
  Loader2,
  Sparkles,
  RefreshCw,
  Search,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceMemo {
  id: string;
  filename: string;
  duration?: number;
  size: number;
  uploadedAt: string;
  transcription?: string;
  transcribing?: boolean;
  projectId?: string;
  projectName?: string;
  notes?: string;
  url: string;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function VoiceMemosPage() {
  const [memos, setMemos] = useState<VoiceMemo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadMemos();
    loadProjects();
  }, []);

  async function loadMemos() {
    setLoading(true);
    try {
      const res = await fetch("/api/voice-memos");
      if (res.ok) {
        const data = await res.json();
        setMemos(data.memos || []);
      }
    } catch (err) {
      console.error("Failed to load voice memos:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadProjects() {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch {}
  }

  async function uploadFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    const audioFiles = fileArray.filter((f) =>
      f.type.startsWith("audio/") || /\.(m4a|mp3|wav|ogg|aac|mp4|flac)$/i.test(f.name)
    );

    if (audioFiles.length === 0) {
      alert("Please select audio files (m4a, mp3, wav, etc.)");
      return;
    }

    setUploading(true);
    try {
      for (const file of audioFiles) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/voice-memos/upload", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          console.error(`Failed to upload ${file.name}`);
        }
      }
      await loadMemos();
    } catch (err) {
      alert("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function transcribeMemo(id: string) {
    setMemos((prev) =>
      prev.map((m) => (m.id === id ? { ...m, transcribing: true } : m))
    );
    try {
      const res = await fetch(`/api/voice-memos/${id}/transcribe`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setMemos((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, transcription: data.transcription, transcribing: false } : m
          )
        );
      } else {
        setMemos((prev) =>
          prev.map((m) => (m.id === id ? { ...m, transcribing: false } : m))
        );
      }
    } catch {
      setMemos((prev) =>
        prev.map((m) => (m.id === id ? { ...m, transcribing: false } : m))
      );
    }
  }

  async function deleteMemo(id: string) {
    try {
      await fetch(`/api/voice-memos/${id}`, { method: "DELETE" });
      setMemos((prev) => prev.filter((m) => m.id !== id));
      if (playingId === id) {
        audioRef.current?.pause();
        setPlayingId(null);
      }
    } catch {
      alert("Failed to delete memo");
    }
  }

  async function assignProject(memoId: string, projectId: string, projectName: string) {
    try {
      await fetch(`/api/voice-memos/${memoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, projectName }),
      });
      setMemos((prev) =>
        prev.map((m) => (m.id === memoId ? { ...m, projectId, projectName } : m))
      );
    } catch {
      alert("Failed to assign project");
    }
  }

  function togglePlay(memo: VoiceMemo) {
    if (playingId === memo.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = new Audio(memo.url);
      audioRef.current.play();
      audioRef.current.onended = () => setPlayingId(null);
      setPlayingId(memo.id);
    }
  }

  const filtered = memos.filter(
    (m) =>
      m.filename.toLowerCase().includes(search.toLowerCase()) ||
      m.transcription?.toLowerCase().includes(search.toLowerCase()) ||
      m.projectName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mic className="h-6 w-6 text-orange-600" />
            Voice Memos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload voice memos from iCloud or your phone
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadMemos}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {uploading ? "Uploading..." : "Upload Memos"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg,.flac"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && uploadFiles(e.target.files)}
          />
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search memos or transcriptions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          uploadFiles(e.dataTransfer.files);
        }}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
          dragging
            ? "border-orange-600 bg-orange-600/5"
            : "border-border hover:border-orange-600/50 hover:bg-muted/30"
        )}
        onClick={() => fileInputRef.current?.click()}
      >
        <FileAudio className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">
          {dragging ? "Drop audio files here" : "Drag & drop voice memos here"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Supports m4a, mp3, wav, aac, ogg, flac
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          💡 Tip: On your iPhone, go to Voice Memos → select memos → share → AirDrop or Files app → upload here
        </p>
      </div>

      {/* Stats */}
      {memos.length > 0 && (
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{memos.length} memo{memos.length !== 1 ? "s" : ""}</span>
          <span>•</span>
          <span>{memos.filter((m) => m.transcription).length} transcribed</span>
          <span>•</span>
          <span>{memos.filter((m) => m.projectId).length} assigned to projects</span>
        </div>
      )}

      {/* Memos List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mic className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">
              {memos.length === 0
                ? "No voice memos yet. Upload some from your iPhone!"
                : "No memos match your search."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((memo) => (
            <Card key={memo.id} className="transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Play Button */}
                  <Button
                    size="icon"
                    variant="outline"
                    className="shrink-0 h-10 w-10 rounded-full"
                    onClick={() => togglePlay(memo)}
                  >
                    {playingId === memo.id ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-sm truncate">{memo.filename}</p>
                      {memo.projectName && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          <FolderOpen className="h-2.5 w-2.5 mr-1" />
                          {memo.projectName}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                      <span>{formatDuration(memo.duration)}</span>
                      <span>•</span>
                      <span>{formatFileSize(memo.size)}</span>
                      <span>•</span>
                      <span>{new Date(memo.uploadedAt).toLocaleDateString()}</span>
                    </div>

                    {/* Transcription */}
                    {memo.transcription ? (
                      <div className="bg-muted/40 rounded p-2 text-xs text-foreground leading-relaxed">
                        {memo.transcription}
                      </div>
                    ) : memo.transcribing ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Transcribing...
                      </div>
                    ) : null}

                    {/* Actions Row */}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {!memo.transcription && !memo.transcribing && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-blue-500 border-blue-500/30 hover:bg-blue-500/10"
                          onClick={() => transcribeMemo(memo.id)}
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          Transcribe
                        </Button>
                      )}

                      {/* Project Assign */}
                      <select
                        className="h-7 text-xs rounded border border-border bg-background px-2 text-muted-foreground"
                        value={memo.projectId || ""}
                        onChange={(e) => {
                          const proj = projects.find((p) => p.id === e.target.value);
                          if (proj) assignProject(memo.id, proj.id, proj.name);
                          else assignProject(memo.id, "", "");
                        }}
                      >
                        <option value="">Assign to project...</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-destructive hover:bg-destructive/10 ml-auto"
                        onClick={() => deleteMemo(memo.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

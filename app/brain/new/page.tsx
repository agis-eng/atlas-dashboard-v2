"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Brain, ArrowLeft } from "lucide-react";

const EMOJI_OPTIONS = [
  "✈️", "🧠", "💡", "📚", "🎯", "💼", "🏠", "🎨", "🔬", "🏃",
  "💰", "🍔", "🎮", "📱", "🚗", "🎵", "📈", "🌱", "🔧", "⚡"
];

const SCHEDULE_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "manual", label: "Manual Only" }
];

export default function NewBrainPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    icon: "🧠",
    description: "",
    schedule: "daily"
  });

  async function handleCreate() {
    if (!formData.name) {
      alert("Please enter a name");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        const brain = await res.json();
        router.push(`/brain/${brain.id}`);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to create brain");
      }
    } catch (err) {
      console.error("Failed to create brain:", err);
      alert("Failed to create brain");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/brain")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
            <Brain className="h-8 w-8 text-purple-600" />
            Create New Brain
          </h1>
          <p className="text-muted-foreground mt-1">
            Set up a knowledge base that learns from your content
          </p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Brain Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Name *</label>
            <Input
              placeholder="e.g., Travel Points & Deals"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          {/* Icon */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Icon</label>
            <div className="grid grid-cols-10 gap-2">
              {EMOJI_OPTIONS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => setFormData({ ...formData, icon: emoji })}
                  className={`text-2xl p-2 rounded border-2 hover:border-purple-600 transition-colors ${
                    formData.icon === emoji ? "border-purple-600 bg-purple-600/10" : "border-transparent"
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              placeholder="What will this brain track? e.g., Track travel points, transfer bonuses, and award redemption strategies"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Update Schedule</label>
            <select
              value={formData.schedule}
              onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {SCHEDULE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              How often should AI summarize new content from your sources?
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Creating..." : "Create Brain"}
            </Button>
            <Button variant="outline" onClick={() => router.push("/brain")}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-purple-600/20 bg-purple-600/5">
        <CardContent className="pt-6">
          <h3 className="font-medium mb-2 flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-600" />
            What can you do with a Brain?
          </h3>
          <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
            <li>Add email senders to automatically track newsletters</li>
            <li>Save important links and articles</li>
            <li>Add manual notes and observations</li>
            <li>Upload documents (coming soon)</li>
            <li>Chat with AI that knows everything in your Brain (coming soon)</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

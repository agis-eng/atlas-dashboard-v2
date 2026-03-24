"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, Plus, Calendar, Mail, FileText, Link as LinkIcon } from "lucide-react";

interface Brain {
  id: string;
  name: string;
  icon: string;
  description: string;
  schedule: string;
  email_sources: string[];
  created: string;
  lastUpdated: string;
}

export default function BrainPage() {
  const router = useRouter();
  const [brains, setBrains] = useState<Brain[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBrains();
  }, []);

  async function loadBrains() {
    try {
      const res = await fetch("/api/brain");
      const data = await res.json();
      setBrains(data.brains || []);
    } catch (err) {
      console.error("Failed to load brains:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
            <Brain className="h-8 w-8 text-purple-600" />
            Knowledge Brains
          </h1>
          <p className="text-muted-foreground mt-1">
            AI-powered knowledge bases that learn from your emails, documents, and notes
          </p>
        </div>
        <Button onClick={() => router.push("/brain/new")}>
          <Plus className="h-4 w-4 mr-2" />
          New Brain
        </Button>
      </div>

      {/* Brain Grid */}
      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-6 bg-muted rounded w-3/4"></div>
                <div className="h-4 bg-muted rounded w-full"></div>
              </CardHeader>
              <CardContent>
                <div className="h-20 bg-muted rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : brains.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Brain className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No Knowledge Brains yet</p>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
              Create your first Brain to start collecting and organizing knowledge from emails, documents, and more
            </p>
            <Button onClick={() => router.push("/brain/new")}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Brain
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {brains.map(brain => (
            <Card
              key={brain.id}
              className="cursor-pointer hover:border-purple-600/50 transition-all"
              onClick={() => router.push(`/brain/${brain.id}`)}
            >
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <span className="text-2xl">{brain.icon}</span>
                  {brain.name}
                </CardTitle>
                <CardDescription>{brain.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    <span>{brain.email_sources.length} email sources</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Updates: {brain.schedule}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    Last updated: {new Date(brain.lastUpdated).toLocaleDateString()}
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

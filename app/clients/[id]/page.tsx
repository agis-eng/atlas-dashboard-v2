"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Mail, Phone, FolderOpen, ExternalLink } from "lucide-react";

interface Project {
  id: string;
  name: string;
  status?: string;
  stage?: string;
  priority?: string;
}

interface Client {
  id: string;
  name: string;
  slug: string;
  contact?: string;
  email?: string;
  phone?: string;
  notes?: string;
  summary?: string;
  requestUrl?: string;
  projects?: Project[];
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadClient() {
      try {
        const res = await fetch(`/api/clients/${encodeURIComponent(id)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load client");
        setClient(data);
      } catch (err: any) {
        setError(err.message || "Failed to load client");
      } finally {
        setLoading(false);
      }
    }
    loadClient();
  }, [id]);

  if (loading) {
    return <div className="p-6 md:p-10 max-w-5xl mx-auto text-muted-foreground">Loading client...</div>;
  }

  if (error || !client) {
    return <div className="p-6 md:p-10 max-w-5xl mx-auto text-red-500">{error || "Client not found"}</div>;
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <Link href="/clients" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to Clients
      </Link>

      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{client.name}</h1>
        <p className="text-muted-foreground mt-1">{client.summary || client.notes || client.id}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(client.email || client.contact) && (
              <a href={`mailto:${client.email || client.contact}`} className="flex items-center gap-2 text-blue-600 hover:underline">
                <Mail className="h-4 w-4" />
                {client.email || client.contact}
              </a>
            )}
            {client.phone && (
              <a href={`tel:${client.phone}`} className="flex items-center gap-2 text-muted-foreground hover:underline">
                <Phone className="h-4 w-4" />
                {client.phone}
              </a>
            )}
            {client.requestUrl && (
              <a href={client.requestUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline">
                <ExternalLink className="h-4 w-4" />
                Request / Contact Link
              </a>
            )}
            {client.notes && <p className="text-muted-foreground">{client.notes}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Linked Projects</CardTitle>
            <CardDescription>Projects connected to this client.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(client.projects || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No linked projects yet.</p>
            ) : (
              <div className="space-y-2">
                {(client.projects || []).map((project) => (
                  <Link key={project.id} href={`/projects/${project.id}`} className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-muted/40 transition-colors">
                    <div>
                      <div className="font-medium text-sm">{project.name}</div>
                      <div className="text-xs text-muted-foreground">{project.stage || ""} {project.status ? `• ${project.status}` : ""}</div>
                    </div>
                    <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                      <FolderOpen className="h-3.5 w-3.5" />
                      {project.priority || "low"}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

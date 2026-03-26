"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Users, Search, Mail, Phone, FolderOpen } from "lucide-react";

interface Client {
  id: string;
  name: string;
  slug: string;
  email?: string;
  phone?: string;
  notes?: string;
  summary?: string;
  projectCount?: number;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadClients() {
      try {
        const res = await fetch("/api/clients");
        const data = await res.json();
        setClients(data.clients || []);
      } catch (error) {
        console.error("Failed to load clients", error);
      } finally {
        setLoading(false);
      }
    }
    loadClients();
  }, []);

  const filtered = clients.filter((client) => {
    const q = search.toLowerCase();
    return !q || client.name.toLowerCase().includes(q) || client.id.toLowerCase().includes(q) || (client.email || "").toLowerCase().includes(q);
  });

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
            <Users className="h-8 w-8 text-orange-600" />
            Clients
          </h1>
          <p className="text-muted-foreground mt-1">Clients, contacts, and linked projects.</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clients..." className="pl-9" />
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading clients...</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`} className="block">
              <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader>
                  <CardTitle className="text-lg">{client.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {client.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      <span className="truncate">{client.email}</span>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      <span>{client.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FolderOpen className="h-4 w-4" />
                    <span>{client.projectCount || 0} linked project(s)</span>
                  </div>
                  {client.summary && <p className="text-muted-foreground line-clamp-3">{client.summary}</p>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

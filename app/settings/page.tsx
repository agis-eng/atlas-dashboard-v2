"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings as SettingsIcon,
  User,
  Database,
  Loader2,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadBackups();
  }, []);

  async function loadBackups() {
    setLoading(true);
    try {
      const res = await fetch('/api/backups');
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups || []);
      }
    } catch (err) {
      console.error('Failed to load backups:', err);
    } finally {
      setLoading(false);
    }
  }

  async function createBackup() {
    setCreating(true);
    try {
      const res = await fetch('/api/backups', { method: 'POST' });
      if (res.ok) {
        toast.success("Backup started", {
          description: "Dashboard backup is running...",
        });
        setTimeout(loadBackups, 5000); // Reload after 5s
      } else {
        throw new Error('Backup failed');
      }
    } catch (err) {
      toast.error("Backup failed", {
        description: "Could not create backup",
      });
    } finally {
      setCreating(false);
    }
  }

  async function deleteBackup(id: string) {
    if (!confirm('Delete this backup?')) return;
    
    try {
      const res = await fetch(`/api/backups/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success("Backup deleted");
        loadBackups();
      }
    } catch (err) {
      toast.error("Delete failed");
    }
  }

  async function restoreBackup(id: string) {
    if (!confirm('Restore this backup? This will overwrite current data.')) return;
    
    try {
      const res = await fetch(`/api/backups/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore' })
      });
      
      if (res.ok) {
        const data = await res.json();
        toast.success("Backup restored", {
          description: `Restored ${data.restored.redis} Redis keys`,
        });
      }
    } catch (err) {
      toast.error("Restore failed");
    }
  }

  function downloadBackup(id: string) {
    window.open(`/api/backups/${id}/download`, '_blank');
  }

  function formatDate(timestamp: string) {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  function formatSize(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  const latestBackup = backups[0];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="h-6 w-6" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage dashboard settings and backups
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="backups" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">
            <User className="h-4 w-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="backups">
            <Database className="h-4 w-4 mr-2" />
            Backups
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Profile settings coming soon...
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Backups Tab */}
        <TabsContent value="backups" className="space-y-4">
          {/* Summary Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Dashboard Backups</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadBackups}
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Refresh
                  </Button>
                  <Button
                    size="sm"
                    onClick={createBackup}
                    disabled={creating}
                  >
                    {creating ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Database className="h-4 w-4 mr-2" />
                    )}
                    Backup Now
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {latestBackup ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Latest Backup:</span>
                    <span className="text-sm font-medium">{formatDate(latestBackup.timestamp)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    <div className="flex items-center gap-2">
                      {latestBackup.health?.errors?.length === 0 ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          <span className="text-sm text-green-600">Healthy</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                          <span className="text-sm text-yellow-600">
                            {latestBackup.health?.errors?.length || 0} errors
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Size:</span>
                    <span className="text-sm font-medium">{formatSize(latestBackup.size)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No backups yet</p>
              )}
            </CardContent>
          </Card>

          {/* Backup History */}
          <Card>
            <CardHeader>
              <CardTitle>Backup History</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : backups.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No backups found
                </p>
              ) : (
                <div className="space-y-3">
                  {backups.map((backup) => (
                    <div
                      key={backup.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {formatDate(backup.timestamp)}
                          </span>
                          {backup.health?.errors?.length === 0 ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-yellow-500" />
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                          <span>{formatSize(backup.size)}</span>
                          <span>•</span>
                          <span>{backup.redis || 0} Redis keys</span>
                          <span>•</span>
                          <span>{backup.files || 0} files</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => restoreBackup(backup.id)}
                        >
                          Restore
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadBackup(backup.id)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteBackup(backup.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Automated Backups</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                Backups run automatically every day at 1:30 AM EST.
              </p>
              <p>
                Each backup includes:
              </p>
              <ul className="list-disc list-inside pl-2 space-y-1">
                <li>All Redis data (calendars, events, Brains, email settings)</li>
                <li>YAML configuration files</li>
                <li>Memory logs and Brain summaries</li>
                <li>Health check results for all API endpoints</li>
              </ul>
              <p className="pt-2">
                Backups older than 30 days are automatically deleted.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

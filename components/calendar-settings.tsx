"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { X, Plus, Eye, EyeOff, Trash2 } from "lucide-react";

interface Calendar {
  id: string;
  name: string;
  type: 'caldav' | 'google';
  color: string;
  visible: boolean;
  caldav?: {
    url: string;
    username: string;
    password: string;
  };
}

interface CalendarSettingsProps {
  calendars: Calendar[];
  onClose: () => void;
  onCalendarsUpdated: () => void;
}

export function CalendarSettings({ calendars, onClose, onCalendarsUpdated }: CalendarSettingsProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'google' as 'caldav' | 'google',
    username: '',
    password: '',
    url: '',
  });
  const [saving, setSaving] = useState(false);

  async function handleAddCalendar() {
    setSaving(true);
    try {
      const res = await fetch('/api/calendar/calendars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          type: formData.type,
          caldav: {
            username: formData.username,
            password: formData.password,
            url: formData.type === 'google' 
              ? 'apidata.googleusercontent.com' 
              : formData.url,
            port: 443,
          }
        })
      });

      if (res.ok) {
        setShowAddForm(false);
        setFormData({ name: '', type: 'google', username: '', password: '', url: '' });
        onCalendarsUpdated();
      } else {
        alert('Failed to add calendar');
      }
    } catch (err) {
      alert('Failed to add calendar');
    } finally {
      setSaving(false);
    }
  }

  async function toggleVisibility(id: string, visible: boolean) {
    try {
      await fetch('/api/calendar/calendars', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, visible })
      });
      onCalendarsUpdated();
    } catch (err) {
      console.error('Failed to toggle calendar:', err);
    }
  }

  async function deleteCalendar(id: string) {
    if (!confirm('Delete this calendar? Events will not be deleted from the source.')) return;
    
    try {
      await fetch(`/api/calendar/calendars?id=${id}`, {
        method: 'DELETE'
      });
      onCalendarsUpdated();
    } catch (err) {
      console.error('Failed to delete calendar:', err);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Calendar Settings</DialogTitle>
          <DialogDescription>
            Manage your connected calendars (Google Calendar, CalDAV, etc.)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Existing Calendars */}
          {calendars.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Connected Calendars</h3>
              {calendars.map((cal) => (
                <div
                  key={cal.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: cal.color }}
                    />
                    <div>
                      <p className="text-sm font-medium">{cal.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {cal.type === 'google' ? 'Google Calendar' : 'CalDAV'} 
                        {cal.caldav?.username && ` • ${cal.caldav.username}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => toggleVisibility(cal.id, !cal.visible)}
                    >
                      {cal.visible ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => deleteCalendar(cal.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Calendar Form */}
          {!showAddForm ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Calendar
            </Button>
          ) : (
            <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Add New Calendar</h3>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowAddForm(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Calendar Type */}
              <div>
                <label className="text-xs text-muted-foreground">Type</label>
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => setFormData({ ...formData, type: 'google' })}
                    className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
                      formData.type === 'google'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    Google Calendar
                  </button>
                  <button
                    onClick={() => setFormData({ ...formData, type: 'caldav' })}
                    className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
                      formData.type === 'caldav'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    CalDAV
                  </button>
                </div>
              </div>

              {/* Calendar Name */}
              <div>
                <label className="text-xs text-muted-foreground">Calendar Name</label>
                <Input
                  placeholder="My Calendar"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1"
                />
              </div>

              {/* Gmail/Email */}
              <div>
                <label className="text-xs text-muted-foreground">
                  {formData.type === 'google' ? 'Gmail Address' : 'Username'}
                </label>
                <Input
                  type="email"
                  placeholder={formData.type === 'google' ? 'you@gmail.com' : 'username'}
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="mt-1"
                />
              </div>

              {/* App Password */}
              <div>
                <label className="text-xs text-muted-foreground">
                  {formData.type === 'google' ? 'App Password' : 'Password'}
                </label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="mt-1"
                />
                {formData.type === 'google' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Generate at:{' '}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 underline"
                    >
                      myaccount.google.com/apppasswords
                    </a>
                  </p>
                )}
              </div>

              {/* CalDAV URL (only for non-Google) */}
              {formData.type === 'caldav' && (
                <div>
                  <label className="text-xs text-muted-foreground">CalDAV Server URL</label>
                  <Input
                    placeholder="dav.privateemail.com"
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    className="mt-1"
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowAddForm(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleAddCalendar}
                  disabled={!formData.name || !formData.username || !formData.password || saving}
                >
                  {saving ? 'Adding...' : 'Add Calendar'}
                </Button>
              </div>
            </div>
          )}

          {/* Help Text */}
          <div className="text-xs text-muted-foreground space-y-1 pt-4 border-t">
            <p className="font-medium">How to connect:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>
                <strong>Google Calendar:</strong> Use your Gmail address + App Password
              </li>
              <li>
                <strong>CalDAV:</strong> Use your email provider's CalDAV server (e.g., iCloud, Fastmail)
              </li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

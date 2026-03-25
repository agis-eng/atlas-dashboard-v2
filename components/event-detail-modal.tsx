"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Clock, MapPin, FileText, Loader2 } from "lucide-react";

interface CalendarOption {
  id: string;
  name: string;
  color: string;
}

interface EventDetailModalProps {
  event: any;
  calendars: CalendarOption[];
  mode?: "view" | "create";
  onClose: () => void;
  onUpdate: () => void;
}

function toDateTimeLocal(value: string) {
  if (!value) return "";
  const date = new Date(value);
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : new Date().toISOString();
}

export function EventDetailModal({ event, calendars, mode = "view", onClose, onUpdate }: EventDetailModalProps) {
  const [editing, setEditing] = useState(mode === "create");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: event.title || "",
    start: toDateTimeLocal(event.start),
    end: toDateTimeLocal(event.end),
    allDay: Boolean(event.allDay),
    location: event.location || "",
    description: event.description || "",
    calendarId: event.calendarId || calendars[0]?.id || "local-primary",
  });

  const selectedCalendar = useMemo(
    () => calendars.find((calendar) => calendar.id === form.calendarId) || calendars[0],
    [calendars, form.calendarId]
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  async function handleSave() {
    if (!form.title.trim() || !form.start) {
      setError("Title and start time are required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const payload = {
        id: event.id,
        title: form.title.trim(),
        start: fromDateTimeLocal(form.start),
        end: fromDateTimeLocal(form.end || form.start),
        allDay: form.allDay,
        location: form.location.trim(),
        description: form.description.trim(),
        calendarId: form.calendarId,
        color: selectedCalendar?.color || event.color || "#3b82f6",
      };

      const res = await fetch("/api/calendar/events", {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save event");
      }

      onUpdate();
    } catch (err: any) {
      setError(err.message || "Failed to save event");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!event.id) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/calendar/events?id=${encodeURIComponent(event.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete event");
      }
      onUpdate();
    } catch (err: any) {
      setError(err.message || "Failed to delete event");
    } finally {
      setSaving(false);
    }
  }

  const eventColor = selectedCalendar?.color || event.color || "#3b82f6";

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3 flex-1">
            <div className="w-1 h-16 rounded-full flex-shrink-0" style={{ backgroundColor: eventColor }} />
            <div className="flex-1">
              <DialogTitle className="text-xl">
                {mode === "create" ? "Create Event" : editing ? "Edit Event" : event.title}
              </DialogTitle>
              {!editing && mode !== "create" && (
                <div className="text-sm text-muted-foreground mt-1">{formatDate(event.start)}</div>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {editing ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Start</label>
                  <Input
                    type="datetime-local"
                    value={form.start}
                    onChange={(e) => setForm((prev) => ({ ...prev, start: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">End</label>
                  <Input
                    type="datetime-local"
                    value={form.end}
                    onChange={(e) => setForm((prev) => ({ ...prev, end: e.target.value }))}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.allDay}
                  onChange={(e) => setForm((prev) => ({ ...prev, allDay: e.target.checked }))}
                />
                All day
              </label>

              <div className="space-y-2">
                <label className="text-sm font-medium">Calendar</label>
                <select
                  value={form.calendarId}
                  onChange={(e) => setForm((prev) => ({ ...prev, calendarId: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {calendars.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {calendar.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Location</label>
                <Input value={form.location} onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="flex-1 text-sm">
                  {event.allDay ? "All day" : `${formatTime(event.start)} - ${formatTime(event.end)}`}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: eventColor }} />
                  <span>{selectedCalendar?.name || "Calendar"}</span>
                </div>
              </div>

              {event.location && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="flex-1 text-sm">{event.location}</div>
                </div>
              )}

              {event.description && (
                <div className="flex items-start gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="flex-1 text-sm whitespace-pre-wrap">{event.description}</div>
                </div>
              )}
            </>
          )}

          {error && <div className="text-sm text-red-500">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => (editing && mode !== "create" ? setEditing(false) : onClose())} disabled={saving}>
            {editing && mode !== "create" ? "Cancel" : "Close"}
          </Button>

          {editing ? (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "create" ? "Create Event" : "Save Changes"}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setEditing(true)} disabled={saving}>
                Edit
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

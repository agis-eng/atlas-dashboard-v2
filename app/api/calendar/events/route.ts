import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { getSessionUserFromRequest } from "@/lib/auth";

const EVENTS_CACHE_KEY = (userId: string) => `calendar:events:${userId}`;
const CALENDARS_KEY = (userId: string) => `calendars:${userId}`;

type CalendarEvent = {
  id: string;
  calendarId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  color?: string;
  description?: string;
  location?: string;
  source?: string;
  updatedAt?: string;
  createdAt?: string;
  remoteUrl?: string;
  remoteEtag?: string;
};

type CachedEvents = {
  events: CalendarEvent[];
  count: number;
  updatedAt?: string;
};

type StoredCalendar = {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  type: "google" | "caldav";
  caldav?: {
    url: string;
    username: string;
    password: string;
    port?: number;
  };
};

function parseICalDate(rawValue?: string) {
  if (!rawValue) return null;
  const value = rawValue.trim();

  if (/^\d{8}$/.test(value)) {
    return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`);
  }

  const normalized = value.replace("Z", "");
  const match = normalized.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (match) {
    const [, year, month, day, hour, minute, second] = match;
    const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${value.endsWith("Z") ? "Z" : ""}`;
    return new Date(iso);
  }

  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function parseIcsEvent(calendarData: string) {
  const unfolded = calendarData.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const record: Record<string, string> = {};
  let inEvent = false;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      continue;
    }
    if (line === "END:VEVENT") break;
    if (!inEvent) continue;

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const rawKey = line.slice(0, colonIndex);
    const value = line.slice(colonIndex + 1);
    const key = rawKey.split(";")[0].toUpperCase();
    record[key] = value;
  }

  const start = parseICalDate(record.DTSTART);
  const end = parseICalDate(record.DTEND) || (start ? new Date(start.getTime() + 60 * 60 * 1000) : null);
  if (!start || !end) return null;

  return {
    uid: record.UID,
    title: record.SUMMARY || "Untitled event",
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: /^\d{8}$/.test(record.DTSTART || ""),
    description: record.DESCRIPTION || "",
    location: record.LOCATION || "",
  };
}

async function getCachedEvents(profile: string): Promise<CachedEvents> {
  const redis = getRedis();
  const cacheKey = EVENTS_CACHE_KEY(profile);
  let cached = await redis.get(cacheKey);

  if (cached && typeof cached === "string") {
    try {
      cached = JSON.parse(cached);
    } catch {
      return { events: [], count: 0 };
    }
  }

  if (cached && typeof cached === "object" && "events" in cached && Array.isArray((cached as any).events)) {
    return {
      events: (cached as any).events,
      count: Array.isArray((cached as any).events) ? (cached as any).events.length : 0,
      updatedAt: (cached as any).updatedAt,
    };
  }

  return { events: [], count: 0 };
}

async function getStoredCalendars(profile: string): Promise<StoredCalendar[]> {
  const redis = getRedis();
  const data = await redis.get<any>(CALENDARS_KEY(profile));
  return Array.isArray(data?.calendars) ? data.calendars : [];
}

async function saveCachedEvents(profile: string, events: CalendarEvent[]) {
  const redis = getRedis();
  const payload: CachedEvents = {
    events: events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    count: events.length,
    updatedAt: new Date().toISOString(),
  };
  await redis.set(EVENTS_CACHE_KEY(profile), payload);
  return payload;
}

function normalizeEvent(input: Partial<CalendarEvent>, fallback?: Partial<CalendarEvent>): CalendarEvent {
  const now = new Date().toISOString();
  const start = input.start ?? fallback?.start ?? now;
  const end = input.end ?? fallback?.end ?? new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();

  return {
    id: input.id ?? fallback?.id ?? `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    calendarId: input.calendarId ?? fallback?.calendarId ?? "local-primary",
    title: (input.title ?? fallback?.title ?? "Untitled event").trim(),
    start,
    end,
    allDay: input.allDay ?? fallback?.allDay ?? false,
    color: input.color ?? fallback?.color ?? "#3b82f6",
    description: input.description ?? fallback?.description ?? "",
    location: input.location ?? fallback?.location ?? "",
    source: input.source ?? fallback?.source ?? "local",
    createdAt: fallback?.createdAt ?? input.createdAt ?? now,
    updatedAt: now,
    remoteUrl: input.remoteUrl ?? fallback?.remoteUrl,
    remoteEtag: input.remoteEtag ?? fallback?.remoteEtag,
  };
}

async function syncRemoteCalendarEvents(profile: string, localEvents: CalendarEvent[]) {
  const calendars = await getStoredCalendars(profile);
  const remoteCalendars = calendars.filter(
    (calendar) => calendar.caldav?.url && calendar.caldav?.username && calendar.caldav?.password
  );

  if (remoteCalendars.length === 0) {
    return null;
  }

  const dav: any = await import("dav");
  const remoteEvents: CalendarEvent[] = [];

  for (const calendar of remoteCalendars) {
    try {
      const serverHost = calendar.caldav?.url?.startsWith("http")
        ? calendar.caldav.url
        : `https://${calendar.caldav?.url}`;

      const xhr = new dav.transport.Basic(
        new dav.Credentials({
          username: calendar.caldav?.username,
          password: calendar.caldav?.password,
        })
      );

      const account = await dav.createAccount({
        accountType: "caldav",
        server: serverHost,
        xhr,
        loadCollections: true,
        loadObjects: true,
      });

      for (const remoteCalendar of account.calendars || []) {
        for (const object of remoteCalendar.objects || []) {
          const parsed = parseIcsEvent(object.calendarData || "");
          if (!parsed) continue;

          remoteEvents.push({
            id: `remote:${calendar.id}:${parsed.uid || object.url}`,
            calendarId: calendar.id,
            title: parsed.title,
            start: parsed.start,
            end: parsed.end,
            allDay: parsed.allDay,
            color: calendar.color,
            description: parsed.description,
            location: parsed.location,
            source: "remote",
            remoteUrl: object.url,
            remoteEtag: object.etag,
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      console.error(`Calendar sync failed for ${calendar.name}:`, error);
    }
  }

  if (remoteEvents.length === 0) {
    return null;
  }

  const localOnlyEvents = localEvents.filter((event) => event.source !== "remote");
  return await saveCachedEvents(profile, [...localOnlyEvents, ...remoteEvents]);
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cached = await getCachedEvents(user.profile);
    const synced = await syncRemoteCalendarEvents(user.profile, cached.events);
    return NextResponse.json(synced || cached);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, events: [], count: 0 },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    if (!body?.title || !body?.start) {
      return NextResponse.json({ error: "Title and start time are required" }, { status: 400 });
    }

    const cached = await getCachedEvents(user.profile);
    const event = normalizeEvent(body);
    const payload = await saveCachedEvents(user.profile, [...cached.events.filter((item) => item.source !== 'remote'), event, ...cached.events.filter((item) => item.source === 'remote')]);

    return NextResponse.json({ event, ...payload }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create event" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getSessionUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    if (!body?.id) {
      return NextResponse.json({ error: "Event ID is required" }, { status: 400 });
    }

    const cached = await getCachedEvents(user.profile);
    const index = cached.events.findIndex((event) => event.id === body.id);

    if (index === -1) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const updatedEvent = normalizeEvent(body, cached.events[index]);
    const events = [...cached.events];
    events[index] = updatedEvent;
    const payload = await saveCachedEvents(user.profile, events);

    return NextResponse.json({ event: updatedEvent, ...payload });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update event" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getSessionUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Event ID is required" }, { status: 400 });
    }

    const cached = await getCachedEvents(user.profile);
    const events = cached.events.filter((event) => event.id !== id);

    if (events.length === cached.events.length) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const payload = await saveCachedEvents(user.profile, events);
    return NextResponse.json({ success: true, ...payload });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete event" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth";
import { getRedis } from "@/lib/redis";

const EVENTS_CACHE_KEY = (userId: string) => `calendar:events:${userId}`;
const CALENDARS_KEY = (userId: string) => `calendars:${userId}`;

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarId: string;
  color?: string;
  description?: string;
  location?: string;
};

function parseQuickCreate(message: string) {
  const match = message.match(/schedule\s+(.+?)\s+(today|tomorrow)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  const [, rawTitle, dayWord, rawHour, rawMinute, meridiem] = match;
  let hour = parseInt(rawHour, 10);
  const minute = rawMinute ? parseInt(rawMinute, 10) : 0;
  const mer = meridiem?.toLowerCase();

  if (mer === "pm" && hour < 12) hour += 12;
  if (mer === "am" && hour === 12) hour = 0;

  const start = new Date();
  start.setSeconds(0, 0);
  if (dayWord.toLowerCase() === "tomorrow") {
    start.setDate(start.getDate() + 1);
  }
  start.setHours(hour, minute, 0, 0);

  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  return {
    title: rawTitle.trim(),
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { message } = await request.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const redis = getRedis();
    const cached = await redis.get<any>(EVENTS_CACHE_KEY(user.profile));
    const calendarsData = await redis.get<any>(CALENDARS_KEY(user.profile));
    const calendars = calendarsData?.calendars || [];
    const visibleCalendar = calendars.find((calendar: any) => calendar.visible) || calendars[0];
    const events: CalendarEvent[] = Array.isArray(cached?.events) ? cached.events : [];

    const quickCreate = parseQuickCreate(message);
    if (quickCreate) {
      const event: CalendarEvent = {
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: quickCreate.title,
        start: quickCreate.start,
        end: quickCreate.end,
        allDay: false,
        calendarId: visibleCalendar?.id || "local-primary",
        color: visibleCalendar?.color || "#3b82f6",
      };

      const payload = {
        events: [...events, event].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
        count: events.length + 1,
        updatedAt: new Date().toISOString(),
      };
      await redis.set(EVENTS_CACHE_KEY(user.profile), payload);

      return NextResponse.json({
        response: `Created “${event.title}” for ${new Date(event.start).toLocaleString()}.`,
        eventCreated: true,
      });
    }

    if (/today|schedule today|what'?s my schedule/i.test(message)) {
      const today = new Date();
      const todaysEvents = events.filter((event) => {
        const start = new Date(event.start);
        return start.getFullYear() === today.getFullYear() && start.getMonth() === today.getMonth() && start.getDate() === today.getDate();
      });

      if (todaysEvents.length === 0) {
        return NextResponse.json({ response: "You have no events on your calendar today.", eventCreated: false });
      }

      const summary = todaysEvents
        .slice(0, 8)
        .map((event) => `• ${new Date(event.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} — ${event.title}`)
        .join("\n");

      return NextResponse.json({
        response: `Here’s your schedule for today:\n${summary}`,
        eventCreated: false,
      });
    }

    return NextResponse.json({
      response: "I can summarize today’s schedule or create quick events with phrases like ‘Schedule dentist tomorrow at 2pm’. For full editing, use the calendar event modal.",
      eventCreated: false,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Calendar AI request failed" }, { status: 500 });
  }
}

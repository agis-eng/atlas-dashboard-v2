import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

export const runtime = 'nodejs'; // Force Node.js runtime for CalDAV libraries

// Dynamic imports to avoid edge runtime issues
let dav: any;
let ical: any;

async function loadLibraries() {
  if (!dav) {
    dav = (await import('dav')).default;
  }
  if (!ical) {
    ical = (await import('ical.js')).default;
  }
}

const CALENDARS_KEY = (userId: string) => `calendars:${userId}`;
const EVENTS_CACHE_KEY = (userId: string) => `calendar:events:${userId}`;

interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  description?: string;
  location?: string;
  color?: string;
}

async function fetchCalDAVEvents(caldavConfig: any): Promise<CalendarEvent[]> {
  await loadLibraries();
  
  try {
    const xhr = new dav.transport.Basic(
      new dav.Credentials({
        username: caldavConfig.username,
        password: caldavConfig.password,
      })
    );

    const account = await dav.createAccount({
      server: `https://${caldavConfig.url}`,
      xhr: xhr,
      accountType: 'caldav',
    });

    const calendars = account.calendars || [];
    const allEvents: CalendarEvent[] = [];

    for (const calendar of calendars) {
      const objects = await dav.listCalendarObjects(calendar, {
        xhr: xhr,
      });

      for (const obj of objects) {
        if (!obj.calendarData) continue;

        try {
          const jcalData = ical.parse(obj.calendarData);
          const comp = new ical.Component(jcalData);
          const vevent = comp.getFirstSubcomponent('vevent');

          if (!vevent) continue;

          const event = new ical.Event(vevent);
          const isAllDay = !event.startDate.isDate;

          allEvents.push({
            id: event.uid || obj.url,
            calendarId: calendar.url,
            title: event.summary || 'Untitled',
            start: event.startDate.toJSDate().toISOString(),
            end: event.endDate.toJSDate().toISOString(),
            allDay: event.startDate.isDate,
            description: event.description || undefined,
            location: event.location || undefined,
          });
        } catch (err) {
          console.error('Failed to parse event:', err);
        }
      }
    }

    return allEvents;
  } catch (error) {
    console.error('CalDAV fetch error:', error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  await loadLibraries();
  
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    const redis = getRedis();
    
    // Check cache first
    let cached = await redis.get(EVENTS_CACHE_KEY(user.profile));
    
    // Parse if string
    if (cached && typeof cached === 'string') {
      try {
        cached = JSON.parse(cached);
      } catch (e) {
        console.error('[Calendar API] Failed to parse cached data');
        cached = null;
      }
    }
    
    if (cached && typeof cached === 'object' && 'events' in cached) {
      console.log(`[Calendar API] Returning ${cached.count} cached events`);
      return NextResponse.json(cached);
    }

    // NO CALDAV FETCH - too slow for serverless
    // Events must be pre-cached via script
    console.log('[Calendar API] No cached events, returning empty');
    return NextResponse.json({ 
      events: [], 
      count: 0,
      message: 'No events cached. Run cache script to populate.'
    });
  } catch (error: any) {
    console.error("Error fetching events:", error);
    
    // Try to return cached data even if stale
    try {
      const redis = getRedis();
      const { getSessionUserFromRequest } = await import("@/lib/auth");
      const user = await getSessionUserFromRequest(request);
      
      if (user) {
        const cached = await redis.get(EVENTS_CACHE_KEY(user.profile));
        if (cached && typeof cached === 'object' && 'events' in cached) {
          return NextResponse.json({
            ...cached,
            warning: "Using cached events due to error"
          });
        }
      }
    } catch {}
    
    return NextResponse.json(
      { error: "Failed to fetch events", events: [], count: 0 },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  await loadLibraries();
  
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { calendarId, title, start, end, allDay, description, location } = body;

    if (!calendarId || !title || !start || !end) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Load calendar
    const redis = getRedis();
    const calData = await redis.get(CALENDARS_KEY(user.profile));
    const calendars = (calData && typeof calData === 'object' && 'calendars' in calData)
      ? (calData as { calendars: any[] }).calendars
      : [];

    const calendar = calendars.find(c => c.id === calendarId);
    if (!calendar || !calendar.caldav) {
      return NextResponse.json(
        { error: "Calendar not found" },
        { status: 404 }
      );
    }

    // Create iCal event
    const event = new ical.Component(['vcalendar', [], []]);
    event.updatePropertyWithValue('prodid', '-//OpenClaw Calendar//EN');
    event.updatePropertyWithValue('version', '2.0');

    const vevent = new ical.Component('vevent');
    const eventObj = new ical.Event(vevent);

    eventObj.uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@openclaw`;
    eventObj.summary = title;
    eventObj.startDate = ical.Time.fromJSDate(new Date(start), !allDay);
    eventObj.endDate = ical.Time.fromJSDate(new Date(end), !allDay);
    
    if (description) eventObj.description = description;
    if (location) eventObj.location = location;

    event.addSubcomponent(vevent);

    // Push to CalDAV server
    try {
      const xhr = new dav.transport.Basic(
        new dav.Credentials({
          username: calendar.caldav.username,
          password: calendar.caldav.password,
        })
      );

      const account = await dav.createAccount({
        server: `https://${calendar.caldav.url}`,
        xhr: xhr,
        accountType: 'caldav',
      });

      const cal = account.calendars?.[0];
      if (cal) {
        await dav.createCalendarObject(cal, {
          filename: `${eventObj.uid}.ics`,
          data: event.toString(),
          xhr: xhr,
        });
      }

      // Invalidate cache
      await redis.del(EVENTS_CACHE_KEY(user.profile));

      return NextResponse.json({
        success: true,
        event: {
          id: eventObj.uid,
          calendarId,
          title,
          start,
          end,
          allDay,
          description,
          location,
        }
      }, { status: 201 });
    } catch (err: any) {
      console.error('Failed to create event:', err);
      return NextResponse.json(
        { error: "Failed to create event on calendar server" },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Error creating event:", error);
    return NextResponse.json(
      { error: "Failed to create event" },
      { status: 500 }
    );
  }
}

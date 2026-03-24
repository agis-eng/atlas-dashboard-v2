import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

const CALENDARS_KEY = (userId: string) => `calendars:${userId}`;

interface Calendar {
  id: string;
  name: string;
  type: 'caldav' | 'google';
  color: string;
  visible: boolean;
  owner: string;
  caldav?: {
    url: string;
    username: string;
    password: string;
    port: number;
  };
  createdAt: string;
}

// Preset colors for calendars
const CALENDAR_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

export async function GET(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const redis = getRedis();
    const data = await redis.get(CALENDARS_KEY(user.profile));
    
    const calendars = (data && typeof data === 'object' && 'calendars' in data) 
      ? (data as { calendars: Calendar[] }).calendars 
      : [];

    return NextResponse.json({ calendars });
  } catch (error: any) {
    console.error("Error fetching calendars:", error);
    return NextResponse.json(
      { error: "Failed to fetch calendars" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, type, caldav } = body;

    if (!name || !type) {
      return NextResponse.json(
        { error: "Name and type are required" },
        { status: 400 }
      );
    }

    const redis = getRedis();
    const existingData = await redis.get(CALENDARS_KEY(user.profile));
    const calendars = (existingData && typeof existingData === 'object' && 'calendars' in existingData)
      ? (existingData as { calendars: Calendar[] }).calendars
      : [];

    // Create new calendar
    const newCalendar: Calendar = {
      id: `cal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      type,
      color: CALENDAR_COLORS[calendars.length % CALENDAR_COLORS.length],
      visible: true,
      owner: user.profile,
      createdAt: new Date().toISOString(),
    };

    // Add CalDAV config for Google Calendar
    if (type === 'google' && caldav) {
      newCalendar.caldav = {
        url: 'apidata.googleusercontent.com',
        username: caldav.username,
        password: caldav.password,
        port: 443,
      };
    } else if (type === 'caldav' && caldav) {
      newCalendar.caldav = {
        url: caldav.url || 'dav.privateemail.com',
        username: caldav.username,
        password: caldav.password,
        port: caldav.port || 443,
      };
    }

    calendars.push(newCalendar);
    await redis.set(CALENDARS_KEY(user.profile), { calendars });

    return NextResponse.json({ calendar: newCalendar }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating calendar:", error);
    return NextResponse.json(
      { error: "Failed to create calendar" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, visible, color, name } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Calendar ID is required" },
        { status: 400 }
      );
    }

    const redis = getRedis();
    const existingData = await redis.get(CALENDARS_KEY(user.profile));
    const calendars = (existingData && typeof existingData === 'object' && 'calendars' in existingData)
      ? (existingData as { calendars: Calendar[] }).calendars
      : [];

    const index = calendars.findIndex(c => c.id === id);
    if (index === -1) {
      return NextResponse.json(
        { error: "Calendar not found" },
        { status: 404 }
      );
    }

    // Update calendar
    if (visible !== undefined) calendars[index].visible = visible;
    if (color !== undefined) calendars[index].color = color;
    if (name !== undefined) calendars[index].name = name;

    await redis.set(CALENDARS_KEY(user.profile), { calendars });

    return NextResponse.json({ calendar: calendars[index] });
  } catch (error: any) {
    console.error("Error updating calendar:", error);
    return NextResponse.json(
      { error: "Failed to update calendar" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: "Calendar ID is required" },
        { status: 400 }
      );
    }

    const redis = getRedis();
    const existingData = await redis.get(CALENDARS_KEY(user.profile));
    const calendars = (existingData && typeof existingData === 'object' && 'calendars' in existingData)
      ? (existingData as { calendars: Calendar[] }).calendars
      : [];

    const filtered = calendars.filter(c => c.id !== id);
    
    if (filtered.length === calendars.length) {
      return NextResponse.json(
        { error: "Calendar not found" },
        { status: 404 }
      );
    }

    await redis.set(CALENDARS_KEY(user.profile), { calendars: filtered });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting calendar:", error);
    return NextResponse.json(
      { error: "Failed to delete calendar" },
      { status: 500 }
    );
  }
}

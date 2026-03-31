import { NextRequest } from "next/server";
import { getRedis } from "@/lib/redis";

export async function GET(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const redis = getRedis();

    // Get cached emails to analyze
    const emails =
      (await redis.get(`email:inbox:${user.profile}:all`)) as any[] | null;

    if (!emails || emails.length === 0) {
      return Response.json({
        totalEmails: 0,
        unreadCount: 0,
        readRate: 0,
        topSenders: [],
        volumeByDay: [],
        volumeByHour: [],
        avgPerDay: 0,
        oldestUnread: null,
      });
    }

    // Total and unread
    const totalEmails = emails.length;
    const unreadCount = emails.filter((e: any) => !e.read).length;
    const readRate =
      totalEmails > 0
        ? Math.round(((totalEmails - unreadCount) / totalEmails) * 100)
        : 0;

    // Top senders
    const senderCount: Record<string, number> = {};
    emails.forEach((e: any) => {
      const sender = e.from?.split("<")[0]?.trim() || e.from || "Unknown";
      senderCount[sender] = (senderCount[sender] || 0) + 1;
    });
    const topSenders = Object.entries(senderCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([sender, count]) => ({ sender, count }));

    // Volume by day of week
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayCount: Record<string, number> = {};
    dayNames.forEach((d) => (dayCount[d] = 0));
    emails.forEach((e: any) => {
      const d = new Date(e.date);
      if (!isNaN(d.getTime())) {
        dayCount[dayNames[d.getDay()]]++;
      }
    });
    const volumeByDay = dayNames.map((day) => ({
      day,
      count: dayCount[day],
    }));

    // Volume by hour
    const hourCount: number[] = new Array(24).fill(0);
    emails.forEach((e: any) => {
      const d = new Date(e.date);
      if (!isNaN(d.getTime())) {
        hourCount[d.getHours()]++;
      }
    });
    const volumeByHour = hourCount.map((count, hour) => ({ hour, count }));

    // Busiest hour
    const busiestHour = hourCount.indexOf(Math.max(...hourCount));

    // Average per day
    const dates = emails
      .map((e: any) => new Date(e.date).toDateString())
      .filter((d, i, arr) => arr.indexOf(d) === i);
    const avgPerDay =
      dates.length > 0 ? Math.round(totalEmails / dates.length) : 0;

    // Oldest unread
    const unreadEmails = emails
      .filter((e: any) => !e.read)
      .sort(
        (a: any, b: any) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
      );
    const oldestUnread = unreadEmails[0]
      ? {
          subject: unreadEmails[0].subject,
          from: unreadEmails[0].from,
          date: unreadEmails[0].date,
          daysOld: Math.floor(
            (Date.now() - new Date(unreadEmails[0].date).getTime()) /
              (1000 * 60 * 60 * 24)
          ),
        }
      : null;

    // Starred count
    const starredCount = emails.filter((e: any) => e.starred).length;

    return Response.json({
      totalEmails,
      unreadCount,
      readRate,
      starredCount,
      topSenders,
      volumeByDay,
      volumeByHour,
      busiestHour,
      avgPerDay,
      oldestUnread,
      dateRange: {
        from: emails[emails.length - 1]?.date,
        to: emails[0]?.date,
      },
    });
  } catch (error) {
    console.error("Email analytics error:", error);
    return Response.json(
      { error: "Failed to compute analytics" },
      { status: 500 }
    );
  }
}

"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Mail,
  Clock,
  Users,
  TrendingUp,
  AlertCircle,
} from "lucide-react";

interface Email {
  id: string;
  from: string;
  subject: string;
  date: string;
  read: boolean;
  starred: boolean;
}

interface EmailAnalyticsProps {
  emails: Email[];
}

export function EmailAnalytics({ emails }: EmailAnalyticsProps) {
  const data = useMemo(() => {
    if (emails.length === 0) return null;

    const totalEmails = emails.length;
    const unreadCount = emails.filter((e) => !e.read).length;
    const readRate =
      totalEmails > 0
        ? Math.round(((totalEmails - unreadCount) / totalEmails) * 100)
        : 0;
    const starredCount = emails.filter((e) => e.starred).length;

    // Top senders
    const senderCount: Record<string, number> = {};
    emails.forEach((e) => {
      const sender = e.from?.split("<")[0]?.trim() || e.from || "Unknown";
      senderCount[sender] = (senderCount[sender] || 0) + 1;
    });
    const topSenders = Object.entries(senderCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([sender, count]) => ({ sender, count }));

    // Volume by day of week
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayCount: Record<string, number> = {};
    dayNames.forEach((d) => (dayCount[d] = 0));
    emails.forEach((e) => {
      const d = new Date(e.date);
      if (!isNaN(d.getTime())) dayCount[dayNames[d.getDay()]]++;
    });
    const volumeByDay = dayNames.map((day) => ({ day, count: dayCount[day] }));

    // Busiest hour
    const hourCount: number[] = new Array(24).fill(0);
    emails.forEach((e) => {
      const d = new Date(e.date);
      if (!isNaN(d.getTime())) hourCount[d.getHours()]++;
    });
    const busiestHour = hourCount.indexOf(Math.max(...hourCount));

    // Average per day
    const dateSet = new Set(
      emails
        .map((e) => new Date(e.date).toDateString())
        .filter((d) => d !== "Invalid Date")
    );
    const avgPerDay = dateSet.size > 0 ? Math.round(totalEmails / dateSet.size) : 0;

    // Oldest unread
    const unreadEmails = emails
      .filter((e) => !e.read)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const oldestUnread = unreadEmails[0]
      ? {
          subject: unreadEmails[0].subject,
          from: unreadEmails[0].from,
          daysOld: Math.floor(
            (Date.now() - new Date(unreadEmails[0].date).getTime()) / (1000 * 60 * 60 * 24)
          ),
        }
      : null;

    return {
      totalEmails,
      unreadCount,
      readRate,
      starredCount,
      topSenders,
      volumeByDay,
      busiestHour,
      avgPerDay,
      oldestUnread,
    };
  }, [emails]);

  if (!data) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No email data available. Load your emails first by refreshing the inbox.
      </p>
    );
  }

  const maxDayCount = Math.max(...data.volumeByDay.map((d) => d.count), 1);

  return (
    <div className="space-y-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Mail className="h-3.5 w-3.5" />
              Total
            </div>
            <p className="text-2xl font-bold">{data.totalEmails}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <AlertCircle className="h-3.5 w-3.5" />
              Unread
            </div>
            <p className="text-2xl font-bold text-orange-500">{data.unreadCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Read Rate
            </div>
            <p className="text-2xl font-bold">{data.readRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Clock className="h-3.5 w-3.5" />
              Avg/Day
            </div>
            <p className="text-2xl font-bold">{data.avgPerDay}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Volume by Day */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Volume by Day
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-24">
              {data.volumeByDay.map((d) => (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-blue-500 rounded-t transition-all"
                    style={{
                      height: `${Math.max((d.count / maxDayCount) * 80, d.count > 0 ? 4 : 0)}px`,
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground">{d.day}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Senders */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Top Senders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.topSenders.slice(0, 5).map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                  <span className="text-xs flex-1 truncate">{s.sender}</span>
                  <Badge variant="secondary" className="text-[10px]">{s.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Busiest Hour</p>
            <p className="text-lg font-semibold">
              {data.busiestHour > 12
                ? `${data.busiestHour - 12} PM`
                : data.busiestHour === 0
                ? "12 AM"
                : `${data.busiestHour} AM`}
            </p>
          </CardContent>
        </Card>

        {data.oldestUnread && (
          <Card className="border-orange-500/30">
            <CardContent className="p-4">
              <p className="text-xs text-orange-500 mb-1">
                Oldest Unread ({data.oldestUnread.daysOld} days old)
              </p>
              <p className="text-sm font-medium truncate">{data.oldestUnread.subject}</p>
              <p className="text-xs text-muted-foreground truncate">{data.oldestUnread.from}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

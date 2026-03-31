"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Mail,
  Clock,
  Star,
  Users,
  TrendingUp,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Analytics {
  totalEmails: number;
  unreadCount: number;
  readRate: number;
  starredCount: number;
  topSenders: Array<{ sender: string; count: number }>;
  volumeByDay: Array<{ day: string; count: number }>;
  volumeByHour: Array<{ hour: number; count: number }>;
  busiestHour: number;
  avgPerDay: number;
  oldestUnread: {
    subject: string;
    from: string;
    date: string;
    daysOld: number;
  } | null;
}

export function EmailAnalytics() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/email/analytics")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.totalEmails === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No email data available for analytics
      </p>
    );
  }

  const maxDayCount = Math.max(...data.volumeByDay.map((d) => d.count), 1);
  const maxHourCount = Math.max(...data.volumeByHour.map((h) => h.count), 1);

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
            <p className="text-2xl font-bold text-orange-500">
              {data.unreadCount}
            </p>
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

      {/* Two columns: Day chart + Top Senders */}
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
                    className="w-full bg-blue-500/20 rounded-t"
                    style={{
                      height: `${(d.count / maxDayCount) * 80}px`,
                      minHeight: d.count > 0 ? "4px" : "0px",
                    }}
                  >
                    <div
                      className="w-full bg-blue-500 rounded-t transition-all"
                      style={{
                        height: `${(d.count / maxDayCount) * 80}px`,
                        minHeight: d.count > 0 ? "4px" : "0px",
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {d.day}
                  </span>
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
                  <span className="text-xs text-muted-foreground w-4">
                    {i + 1}.
                  </span>
                  <span className="text-xs flex-1 truncate">{s.sender}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {s.count}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Busiest hour + Oldest unread */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">
              Busiest Hour
            </p>
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
              <p className="text-sm font-medium truncate">
                {data.oldestUnread.subject}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {data.oldestUnread.from}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

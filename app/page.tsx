"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  MessageSquare,
  ListChecks,
  FolderOpen,
  Activity,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const quickStats = [
  {
    title: "Active Projects",
    value: "4",
    description: "2 updated today",
    icon: FolderOpen,
    accent: true,
  },
  {
    title: "Open Tasks",
    value: "12",
    description: "3 due this week",
    icon: ListChecks,
  },
  {
    title: "Messages",
    value: "8",
    description: "Unread conversations",
    icon: MessageSquare,
  },
  {
    title: "System Health",
    value: "98%",
    description: "All services running",
    icon: Activity,
  },
];

const recentActivity = [
  {
    title: "Dashboard v2 scaffolding",
    project: "Atlas",
    time: "Just now",
  },
  {
    title: "eBay listing automation",
    project: "AutomateIQ",
    time: "2h ago",
  },
  {
    title: "Contract analysis pipeline",
    project: "OpenClaw",
    time: "Yesterday",
  },
];

export default function Home() {
  const [greeting, setGreeting] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setGreeting(getGreeting());
    setMounted(true);
  }, []);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* Greeting */}
      <div
        className={`transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
      >
        <h1 className="text-3xl font-semibold tracking-tight">
          {greeting}, <span className="text-orange-600">Erik</span>
        </h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s what&apos;s happening across your projects.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quickStats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card
              key={stat.title}
              className={`group cursor-pointer transition-all duration-300 hover:shadow-md ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
              style={{ transitionDelay: `${(i + 1) * 100}ms` }}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <Icon
                  className={`h-4 w-4 ${stat.accent ? "text-orange-600" : "text-muted-foreground"}`}
                />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Bottom Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Activity */}
        <Card
          className={`transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
          style={{ transitionDelay: "500ms" }}
        >
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
            <CardDescription>Your latest work across projects</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentActivity.map((item) => (
              <div
                key={item.title}
                className="flex items-center justify-between group cursor-pointer rounded-lg p-2 -mx-2 transition-colors hover:bg-muted/50"
              >
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.project}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {item.time}
                  </span>
                  <ArrowUpRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card
          className={`transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
          style={{ transitionDelay: "600ms" }}
        >
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
            <CardDescription>Jump into something</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {[
              { label: "New Chat", icon: MessageSquare, color: "text-orange-600", href: "/chat" },
              { label: "View Tasks", icon: ListChecks, color: "text-blue-500", href: "/tasks" },
              { label: "Browse Projects", icon: FolderOpen, color: "text-green-500", href: "/projects" },
            ].map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.label}
                  href={action.href}
                  className="flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-all hover:bg-muted/50 hover:shadow-sm"
                >
                  <Icon className={`h-5 w-5 ${action.color}`} />
                  <span className="text-sm font-medium">{action.label}</span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

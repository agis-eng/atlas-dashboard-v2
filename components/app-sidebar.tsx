"use client";

import {
  LayoutDashboard,
  MessageSquare,
  FolderOpen,
  ListChecks,
  Mail,
  Inbox,
  ShoppingBag,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  User,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/redis";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: MessageSquare, label: "Chat", href: "/chat" },
  { icon: FolderOpen, label: "Projects", href: "/projects" },
  { icon: ListChecks, label: "Tasks", href: "/tasks" },
  { icon: Inbox, label: "Inbox", href: "/inbox" },
  { icon: Mail, label: "Email Digest", href: "/email" },
  { icon: ShoppingBag, label: "eBay", href: "/ebay" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

const profiles: { value: Profile; label: string; icon: typeof User }[] = [
  { value: "erik", label: "Erik", icon: User },
  { value: "anton", label: "Anton", icon: User },
  { value: "all", label: "All", icon: Users },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(true);
  const [currentProfile, setCurrentProfile] = useState<Profile>("erik");
  const [profileOpen, setProfileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <TooltipProvider delay={0}>
      <aside
        className={cn(
          "relative flex h-screen flex-col border-r border-border bg-sidebar transition-all duration-300 ease-in-out",
          collapsed ? "w-16" : "w-56"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-center border-b border-border">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-600 text-white font-bold text-sm">
            A
          </div>
        </div>

        {/* Profile Switcher */}
        <div className="border-b border-border p-2">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger
                render={(props) => (
                  <button
                    {...props}
                    onClick={() => {
                      const idx = profiles.findIndex((p) => p.value === currentProfile);
                      const next = profiles[(idx + 1) % profiles.length];
                      setCurrentProfile(next.value);
                    }}
                    className="w-full flex items-center justify-center h-9 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="h-7 w-7 rounded-full bg-orange-600/10 flex items-center justify-center text-xs font-semibold text-orange-600">
                      {currentProfile === "all" ? "A" : currentProfile[0].toUpperCase()}
                    </div>
                  </button>
                )}
              />
              <TooltipContent side="right" sideOffset={8}>
                Profile: {profiles.find((p) => p.value === currentProfile)?.label}
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="w-full flex items-center gap-2 rounded-lg p-2 hover:bg-muted/50 transition-colors"
              >
                <div className="h-7 w-7 rounded-full bg-orange-600/10 flex items-center justify-center text-xs font-semibold text-orange-600">
                  {currentProfile === "all" ? "A" : currentProfile[0].toUpperCase()}
                </div>
                <span className="text-sm font-medium flex-1 text-left">
                  {profiles.find((p) => p.value === currentProfile)?.label}
                </span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-muted-foreground transition-transform",
                    profileOpen && "rotate-180"
                  )}
                />
              </button>
              {profileOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 p-1">
                  {profiles.map((profile) => (
                    <button
                      key={profile.value}
                      onClick={() => {
                        setCurrentProfile(profile.value);
                        setProfileOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 rounded-md p-2 text-sm transition-colors",
                        currentProfile === profile.value
                          ? "bg-orange-600/10 text-orange-600"
                          : "hover:bg-muted/50"
                      )}
                    >
                      <profile.icon className="h-3.5 w-3.5" />
                      {profile.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-1 p-2 pt-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            if (collapsed) {
              return (
                <Tooltip key={item.label}>
                  <TooltipTrigger
                    render={(props) => (
                      <Link href={item.href} {...props}>
                        <Button
                          variant={isActive ? "secondary" : "ghost"}
                          className={cn(
                            "w-full justify-center px-0 transition-all",
                            isActive &&
                              "bg-orange-600/10 text-orange-600 hover:bg-orange-600/15 hover:text-orange-600"
                          )}
                          size="icon"
                          tabIndex={-1}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                        </Button>
                      </Link>
                    )}
                  />
                  <TooltipContent side="right" sideOffset={8}>
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return (
              <Link key={item.label} href={item.href}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-3 transition-all px-3",
                    isActive &&
                      "bg-orange-600/10 text-orange-600 hover:bg-orange-600/15 hover:text-orange-600"
                  )}
                  size="default"
                  tabIndex={-1}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Button>
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="icon"
            className="w-full h-9"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}

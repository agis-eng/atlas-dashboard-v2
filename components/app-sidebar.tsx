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
  LogOut,
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
import { usePathname, useRouter } from "next/navigation";
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

interface AppSidebarProps {
  currentUser: {
    id: string;
    name: string;
    email: string;
    profile: "erik" | "anton";
  } | null;
}

export function AppSidebar({ currentUser }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [currentProfile, setCurrentProfile] = useState<Profile>(
    currentUser?.profile ?? "erik"
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  }

  const userInitial = currentUser
    ? currentUser.name[0].toUpperCase()
    : currentProfile === "all"
    ? "A"
    : currentProfile[0].toUpperCase();

  const userLabel = currentUser?.name ?? profiles.find((p) => p.value === currentProfile)?.label ?? "User";

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

        {/* Profile / User Switcher */}
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
                      {userInitial}
                    </div>
                  </button>
                )}
              />
              <TooltipContent side="right" sideOffset={8}>
                {userLabel}
                {currentUser && (
                  <span className="block text-xs text-muted-foreground">{currentUser.email}</span>
                )}
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="w-full flex items-center gap-2 rounded-lg p-2 hover:bg-muted/50 transition-colors"
              >
                <div className="h-7 w-7 rounded-full bg-orange-600/10 flex items-center justify-center text-xs font-semibold text-orange-600 shrink-0">
                  {userInitial}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium truncate">{userLabel}</p>
                  {currentUser && (
                    <p className="text-xs text-muted-foreground truncate">{currentUser.email}</p>
                  )}
                </div>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0",
                    profileOpen && "rotate-180"
                  )}
                />
              </button>
              {profileOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 p-1">
                  <p className="px-2 py-1 text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    View as
                  </p>
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

        {/* Bottom: Logout + Collapse toggle */}
        <div className="border-t border-border p-2 space-y-1">
          {/* Logout */}
          {currentUser && (
            <Tooltip>
              <TooltipTrigger
                render={(props) => (
                  <Button
                    {...props}
                    variant="ghost"
                    size={collapsed ? "icon" : "default"}
                    className={cn(
                      "w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors",
                      collapsed ? "justify-center px-0" : "justify-start gap-3 px-3"
                    )}
                    onClick={handleLogout}
                    disabled={loggingOut}
                  >
                    <LogOut className="h-4 w-4 shrink-0" />
                    {!collapsed && (
                      <span className="truncate">{loggingOut ? "Signing out…" : "Sign out"}</span>
                    )}
                  </Button>
                )}
              />
              {collapsed && (
                <TooltipContent side="right" sideOffset={8}>
                  Sign out
                </TooltipContent>
              )}
            </Tooltip>
          )}

          {/* Collapse toggle */}
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

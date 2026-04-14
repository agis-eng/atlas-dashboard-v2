"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  Mail,
  MessageSquare,
  Menu,
  Sparkles,
  ShoppingBag,
  Tag,
  Search,
  Image,
  Presentation,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const primaryNav = [
  { icon: LayoutDashboard, label: "Home", href: "/" },
  { icon: FolderOpen, label: "Projects", href: "/projects" },
  { icon: Mail, label: "Email", href: "/email" },
  { icon: MessageSquare, label: "Chat", href: "/chat" },
  { icon: Menu, label: "More", href: "__more__" },
];

const moreNav = [
  { label: "Agroktic", href: "/agroktic", icon: Sparkles },
  { label: "SlideBoost", href: "/slideboost", icon: Presentation },
  { label: "LogoClear", href: "/logo", icon: Image },
  { label: "Listings", href: "/listings", icon: Tag },
  { label: "eBay", href: "/ebay", icon: ShoppingBag },
  { label: "Tasks", href: "/tasks" },
  { label: "Calendar", href: "/calendar" },
  { label: "Brain", href: "/brain" },
  { label: "Research", href: "/research", icon: Search },
  { label: "Trends", href: "/trends" },
  { label: "Transcribe", href: "/transcribe" },
  { label: "Recordings", href: "/recordings" },
  { label: "Voice", href: "/voice" },
  { label: "Memory", href: "/memory" },
  { label: "Monitor", href: "/monitor" },
  { label: "Settings", href: "/settings" },
];

export function MobileNav() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);

  return (
    <>
      {/* More menu overlay */}
      {showMore && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setShowMore(false)}
        >
          <div
            className="absolute bottom-16 left-0 right-0 bg-background border-t border-border rounded-t-2xl p-4 space-y-1"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2 pb-2">
              More
            </p>
            <div className="grid grid-cols-3 gap-2">
              {moreNav.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMore(false)}
                    className={cn(
                      "rounded-xl px-3 py-2.5 text-center text-sm font-medium transition-colors flex flex-col items-center gap-1",
                      isActive
                        ? "bg-orange-600/10 text-orange-600"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {Icon ? <Icon className="h-4 w-4" /> : null}
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden items-center justify-around border-t border-border bg-background/95 backdrop-blur-sm h-14 px-1 safe-bottom">
        {primaryNav.map((item) => {
          const Icon = item.icon;
          const isMore = item.href === "__more__";
          const isActive = isMore
            ? showMore
            : item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

          if (isMore) {
            return (
              <button
                key="more"
                onClick={() => setShowMore(!showMore)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
                  showMore
                    ? "text-orange-600"
                    : "text-muted-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
                isActive
                  ? "text-orange-600"
                  : "text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

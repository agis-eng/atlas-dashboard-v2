"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Mail,
  ExternalLink,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmailSettingsSheet } from "@/components/email-settings";

// ── Types ──────────────────────────────────────────────────────────

interface Email {
  id: string;
  subject: string;
  from: string;
  to: string;
  snippet: string;
  url?: string;
  inbox: string;
}

interface EmailDigest {
  id: string;
  timestamp: string;
  greeting: string;
  inboxes: string[];
  emailCount: number;
  categories: {
    topOfMind: Email[];
    fyi: Email[];
    newsletters: Email[];
  };
}

// ── Mock Data ──────────────────────────────────────────────────────

const MOCK_DIGESTS: EmailDigest[] = [
  {
    id: "digest-001",
    timestamp: "2026-03-22T08:00:00Z",
    greeting: "Good morning",
    inboxes: ["sales@ted-associates.com", "erik@rcmn.com"],
    emailCount: 9,
    categories: {
      topOfMind: [
        {
          id: "e1",
          subject: "Re: Atlas Dashboard — feedback from investor call",
          from: "anton@ted-associates.com",
          to: "erik@rcmn.com",
          snippet:
            "Hey Erik, the investors loved the demo. They want to schedule a follow-up next week to discuss the roadmap. Can you send over the latest deck?",
          inbox: "erik@rcmn.com",
        },
        {
          id: "e2",
          subject: "URGENT: SSL cert expiring on openclaw.com",
          from: "alerts@vercel.com",
          to: "erik@rcmn.com",
          snippet:
            "Your SSL certificate for openclaw.com expires in 3 days. Auto-renewal failed — please check your DNS settings.",
          url: "https://vercel.com/dashboard",
          inbox: "erik@rcmn.com",
        },
        {
          id: "e3",
          subject: "New lead: Peterson & Co — contract review request",
          from: "intake@ted-associates.com",
          to: "sales@ted-associates.com",
          snippet:
            "Peterson & Co submitted a contract review request via the website. They have 12 vendor agreements that need analysis by end of month.",
          inbox: "sales@ted-associates.com",
        },
      ],
      fyi: [
        {
          id: "e4",
          subject: "Weekly standup notes — March 22",
          from: "atlas@ted-associates.com",
          to: "team@ted-associates.com",
          snippet:
            "Standup summary: 3 projects in review, 2 new client inquiries, eBay automation on track for Friday deploy.",
          inbox: "sales@ted-associates.com",
        },
        {
          id: "e5",
          subject: "Your Stripe payout has been initiated",
          from: "notifications@stripe.com",
          to: "erik@rcmn.com",
          snippet:
            "A payout of $4,230.00 has been initiated to your bank account ending in 8842. Expected arrival: March 24.",
          url: "https://dashboard.stripe.com/payouts",
          inbox: "erik@rcmn.com",
        },
        {
          id: "e6",
          subject: "GitHub: 3 new issues on atlas-dashboard-v2",
          from: "notifications@github.com",
          to: "erik@rcmn.com",
          snippet:
            "eriklaine/atlas-dashboard-v2: #42 Email digest page, #43 Redis caching layer, #44 Mobile responsive sidebar.",
          url: "https://github.com/eriklaine/atlas-dashboard-v2/issues",
          inbox: "erik@rcmn.com",
        },
      ],
      newsletters: [
        {
          id: "e7",
          subject: "This Week in AI — GPT-5 rumors, Claude updates",
          from: "newsletter@therundown.ai",
          to: "erik@rcmn.com",
          snippet:
            "Top stories: OpenAI reportedly testing GPT-5 internally, Anthropic ships Claude 4.6, Google DeepMind releases Gemini 2.5 Pro.",
          url: "https://therundown.ai/latest",
          inbox: "erik@rcmn.com",
        },
        {
          id: "e8",
          subject: "Hacker News Digest — Top 10 stories",
          from: "digest@hndigest.com",
          to: "erik@rcmn.com",
          snippet:
            "1. Show HN: I built a local-first CRM in Rust. 2. Why SQLite is the future of edge computing. 3. The death of SaaS pricing...",
          inbox: "erik@rcmn.com",
        },
        {
          id: "e9",
          subject: "SaaS Weekly: Churn benchmarks for 2026",
          from: "hello@saasweekly.com",
          to: "sales@ted-associates.com",
          snippet:
            "Average monthly churn for B2B SaaS dropped to 3.2% in Q1 2026. Here's how top performers keep it under 1%.",
          inbox: "sales@ted-associates.com",
        },
      ],
    },
  },
  {
    id: "digest-002",
    timestamp: "2026-03-21T17:00:00Z",
    greeting: "Good evening",
    inboxes: ["erik@rcmn.com"],
    emailCount: 5,
    categories: {
      topOfMind: [
        {
          id: "e10",
          subject: "Re: OpenClaw contract parser — production bug",
          from: "anton@ted-associates.com",
          to: "erik@rcmn.com",
          snippet:
            "Found the issue — the PDF parser chokes on scanned documents with mixed orientations. I've pushed a fix to staging.",
          inbox: "erik@rcmn.com",
        },
      ],
      fyi: [
        {
          id: "e11",
          subject: "Vercel deploy succeeded: atlas-dashboard-v2",
          from: "notifications@vercel.com",
          to: "erik@rcmn.com",
          snippet:
            "Production deployment completed for commit c69d272. Build time: 34s. Preview: atlas-dashboard-v2.vercel.app",
          url: "https://vercel.com/deployments",
          inbox: "erik@rcmn.com",
        },
        {
          id: "e12",
          subject: "Upstash Redis usage alert — 80% quota",
          from: "alerts@upstash.com",
          to: "erik@rcmn.com",
          snippet:
            "Your Redis database 'atlas-prod' has used 80% of its monthly command quota. Consider upgrading your plan.",
          inbox: "erik@rcmn.com",
        },
      ],
      newsletters: [
        {
          id: "e13",
          subject: "Tailwind CSS v4.1 released",
          from: "updates@tailwindcss.com",
          to: "erik@rcmn.com",
          snippet:
            "New in v4.1: Container queries support, improved dark mode variants, and 30% faster build times.",
          url: "https://tailwindcss.com/blog/v4-1",
          inbox: "erik@rcmn.com",
        },
        {
          id: "e14",
          subject: "Next.js Weekly — App Router deep dive",
          from: "newsletter@nextjs.org",
          to: "erik@rcmn.com",
          snippet:
            "This week: Server Actions best practices, streaming SSR patterns, and a case study on migrating from Pages Router.",
          inbox: "erik@rcmn.com",
        },
      ],
    },
  },
  {
    id: "digest-003",
    timestamp: "2026-03-21T12:00:00Z",
    greeting: "Good afternoon",
    inboxes: ["sales@ted-associates.com", "erik@rcmn.com"],
    emailCount: 6,
    categories: {
      topOfMind: [
        {
          id: "e15",
          subject: "New client onboarding: Meridian Holdings",
          from: "intake@ted-associates.com",
          to: "sales@ted-associates.com",
          snippet:
            "Meridian Holdings signed the engagement letter. They need full contract review for a $2.3M acquisition. Due: April 5.",
          inbox: "sales@ted-associates.com",
        },
        {
          id: "e16",
          subject: "Re: eBay automation — listing sync broken",
          from: "support@ebay.com",
          to: "erik@rcmn.com",
          snippet:
            "We identified an API rate limit change affecting bulk listing operations. New limit: 500 calls/hour (was 1000).",
          inbox: "erik@rcmn.com",
        },
      ],
      fyi: [
        {
          id: "e17",
          subject: "Invoice #1087 paid — Peterson & Co",
          from: "notifications@stripe.com",
          to: "sales@ted-associates.com",
          snippet:
            "Invoice #1087 for $8,500.00 has been paid via ACH. Funds will be available in 2 business days.",
          inbox: "sales@ted-associates.com",
        },
        {
          id: "e18",
          subject: "Figma comment: Dashboard wireframes v3",
          from: "notifications@figma.com",
          to: "erik@rcmn.com",
          snippet:
            "Anton left 4 comments on 'Dashboard wireframes v3'. Click to view and resolve.",
          url: "https://figma.com/file/dashboard-v3",
          inbox: "erik@rcmn.com",
        },
      ],
      newsletters: [
        {
          id: "e19",
          subject: "Indie Hackers Digest — March 21",
          from: "digest@indiehackers.com",
          to: "erik@rcmn.com",
          snippet:
            "Trending: Solo founder hits $50k MRR with AI legal tools. Community AMA with the creator of Linear.",
          inbox: "erik@rcmn.com",
        },
        {
          id: "e20",
          subject: "The Pragmatic Engineer — Platform engineering trends",
          from: "gergely@pragmaticengineer.com",
          to: "erik@rcmn.com",
          snippet:
            "Internal developer platforms are becoming table stakes at Series B+. Here's what the best teams are building.",
          inbox: "erik@rcmn.com",
        },
      ],
    },
  },
];

// ── Category Config ────────────────────────────────────────────────

const CATEGORIES = [
  {
    key: "topOfMind" as const,
    label: "Top of Mind",
    emoji: "\u{1F6A8}",
    color: "bg-red-500/10 text-red-600 dark:text-red-400",
    dotColor: "bg-red-500",
  },
  {
    key: "fyi" as const,
    label: "FYI",
    emoji: "\u{1F4DD}",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    dotColor: "bg-blue-500",
  },
  {
    key: "newsletters" as const,
    label: "Newsletters & Low Priority",
    emoji: "\u{1F4F0}",
    color: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
    dotColor: "bg-gray-400",
  },
];

// ── Helpers ────────────────────────────────────────────────────────

function formatDigestTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (diffDays === 0) return `Today at ${time}`;
  if (diffDays === 1) return `Yesterday at ${time}`;
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${time}`;
}

// ── Components ─────────────────────────────────────────────────────

function EmailItem({ email }: { email: Email }) {
  return (
    <div className="group rounded-lg border border-border/50 bg-card/50 p-3 transition-all hover:border-border hover:bg-card hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {email.url ? (
            <a
              href={email.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium hover:text-orange-600 transition-colors"
            >
              <span className="truncate">{email.subject}</span>
              <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          ) : (
            <p className="text-sm font-medium truncate">{email.subject}</p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">
              From: {email.from}
            </span>
            <span className="text-xs text-muted-foreground/50">&rarr;</span>
            <span className="text-xs text-muted-foreground">
              {email.to}
            </span>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {email.inbox}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">
        {email.snippet}
      </p>
    </div>
  );
}

function CategorySection({
  category,
  emails,
  defaultOpen = true,
}: {
  category: (typeof CATEGORIES)[number];
  emails: Email[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (emails.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="text-base">{category.emoji}</span>
        <span className="text-sm font-semibold">{category.label}</span>
        <span
          className={cn(
            "ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
            category.color
          )}
        >
          {emails.length}
        </span>
      </button>
      {open && (
        <div className="ml-6 mt-2 space-y-2">
          {emails.map((email) => (
            <EmailItem key={email.id} email={email} />
          ))}
        </div>
      )}
    </div>
  );
}

function DigestCard({ digest }: { digest: EmailDigest }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card className="transition-all duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-3 text-left"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <div>
              <CardTitle className="text-lg">
                {digest.greeting},{" "}
                <span className="text-orange-600">Erik</span>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDigestTime(digest.timestamp)} &middot;{" "}
                {digest.emailCount} emails across{" "}
                {digest.inboxes.length} inbox
                {digest.inboxes.length > 1 ? "es" : ""}
              </p>
            </div>
          </button>
          <div className="flex items-center gap-1">
            {digest.inboxes.map((inbox) => (
              <span
                key={inbox}
                className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {inbox}
              </span>
            ))}
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4 pt-0">
          {CATEGORIES.map((cat) => (
            <CategorySection
              key={cat.key}
              category={cat}
              emails={digest.categories[cat.key]}
              defaultOpen={cat.key === "topOfMind"}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function EmailPage() {
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [inboxFilter, setInboxFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Derive all unique inboxes from data
  const allInboxes = useMemo(() => {
    const set = new Set<string>();
    MOCK_DIGESTS.forEach((d) => d.inboxes.forEach((i) => set.add(i)));
    return Array.from(set).sort();
  }, []);

  // Filter digests
  const filteredDigests = useMemo(() => {
    return MOCK_DIGESTS.map((digest) => {
      const filterEmails = (emails: Email[]) =>
        emails.filter((email) => {
          const matchesSearch =
            !search ||
            email.subject.toLowerCase().includes(search.toLowerCase()) ||
            email.from.toLowerCase().includes(search.toLowerCase()) ||
            email.snippet.toLowerCase().includes(search.toLowerCase());
          const matchesInbox =
            inboxFilter === "all" || email.inbox === inboxFilter;
          return matchesSearch && matchesInbox;
        });

      const filtered = {
        ...digest,
        categories: {
          topOfMind: filterEmails(digest.categories.topOfMind),
          fyi: filterEmails(digest.categories.fyi),
          newsletters: filterEmails(digest.categories.newsletters),
        },
      };

      // Apply category filter
      if (categoryFilter !== "all") {
        const keys = ["topOfMind", "fyi", "newsletters"] as const;
        for (const key of keys) {
          if (key !== categoryFilter) {
            filtered.categories[key] = [];
          }
        }
      }

      filtered.emailCount =
        filtered.categories.topOfMind.length +
        filtered.categories.fyi.length +
        filtered.categories.newsletters.length;

      return filtered;
    }).filter((d) => d.emailCount > 0);
  }, [search, inboxFilter, categoryFilter]);

  const totalEmails = MOCK_DIGESTS.reduce((sum, d) => sum + d.emailCount, 0);

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div
        className={`transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-600/10">
              <Mail className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Email Digests
              </h1>
              <p className="text-sm text-muted-foreground">
                {totalEmails} emails across {MOCK_DIGESTS.length} digests
              </p>
            </div>
          </div>
          <EmailSettingsSheet />
        </div>
      </div>

      {/* Filters */}
      <div
        className={`flex flex-wrap items-center gap-3 transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        style={{ transitionDelay: "100ms" }}
      >
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search emails..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={inboxFilter}
            onChange={(e) => setInboxFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Inboxes</option>
            {allInboxes.map((inbox) => (
              <option key={inbox} value={inbox}>
                {inbox}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Categories</option>
            <option value="topOfMind">{"\u{1F6A8}"} Top of Mind</option>
            <option value="fyi">{"\u{1F4DD}"} FYI</option>
            <option value="newsletters">{"\u{1F4F0}"} Newsletters</option>
          </select>
        </div>
      </div>

      {/* Digest Cards */}
      <div className="space-y-4">
        {filteredDigests.map((digest, i) => (
          <div
            key={digest.id}
            className={`transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ transitionDelay: `${(i + 1) * 150}ms` }}
          >
            <DigestCard digest={digest} />
          </div>
        ))}
        {filteredDigests.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Mail className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              No digests match your filters
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => {
                setSearch("");
                setInboxFilter("all");
                setCategoryFilter("all");
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

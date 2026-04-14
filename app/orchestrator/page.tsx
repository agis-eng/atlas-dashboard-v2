import Link from "next/link";
import { connection } from "next/server";
import type { ComponentType } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  FolderKanban,
  RadioTower,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BUILD_INFO } from "@/lib/build-info";
import { cn } from "@/lib/utils";
import { readOrchestratorData, type OrchestratorEntry } from "@/lib/orchestrator";

export default async function OrchestratorPage() {
  await connection();

  const data = await readOrchestratorData();
  const liveUrl =
    data.active.find((entry) => entry.url)?.url ??
    data.blocked.find((entry) => entry.url)?.url ??
    null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-6 md:p-10">
      <section className="overflow-hidden rounded-[28px] border border-border/60 bg-[linear-gradient(135deg,rgba(249,115,22,0.16),rgba(249,115,22,0.03)_42%,rgba(255,255,255,0)_100%)] p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <Badge className="bg-orange-600 text-white hover:bg-orange-600">Operations</Badge>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Orchestrator
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                Active project execution, blockers, and live deployment context from the shared workspace tracker.
              </p>
            </div>
          </div>
          <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-background/75 p-4 backdrop-blur">
              <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground/80">
                Tracker updated
              </div>
              <div className="mt-2 font-medium text-foreground">
                {data.lastUpdated ?? "Unknown"}
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/75 p-4 backdrop-blur">
              <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground/80">
                Source
              </div>
              <div className="mt-2 truncate font-mono text-xs text-foreground">
                {data.sourcePath}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Active Workstreams"
          value={String(data.counts.active)}
          detail="Items currently moving"
          icon={Workflow}
        />
        <SummaryCard
          title="Blocked"
          value={String(data.counts.blocked)}
          detail="Needs intervention"
          icon={AlertTriangle}
          accent="amber"
        />
        <SummaryCard
          title="Recently Completed"
          value={String(data.counts.recentlyCompleted)}
          detail="Finished in code or live"
          icon={CheckCircle2}
          accent="green"
        />
        <SummaryCard
          title="Live Dashboard"
          value={liveUrl ? "Online" : "Unknown"}
          detail={liveUrl ?? `${BUILD_INFO.commit} • ${BUILD_INFO.builtAt}`}
          icon={RadioTower}
          href={liveUrl ?? undefined}
          accent="orange"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-orange-600" />
              Active
            </CardTitle>
            <CardDescription>
              Workstreams currently in motion, including live-but-not-finished operational items.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.active.length > 0 ? (
              data.active.map((entry) => <TrackerCard key={entry.id} entry={entry} />)
            ) : (
              <EmptyState label="No active tasks in the tracker." />
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Blocked
            </CardTitle>
            <CardDescription>
              Items with a hard stop or prerequisite still unresolved.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.blocked.length > 0 ? (
              data.blocked.map((entry) => <TrackerCard key={entry.id} entry={entry} compact />)
            ) : (
              <EmptyState label="No blocked tasks right now." />
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Recently Completed
            </CardTitle>
            <CardDescription>
              Recent work that has landed in code or live environments.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-3">
            {data.recentlyCompleted.length > 0 ? (
              data.recentlyCompleted.map((entry) => (
                <Card key={entry.id} size="sm" className="border border-border/70 bg-muted/20 py-0">
                  <CardHeader className="pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>{entry.title}</CardTitle>
                        <CardDescription className="mt-1">
                          {entry.lastUpdated ?? data.lastUpdated ?? "No timestamp"}
                        </CardDescription>
                      </div>
                      <StatusBadge status={entry.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 pb-4 text-sm text-muted-foreground">
                    {entry.notes.length > 0 ? (
                      entry.notes.map((note) => (
                        <div key={note} className="rounded-xl border border-border/60 bg-background px-3 py-2">
                          {note}
                        </div>
                      ))
                    ) : (
                      <span>No completion notes provided.</span>
                    )}
                  </CardContent>
                </Card>
              ))
            ) : (
              <EmptyState label="No recently completed entries in the tracker." />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  detail,
  icon: Icon,
  href,
  accent = "default",
}: {
  title: string;
  value: string;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  href?: string;
  accent?: "default" | "amber" | "green" | "orange";
}) {
  const card = (
    <Card className="border-border/70 transition-colors hover:border-orange-500/40">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardDescription>{title}</CardDescription>
          <div
            className={cn(
              "rounded-xl p-2",
              accent === "default" && "bg-muted text-foreground",
              accent === "amber" && "bg-amber-500/12 text-amber-700 dark:text-amber-400",
              accent === "green" && "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
              accent === "orange" && "bg-orange-500/12 text-orange-700 dark:text-orange-400"
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="line-clamp-2 text-sm text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  );

  if (!href) {
    return card;
  }

  return (
    <Link href={href} target="_blank" rel="noreferrer">
      {card}
    </Link>
  );
}

function TrackerCard({
  entry,
  compact = false,
}: {
  entry: OrchestratorEntry;
  compact?: boolean;
}) {
  const labels = [
    entry.workstream,
    entry.agent,
    entry.model,
    entry.service,
  ].filter(Boolean) as string[];

  return (
    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-medium text-foreground">{entry.title}</h3>
            <StatusBadge status={entry.status} />
          </div>
          <div className="flex flex-wrap gap-2">
            {labels.map((label) => (
              <Badge key={label} variant="outline" className="rounded-full border-border/80 bg-background/80">
                {label}
              </Badge>
            ))}
            {entry.sessionId ? (
              <Badge variant="outline" className="rounded-full border-border/80 bg-background/80 font-mono">
                session {entry.sessionId}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {entry.lastUpdated ?? "No timestamp"}
        </div>
      </div>

      <div className={cn("mt-4 grid gap-3", compact ? "md:grid-cols-1" : "md:grid-cols-2")}>
        {entry.goal ? <Field label="Goal" value={entry.goal} /> : null}
        {entry.latestSignal ? <Field label="Latest signal" value={entry.latestSignal} emphasis /> : null}
        {entry.blocker ? <Field label="Blocker" value={entry.blocker} /> : null}
        {entry.nextAction ? <Field label="Next action" value={entry.nextAction} /> : null}
      </div>

      {entry.url ? (
        <div className="mt-4">
          <Link
            href={entry.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-orange-600 transition-colors hover:text-orange-500"
          >
            Open live service
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-background px-3 py-3",
        emphasis && "border-orange-500/25 bg-orange-500/5"
      )}
    >
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-sm leading-6 text-foreground">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const normalized = status?.toLowerCase() ?? "unknown";

  return (
    <Badge
      className={cn(
        "rounded-full border font-medium",
        normalized === "in_progress" && "border-sky-500/30 bg-sky-500/12 text-sky-700 dark:text-sky-300",
        normalized === "blocked" && "border-amber-500/30 bg-amber-500/12 text-amber-700 dark:text-amber-300",
        normalized === "done" && "border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
        normalized === "completed_in_live_code" && "border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
        normalized === "completed_in_code" && "border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
        normalized === "live_with_known_issues" && "border-orange-500/30 bg-orange-500/12 text-orange-700 dark:text-orange-300",
        ![
          "in_progress",
          "blocked",
          "done",
          "completed_in_live_code",
          "completed_in_code",
          "live_with_known_issues",
        ].includes(normalized) && "border-border bg-muted text-foreground"
      )}
      variant="outline"
    >
      {normalized === "in_progress" ? <Activity className="mr-1 h-3 w-3" /> : null}
      {normalized === "blocked" ? <AlertTriangle className="mr-1 h-3 w-3" /> : null}
      {normalized === "done" || normalized.startsWith("completed") ? <CheckCircle2 className="mr-1 h-3 w-3" /> : null}
      {normalized === "live_with_known_issues" ? <CircleDashed className="mr-1 h-3 w-3" /> : null}
      {status ?? "unknown"}
    </Badge>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

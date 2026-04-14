import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Sparkles, Mic, MessageSquare, Globe, Camera, Workflow, ShieldCheck, LayoutGrid, CreditCard } from "lucide-react";

export const metadata: Metadata = {
  title: "Agroktic + Haley AI",
  description: "Voice-first CRM, outreach, automation, and operations.",
};

const featureGroups = [
  {
    title: "Voice-Command CRM",
    desc: "Talk to the dashboard to pull up leads, print invoices, launch workflows, and keep moving.",
    icon: Mic,
  },
  {
    title: "Contextual Agentic Action",
    desc: "Haley can text links, verify information, and fire workflows while the conversation is still happening.",
    icon: Workflow,
  },
  {
    title: "HaleyVision",
    desc: "Join calls, read the room, extract data from IDs or cards, and respond in real time.",
    icon: Camera,
  },
  {
    title: "Unified Inbox",
    desc: "Manage SMS, email, WhatsApp, X, Telegram, Discord, TikTok, Instagram, and Messenger from one place.",
    icon: MessageSquare,
  },
  {
    title: "Funnels, Courses, Commerce",
    desc: "Turn a URL into a branded funnel, spin up course content, and keep checkout inside the flow.",
    icon: LayoutGrid,
  },
  {
    title: "Healthcare & RCM",
    desc: "Ambient scribing, eligibility checks, prior auth support, and practice workflows that keep up.",
    icon: ShieldCheck,
  },
];

const bullets = [
  "Stop clicking and start commanding",
  "Built on top of GoHighLevel and other CRMs",
  "Voice, video, inbox, and automation in one layer",
  "Designed for agencies, sales teams, and healthcare ops",
];

export default function AgrokticPage() {
  return (
    <div className="min-h-full bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-10 shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(106,228,255,0.18),transparent_30%),radial-gradient(circle_at_top_left,rgba(138,255,178,0.12),transparent_20%)]" />
          <div className="relative space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
              Agroktic + Haley AI landing page
            </div>

            <div className="max-w-4xl space-y-4">
              <p className="text-sm uppercase tracking-[0.2em] text-cyan-200/80">Drive your business like you drive your Tesla</p>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
                Stop clicking.
                <br />
                Start commanding.
              </h1>
              <p className="max-w-3xl text-base text-slate-300 sm:text-lg">
                Agroktic wraps your CRM, outreach, inbox, and operations into one AI control layer.
                Talk to your business, and Haley gets it done.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="#contact"
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                Book a Demo <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#capabilities"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 font-semibold text-white transition hover:bg-white/10"
              >
                See Capabilities
              </Link>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {bullets.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-slate-200"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section id="capabilities" className="space-y-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Core capabilities</h2>
            <p className="text-slate-400">A cleaner version of the product story, built from the capability list you gave me.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {featureGroups.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              <Globe className="h-3.5 w-3.5 text-emerald-300" />
              Omnichannel marketing and lead gen
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">One inbox. One brain. One place to move.</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              <li>• Manage every major channel from a single hub.</li>
              <li>• Prospect, enrich, and personalize outreach faster.</li>
              <li>• Build funnels from any website URL in seconds.</li>
              <li>• Keep customers inside the conversation instead of sending them everywhere else.</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6" id="contact">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              <CreditCard className="h-3.5 w-3.5 text-amber-300" />
              Final CTA
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Join the first 42 teams.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              If you want a page that feels more enterprise, more healthcare-specific, or more sales-led,
              I can spin that version up next.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/chat"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300"
              >
                Open Chat <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/projects"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 font-semibold text-white transition hover:bg-white/10"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

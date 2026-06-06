"use client";

import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ShoppingBag,
  Store,
  Facebook,
  Trash2,
  ExternalLink,
  Save,
  Loader2,
  Image as ImageIcon,
  Search,
  RotateCcw,
  RotateCw,
  Check,
  MapPin,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { rotatePhoto90 } from "@/lib/rotate-photo";

interface ListingDraft {
  id: string;
  photos: string[];
  title: string;
  price: number | null;
  quantity: number;
  condition: string;
  platforms: ("ebay" | "mercari" | "facebook" | "craigslist")[];
  status: string;
  facebookListingUrl?: string;
  mercariListingUrl?: string;
  ebayListingId?: string;
  craigslistListingUrl?: string;
  facebookLocalOnly?: boolean;
  publishQueued?: boolean;
  createdAt: string;
}

interface Props {
  listings: ListingDraft[];
  onUpdate: (id: string, patch: Partial<ListingDraft>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPublish: (ids: string[]) => void;
  onPublishFacebook: (ids: string[]) => void;
  queueRunning?: boolean;
  publishProgress: Record<string, string>;
}

const STATUS_STYLES: Record<string, string> = {
  draft:     "bg-gray-500/10 text-gray-400",
  ready:     "bg-green-500/10 text-green-400",
  listing:   "bg-yellow-500/10 text-yellow-400",
  listed:    "bg-blue-500/10 text-blue-400",
  error:     "bg-red-500/10 text-red-400",
  analyzing: "bg-purple-500/10 text-purple-400",
};

function PlatformCell({
  listing,
  onUpdate,
  saving,
}: {
  listing: ListingDraft;
  onUpdate: (patch: Partial<ListingDraft>) => void;
  saving: boolean;
}) {
  const platforms = listing.platforms ?? [];
  function toggle(p: "ebay" | "mercari" | "facebook" | "craigslist") {
    const next = platforms.includes(p)
      ? platforms.filter(x => x !== p)
      : [...platforms, p];
    onUpdate({ platforms: next as ListingDraft["platforms"] });
  }
  return (
    <div className="flex items-center gap-2">
      {(["ebay", "mercari", "facebook", "craigslist"] as const).map(p => {
        const icons = { ebay: ShoppingBag, mercari: Store, facebook: Facebook, craigslist: MapPin };
        const Icon = icons[p];
        const active = platforms.includes(p);
        return (
          <button
            key={p}
            onClick={() => toggle(p)}
            disabled={saving}
            title={p}
            className={cn(
              "p-1 rounded transition-colors",
              active
                ? "text-white bg-white/15 hover:bg-white/20"
                : "text-white/20 hover:text-white/40"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        );
      })}
    </div>
  );
}

function InlineNumber({
  value,
  onChange,
  min = 1,
  step = 1,
  prefix,
  className,
}: {
  value: number | null;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  prefix?: string;
  className?: string;
}) {
  const [local, setLocal] = useState(value != null ? String(value) : "");
  const [focused, setFocused] = useState(false);

  if (!focused && value != null && String(value) !== local) {
    setLocal(String(value));
  }

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {prefix && <span className="text-white/40 text-xs">{prefix}</span>}
      <input
        type="number"
        min={min}
        step={step}
        value={local}
        onFocus={() => setFocused(true)}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => {
          setFocused(false);
          const n = parseFloat(local);
          if (!isNaN(n) && n >= min) onChange(n);
          else setLocal(value != null ? String(value) : "");
        }}
        onKeyDown={e => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setLocal(value != null ? String(value) : "");
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="w-16 bg-transparent border-b border-white/10 focus:border-white/40 outline-none text-sm text-right py-0.5 px-0 text-white/90"
      />
    </div>
  );
}

function TitleCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!editing && local !== value) setLocal(value);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => { setEditing(false); onChange(local); }}
        onKeyDown={e => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setLocal(value); setEditing(false); }
        }}
        autoFocus
        className="w-full bg-white/5 border border-white/20 rounded px-2 py-0.5 text-sm outline-none text-white"
      />
    );
  }
  return (
    <span
      onClick={() => setEditing(true)}
      className="cursor-text text-sm text-white/90 hover:text-white line-clamp-2 leading-snug"
      title="Click to edit"
    >
      {value || <span className="italic text-white/30">Untitled</span>}
    </span>
  );
}

export function ListingsTableView({ listings, onUpdate, onDelete, onPublish, onPublishFacebook, queueRunning, publishProgress }: Props) {
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [researching, setResearching] = useState<Record<string, boolean>>({});
  const [priceHints, setPriceHints] = useState<Record<string, string>>({});

  // Optimistic local queue state — updates immediately on click so the checkbox
  // feels responsive even though the API round-trip takes ~300ms.
  const [localQueued, setLocalQueued] = useState<Set<string>>(
    () => new Set(listings.filter(l => l.publishQueued).map(l => l.id))
  );

  useEffect(() => {
    setLocalQueued(new Set(listings.filter(l => l.publishQueued).map(l => l.id)));
  }, [listings]);

  async function researchPrice(id: string) {
    setResearching(r => ({ ...r, [id]: true }));
    setPriceHints(h => ({ ...h, [id]: "" }));
    try {
      const res = await fetch("/api/listings/research-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: id }),
      });
      const data = await res.json();
      const aiParts: string[] = [];
      if (data.ai?.avgRetailPrice != null) aiParts.push(`retail ~$${data.ai.avgRetailPrice}`);
      if (data.ai?.avgResalePrice != null) aiParts.push(`resale ~$${data.ai.avgResalePrice}`);
      const aiSuffix = aiParts.length ? ` · AI est: ${aiParts.join(", ")}` : "";
      if (data.suggestedPrice) {
        await onUpdate(id, { price: data.suggestedPrice });
        setPriceHints(h => ({ ...h, [id]: (data.message || "") + aiSuffix }));
      } else {
        setPriceHints(h => ({ ...h, [id]: (data.message || data.error || "No eBay results") + aiSuffix }));
      }
    } catch {
      setPriceHints(h => ({ ...h, [id]: "Research failed" }));
    } finally {
      setResearching(r => ({ ...r, [id]: false }));
    }
  }

  async function save(id: string, patch: Partial<ListingDraft>) {
    setSaving(s => ({ ...s, [id]: true }));
    try { await onUpdate(id, patch); } finally {
      setSaving(s => ({ ...s, [id]: false }));
    }
  }

  // Photo viewer/rotate modal. `rotating` holds `${id}:${index}` while a single
  // rotate is in flight.
  const [photoModalId, setPhotoModalId] = useState<string | null>(null);
  const [rotating, setRotating] = useState<string | null>(null);

  async function doRotate(id: string, index: number) {
    if (rotating) return;
    const pl = listings.find(l => l.id === id);
    if (!pl || !pl.photos?.[index]) return;
    setRotating(`${id}:${index}`);
    try {
      const url = await rotatePhoto90(pl.photos[index], id);
      const next = [...pl.photos];
      next[index] = url;
      await save(id, { photos: next });
    } catch (e) {
      console.error("rotate failed:", e);
      const why = e instanceof Error ? e.message : String(e);
      alert(`Couldn't rotate that photo — ${why}`);
    } finally {
      setRotating(null);
    }
  }

  const publishable = listings.filter(l => l.status === "ready" || l.status === "draft");
  const localQueuedPublishable = publishable.filter(l => localQueued.has(l.id));
  const allQueued = publishable.length > 0 && localQueuedPublishable.length === publishable.length;
  const [researchAllProgress, setResearchAllProgress] = useState<{ done: number; total: number } | null>(null);

  async function toggleAll() {
    const next = !allQueued;
    setLocalQueued(next ? new Set(publishable.map(l => l.id)) : new Set());
    for (const l of publishable) {
      await save(l.id, { publishQueued: next });
    }
  }

  async function toggleOne(id: string) {
    const next = !localQueued.has(id);
    setLocalQueued(prev => {
      const s = new Set(prev);
      if (next) s.add(id); else s.delete(id);
      return s;
    });
    await save(id, { publishQueued: next });
  }

  async function researchAllPrices() {
    const targets = publishable.filter(l => l.title && l.title !== "Untitled");
    setResearchAllProgress({ done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      await researchPrice(targets[i].id);
      setResearchAllProgress({ done: i + 1, total: targets.length });
    }
    setResearchAllProgress(null);
  }

  const queuedIds = localQueuedPublishable.map(l => l.id);

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-white/40">{listings.length} listings</span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={researchAllPrices}
            disabled={!!researchAllProgress}
            className="h-7 text-xs"
          >
            {researchAllProgress
              ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />{researchAllProgress.done}/{researchAllProgress.total} pricing…</>
              : <><Search className="w-3 h-3 mr-1" />Research all prices</>}
          </Button>
          {queuedIds.length > 0 && (
            <>
              <Button
                size="sm"
                onClick={() => onPublishFacebook(queuedIds)}
                className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Facebook className="w-3 h-3 mr-1" />
                Post to Facebook ({queuedIds.length})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onPublish(queuedIds)}
                disabled={queueRunning}
                className="h-7 text-xs"
              >
                {queueRunning
                  ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Running queue...</>
                  : `Publish all platforms (${queuedIds.length})`}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="w-8 py-2 px-2">
                <Checkbox
                  checked={allQueued}
                  onCheckedChange={toggleAll}
                  className="border-white/30"
                />
              </th>
              <th className="w-12 py-2 px-2" />
              <th className="py-2 px-3 text-left text-xs font-medium text-white/50 uppercase tracking-wide">Title</th>
              <th className="w-16 py-2 px-2 text-right text-xs font-medium text-white/50 uppercase tracking-wide">Price</th>
              <th className="w-12 py-2 px-2 text-right text-xs font-medium text-white/50 uppercase tracking-wide">Qty</th>
              <th className="w-28 py-2 px-3 text-center text-xs font-medium text-white/50 uppercase tracking-wide">Platforms</th>
              <th className="w-20 py-2 px-2 text-center text-xs font-medium text-white/50 uppercase tracking-wide">Status</th>
              <th className="w-16 py-2 px-2" />
            </tr>
          </thead>
          <tbody>
            {listings.map((l, i) => {
              const isSaving = !!saving[l.id];
              const progress = publishProgress[l.id];
              const isPublishable = l.status === "ready" || l.status === "draft";
              const isQueued = localQueued.has(l.id);
              return (
                <tr
                  key={l.id}
                  className={cn(
                    "border-b border-white/5 transition-colors",
                    i % 2 === 0 ? "bg-white/[0.02]" : "",
                    isQueued ? "bg-blue-500/5" : "hover:bg-white/5"
                  )}
                >
                  {/* Select */}
                  <td className="py-2 px-2 text-center">
                    {isPublishable && (
                      <Checkbox
                        checked={isQueued}
                        onCheckedChange={() => toggleOne(l.id)}
                        className="border-white/30"
                      />
                    )}
                  </td>

                  {/* Thumbnail */}
                  <td className="py-1.5 px-2">
                    {l.photos?.[0] ? (
                      <button
                        type="button"
                        onClick={() => setPhotoModalId(l.id)}
                        title="View / rotate photos"
                        className="relative block"
                      >
                        <img
                          src={l.photos[0]}
                          alt=""
                          className="w-10 h-10 object-cover rounded ring-1 ring-transparent hover:ring-2 hover:ring-blue-500 transition"
                        />
                        {/* Always-visible badge so it's obvious the photo opens a rotate/view popup */}
                        <span className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center shadow ring-1 ring-black/30">
                          <RotateCw className="w-2.5 h-2.5" />
                        </span>
                      </button>
                    ) : (
                      <div className="w-10 h-10 bg-white/5 rounded flex items-center justify-center">
                        <ImageIcon className="w-4 h-4 text-white/20" />
                      </div>
                    )}
                  </td>

                  {/* Title */}
                  <td className="py-2 px-3 max-w-xs">
                    <TitleCell
                      value={l.title}
                      onChange={title => save(l.id, { title })}
                    />
                  </td>

                  {/* Price */}
                  <td className="py-2 px-2 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => researchPrice(l.id)}
                          disabled={researching[l.id]}
                          title="Research eBay sold prices"
                          className="text-white/20 hover:text-blue-400 transition-colors disabled:opacity-40"
                        >
                          {researching[l.id]
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Search className="w-3 h-3" />}
                        </button>
                        <InlineNumber
                          value={l.price}
                          prefix="$"
                          step={1}
                          onChange={price => save(l.id, { price })}
                          className="justify-end"
                        />
                      </div>
                      {priceHints[l.id] && (
                        <span className="text-[10px] text-blue-400/70 max-w-[140px] text-right leading-tight">
                          {priceHints[l.id]}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Qty */}
                  <td className="py-2 px-2 text-right">
                    <InlineNumber
                      value={l.quantity ?? 1}
                      onChange={quantity => save(l.id, { quantity })}
                      className="justify-end"
                    />
                  </td>

                  {/* Platforms */}
                  <td className="py-2 px-3">
                    <PlatformCell
                      listing={l}
                      onUpdate={patch => save(l.id, patch)}
                      saving={isSaving}
                    />
                  </td>

                  {/* Status */}
                  <td className="py-2 px-2 text-center">
                    {progress ? (
                      <span className="text-xs text-white/50 whitespace-nowrap">{progress}</span>
                    ) : (l.status === "listing" || l.status === "error") ? (
                      <div className="flex flex-col items-center gap-1">
                        <Badge className={cn("text-xs capitalize border-0 px-1.5", STATUS_STYLES[l.status])}>
                          {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : l.status}
                        </Badge>
                        <button
                          onClick={() => save(l.id, { status: "ready", error: undefined } as any)}
                          disabled={isSaving}
                          title="Reset to Ready"
                          className="flex items-center gap-0.5 text-[10px] text-white/30 hover:text-white/60 transition-colors disabled:opacity-30"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          Reset
                        </button>
                      </div>
                    ) : (l.status === "ready" || l.status === "draft") ? (
                      <div className="flex flex-col items-center gap-1">
                        <Badge className={cn("text-xs capitalize border-0 px-1.5", STATUS_STYLES[l.status])}>
                          {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : l.status}
                        </Badge>
                        <button
                          onClick={() => save(l.id, { status: "listed", facebookListingUrl: l.facebookListingUrl || "https://www.facebook.com/marketplace/you/selling" } as any)}
                          disabled={isSaving}
                          title="Mark as Listed"
                          className="flex items-center gap-0.5 text-[10px] text-white/30 hover:text-green-400 transition-colors disabled:opacity-30"
                        >
                          <Check className="w-2.5 h-2.5" />
                          Listed
                        </button>
                      </div>
                    ) : (
                      <Badge className={cn("text-xs capitalize border-0 px-1.5", STATUS_STYLES[l.status] || STATUS_STYLES.draft)}>
                        {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : l.status}
                      </Badge>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1 justify-end">
                      {(l.facebookListingUrl || l.mercariListingUrl) && (
                        <a
                          href={l.facebookListingUrl ?? l.mercariListingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-white/30 hover:text-white/70 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => onDelete(l.id)}
                        className="p-1 text-white/20 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {listings.length === 0 && (
          <div className="py-16 text-center text-white/30 text-sm">
            No listings yet
          </div>
        )}
      </div>

      {photoModalId && (() => {
        const pl = listings.find(l => l.id === photoModalId);
        if (!pl) return null;
        return (
          <div
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => { if (!rotating) setPhotoModalId(null); }}
          >
            <div
              className="bg-zinc-900 border border-white/10 rounded-lg p-4 w-full max-w-3xl max-h-[85vh] overflow-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-sm font-medium text-white/90 truncate">{pl.title || "Photos"}</h3>
                <button
                  onClick={() => { if (!rotating) setPhotoModalId(null); }}
                  className="shrink-0 text-white/40 hover:text-white"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {pl.photos?.length ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {pl.photos.map((p, i) => (
                    <div key={i} className="relative">
                      <img src={p} alt="" className="w-full h-44 object-contain bg-black/40 rounded" />
                      <button
                        type="button"
                        onClick={() => doRotate(pl.id, i)}
                        disabled={!!rotating}
                        title="Rotate 90° clockwise"
                        className="absolute bottom-1.5 right-1.5 w-8 h-8 bg-blue-600 hover:bg-blue-500 rounded-full text-white flex items-center justify-center shadow-md disabled:opacity-60"
                      >
                        {rotating === `${pl.id}:${i}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-10 text-center text-white/30 text-sm">No photos</div>
              )}
              <p className="mt-3 text-[11px] text-white/30">Rotate turns the photo 90° clockwise and saves it. Upside-down? Click twice.</p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

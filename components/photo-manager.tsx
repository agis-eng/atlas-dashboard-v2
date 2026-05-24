"use client";

import { useState, useRef } from "react";
import { X, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import crypto from "crypto";

interface Listing {
  id: string;
  photos: string[];
  title: string;
  isNew?: boolean;
}

interface Props {
  listings: Listing[];
  onUpdate: (id: string, patch: { photos: string[] }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

export function PhotoManager({ listings, onUpdate, onDelete, onClose }: Props) {
  const [local, setLocal] = useState<Listing[]>(() =>
    listings.map(l => ({ ...l, photos: [...l.photos] }))
  );
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Drag state in refs — avoids React re-renders on every dragover event
  const dragRef = useRef<{ fromId: string; url: string } | null>(null);
  const dragImgRef = useRef<HTMLImageElement | null>(null);

  function movePhoto(fromId: string, toId: string, url: string) {
    if (fromId === toId) return;
    setLocal(prev =>
      prev.map(l => {
        if (l.id === fromId) return { ...l, photos: l.photos.filter(p => p !== url) };
        if (l.id === toId) return { ...l, photos: [...l.photos, url] };
        return l;
      })
    );
  }

  function mergeInto(sourceId: string, targetId: string) {
    const source = local.find(l => l.id === sourceId);
    if (!source) return;
    setLocal(prev =>
      prev
        .filter(l => l.id !== sourceId)
        .map(l => (l.id === targetId ? { ...l, photos: [...l.photos, ...source.photos] } : l))
    );
    setMergeSource(null);
  }

  function addNewListing() {
    const tempId = `new-${crypto.randomUUID()}`;
    setLocal(prev => [...prev, { id: tempId, photos: [], title: "New listing", isNew: true }]);
  }

  async function save() {
    setSaving(true);
    try {
      for (const l of local) {
        if (l.isNew) {
          // Create new listing via API (no id = creates new record)
          if (l.photos.length > 0) {
            await fetch("/api/listings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                photos: l.photos,
                title: "New listing",
                status: "draft",
                platforms: ["facebook"],
                condition: "New",
                quantity: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }),
            });
          }
          continue;
        }
        const original = listings.find(o => o.id === l.id);
        if (!original) continue;
        if (JSON.stringify(original.photos) !== JSON.stringify(l.photos)) {
          await onUpdate(l.id, { photos: l.photos });
        }
      }
      const deletedIds = listings
        .filter(o => !local.find(l => l.id === o.id))
        .map(o => o.id);
      for (const id of deletedIds) {
        await onDelete(id);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#141414] rounded-xl border border-white/10 w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <div>
            <h2 className="font-semibold text-white text-sm">Photo Manager</h2>
            <p className="text-xs text-white/40 mt-0.5">
              Drag photos between listings · Merge → to combine · + New Listing for orphaned photos
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={addNewListing}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white text-xs rounded-lg font-medium flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3 h-3" />
              New Listing
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-3 py-1.5 bg-white text-black text-xs rounded-lg font-medium disabled:opacity-50 flex items-center gap-1"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              {saving ? "Saving…" : "Save & Close"}
            </button>
            <button onClick={onClose} className="p-1 text-white/40 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Listings */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {local.map(listing => {
            const isSource = mergeSource === listing.id;
            const isMergeTarget = !!mergeSource && mergeSource !== listing.id;

            return (
              <div
                key={listing.id}
                data-listingid={listing.id}
                className={cn(
                  "rounded-lg border p-3 transition-colors",
                  isSource
                    ? "border-purple-500/60 bg-purple-500/10"
                    : isMergeTarget
                    ? "border-purple-400/30 bg-purple-400/5 cursor-pointer hover:border-purple-400/60 hover:bg-purple-400/10"
                    : listing.isNew
                    ? "border-dashed border-white/20 bg-white/[0.01]"
                    : "border-white/10 bg-white/[0.02]"
                )}
                onDragOver={e => e.preventDefault()}
                onDragEnter={e => {
                  e.preventDefault();
                  if (dragRef.current && dragRef.current.fromId !== listing.id) {
                    (e.currentTarget as HTMLElement).style.boxShadow = "inset 0 0 0 2px rgba(96,165,250,0.6)";
                  }
                }}
                onDragLeave={e => {
                  // Only clear if leaving the listing card itself (not a child)
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    (e.currentTarget as HTMLElement).style.boxShadow = "";
                  }
                }}
                onDrop={e => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).style.boxShadow = "";
                  if (dragRef.current) {
                    movePhoto(dragRef.current.fromId, listing.id, dragRef.current.url);
                    dragRef.current = null;
                    // Remove opacity from the dragged image
                    if (dragImgRef.current) {
                      dragImgRef.current.style.opacity = "";
                      dragImgRef.current = null;
                    }
                  }
                }}
                onClick={() => {
                  if (isMergeTarget && mergeSource) mergeInto(mergeSource, listing.id);
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-white/70 truncate flex-1 leading-tight">
                    {listing.isNew
                      ? <span className="italic text-white/40">New listing — drag photos here</span>
                      : listing.title || <span className="italic text-white/30">Untitled</span>
                    }
                  </span>
                  <span className="text-xs text-white/25 shrink-0">
                    {listing.photos.length} photo{listing.photos.length !== 1 ? "s" : ""}
                  </span>
                  {!listing.isNew && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setMergeSource(isSource ? null : listing.id);
                      }}
                      className={cn(
                        "text-xs px-2 py-0.5 rounded shrink-0 transition-colors",
                        isSource
                          ? "bg-purple-500/30 text-purple-300 hover:bg-purple-500/40"
                          : "text-white/30 hover:text-white/60 hover:bg-white/10"
                      )}
                    >
                      {isSource ? "Cancel" : "Merge →"}
                    </button>
                  )}
                </div>

                {isMergeTarget && (
                  <p className="text-[10px] text-purple-400/70 mb-2">
                    Click to merge source photos into this listing
                  </p>
                )}

                <div className="flex gap-2 flex-wrap min-h-[4rem]">
                  {listing.photos.map((url, i) => (
                    <img
                      key={`${url}-${i}`}
                      src={url}
                      alt=""
                      draggable
                      onDragStart={e => {
                        e.stopPropagation();
                        dragRef.current = { fromId: listing.id, url };
                        dragImgRef.current = e.currentTarget as HTMLImageElement;
                        (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
                      }}
                      onDragEnd={e => {
                        (e.currentTarget as HTMLImageElement).style.opacity = "";
                        dragRef.current = null;
                        dragImgRef.current = null;
                        // Clear any leftover drop highlights
                        document.querySelectorAll("[data-listingid]").forEach(el => {
                          (el as HTMLElement).style.boxShadow = "";
                        });
                      }}
                      className="w-16 h-16 object-cover rounded-md border border-white/10 hover:border-white/30 cursor-grab active:cursor-grabbing"
                    />
                  ))}
                  {listing.photos.length === 0 && (
                    <div className="w-16 h-16 rounded-md border border-dashed border-white/15 flex items-center justify-center text-white/20 text-[10px]">
                      drop here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {mergeSource && (
          <div className="shrink-0 px-4 py-2.5 bg-purple-500/10 border-t border-purple-500/20 text-xs text-purple-300 text-center">
            Click a listing above to merge &ldquo;
            {local.find(l => l.id === mergeSource)?.title || "this listing"}
            &rdquo; into it
          </div>
        )}
      </div>
    </div>
  );
}

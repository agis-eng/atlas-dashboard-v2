// app/listings/batch/page.tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";

type Stage = "idle" | "uploading" | "grouping" | "analyzing" | "ready" | "publishing";

interface UploadedPhoto {
  photoId: string;
  blobUrl: string;
  originalName: string;
  exifTimestampMs: number | null;
  sizeBytes: number;
}

interface Group {
  productId: string;
  photoIds: string[];
  blobUrls: string[];
  lowConfidence: boolean;
  confidenceReason?: string;
}

interface Draft {
  productId: string;
  photoIds: string[];
  blobUrls: string[];
  title: string;
  description: string;
  condition: string;
  price: number;
  weight_lbs: number;
  dims_in: { length: number; width: number; height: number };
  category: string;
  quantity: number;
  routing: "ship_online" | "local_only";
  routingReason: string;
  estimatedProfit: number;
  platforms: { ebay: boolean; mercari: boolean; facebook: boolean };
  facebookLocalOnly: boolean;
  status: "ready" | "needs_review";
  selected?: boolean;
  rowStatus?: "ready" | "publishing" | "listed" | "partial" | "failed";
  publishErrors?: Record<string, string>;
}

export default function BatchListingPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setStage("uploading");
    setUploadProgress(`Uploading ${files.length} photos...`);

    const batchId = crypto.randomUUID();
    const formData = new FormData();
    for (const f of files) formData.append("photos", f);
    formData.append("batchId", batchId);

    try {
      const uploadRes = await fetch("/api/listings/batch/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const upload = await uploadRes.json();

      if (upload.skippedCount > 0) {
        toast.warning(`Skipped ${upload.skippedCount} files`, { description: upload.skippedReasons.join("\n") });
      }

      setStage("grouping");
      setUploadProgress("Grouping photos into products...");
      const groupRes = await fetch("/api/listings/batch/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, photos: upload.photos }),
      });
      if (!groupRes.ok) throw new Error("Grouping failed");
      const { groups } = await groupRes.json() as { groups: Group[] };

      setStage("analyzing");
      setUploadProgress(`Analyzing ${groups.length} products...`);
      const analyzeRes = await fetch("/api/listings/batch/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups }),
      });
      if (!analyzeRes.ok) throw new Error("Analyze failed");
      const { drafts: newDrafts } = await analyzeRes.json() as { drafts: Draft[] };

      setDrafts(newDrafts.map(d => ({ ...d, selected: d.status === "ready", rowStatus: "ready" })));
      setStage("ready");
      setUploadProgress("");
      toast.success(`Ready: ${newDrafts.length} draft listings`);
    } catch (err) {
      toast.error((err as Error).message);
      setStage("idle");
      setUploadProgress("");
    }
  }

  function updateDraft(idx: number, patch: Partial<Draft>) {
    setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, ...patch } : d));
  }

  function applyEvent(evt: { productId: string; platform: string; status: string; error?: string }) {
    setDrafts(prev => prev.map(d => {
      if (d.productId !== evt.productId) return d;
      const next = { ...d };
      if (!next.publishErrors) next.publishErrors = {};
      if (evt.status === "failed" && evt.error) {
        next.publishErrors = { ...next.publishErrors, [evt.platform]: evt.error };
      } else if (evt.status === "success") {
        const { [evt.platform]: _drop, ...rest } = next.publishErrors;
        next.publishErrors = rest;
      }
      return next;
    }));
  }

  function movePhoto(fromIdx: number, photoIdx: number, toProductId: string) {
    setDrafts(prev => {
      const next = prev.map(d => ({ ...d, blobUrls: [...d.blobUrls], photoIds: [...d.photoIds] }));
      const from = next[fromIdx];
      const movedUrl = from.blobUrls.splice(photoIdx, 1)[0];
      const movedId = from.photoIds.splice(photoIdx, 1)[0];

      if (toProductId === "__new__") {
        next.push({
          ...from,
          productId: crypto.randomUUID(),
          blobUrls: [movedUrl],
          photoIds: [movedId],
          title: "",
          price: 0,
          status: "needs_review",
          rowStatus: "ready",
          selected: false,
        });
      } else {
        const toIdx = next.findIndex(d => d.productId === toProductId);
        if (toIdx >= 0) {
          next[toIdx].blobUrls.push(movedUrl);
          next[toIdx].photoIds.push(movedId);
        }
      }

      return next.filter(d => d.blobUrls.length > 0);
    });
  }

  async function reanalyzeSelected() {
    const selected = drafts.filter(d => d.selected);
    if (selected.length === 0) return;
    setStage("analyzing");
    try {
      const res = await fetch("/api/listings/batch/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groups: selected.map(d => ({
            productId: d.productId,
            photoIds: d.photoIds,
            blobUrls: d.blobUrls,
            lowConfidence: false,
          })),
        }),
      });
      if (!res.ok) throw new Error("Re-analyze failed");
      const { drafts: refreshed } = await res.json() as { drafts: Draft[] };
      setDrafts(prev => prev.map(d => {
        const updated = refreshed.find(r => r.productId === d.productId);
        return updated ? { ...d, ...updated, selected: d.selected, rowStatus: "ready" } : d;
      }));
      toast.success(`Re-analyzed ${refreshed.length} products`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setStage("ready");
    }
  }

  async function publishSelected() {
    const selected = drafts.filter(d => d.selected && d.status === "ready");
    if (selected.length === 0) {
      toast.warning("No ready rows selected");
      return;
    }

    setStage("publishing");
    setDrafts(prev => prev.map(d => d.selected && d.status === "ready" ? { ...d, rowStatus: "publishing", publishErrors: {} } : d));

    try {
      const res = await fetch("/api/listings/batch/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drafts: selected }),
      });
      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const evt of events) {
          const line = evt.trim().replace(/^data:\s*/, "");
          if (!line) continue;
          try {
            const data = JSON.parse(line);
            if (data.done) continue;
            if (data.productId && data.platform) {
              applyEvent(data);
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      setDrafts(prev => prev.map(d => {
        if (d.rowStatus !== "publishing") return d;
        const platforms = (["ebay", "mercari", "facebook"] as const).filter(p => d.platforms[p]);
        const errs = d.publishErrors || {};
        const failed = platforms.filter(p => errs[p]);
        if (failed.length === 0) return { ...d, rowStatus: "listed" };
        if (failed.length === platforms.length) return { ...d, rowStatus: "failed" };
        return { ...d, rowStatus: "partial" };
      }));

      toast.success("Batch publish complete");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setStage("ready");
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Batch Listings</h1>

      {stage === "idle" && (
        <label className="inline-block px-4 py-2 bg-blue-600 text-white rounded cursor-pointer hover:bg-blue-700">
          Upload photos
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif"
            className="hidden"
            onChange={handleFilePick}
          />
        </label>
      )}

      {(stage === "uploading" || stage === "grouping" || stage === "analyzing") && (
        <div className="text-gray-700">{uploadProgress}</div>
      )}

      {stage === "ready" && drafts.length > 0 && (
        <div className="mt-6">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-2 text-left w-8">
                    <input
                      type="checkbox"
                      checked={drafts.every(d => d.selected)}
                      onChange={(e) => setDrafts(drafts.map(d => ({ ...d, selected: e.target.checked && d.status === "ready" })))}
                    />
                  </th>
                  <th className="p-2 text-left">Photos</th>
                  <th className="p-2 text-left">Title</th>
                  <th className="p-2 text-left w-20">Price</th>
                  <th className="p-2 text-left w-16">Qty</th>
                  <th className="p-2 text-left w-16">Lbs</th>
                  <th className="p-2 text-left w-40">Routing</th>
                  <th className="p-2 text-left w-32">Status</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d, i) => (
                  <tr key={d.productId} className="border-b align-top">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={!!d.selected}
                        disabled={d.status === "needs_review"}
                        onChange={(e) => updateDraft(i, { selected: e.target.checked })}
                      />
                    </td>
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => setExpandedRow(expandedRow === d.productId ? null : d.productId)}
                        className="flex gap-1 flex-wrap max-w-[160px] cursor-pointer hover:opacity-80"
                      >
                        {d.blobUrls.slice(0, 3).map((url, j) => (
                          <img key={j} src={url} alt="" className="w-12 h-12 object-cover rounded border" />
                        ))}
                        {d.blobUrls.length > 3 && <span className="text-xs text-gray-500 self-end">+{d.blobUrls.length - 3}</span>}
                        {d.status === "needs_review" && <span title={d.routingReason} className="text-yellow-600">⚠️</span>}
                      </button>
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={d.title}
                        onChange={(e) => updateDraft(i, { title: e.target.value })}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={d.price}
                        onChange={(e) => updateDraft(i, { price: Number(e.target.value) })}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={d.quantity}
                        onChange={(e) => updateDraft(i, { quantity: Math.max(1, Number(e.target.value)) })}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={d.weight_lbs}
                        onChange={(e) => updateDraft(i, { weight_lbs: Number(e.target.value) })}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    </td>
                    <td className="p-2">
                      <select
                        value={d.routing}
                        onChange={(e) => {
                          const recommendation = e.target.value as "ship_online" | "local_only";
                          if (recommendation === "ship_online") {
                            updateDraft(i, { routing: recommendation, platforms: { ebay: true, mercari: true, facebook: true }, facebookLocalOnly: false });
                          } else {
                            updateDraft(i, { routing: recommendation, platforms: { ebay: false, mercari: false, facebook: true }, facebookLocalOnly: true });
                          }
                        }}
                        className="px-2 py-1 border rounded text-sm w-full"
                        title={`${d.routingReason} (est profit: $${d.estimatedProfit})`}
                      >
                        <option value="ship_online">Online (eBay+Mercari+FB)</option>
                        <option value="local_only">FB local only</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <span className={
                        d.rowStatus === "listed" ? "text-green-600" :
                        d.rowStatus === "partial" ? "text-yellow-600" :
                        d.rowStatus === "failed" ? "text-red-600" :
                        d.rowStatus === "publishing" ? "text-blue-600" :
                        d.status === "needs_review" ? "text-yellow-600" : "text-gray-700"
                      }>
                        {d.rowStatus === "listed" ? "Listed" :
                         d.rowStatus === "partial" ? "Partial" :
                         d.rowStatus === "failed" ? "Failed" :
                         d.rowStatus === "publishing" ? "Publishing…" :
                         d.status === "needs_review" ? "Needs review" : "Ready"}
                      </span>
                      {d.publishErrors && Object.keys(d.publishErrors).length > 0 && (
                        <div className="text-xs text-red-600 mt-1">
                          {Object.entries(d.publishErrors).map(([p, e]) => <div key={p}>{p}: {e}</div>)}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {drafts.map((d, i) => (
              <div key={d.productId} className="border rounded p-3 bg-white">
                <div className="flex items-start gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={!!d.selected}
                    disabled={d.status === "needs_review"}
                    onChange={(e) => updateDraft(i, { selected: e.target.checked })}
                  />
                  <button onClick={() => setExpandedRow(expandedRow === d.productId ? null : d.productId)} className="flex gap-1">
                    {d.blobUrls.slice(0, 3).map((url, j) => (
                      <img key={j} src={url} alt="" className="w-14 h-14 object-cover rounded border" />
                    ))}
                    {d.blobUrls.length > 3 && <span className="text-xs text-gray-500 self-end">+{d.blobUrls.length - 3}</span>}
                  </button>
                  <span className={`ml-auto text-xs ${
                    d.rowStatus === "listed" ? "text-green-600" :
                    d.rowStatus === "partial" ? "text-yellow-600" :
                    d.rowStatus === "failed" ? "text-red-600" :
                    d.rowStatus === "publishing" ? "text-blue-600" :
                    d.status === "needs_review" ? "text-yellow-600" : "text-gray-700"
                  }`}>
                    {d.rowStatus === "listed" ? "Listed" :
                     d.rowStatus === "partial" ? "Partial" :
                     d.rowStatus === "failed" ? "Failed" :
                     d.rowStatus === "publishing" ? "Publishing…" :
                     d.status === "needs_review" ? "Needs review" : "Ready"}
                  </span>
                </div>
                <input
                  type="text"
                  value={d.title}
                  placeholder="Title"
                  onChange={(e) => updateDraft(i, { title: e.target.value })}
                  className="w-full px-2 py-1 border rounded text-sm mb-2"
                />
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <label className="text-xs">
                    Price
                    <input type="number" min="0" step="0.01" value={d.price} onChange={(e) => updateDraft(i, { price: Number(e.target.value) })} className="w-full px-2 py-1 border rounded text-sm" />
                  </label>
                  <label className="text-xs">
                    Qty
                    <input type="number" min="1" value={d.quantity} onChange={(e) => updateDraft(i, { quantity: Math.max(1, Number(e.target.value)) })} className="w-full px-2 py-1 border rounded text-sm" />
                  </label>
                  <label className="text-xs">
                    Lbs
                    <input type="number" min="0" step="0.1" value={d.weight_lbs} onChange={(e) => updateDraft(i, { weight_lbs: Number(e.target.value) })} className="w-full px-2 py-1 border rounded text-sm" />
                  </label>
                </div>
                <select
                  value={d.routing}
                  onChange={(e) => {
                    const recommendation = e.target.value as "ship_online" | "local_only";
                    if (recommendation === "ship_online") {
                      updateDraft(i, { routing: recommendation, platforms: { ebay: true, mercari: true, facebook: true }, facebookLocalOnly: false });
                    } else {
                      updateDraft(i, { routing: recommendation, platforms: { ebay: false, mercari: false, facebook: true }, facebookLocalOnly: true });
                    }
                  }}
                  className="w-full px-2 py-1 border rounded text-sm"
                >
                  <option value="ship_online">Online (eBay+Mercari+FB)</option>
                  <option value="local_only">FB local only</option>
                </select>
                {d.publishErrors && Object.keys(d.publishErrors).length > 0 && (
                  <div className="text-xs text-red-600 mt-2">
                    {Object.entries(d.publishErrors).map(([p, e]) => <div key={p}>{p}: {e}</div>)}
                  </div>
                )}
              </div>
            ))}
          </div>

          {expandedRow && (() => {
            const rowIdx = drafts.findIndex(d => d.productId === expandedRow);
            if (rowIdx < 0) return null;
            const row = drafts[rowIdx];
            return (
              <div className="mt-4 p-4 border rounded bg-gray-50">
                <div className="flex justify-between items-center mb-2">
                  <div className="font-semibold">Reassign photos: {row.title || "Untitled"}</div>
                  <button onClick={() => setExpandedRow(null)} className="text-sm text-gray-500">Close</button>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {row.blobUrls.map((url, j) => (
                    <div key={j} className="relative">
                      <img src={url} className="w-full aspect-square object-cover rounded border" />
                      <select
                        value={row.productId}
                        onChange={(e) => movePhoto(rowIdx, j, e.target.value)}
                        className="absolute bottom-1 left-1 right-1 text-xs px-1 py-0.5 bg-white/90 border rounded"
                      >
                        <option value={row.productId}>This product</option>
                        {drafts.filter(d => d.productId !== row.productId).map(d => (
                          <option key={d.productId} value={d.productId}>{d.title || "Untitled"}</option>
                        ))}
                        <option value="__new__">→ New product</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="mt-4 flex justify-end gap-2">
            <button
              className="px-3 py-2 border rounded text-sm"
              disabled={drafts.filter(d => d.selected).length === 0 || (stage as Stage) === "publishing"}
              onClick={reanalyzeSelected}
            >
              Re-analyze selected
            </button>
            <button
              className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
              disabled={drafts.filter(d => d.selected).length === 0 || (stage as Stage) === "publishing"}
              onClick={publishSelected}
            >
              Publish All Selected ({drafts.filter(d => d.selected).length})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

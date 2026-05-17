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
          <p className="text-sm text-gray-600 mb-2">{drafts.length} draft listings — review table coming in next task.</p>
          <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-96">
            {JSON.stringify(drafts.map(d => ({ title: d.title, price: d.price, routing: d.routing })), null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

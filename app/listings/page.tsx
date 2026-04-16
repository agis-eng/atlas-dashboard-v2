"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tag,
  Upload,
  Camera,
  Sparkles,
  Loader2,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Check,
  X,
  Image as ImageIcon,
  ShoppingBag,
  Store,
  Facebook,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ListingDraft {
  id: string;
  photos: string[];
  title: string;
  description: string;
  price: number | null;
  quantity: number;
  condition: string;
  category: string;
  platforms: ("ebay" | "mercari" | "facebook")[];
  status: "draft" | "analyzing" | "ready" | "listing" | "listed" | "error";
  ebayListingId?: string;
  mercariListingUrl?: string;
  facebookListingUrl?: string;
  aiAnalysis?: {
    suggestedTitle: string;
    suggestedDescription: string;
    suggestedPrice: number;
    suggestedCategory: string;
    suggestedCondition: string;
    suggestedWeightOz?: number;
    suggestedLengthIn?: number;
    suggestedWidthIn?: number;
    suggestedHeightIn?: number;
    confidence: string;
  };
  weightOz?: number;
  lengthIn?: number;
  widthIn?: number;
  heightIn?: number;
  mercariError?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const CONDITIONS = [
  "New",
  "Like New",
  "Good",
  "Fair",
  "Poor",
];

const EBAY_CONDITION_MAP: Record<string, string> = {
  New: "NEW",
  "Like New": "LIKE_NEW",
  Good: "USED_GOOD",
  Fair: "USED_ACCEPTABLE",
  Poor: "FOR_PARTS_OR_NOT_WORKING",
};

const PLATFORM_INFO = {
  ebay: { label: "eBay", icon: ShoppingBag, color: "text-blue-600 bg-blue-600/10", fee: "~13.25%" },
  mercari: { label: "Mercari", icon: Store, color: "text-red-500 bg-red-500/10", fee: "12.9%" },
  facebook: { label: "Facebook", icon: Facebook, color: "text-blue-500 bg-blue-500/10", fee: "Free" },
};

interface MarketplaceConnection {
  platform: string;
  connected: boolean;
  lastValidated: string;
  username?: string;
  error?: string;
}

interface MarketplaceStatus {
  mercari: MarketplaceConnection | null;
  facebook: MarketplaceConnection | null;
}

export default function ListingsPage() {
  const [listings, setListings] = useState<ListingDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [marketplaceStatus, setMarketplaceStatus] = useState<MarketplaceStatus>({ mercari: null, facebook: null });
  const [connecting, setConnecting] = useState<string | null>(null);
  const [publishProgress, setPublishProgress] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadListings();
    loadMarketplaceStatus();
  }, []);

  async function loadListings() {
    setLoading(true);
    try {
      const res = await fetch("/api/listings");
      if (res.ok) {
        const data = await res.json();
        setListings(data.listings || []);
      }
    } catch (err) {
      console.error("Failed to load listings:", err);
    } finally {
      setLoading(false);
    }
  }

  async function compressImage(file: File, maxWidth = 1600, quality = 0.8): Promise<File> {
    return new Promise((resolve) => {
      // If already small enough, skip compression
      if (file.size < 500_000) {
        resolve(file);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            resolve(new File([blob!], file.name, { type: "image/jpeg" }));
          },
          "image/jpeg",
          quality
        );
      };
      img.src = URL.createObjectURL(file);
    });
  }

  async function handlePhotoUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);

    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        const compressed = await compressImage(files[i]);
        formData.append("photos", compressed);
      }

      const uploadRes = await fetch("/api/listings/upload", {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok) {
        alert(uploadData.error || "Upload failed");
        return;
      }

      // Create the listing draft
      const createRes = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: uploadData.listingId,
          photos: uploadData.photos,
          status: "draft",
        }),
      });

      if (createRes.ok) {
        const data = await createRes.json();
        setListings(data.listings);
        // Auto-expand and analyze
        setExpanded((prev) => new Set(prev).add(uploadData.listingId));
        analyzePhotos(uploadData.listingId, uploadData.photos);
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to upload photos");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function analyzePhotos(listingId: string, photos: string[]) {
    setAnalyzing(listingId);

    // Update status to analyzing
    await fetch("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: listingId, status: "analyzing" }),
    });

    try {
      const res = await fetch("/api/listings/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos }),
      });

      const data = await res.json();

      if (res.ok && data.analysis) {
        const update: any = {
          id: listingId,
          title: data.analysis.suggestedTitle || "",
          description: data.analysis.suggestedDescription || "",
          price: data.analysis.suggestedPrice || null,
          condition: data.analysis.suggestedCondition || "",
          category: data.analysis.suggestedCategory || "",
          aiAnalysis: data.analysis,
          status: "ready",
        };
        if (data.analysis.suggestedWeightOz) update.weightOz = data.analysis.suggestedWeightOz;
        if (data.analysis.suggestedLengthIn) update.lengthIn = data.analysis.suggestedLengthIn;
        if (data.analysis.suggestedWidthIn) update.widthIn = data.analysis.suggestedWidthIn;
        if (data.analysis.suggestedHeightIn) update.heightIn = data.analysis.suggestedHeightIn;

        const updateRes = await fetch("/api/listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        });

        if (updateRes.ok) {
          const updateData = await updateRes.json();
          setListings(updateData.listings);
        }
      } else {
        await fetch("/api/listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: listingId,
            status: "draft",
            error: data.error || "Analysis failed",
          }),
        });
        await loadListings();
      }
    } catch (err) {
      console.error("Analysis error:", err);
    } finally {
      setAnalyzing(null);
    }
  }

  async function updateListing(id: string, updates: Partial<ListingDraft>) {
    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      if (res.ok) {
        const data = await res.json();
        setListings(data.listings);
      }
    } catch (err) {
      console.error("Update error:", err);
    }
  }

  async function deleteListing(id: string) {
    try {
      await fetch(`/api/listings?id=${id}`, { method: "DELETE" });
      setListings((prev) => prev.filter((l) => l.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      console.error("Delete error:", err);
    }
  }

  async function deleteSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} listing${ids.length === 1 ? "" : "s"}?`)) return;
    await Promise.all(
      ids.map((id) => fetch(`/api/listings?id=${id}`, { method: "DELETE" }))
    );
    setListings((prev) => prev.filter((l) => !selectedIds.has(l.id)));
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function publishToEbay(listing: ListingDraft) {
    if (!listing.title || !listing.price) {
      alert("Title and price are required to publish");
      return;
    }

    await updateListing(listing.id, { status: "listing" });

    try {
      // Token is handled server-side (env var or Redis). Pass from localStorage if available.
      const savedSettings = localStorage.getItem("ebay-settings");
      const settings = savedSettings ? JSON.parse(savedSettings) : {};
      const token = settings.token || ""; // may be empty — server will use Redis/env fallback
      const env = settings.environment || "production";

      const sku = `LISTING-${listing.id.slice(0, 8)}`;

      // Build image URLs — need full public URL for eBay
      const baseUrl = window.location.origin;
      const imageUrls = listing.photos.map((p) => p.startsWith("http") ? p : `${baseUrl}${p}`);

      // Step 1: Create inventory item
      const invRes = await fetch("/api/ebay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-inventory-item",
          token,
          env,
          sku,
          product: {
            title: listing.title,
            description: listing.description,
            imageUrls,
          },
          condition: EBAY_CONDITION_MAP[listing.condition] || "USED_GOOD",
          availability: {
            shipToLocationAvailability: { quantity: listing.quantity || 1 },
          },
        }),
      });

      if (!invRes.ok) {
        const errData = await invRes.json();
        throw new Error(errData.errors?.[0]?.message || errData.error || "Failed to create inventory item");
      }

      // Look up eBay category ID from listing title
      let categoryId = "";
      try {
        const catRes = await fetch(`/api/ebay?action=categories&q=${encodeURIComponent(listing.title)}&env=${env}`);
        if (catRes.ok) {
          const catData = await catRes.json();
          categoryId = catData.categorySuggestions?.[0]?.category?.categoryId || "";
        }
      } catch {}

      // Fetch eBay policies
      let policies = { fulfillmentPolicyId: "", returnPolicyId: "", paymentPolicyId: "" };
      try {
        const polRes = await fetch("/api/ebay/policies");
        if (polRes.ok) {
          const polData = await polRes.json();
          if (polData.policies) policies = polData.policies;
        }
      } catch {}

      // Step 2: Create offer
      const offerRes = await fetch("/api/ebay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-offer",
          token,
          env,
          sku,
          marketplaceId: "EBAY_US",
          format: "FIXED_PRICE",
          listingDescription: listing.description,
          pricingSummary: {
            price: { value: String(listing.price), currency: "USD" },
          },
          availableQuantity: listing.quantity || 1,
          listingPolicies: {
            fulfillmentPolicyId: policies.fulfillmentPolicyId,
            returnPolicyId: policies.returnPolicyId,
            paymentPolicyId: policies.paymentPolicyId,
          },
          countryCode: "US",
          merchantLocationKey: "default",
          categoryId,
        }),
      });

      const offerData = await offerRes.json();
      if (!offerRes.ok) {
        throw new Error(offerData.errors?.[0]?.message || offerData.error || "Failed to create offer");
      }

      const offerId = offerData.offerId;

      // Step 3: Publish offer
      const pubRes = await fetch("/api/ebay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish-offer",
          token,
          env,
          offerId,
        }),
      });

      const pubData = await pubRes.json();

      if (pubRes.ok) {
        await updateListing(listing.id, {
          status: "listed",
          ebayListingId: pubData.listingId || offerId,
        });
      } else {
        throw new Error(pubData.errors?.[0]?.message || "Failed to publish");
      }
    } catch (err: any) {
      console.error("eBay publish error:", err);
      await updateListing(listing.id, {
        status: "error",
        error: `eBay: ${err.message}`,
      });
    }
  }

  async function loadMarketplaceStatus() {
    try {
      const res = await fetch("/api/marketplace/status");
      if (res.ok) {
        const data = await res.json();
        setMarketplaceStatus(data);
      }
    } catch (err) {
      console.error("Failed to load marketplace status:", err);
    }
  }

  const [pendingConnect, setPendingConnect] = useState<{ platform: string; sessionId: string; liveViewUrl: string } | null>(null);
  const [cookieImport, setCookieImport] = useState<{ platform: "mercari" | "facebook"; text: string } | null>(null);
  const [importingCookies, setImportingCookies] = useState(false);

  async function importCookies() {
    if (!cookieImport) return;
    let parsed: any;
    try {
      parsed = JSON.parse(cookieImport.text);
    } catch {
      alert("Payload must be valid JSON. Use the snippet below in your browser console.");
      return;
    }
    // Accept either an array of cookies (old format) or an object { cookies, localStorage, origin }
    let cookies: any[] = [];
    let localStorage: Record<string, string> = {};
    let origin = "";
    if (Array.isArray(parsed)) {
      cookies = parsed;
    } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.cookies)) {
      cookies = parsed.cookies;
      localStorage = parsed.localStorage || {};
      origin = parsed.origin || "";
    } else {
      alert("JSON must be either an array of cookies or { cookies, localStorage, origin }.");
      return;
    }
    // Merge in optional localStorage from the separate textarea
    if (cookieImportLS.trim()) {
      try {
        const ls = JSON.parse(cookieImportLS);
        if (ls && typeof ls === "object") {
          if (ls.localStorage) {
            localStorage = { ...localStorage, ...ls.localStorage };
            if (!origin && ls.origin) origin = ls.origin;
          } else {
            // Assume user pasted raw {key: value} object
            localStorage = { ...localStorage, ...ls };
          }
        }
      } catch {
        alert("localStorage field is not valid JSON.");
        return;
      }
    }
    setImportingCookies(true);
    try {
      const res = await fetch("/api/marketplace/import-cookies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: cookieImport.platform, cookies, localStorage, origin }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.details || data.error || "Cookie import failed");
      } else if (data.connection?.connected) {
        alert(`${cookieImport.platform} connected via cookie + localStorage import.`);
        setMarketplaceStatus((prev) => ({ ...prev, [cookieImport.platform]: data.connection }));
        setCookieImport(null);
      } else {
        alert(data.connection?.error || `Import completed but login verification failed. Try exporting fresh data while logged in.`);
        setMarketplaceStatus((prev) => ({ ...prev, [cookieImport.platform]: data.connection }));
      }
    } catch (err: any) {
      alert("Failed to import: " + (err?.message || String(err)));
    }
    setImportingCookies(false);
  }

  const LOCALSTORAGE_SNIPPET = `copy(JSON.stringify({localStorage: Object.fromEntries(Object.entries(localStorage)), origin: location.origin}))`;
  const [cookieImportLS, setCookieImportLS] = useState("");

  async function disconnectMarketplace(platform: "mercari" | "facebook") {
    if (!confirm(`Disconnect ${platform}? You'll need to log in again to publish.`)) return;
    setConnecting(platform);
    try {
      await fetch(`/api/marketplace/connect?platform=${platform}`, { method: "DELETE" });
      await loadMarketplaceStatus();
    } catch (err) {
      console.error("Disconnect error:", err);
    }
    setConnecting(null);
  }

  async function connectMarketplace(platform: "mercari" | "facebook") {
    setConnecting(platform);
    try {
      const res = await fetch("/api/marketplace/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, action: "start" }),
      });
      const data = await res.json();

      if (data.status === "login_required" && data.liveViewUrl) {
        // Open the remote browser for the user to log in
        setPendingConnect({ platform, sessionId: data.sessionId, liveViewUrl: data.liveViewUrl });
        window.open(data.liveViewUrl, "_blank");
      } else {
        const msg = data.details || data.error || "Connection failed";
        console.error("Connect failed:", data);
        alert(msg);
      }
    } catch (err: any) {
      console.error("Connect error:", err);
      alert("Failed to connect marketplace: " + (err?.message || String(err)));
    }
    setConnecting(null);
  }

  async function verifyConnection() {
    if (!pendingConnect) return;
    setConnecting(pendingConnect.platform);
    try {
      const res = await fetch("/api/marketplace/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: pendingConnect.platform,
          action: "verify",
          sessionId: pendingConnect.sessionId,
        }),
      });
      const data = await res.json();
      if (data.connection) {
        setMarketplaceStatus((prev) => ({ ...prev, [pendingConnect.platform]: data.connection }));
        if (data.connection.connected) {
          alert(`${pendingConnect.platform} connected successfully!`);
          setPendingConnect(null);
        } else {
          alert("Login not detected yet. Make sure you completed the login in the browser window, then try verifying again.");
        }
      }
    } catch (err) {
      console.error("Verify error:", err);
      alert("Failed to verify connection");
    }
    setConnecting(null);
  }

  async function publishToMercari(listing: ListingDraft) {
    if (!listing.title || !listing.price) {
      alert("Title and price are required");
      return;
    }
    if (!marketplaceStatus.mercari?.connected) {
      alert("Connect your Mercari account first");
      return;
    }

    await updateListing(listing.id, { status: "listing" });

    let sessionId = "";

    try {
      // Step 1: Open Mercari in a browser session
      setPublishProgress((prev) => ({ ...prev, [listing.id]: "Opening Mercari..." }));
      const startRes = await fetch("/api/listings/publish/mercari", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: listing.id, step: "start" }),
      });
      const startData = await startRes.json();

      if (!startRes.ok) throw new Error(startData.details || startData.error || "Failed to open Mercari");
      sessionId = startData.sessionId || "";

      // Open the live browser view so user can watch the fill happen
      if (startData.liveViewUrl) {
        window.open(startData.liveViewUrl, `mercari-publish-${listing.id}`, "width=1200,height=800");
      }

      // Step 2: Fill in the listing details (including photos)
      setPublishProgress((prev) => ({ ...prev, [listing.id]: "Uploading photos & filling details..." }));
      const fillRes = await fetch("/api/listings/publish/mercari", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: listing.id, sessionId, step: "fill" }),
      });
      const fillData = await fillRes.json();

      if (!fillRes.ok) throw new Error(fillData.details || fillData.error || "Failed to fill fields");

      // Step 3: Submit the listing
      setPublishProgress((prev) => ({ ...prev, [listing.id]: "Publishing listing..." }));
      const submitRes = await fetch("/api/listings/publish/mercari", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: listing.id, sessionId, step: "submit" }),
      });
      const submitData = await submitRes.json();

      if (!submitRes.ok) throw new Error(submitData.details || submitData.error || "Failed to publish");
      // Server returns 200 with success:false when final URL still looks like the sell page
      if (submitData.success === false) {
        throw new Error(submitData.details || submitData.error || "Publish did not complete — check the browser window");
      }

      await updateListing(listing.id, {
        status: "listed",
        mercariListingUrl: submitData.listingUrl,
      });
    } catch (err: any) {
      console.error("Mercari publish error:", err);
      await updateListing(listing.id, {
        status: "error",
        error: `Mercari: ${err.message}`,
      });
      alert(`Mercari publish failed:\n${err.message}`);
    } finally {
      setPublishProgress((prev) => {
        const next = { ...prev };
        delete next[listing.id];
        return next;
      });
    }
  }

  async function publishToFacebook(listing: ListingDraft) {
    if (!listing.title || !listing.price) {
      alert("Title and price are required");
      return;
    }
    if (!marketplaceStatus.facebook?.connected) {
      alert("Connect your Facebook account first");
      return;
    }

    await updateListing(listing.id, { status: "listing" });
    const steps = ["start", "fill", "photos", "submit"] as const;
    const stepLabels: Record<string, string> = {
      start: "Opening Facebook...",
      fill: "Filling details...",
      photos: "Uploading photos...",
      submit: "Submitting listing...",
    };

    let scrapeId = "";

    try {
      for (const step of steps) {
        setPublishProgress((prev) => ({ ...prev, [listing.id]: stepLabels[step] }));

        const res = await fetch("/api/listings/publish/facebook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId: listing.id, scrapeId, step }),
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || `Step "${step}" failed`);
        }

        if (data.scrapeId) scrapeId = data.scrapeId;

        if (step === "submit") {
          await updateListing(listing.id, {
            status: "listed",
            facebookListingUrl: data.listingUrl,
          });
        }
      }
    } catch (err: any) {
      console.error("Facebook publish error:", err);
      await updateListing(listing.id, {
        status: "error",
        error: `Facebook: ${err.message}`,
      });
    } finally {
      setPublishProgress((prev) => {
        const next = { ...prev };
        delete next[listing.id];
        return next;
      });
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handlePhotoUpload(e.dataTransfer.files);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const drafts = listings.filter((l) => l.status !== "listed");
  const listed = listings.filter((l) => l.status === "listed");

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Tag className="h-6 w-6 text-orange-600" />
          Listings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload photos, AI generates listing details, publish to marketplaces
        </p>
      </div>

      {/* Upload Zone */}
      <Card
        className={cn(
          "border-2 border-dashed transition-colors cursor-pointer",
          uploading ? "border-orange-500 bg-orange-500/5" : "border-muted-foreground/25 hover:border-orange-500/50"
        )}
        onClick={() => !uploading && fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <CardContent className="py-8 sm:py-12 flex flex-col items-center gap-3">
          {uploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
              <p className="text-sm font-medium">Uploading photos...</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-orange-600/10 flex items-center justify-center">
                  <Camera className="h-6 w-6 text-orange-600" />
                </div>
              </div>
              <div className="text-center">
                <p className="font-medium">Add photos to create a listing</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tap to take a photo or select from gallery. Drag & drop also works.
                </p>
              </div>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handlePhotoUpload(e.target.files)}
          />
        </CardContent>
      </Card>

      {/* Marketplace Connections */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground mr-1">Accounts:</span>
            <Button
              size="sm"
              variant={marketplaceStatus.mercari?.connected ? "outline" : "default"}
              className={cn(
                "text-xs h-7",
                marketplaceStatus.mercari?.connected
                  ? "border-green-500 text-green-700"
                  : "bg-red-500 hover:bg-red-600 text-white"
              )}
              onClick={() => connectMarketplace("mercari")}
              disabled={connecting === "mercari"}
            >
              {connecting === "mercari" ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : marketplaceStatus.mercari?.connected ? (
                <Check className="h-3 w-3 mr-1" />
              ) : (
                <Store className="h-3 w-3 mr-1" />
              )}
              {marketplaceStatus.mercari?.connected
                ? `Mercari${marketplaceStatus.mercari.username ? ` (${marketplaceStatus.mercari.username})` : ""}`
                : "Connect Mercari"}
            </Button>
            {marketplaceStatus.mercari?.connected && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-red-600"
                onClick={() => disconnectMarketplace("mercari")}
                disabled={connecting === "mercari"}
                title="Disconnect Mercari"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
            <Button
              size="sm"
              variant={marketplaceStatus.facebook?.connected ? "outline" : "default"}
              className={cn(
                "text-xs h-7",
                marketplaceStatus.facebook?.connected
                  ? "border-green-500 text-green-700"
                  : "bg-blue-500 hover:bg-blue-600 text-white"
              )}
              onClick={() => connectMarketplace("facebook")}
              disabled={connecting === "facebook"}
            >
              {connecting === "facebook" ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : marketplaceStatus.facebook?.connected ? (
                <Check className="h-3 w-3 mr-1" />
              ) : (
                <Facebook className="h-3 w-3 mr-1" />
              )}
              {marketplaceStatus.facebook?.connected
                ? `Facebook${marketplaceStatus.facebook.username ? ` (${marketplaceStatus.facebook.username})` : ""}`
                : "Connect Facebook"}
            </Button>
            {marketplaceStatus.facebook?.connected && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-red-600"
                onClick={() => disconnectMarketplace("facebook")}
                disabled={connecting === "facebook"}
                title="Disconnect Facebook"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
            {pendingConnect && (
              <>
                <Button
                  size="sm"
                  className="text-xs h-7 bg-green-600 hover:bg-green-700 text-white"
                  onClick={verifyConnection}
                  disabled={!!connecting}
                >
                  {connecting ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3 mr-1" />
                  )}
                  I logged in — Verify
                </Button>
                <a
                  href={pendingConnect.liveViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 underline"
                >
                  Re-open login window
                </a>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(pendingConnect.liveViewUrl);
                      alert("Login URL copied. Open it on your Mac to log in.");
                    } catch {
                      prompt("Copy this URL and open it on your Mac:", pendingConnect.liveViewUrl);
                    }
                  }}
                >
                  Copy URL for Mac
                </Button>
              </>
            )}
          </div>
          {pendingConnect && (
            <p className="text-xs text-muted-foreground mt-2">
              Login is easier on desktop. Tap "Copy URL for Mac" and open on your laptop — after logging in once, all future phone publishes will use that saved login automatically.
            </p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Login blocked by reCAPTCHA?</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setCookieImport({ platform: "mercari", text: "" })}
            >
              Import Mercari cookies
            </Button>
          </div>
        </CardContent>
      </Card>

      {cookieImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <CardContent className="py-4 space-y-3">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-sm">Import {cookieImport.platform} cookies</h3>
                <button onClick={() => setCookieImport(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="text-xs text-muted-foreground space-y-2">
                <p>Mercari uses cookies AND localStorage for auth. Import both.</p>
                <p className="font-medium text-foreground">1) Cookies (from Cookie-Editor extension)</p>
                <p>
                  Install{" "}
                  <a className="text-blue-600 underline" href="https://chrome.google.com/webstore/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm" target="_blank" rel="noopener noreferrer">
                    Cookie-Editor
                  </a>
                  , log into {cookieImport.platform} in Chrome, click the extension icon → Export → Export as JSON, paste below.
                </p>
              </div>
              <Textarea
                placeholder='Cookie-Editor JSON: [{"name":"...","value":"...",...}]'
                value={cookieImport.text}
                onChange={(e) => setCookieImport({ ...cookieImport, text: e.target.value })}
                className="font-mono text-xs min-h-[140px]"
              />
              <div className="text-xs text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">2) localStorage (from DevTools console)</p>
                <p>
                  On the {cookieImport.platform} tab, open DevTools (⌘⌥I) → Console, paste this snippet, press Enter (auto-copies to clipboard):
                </p>
                <div className="flex items-start gap-1">
                  <code className="block flex-1 bg-muted p-2 rounded text-[10px] break-all select-all">
                    {LOCALSTORAGE_SNIPPET}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs shrink-0"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(LOCALSTORAGE_SNIPPET);
                        alert("Snippet copied.");
                      } catch {}
                    }}
                  >
                    Copy
                  </Button>
                </div>
                <p>Then paste what&apos;s on your clipboard below.</p>
              </div>
              <Textarea
                placeholder='{"localStorage":{...},"origin":"https://www.mercari.com"}'
                value={cookieImportLS}
                onChange={(e) => setCookieImportLS(e.target.value)}
                className="font-mono text-xs min-h-[100px]"
              />
              <div className="flex items-center gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => { setCookieImport(null); setCookieImportLS(""); }} disabled={importingCookies}>
                  Cancel
                </Button>
                <Button size="sm" onClick={importCookies} disabled={importingCookies || !cookieImport.text.trim()}>
                  {importingCookies ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                  Import
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Listings */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : listings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ImageIcon className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">No listings yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload photos above to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="drafts">
          <TabsList>
            <TabsTrigger value="drafts">Drafts ({drafts.length})</TabsTrigger>
            <TabsTrigger value="listed">Listed ({listed.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="drafts" className="mt-4 space-y-4">
            {drafts.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Check className="h-6 w-6 mx-auto mb-2 text-green-500" />
                  <p className="text-sm text-muted-foreground">No drafts. Upload photos to start a new listing.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => {
                      const allSelected = drafts.every((d) => selectedIds.has(d.id));
                      if (allSelected) setSelectedIds(new Set());
                      else setSelectedIds(new Set(drafts.map((d) => d.id)));
                    }}
                  >
                    {drafts.every((d) => selectedIds.has(d.id)) ? "Deselect all" : "Select all"}
                  </Button>
                  {selectedIds.size > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs border-red-300 text-red-600 hover:bg-red-50"
                      onClick={deleteSelected}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete selected ({selectedIds.size})
                    </Button>
                  )}
                </div>
                {drafts.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    expanded={expanded.has(listing.id)}
                    analyzing={analyzing === listing.id}
                    selected={selectedIds.has(listing.id)}
                    onToggleSelect={() => toggleSelected(listing.id)}
                    onToggleExpand={() => toggleExpand(listing.id)}
                    onUpdate={(updates) => updateListing(listing.id, updates)}
                    onDelete={() => deleteListing(listing.id)}
                    onPublishEbay={() => publishToEbay(listing)}
                    onPublishMercari={() => publishToMercari(listing)}
                    onPublishFacebook={() => publishToFacebook(listing)}
                    onReanalyze={() => analyzePhotos(listing.id, listing.photos)}
                    marketplaceStatus={marketplaceStatus}
                    publishProgress={publishProgress[listing.id]}
                  />
                ))}
              </>
            )}
          </TabsContent>

          <TabsContent value="listed" className="mt-4 space-y-4">
            {listed.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <ShoppingBag className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No listed items yet.</p>
                </CardContent>
              </Card>
            ) : (
              listed.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  expanded={expanded.has(listing.id)}
                  analyzing={false}
                  onToggleExpand={() => toggleExpand(listing.id)}
                  onUpdate={(updates) => updateListing(listing.id, updates)}
                  onDelete={() => deleteListing(listing.id)}
                  onPublishEbay={() => {}}
                  onPublishMercari={() => {}}
                  onPublishFacebook={() => {}}
                  onReanalyze={() => {}}
                  marketplaceStatus={marketplaceStatus}
                  publishProgress={undefined}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function ListingCard({
  listing,
  expanded,
  analyzing,
  selected,
  onToggleSelect,
  onToggleExpand,
  onUpdate,
  onDelete,
  onPublishEbay,
  onPublishMercari,
  onPublishFacebook,
  onReanalyze,
  marketplaceStatus,
  publishProgress,
}: {
  listing: ListingDraft;
  expanded: boolean;
  analyzing: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<ListingDraft>) => void;
  onDelete: () => void;
  onPublishEbay: () => void;
  onPublishMercari: () => void;
  onPublishFacebook: () => void;
  onReanalyze: () => void;
  marketplaceStatus: MarketplaceStatus;
  publishProgress?: string;
}) {
  const [editTitle, setEditTitle] = useState(listing.title);
  const [editDesc, setEditDesc] = useState(listing.description);
  const [editPrice, setEditPrice] = useState(listing.price?.toString() || "");
  const [editQuantity, setEditQuantity] = useState((listing.quantity || 1).toString());
  const [editCondition, setEditCondition] = useState(listing.condition);
  const [editCategory, setEditCategory] = useState(listing.category);
  const [editWeight, setEditWeight] = useState((listing.weightOz ?? "").toString());
  const [editLength, setEditLength] = useState((listing.lengthIn ?? "").toString());
  const [editWidth, setEditWidth] = useState((listing.widthIn ?? "").toString());
  const [editHeight, setEditHeight] = useState((listing.heightIn ?? "").toString());
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    new Set(listing.platforms)
  );

  // Sync local state when listing updates (e.g., after AI analysis)
  useEffect(() => {
    setEditTitle(listing.title);
    setEditDesc(listing.description);
    setEditPrice(listing.price?.toString() || "");
    setEditQuantity((listing.quantity || 1).toString());
    setEditCondition(listing.condition);
    setEditCategory(listing.category);
    setEditWeight((listing.weightOz ?? "").toString());
    setEditLength((listing.lengthIn ?? "").toString());
    setEditWidth((listing.widthIn ?? "").toString());
    setEditHeight((listing.heightIn ?? "").toString());
  }, [listing.title, listing.description, listing.price, listing.quantity, listing.condition, listing.category, listing.weightOz, listing.lengthIn, listing.widthIn, listing.heightIn]);

  function saveEdits() {
    onUpdate({
      title: editTitle,
      description: editDesc,
      price: editPrice ? parseFloat(editPrice) : null,
      quantity: editQuantity ? parseInt(editQuantity) : 1,
      condition: editCondition,
      category: editCategory,
      platforms: Array.from(selectedPlatforms) as any,
      weightOz: editWeight ? parseFloat(editWeight) : undefined,
      lengthIn: editLength ? parseFloat(editLength) : undefined,
      widthIn: editWidth ? parseFloat(editWidth) : undefined,
      heightIn: editHeight ? parseFloat(editHeight) : undefined,
    });
  }

  function togglePlatform(platform: string) {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  }

  const statusColors: Record<string, string> = {
    draft: "bg-gray-500/10 text-gray-500",
    analyzing: "bg-purple-500/10 text-purple-500",
    ready: "bg-green-500/10 text-green-500",
    listing: "bg-orange-500/10 text-orange-500",
    listed: "bg-blue-500/10 text-blue-500",
    error: "bg-red-500/10 text-red-500",
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Photo strip */}
        <div className="flex gap-1 p-2 overflow-x-auto bg-muted/30">
          {listing.photos.map((photo, i) => (
            <img
              key={i}
              src={photo}
              alt={`Photo ${i + 1}`}
              className="h-20 w-20 sm:h-24 sm:w-24 object-cover rounded-lg shrink-0"
            />
          ))}
        </div>

        {/* Header */}
        <div className="p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            {onToggleSelect && (
              <Checkbox
                checked={!!selected}
                onCheckedChange={onToggleSelect}
                className="mt-1 shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <button
                onClick={onToggleExpand}
                className="font-medium text-sm text-left hover:text-orange-600 transition-colors"
              >
                {listing.title || "Untitled listing"}
              </button>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge className={cn("text-xs", statusColors[listing.status])}>
                  {listing.status === "analyzing" && (
                    <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
                  )}
                  {listing.status}
                </Badge>
                {listing.price && (
                  <span className="text-sm font-semibold text-green-600">
                    ${listing.price.toFixed(2)}
                  </span>
                )}
                {listing.aiAnalysis?.confidence && (
                  <Badge variant="outline" className="text-xs">
                    <Sparkles className="h-2.5 w-2.5 mr-1" />
                    AI {listing.aiAnalysis.confidence}
                  </Badge>
                )}
              </div>
              {listing.error && (
                <p className="text-xs text-red-500 mt-1">{listing.error}</p>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 shrink-0"
              onClick={onToggleExpand}
            >
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          {/* Expanded editor */}
          {expanded && (
            <div className="mt-4 space-y-4">
              {/* Title */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Title
                </label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Product title..."
                  maxLength={80}
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground mt-0.5 text-right">
                  {editTitle.length}/80
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Description
                </label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Describe the item..."
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Price + Condition row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Price
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      placeholder="0.00"
                      className="pl-7 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Qty
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(e.target.value)}
                    placeholder="1"
                    className="text-sm w-20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Condition
                  </label>
                  <select
                    value={editCondition}
                    onChange={(e) => setEditCondition(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Select...</option>
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Category
                </label>
                <Input
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  placeholder="e.g. Electronics > Video Games > Controllers"
                  className="text-sm"
                />
              </div>

              {/* Package size + weight (for Mercari shipping) */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Package (AI estimate — used for Mercari shipping)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  <Input
                    value={editWeight}
                    onChange={(e) => setEditWeight(e.target.value)}
                    placeholder="oz"
                    className="text-xs"
                    inputMode="decimal"
                  />
                  <Input
                    value={editLength}
                    onChange={(e) => setEditLength(e.target.value)}
                    placeholder="L (in)"
                    className="text-xs"
                    inputMode="decimal"
                  />
                  <Input
                    value={editWidth}
                    onChange={(e) => setEditWidth(e.target.value)}
                    placeholder="W (in)"
                    className="text-xs"
                    inputMode="decimal"
                  />
                  <Input
                    value={editHeight}
                    onChange={(e) => setEditHeight(e.target.value)}
                    placeholder="H (in)"
                    className="text-xs"
                    inputMode="decimal"
                  />
                </div>
              </div>

              {/* Platform selection */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">
                  List on
                </label>
                <div className="flex gap-2 flex-wrap">
                  {(Object.entries(PLATFORM_INFO) as [string, typeof PLATFORM_INFO.ebay][]).map(
                    ([key, info]) => {
                      const Icon = info.icon;
                      const selected = selectedPlatforms.has(key);
                      return (
                        <button
                          key={key}
                          onClick={() => togglePlatform(key)}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-all",
                            selected
                              ? `${info.color} border-current font-medium`
                              : "border-border text-muted-foreground hover:border-muted-foreground"
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {info.label}
                          <span className="text-xs opacity-60">({info.fee})</span>
                          {selected && <Check className="h-3 w-3" />}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
                <Button
                  size="sm"
                  onClick={() => {
                    saveEdits();
                  }}
                  variant="outline"
                  className="text-xs"
                >
                  Save Draft
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={onReanalyze}
                  disabled={analyzing}
                >
                  {analyzing ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3 mr-1" />
                  )}
                  {analyzing ? "Analyzing..." : "Re-analyze"}
                </Button>

                {listing.status === "error" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() =>
                      onUpdate({
                        status: "ready",
                        error: null as any,
                        mercariError: null as any,
                      })
                    }
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset Draft
                  </Button>
                )}

                {listing.status === "listed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() =>
                      onUpdate({
                        status: "ready",
                        mercariListingUrl: null as any,
                        facebookListingUrl: null as any,
                        ebayListingId: null as any,
                      })
                    }
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Move to Drafts
                  </Button>
                )}

                {selectedPlatforms.has("ebay") && listing.status !== "listed" && (
                  <Button
                    size="sm"
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => {
                      saveEdits();
                      setTimeout(onPublishEbay, 100);
                    }}
                    disabled={listing.status === "listing"}
                  >
                    {listing.status === "listing" ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <ShoppingBag className="h-3 w-3 mr-1" />
                    )}
                    {listing.status === "listing" ? "Publishing..." : "Publish to eBay"}
                  </Button>
                )}

                {selectedPlatforms.has("mercari") && listing.status !== "listed" && (
                  <Button
                    size="sm"
                    className="text-xs bg-red-500 hover:bg-red-600 text-white"
                    onClick={() => {
                      saveEdits();
                      setTimeout(onPublishMercari, 100);
                    }}
                    disabled={listing.status === "listing" || !marketplaceStatus.mercari?.connected}
                  >
                    {listing.status === "listing" && publishProgress ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Store className="h-3 w-3 mr-1" />
                    )}
                    {!marketplaceStatus.mercari?.connected
                      ? "Connect Mercari"
                      : publishProgress || "Draft to Mercari"}
                  </Button>
                )}

                {selectedPlatforms.has("facebook") && listing.status !== "listed" && (
                  <Button
                    size="sm"
                    className="text-xs bg-blue-500 hover:bg-blue-600 text-white"
                    onClick={() => {
                      saveEdits();
                      setTimeout(onPublishFacebook, 100);
                    }}
                    disabled={listing.status === "listing" || !marketplaceStatus.facebook?.connected}
                  >
                    {listing.status === "listing" && publishProgress ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Facebook className="h-3 w-3 mr-1" />
                    )}
                    {!marketplaceStatus.facebook?.connected
                      ? "Connect Facebook"
                      : publishProgress || "Publish to Facebook"}
                  </Button>
                )}

                <div className="flex-1" />

                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-destructive hover:bg-destructive/10"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete
                </Button>
              </div>

              {/* Listed links */}
              {listing.status === "listed" && (
                <div className="flex gap-2 flex-wrap">
                  {listing.ebayListingId && (
                    <a
                      href={`https://www.ebay.com/itm/${listing.ebayListingId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-xs text-blue-600 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View on eBay
                    </a>
                  )}
                  {listing.mercariListingUrl && (
                    <a
                      href={listing.mercariListingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-xs text-red-500 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View on Mercari
                    </a>
                  )}
                  {listing.facebookListingUrl && (
                    <a
                      href={listing.facebookListingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-xs text-blue-500 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View on Facebook
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

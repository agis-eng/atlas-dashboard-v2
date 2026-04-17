"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Sparkles, Loader2, ExternalLink, Download } from "lucide-react";

interface Listing {
  id: string;
  title: string;
  price: number | null;
  photos: string[];
  category: string;
  brand?: string;
  condition: string;
  platforms: string[];
  status: string;
  ebayListingId?: string;
  mercariListingUrl?: string;
  facebookListingUrl?: string;
  createdAt: string;
  updatedAt: string;
}

function daysSince(iso: string) {
  const d = new Date(iso);
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function ebayUrl(id: string) {
  return `https://www.ebay.com/itm/${id}`;
}

export default function InventoryPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string>("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/listings");
        const data = await res.json();
        setListings((data.listings || []).filter((l: Listing) => l.status === "listed"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalAsking = listings.reduce((sum, l) => sum + (l.price || 0), 0);
  const avgPrice =
    listings.length > 0 ? totalAsking / listings.length : 0;
  const oldestDays =
    listings.length > 0
      ? Math.max(...listings.map((l) => daysSince(l.createdAt)))
      : 0;

  async function runAnalysis() {
    setAnalyzing(true);
    setAnalysis("");
    try {
      const res = await fetch("/api/listings/analyze-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok) setAnalysis(data.analysis || "(no analysis returned)");
      else setAnalysis(`Error: ${data.error || "analysis failed"}`);
    } catch (err: any) {
      setAnalysis(`Error: ${err?.message || err}`);
    }
    setAnalyzing(false);
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package className="h-6 w-6 text-orange-600" />
          Inventory
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          All current listings across eBay, Mercari, and Facebook Marketplace.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">Active listings</div>
            <div className="text-2xl font-bold">{listings.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">Total asking $</div>
            <div className="text-2xl font-bold">${totalAsking.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">Avg price</div>
            <div className="text-2xl font-bold">${avgPrice.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">Oldest (days)</div>
            <div className="text-2xl font-bold">{oldestDays}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          onClick={runAnalysis}
          disabled={analyzing || listings.length === 0}
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          {analyzing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {analyzing ? "Analyzing…" : "AI Price Analysis"}
        </Button>

        <Button
          variant="outline"
          disabled={importing}
          onClick={async () => {
            setImporting(true);
            try {
              const res = await fetch("/api/listings/import-mercari", { method: "POST" });
              const data = await res.json();
              if (res.ok) {
                const msg = [
                  `Mercari import:`,
                  ``,
                  `Found ${data.scrapedCount} listings.`,
                  `Imported ${data.importedCount} new items.`,
                  `Skipped ${data.skippedCount} already in dashboard.`,
                ];
                if (data.firstCardPreview) {
                  msg.push("");
                  msg.push("First card preview (for debugging):");
                  msg.push(data.firstCardPreview);
                }
                alert(msg.join("\n"));
                window.location.reload();
              } else {
                alert(`Import failed: ${data.details || data.error}`);
              }
            } catch (err: any) {
              alert(`Import error: ${err?.message || err}`);
            }
            setImporting(false);
          }}
        >
          {importing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          {importing ? "Importing…" : "Import from Mercari"}
        </Button>

        <span className="text-xs text-muted-foreground">
          Claude reviews pricing; Import pulls existing Mercari listings into the dashboard.
        </span>
      </div>

      {analysis && (
        <Card>
          <CardContent className="py-4">
            <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">
              {analysis}
            </pre>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : listings.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No active listings yet. Head to Listings to publish items.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Photo</th>
                <th className="py-2 pr-3">Title</th>
                <th className="py-2 pr-3 text-right">Price</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">Platforms</th>
                <th className="py-2 pr-3 text-right">Days</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.id} className="border-b hover:bg-muted/30">
                  <td className="py-2 pr-3">
                    {l.photos?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={l.photos[0]}
                        alt=""
                        className="w-12 h-12 object-cover rounded"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-muted" />
                    )}
                  </td>
                  <td className="py-2 pr-3 max-w-sm">
                    <Link
                      href={`/listings?id=${l.id}`}
                      className="font-medium hover:underline line-clamp-2"
                    >
                      {l.title}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-right font-semibold">
                    ${(l.price || 0).toFixed(2)}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground max-w-xs truncate">
                    {l.category}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex gap-1 flex-wrap">
                      {l.ebayListingId && (
                        <a
                          href={ebayUrl(l.ebayListingId)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-700 hover:bg-blue-500/20"
                        >
                          eBay <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {l.mercariListingUrl && (
                        <a
                          href={l.mercariListingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-700 hover:bg-red-500/20"
                        >
                          Mercari <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {l.facebookListingUrl && (
                        <a
                          href={l.facebookListingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-blue-600/10 text-blue-700 hover:bg-blue-600/20"
                        >
                          Facebook <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right text-xs text-muted-foreground">
                    {daysSince(l.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

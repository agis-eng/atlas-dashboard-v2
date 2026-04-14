"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import {
  Search,
  Settings,
  ShoppingBag,
  FileText,
  PlusCircle,
  Package,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Trash2,
  ExternalLink,
  Truck,
  Image as ImageIcon,
  Tag,
  DollarSign,
  Hash,
  ChevronDown,
  ChevronUp,
  Eye,
  Send,
  X,
  Pencil,
  Copy,
  Upload,
  Camera,
  Sparkles,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EbayOffer {
  offerId: string;
  sku: string;
  marketplaceId: string;
  format: string;
  listingDescription?: string;
  availableQuantity?: number;
  categoryId?: string;
  listing?: { listingId: string };
  pricingSummary?: {
    price?: { value: string; currency: string };
  };
  status?: string;
}

interface InventoryItem {
  sku: string;
  locale?: string;
  product?: {
    title?: string;
    description?: string;
    imageUrls?: string[];
    aspects?: Record<string, string[]>;
    upc?: string[];
  };
  condition?: string;
  availability?: {
    shipToLocationAvailability?: {
      quantity?: number;
    };
  };
}

interface EbayOrder {
  orderId: string;
  creationDate: string;
  orderFulfillmentStatus: string;
  orderPaymentStatus: string;
  pricingSummary?: {
    total?: { value: string; currency: string };
  };
  buyer?: {
    username?: string;
  };
  lineItems?: {
    title?: string;
    quantity?: number;
    lineItemId?: string;
    total?: { value: string; currency: string };
    sku?: string;
  }[];
  fulfillmentStartInstructions?: {
    shippingStep?: {
      shipTo?: {
        fullName?: string;
        contactAddress?: {
          addressLine1?: string;
          city?: string;
          stateOrProvince?: string;
          postalCode?: string;
          countryCode?: string;
        };
      };
    };
  }[];
}

interface DraftListing {
  id: string;
  sku: string;
  title: string;
  description: string;
  price: string;
  quantity: number;
  condition: string;
  categoryId: string;
  imageUrls: string[];
  weightLbs?: string;
  lengthIn?: string;
  widthIn?: string;
  heightIn?: string;
}

type Tab = "settings" | "listings" | "drafts" | "create" | "orders";

const TABS: { key: Tab; label: string; icon: typeof Settings }[] = [
  { key: "settings", label: "Settings", icon: Settings },
  { key: "listings", label: "Active Listings", icon: ShoppingBag },
  { key: "drafts", label: "Drafts", icon: FileText },
  { key: "create", label: "Create Listing", icon: PlusCircle },
  { key: "orders", label: "Orders", icon: Package },
];

const CONDITIONS = [
  { value: "NEW", label: "New" },
  { value: "LIKE_NEW", label: "Like New" },
  { value: "NEW_OTHER", label: "New (Other)" },
  { value: "NEW_WITH_DEFECTS", label: "New with Defects" },
  { value: "MANUFACTURER_REFURBISHED", label: "Manufacturer Refurbished" },
  { value: "CERTIFIED_REFURBISHED", label: "Certified Refurbished" },
  { value: "VERY_GOOD", label: "Very Good" },
  { value: "GOOD", label: "Good" },
  { value: "ACCEPTABLE", label: "Acceptable" },
  { value: "USED_EXCELLENT", label: "Used - Excellent" },
  { value: "USED_VERY_GOOD", label: "Used - Very Good" },
  { value: "USED_GOOD", label: "Used - Good" },
  { value: "USED_ACCEPTABLE", label: "Used - Acceptable" },
  { value: "FOR_PARTS_OR_NOT_WORKING", label: "For Parts or Not Working" },
];

const CARRIERS = [
  "USPS", "UPS", "FedEx", "DHL", "Other",
];

const DRAFT_STORAGE_KEY = "ebay-drafts";

// ─── Component ──────────────────────────────────────────────────────────────

export default function EbayPage() {
  const [activeTab, setActiveTab] = useState<Tab>("settings");

  // Settings
  const [environment, setEnvironment] = useState<"production" | "sandbox">("production");
  const [connectionStatus, setConnectionStatus] = useState<"untested" | "testing" | "connected" | "failed">("untested");
  const [connectionError, setConnectionError] = useState("");

  // Listings
  const [listings, setListings] = useState<EbayOffer[]>([]);
  const [inventory, setInventory] = useState<Record<string, InventoryItem>>({});
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsSearch, setListingsSearch] = useState("");
  const [endingListing, setEndingListing] = useState<string | null>(null);

  // Drafts
  const [drafts, setDrafts] = useState<DraftListing[]>([]);
  const [publishingDraft, setPublishingDraft] = useState<string | null>(null);

  // Create
  const [createForm, setCreateForm] = useState({
    sku: "",
    title: "",
    description: "",
    price: "",
    quantity: 1,
    condition: "NEW",
    categoryId: "",
    categorySearch: "",
    imageUrls: [""],
    upc: "",
    weightLbs: "",
    lengthIn: "",
    widthIn: "",
    heightIn: "",
  });
  const [categorySuggestions, setCategorySuggestions] = useState<{ category: { categoryId: string; categoryName: string } }[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createResult, setCreateResult] = useState<{ success?: boolean; error?: string } | null>(null);

  // Photo upload + AI
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState("");

  // Orders
  const [orders, setOrders] = useState<EbayOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersSearch, setOrdersSearch] = useState("");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [shipForm, setShipForm] = useState<{ orderId: string; trackingNumber: string; carrier: string } | null>(null);
  const [shipping, setShipping] = useState(false);

  // Check OAuth connection status + load drafts on mount
  useEffect(() => {
    checkConnection();
    const savedDrafts = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (savedDrafts) {
      try { setDrafts(JSON.parse(savedDrafts)); } catch { /* ignore */ }
    }
    // Check for OAuth callback params
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "true") {
      setConnectionStatus("connected");
      window.history.replaceState({}, "", "/ebay");
    }
    if (params.get("error")) {
      setConnectionStatus("failed");
      setConnectionError(params.get("error") || "Authorization failed");
      window.history.replaceState({}, "", "/ebay");
    }
  }, []);

  // Save drafts
  useEffect(() => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
  }, [drafts]);

  // ─── API Helpers ───────────────────────────────────────────────────────

  const apiGet = useCallback(async (action: string, extra: Record<string, string> = {}) => {
    const params = new URLSearchParams({ action, env: environment, ...extra });
    const res = await fetch(`/api/ebay?${params}`);
    return res.json();
  }, [environment]);

  const apiPost = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    const res = await fetch("/api/ebay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, env: environment, ...payload }),
    });
    return res.json();
  }, [environment]);

  // ─── Settings ──────────────────────────────────────────────────────────

  async function checkConnection() {
    setConnectionStatus("testing");
    setConnectionError("");
    try {
      const res = await fetch("/api/ebay/auth?action=status");
      const data = await res.json();
      if (data.connected) {
        const test = await apiGet("test-connection");
        if (test.connected) {
          setConnectionStatus("connected");
        } else {
          // Try refreshing token
          const refreshRes = await fetch("/api/ebay/auth?action=token");
          if (refreshRes.ok) {
            const retest = await apiGet("test-connection");
            setConnectionStatus(retest.connected ? "connected" : "failed");
            if (!retest.connected) setConnectionError(retest.error || "Connection failed after refresh");
          } else {
            setConnectionStatus("failed");
            setConnectionError("Token expired. Please reconnect.");
          }
        }
      } else {
        setConnectionStatus("untested");
      }
    } catch {
      setConnectionStatus("untested");
    }
  }

  function connectEbay() {
    window.location.href = "/api/ebay/auth?action=login";
  }

  // ─── Photo Upload + AI ─────────────────────────────────────────────────

  async function handlePhotoUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setPhotoError("");

    const allUrls: string[] = [];
    const allErrors: string[] = [];

    // Upload one at a time to avoid Vercel's 4.5MB body limit
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("photos", file);

      try {
        const res = await fetch("/api/ebay/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (data.urls?.length) allUrls.push(...data.urls);
        if (data.errors?.length) allErrors.push(...data.errors);
        if (data.error) allErrors.push(data.error);
      } catch {
        allErrors.push(`${file.name}: Upload failed`);
      }
    }

    if (allErrors.length) setPhotoError(allErrors.join("; "));
    if (allUrls.length) {
      const newPhotos = [...uploadedPhotos, ...allUrls];
      setUploadedPhotos(newPhotos);
      setCreateForm((prev) => ({ ...prev, imageUrls: newPhotos }));
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function analyzePhotos() {
    if (!uploadedPhotos.length) return;
    setAnalyzing(true);
    setPhotoError("");

    try {
      const res = await fetch("/api/ebay/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrls: uploadedPhotos }),
      });
      const data = await res.json();

      if (data.error) {
        setPhotoError(data.error);
        return;
      }

      // Auto-fill the form with AI suggestions
      setCreateForm((prev) => ({
        ...prev,
        title: data.title || prev.title,
        description: data.description || prev.description,
        price: data.price || prev.price,
        condition: data.condition || prev.condition,
        categorySearch: data.categoryKeywords || prev.categorySearch,
        sku: prev.sku || `AI-${Date.now().toString(36).toUpperCase()}`,
        weightLbs: data.shipping?.weightLbs ? String(data.shipping.weightLbs) : prev.weightLbs,
        lengthIn: data.shipping?.lengthIn ? String(data.shipping.lengthIn) : prev.lengthIn,
        widthIn: data.shipping?.widthIn ? String(data.shipping.widthIn) : prev.widthIn,
        heightIn: data.shipping?.heightIn ? String(data.shipping.heightIn) : prev.heightIn,
      }));

      // Auto-search for category and select the first match
      if (data.categoryKeywords) {
        try {
          const catData = await apiGet("categories", { q: data.categoryKeywords });
          const suggestions = catData.categorySuggestions || [];
          setCategorySuggestions(suggestions);
          if (suggestions.length > 0) {
            setCreateForm((prev) => ({
              ...prev,
              categoryId: suggestions[0].category.categoryId,
              categorySearch: suggestions[0].category.categoryName,
            }));
          }
        } catch {
          searchCategories(data.categoryKeywords);
        }
      }

      // Save to shared listings store so it's available on Mercari/Facebook page
      try {
        await fetch("/api/listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photos: uploadedPhotos,
            title: data.title || "",
            description: data.description || "",
            price: data.price ? parseFloat(data.price) : null,
            quantity: 1,
            condition: data.condition || "NEW",
            category: data.categoryKeywords || "",
            platforms: ["ebay"],
            status: "ready",
            aiAnalysis: {
              suggestedTitle: data.title || "",
              suggestedDescription: data.description || "",
              suggestedPrice: data.price ? parseFloat(data.price) : 0,
              suggestedCategory: data.categoryKeywords || "",
              suggestedCondition: data.condition || "NEW",
              confidence: "high",
            },
          }),
        });
      } catch {
        // Non-critical — listing still works on eBay
      }
    } catch {
      setPhotoError("AI analysis failed. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  function removePhoto(idx: number) {
    const newPhotos = uploadedPhotos.filter((_, i) => i !== idx);
    setUploadedPhotos(newPhotos);
    setCreateForm((prev) => ({ ...prev, imageUrls: newPhotos.length ? newPhotos : [""] }));
  }

  // ─── Listings ──────────────────────────────────────────────────────────

  async function loadListings() {
    setListingsLoading(true);
    try {
      const [offersData, inventoryData] = await Promise.all([
        apiGet("active-listings"),
        apiGet("inventory"),
      ]);
      setListings(offersData.offers || []);
      const invMap: Record<string, InventoryItem> = {};
      for (const item of inventoryData.inventoryItems || inventoryData.inventoryItem || []) {
        invMap[item.sku] = item;
      }
      setInventory(invMap);
    } catch {
      console.error("Failed to load listings");
    } finally {
      setListingsLoading(false);
    }
  }

  async function endListing(offerId: string) {
    setEndingListing(offerId);
    try {
      await apiPost("end-listing", { offerId });
      setListings((prev) => prev.filter((l) => l.offerId !== offerId));
    } catch {
      console.error("Failed to end listing");
    } finally {
      setEndingListing(null);
    }
  }

  const filteredListings = listings.filter((l) => {
    if (!listingsSearch) return true;
    const q = listingsSearch.toLowerCase();
    const inv = inventory[l.sku];
    return (
      l.sku.toLowerCase().includes(q) ||
      inv?.product?.title?.toLowerCase().includes(q) ||
      l.offerId.toLowerCase().includes(q)
    );
  });

  // ─── Create Listing ────────────────────────────────────────────────────

  async function searchCategories(q: string) {
    if (q.length < 3) { setCategorySuggestions([]); return; }
    setCategoryLoading(true);
    try {
      const data = await apiGet("categories", { q });
      setCategorySuggestions(data.categorySuggestions || []);
    } catch {
      setCategorySuggestions([]);
    } finally {
      setCategoryLoading(false);
    }
  }

  function saveAsDraft() {
    const draft: DraftListing = {
      id: crypto.randomUUID(),
      sku: createForm.sku,
      title: createForm.title,
      description: createForm.description,
      price: createForm.price,
      quantity: createForm.quantity,
      condition: createForm.condition,
      categoryId: createForm.categoryId,
      imageUrls: createForm.imageUrls.filter(Boolean),
    };
    setDrafts((prev) => [...prev, draft]);
    resetCreateForm();
    setCreateResult({ success: true });
    setTimeout(() => setCreateResult(null), 3000);
  }

  async function submitListing() {
    setCreateSubmitting(true);
    setCreateResult(null);
    try {
      // Step 1: Create inventory item
      const hasShipping = createForm.weightLbs && createForm.lengthIn && createForm.widthIn && createForm.heightIn;
      const invResult = await apiPost("create-inventory-item", {
        sku: createForm.sku,
        product: {
          title: createForm.title,
          description: createForm.description,
          imageUrls: createForm.imageUrls.filter(Boolean),
          ...(createForm.upc ? { upc: [createForm.upc] } : {}),
        },
        condition: createForm.condition,
        availability: {
          shipToLocationAvailability: {
            quantity: createForm.quantity,
          },
        },
        ...(hasShipping ? {
          packageWeightAndSize: {
            weight: {
              value: parseFloat(createForm.weightLbs),
              unit: "POUND",
            },
            dimensions: {
              length: parseFloat(createForm.lengthIn),
              width: parseFloat(createForm.widthIn),
              height: parseFloat(createForm.heightIn),
              unit: "INCH",
            },
            packageType: "PACKAGE",
          },
        } : {}),
      });

      if (invResult.error || invResult.errors) {
        setCreateResult({ error: invResult.errors?.[0]?.message || invResult.error || "Failed to create inventory item" });
        return;
      }

      // Step 2: Create offer
      const offerResult = await apiPost("create-offer", {
        sku: createForm.sku,
        marketplaceId: "EBAY_US",
        format: "FIXED_PRICE",
        availableQuantity: createForm.quantity,
        categoryId: createForm.categoryId,
        listingDescription: createForm.description,
        countryCode: "US",
        merchantLocationKey: "default",
        pricingSummary: {
          price: {
            value: String(createForm.price),
            currency: "USD",
          },
        },
      });

      if (offerResult.error || offerResult.errors) {
        setCreateResult({ error: offerResult.errors?.[0]?.message || offerResult.error || "Failed to create offer" });
        return;
      }

      // Step 3: Publish the offer
      if (offerResult.offerId) {
        const publishResult = await apiPost("publish-offer", { offerId: offerResult.offerId });
        if (publishResult.error || publishResult.errors) {
          setCreateResult({ error: publishResult.errors?.[0]?.message || publishResult.error || "Failed to publish listing" });
          return;
        }
      }

      setCreateResult({ success: true });
      resetCreateForm();
    } catch {
      setCreateResult({ error: "Submission failed" });
    } finally {
      setCreateSubmitting(false);
    }
  }

  function resetCreateForm() {
    setCreateForm({
      sku: "",
      title: "",
      description: "",
      price: "",
      quantity: 1,
      condition: "NEW",
      categoryId: "",
      categorySearch: "",
      imageUrls: [""],
      upc: "",
      weightLbs: "",
      lengthIn: "",
      widthIn: "",
      heightIn: "",
    });
    setCategorySuggestions([]);
    setUploadedPhotos([]);
    setPhotoError("");
  }

  // ─── Drafts ────────────────────────────────────────────────────────────

  function deleteDraft(id: string) {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }

  function editDraft(draft: DraftListing) {
    setCreateForm({
      sku: draft.sku,
      title: draft.title,
      description: draft.description,
      price: draft.price,
      quantity: draft.quantity,
      condition: draft.condition,
      categoryId: draft.categoryId,
      categorySearch: "",
      imageUrls: draft.imageUrls.length ? draft.imageUrls : [""],
      upc: "",
      weightLbs: draft.weightLbs || "",
      lengthIn: draft.lengthIn || "",
      widthIn: draft.widthIn || "",
      heightIn: draft.heightIn || "",
    });
    deleteDraft(draft.id);
    setActiveTab("create");
  }

  async function publishDraft(draft: DraftListing) {
    setPublishingDraft(draft.id);
    try {
      const invResult = await apiPost("create-inventory-item", {
        sku: draft.sku,
        product: {
          title: draft.title,
          description: draft.description,
          imageUrls: draft.imageUrls,
        },
        condition: draft.condition,
        availability: {
          shipToLocationAvailability: { quantity: draft.quantity },
        },
      });

      if (invResult.error || invResult.errors) return;

      const offerResult = await apiPost("create-offer", {
        sku: draft.sku,
        marketplaceId: "EBAY_US",
        format: "FIXED_PRICE",
        availableQuantity: draft.quantity,
        categoryId: draft.categoryId,
        listingDescription: draft.description,
        countryCode: "US",
        merchantLocationKey: "default",
        pricingSummary: {
          price: { value: String(draft.price), currency: "USD" },
        },
      });

      if (offerResult.offerId) {
        await apiPost("publish-offer", { offerId: offerResult.offerId });
        deleteDraft(draft.id);
      }
    } catch {
      console.error("Failed to publish draft");
    } finally {
      setPublishingDraft(null);
    }
  }

  // ─── Orders ────────────────────────────────────────────────────────────

  async function loadOrders() {
    setOrdersLoading(true);
    try {
      const data = await apiGet("orders");
      setOrders(data.orders || []);
    } catch {
      console.error("Failed to load orders");
    } finally {
      setOrdersLoading(false);
    }
  }

  async function markShipped() {
    if (!shipForm) return;
    setShipping(true);
    try {
      const order = orders.find((o) => o.orderId === shipForm.orderId);
      await apiPost("mark-shipped", {
        orderId: shipForm.orderId,
        trackingNumber: shipForm.trackingNumber,
        carrier: shipForm.carrier,
        lineItems: order?.lineItems?.map((li) => ({
          lineItemId: li.lineItemId,
          quantity: li.quantity,
        })) || [],
      });
      setOrders((prev) =>
        prev.map((o) =>
          o.orderId === shipForm.orderId
            ? { ...o, orderFulfillmentStatus: "FULFILLED" }
            : o
        )
      );
      setShipForm(null);
    } catch {
      console.error("Failed to mark shipped");
    } finally {
      setShipping(false);
    }
  }

  const filteredOrders = orders.filter((o) => {
    if (!ordersSearch) return true;
    const q = ordersSearch.toLowerCase();
    return (
      o.orderId.toLowerCase().includes(q) ||
      o.buyer?.username?.toLowerCase().includes(q) ||
      o.lineItems?.some((li) => li.title?.toLowerCase().includes(q))
    );
  });

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">eBay</h1>
        <p className="text-muted-foreground mt-1">Manage your eBay listings, inventory, and orders</p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-border pb-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                if (tab.key === "listings" && listings.length === 0 && connectionStatus === "connected") loadListings();
                if (tab.key === "orders" && orders.length === 0 && connectionStatus === "connected") loadOrders();
              }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${
                isActive
                  ? "border-orange-600 text-orange-600"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-[500px]">
        {/* ─── Settings Tab ──────────────────────────────────────────── */}
        {activeTab === "settings" && (
          <div className="space-y-6 max-w-2xl">
            {/* Connection Status */}
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <h2 className="text-lg font-semibold">Connection</h2>

              <div className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${
                  connectionStatus === "connected" ? "bg-green-500" :
                  connectionStatus === "failed" ? "bg-red-500" :
                  connectionStatus === "testing" ? "bg-yellow-500 animate-pulse" :
                  "bg-zinc-400"
                }`} />
                <span className="text-sm font-medium">
                  {connectionStatus === "connected" && "Connected to eBay"}
                  {connectionStatus === "failed" && "Connection Failed"}
                  {connectionStatus === "testing" && "Checking..."}
                  {connectionStatus === "untested" && "Not Connected"}
                </span>
              </div>
              {connectionError && (
                <p className="text-xs text-red-500 mt-1">{connectionError}</p>
              )}

              <div className="flex gap-3">
                {connectionStatus === "connected" ? (
                  <>
                    <button
                      onClick={checkConnection}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Test Connection
                    </button>
                    <button
                      onClick={connectEbay}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Reconnect
                    </button>
                  </>
                ) : connectionStatus === "testing" ? (
                  <button
                    disabled
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-600 text-white rounded-lg opacity-50"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking...
                  </button>
                ) : (
                  <button
                    onClick={connectEbay}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Connect eBay Account
                  </button>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                OAuth 2.0 — tokens are stored server-side and auto-refresh when expired.
              </p>
            </div>

            {/* Quick Info */}
            <div className="rounded-lg border border-border bg-card p-6 space-y-3">
              <h2 className="text-lg font-semibold">API Information</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">APIs Used</p>
                  <p className="font-medium mt-0.5">Inventory, Sell, Fulfillment, Taxonomy</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Marketplace</p>
                  <p className="font-medium mt-0.5">EBAY_US</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Listing Format</p>
                  <p className="font-medium mt-0.5">Fixed Price</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Currency</p>
                  <p className="font-medium mt-0.5">USD</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Active Listings Tab ───────────────────────────────────── */}
        {activeTab === "listings" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={listingsSearch}
                  onChange={(e) => setListingsSearch(e.target.value)}
                  placeholder="Search listings..."
                  className="pl-9"
                />
              </div>
              <button
                onClick={loadListings}
                disabled={listingsLoading || connectionStatus !== "connected"}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                {listingsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </button>
            </div>

            {connectionStatus !== "connected" && (
              <div className="rounded-lg border border-border bg-card p-12 text-center">
                <Settings className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Connect your eBay account in Settings first</p>
              </div>
            )}

            {connectionStatus === "connected" && listingsLoading && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-3">
                    <div className="h-32 bg-muted rounded animate-pulse" />
                    <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                    <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
                  </div>
                ))}
              </div>
            )}

            {connectionStatus === "connected" && !listingsLoading && filteredListings.length === 0 && (
              <div className="rounded-lg border border-border bg-card p-12 text-center">
                <ShoppingBag className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">
                  {listings.length === 0 ? "No active listings found" : "No listings match your search"}
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredListings.map((offer) => {
                const inv = inventory[offer.sku];
                const title = inv?.product?.title || offer.sku;
                const image = inv?.product?.imageUrls?.[0];
                const price = offer.pricingSummary?.price;

                return (
                  <div
                    key={offer.offerId}
                    className="rounded-lg border border-border bg-card overflow-hidden hover:shadow-md transition-shadow"
                  >
                    {/* Image */}
                    <div className="h-40 bg-muted flex items-center justify-center overflow-hidden">
                      {image ? (
                        <img src={image} alt={title} className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
                      )}
                    </div>

                    <div className="p-4 space-y-3">
                      <h3 className="text-sm font-semibold leading-snug line-clamp-2">{title}</h3>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5 text-green-500" />
                          <span className="text-lg font-bold">
                            {price ? `${price.value}` : "—"}
                          </span>
                          {price && <span className="text-xs text-muted-foreground">{price.currency}</span>}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Hash className="h-3 w-3" />
                          Qty: {offer.availableQuantity ?? inv?.availability?.shipToLocationAvailability?.quantity ?? "—"}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Tag className="h-3 w-3" />
                        <span className="font-mono">{offer.sku}</span>
                        {offer.status && (
                          <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            offer.status === "PUBLISHED" ? "bg-green-500/10 text-green-500" :
                            "bg-yellow-500/10 text-yellow-500"
                          }`}>
                            {offer.status}
                          </span>
                        )}
                      </div>

                      <div className="flex gap-2 pt-1">
                        {offer.listing?.listingId && (
                          <a
                            href={`https://www.ebay.com/itm/${offer.listing.listingId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-muted rounded-md hover:bg-muted/80 transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View
                          </a>
                        )}
                        <button
                          onClick={() => endListing(offer.offerId)}
                          disabled={endingListing === offer.offerId}
                          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-red-500/10 text-red-500 rounded-md hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                        >
                          {endingListing === offer.offerId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                          End
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Drafts Tab ────────────────────────────────────────────── */}
        {activeTab === "drafts" && (
          <div className="space-y-4">
            {drafts.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-12 text-center">
                <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No drafts yet</p>
                <p className="text-xs text-muted-foreground mt-1">Create a listing and save as draft to see it here</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {drafts.map((draft) => (
                  <div key={draft.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
                    {/* Image preview */}
                    <div className="h-32 bg-muted rounded flex items-center justify-center overflow-hidden">
                      {draft.imageUrls[0] ? (
                        <img src={draft.imageUrls[0]} alt={draft.title} className="h-full w-full object-cover rounded" />
                      ) : (
                        <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                      )}
                    </div>

                    <h3 className="text-sm font-semibold leading-snug line-clamp-2">{draft.title || "Untitled"}</h3>

                    <div className="flex items-center justify-between text-sm">
                      <span className="font-bold">${draft.price || "0.00"}</span>
                      <span className="text-xs text-muted-foreground">Qty: {draft.quantity}</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Tag className="h-3 w-3" />
                      <span className="font-mono">{draft.sku || "No SKU"}</span>
                      <span className="ml-auto px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500 text-[10px] font-medium">
                        DRAFT
                      </span>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => editDraft(draft)}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-muted rounded-md hover:bg-muted/80"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => publishDraft(draft)}
                        disabled={publishingDraft === draft.id || connectionStatus !== "connected"}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
                      >
                        {publishingDraft === draft.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Send className="h-3 w-3" />
                        )}
                        Publish
                      </button>
                      <button
                        onClick={() => deleteDraft(draft.id)}
                        className="flex items-center justify-center px-2 py-1.5 text-xs text-red-500 bg-red-500/10 rounded-md hover:bg-red-500/20"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Create Listing Tab ────────────────────────────────────── */}
        {activeTab === "create" && (
          <div className="max-w-3xl space-y-6">
            {createResult && (
              <div className={`rounded-lg border p-4 flex items-center gap-2 ${
                createResult.success
                  ? "border-green-500/30 bg-green-500/5 text-green-500"
                  : "border-red-500/30 bg-red-500/5 text-red-500"
              }`}>
                {createResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                <span className="text-sm">{createResult.success ? "Listing created successfully!" : createResult.error}</span>
                <button onClick={() => setCreateResult(null)} className="ml-auto"><X className="h-4 w-4" /></button>
              </div>
            )}

            {/* Photo Upload + AI */}
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  Quick List from Photos
                </h2>
                {uploadedPhotos.length > 0 && (
                  <button
                    onClick={analyzePhotos}
                    disabled={analyzing}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
                  >
                    {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {analyzing ? "Analyzing..." : "Generate Listing with AI"}
                  </button>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                Upload product photos and AI will generate the title, description, price, and category for you.
              </p>

              {/* Drop zone / Upload button */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handlePhotoUpload(e.dataTransfer.files); }}
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-orange-600/50 hover:bg-orange-600/5 transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                  multiple
                  className="hidden"
                  onChange={(e) => handlePhotoUpload(e.target.files)}
                />
                {uploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
                    <span className="text-sm text-muted-foreground">Uploading...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm font-medium">Drop photos here or tap to upload</span>
                    <span className="text-xs text-muted-foreground">JPEG, PNG, or WebP up to 10MB each</span>
                  </div>
                )}
              </div>

              {/* Photo previews */}
              {uploadedPhotos.length > 0 && (
                <div className="flex gap-3 flex-wrap">
                  {uploadedPhotos.map((url, idx) => (
                    <div key={idx} className="relative group">
                      <div className="h-24 w-24 rounded-lg border border-border overflow-hidden bg-muted">
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removePhoto(idx); }}
                        className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {photoError && (
                <p className="text-xs text-red-500">{photoError}</p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-6 space-y-5">
              <h2 className="text-lg font-semibold">Listing Details</h2>

              {/* Title */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Title *</label>
                <Input
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="Item title (max 80 characters)"
                  maxLength={80}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">{createForm.title.length}/80</p>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description *</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Detailed item description..."
                  rows={4}
                  className="mt-1 w-full bg-background border border-input rounded-lg px-3 py-2 text-sm resize-y"
                />
              </div>

              {/* Price & Quantity */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Price (USD) *</label>
                  <div className="relative mt-1">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={createForm.price}
                      onChange={(e) => setCreateForm({ ...createForm, price: e.target.value })}
                      placeholder="0.00"
                      className="pl-9"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quantity *</label>
                  <Input
                    type="number"
                    min="1"
                    value={createForm.quantity || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCreateForm({ ...createForm, quantity: val === "" ? 0 : parseInt(val) || 0 });
                    }}
                    onBlur={() => {
                      if (!createForm.quantity || createForm.quantity < 1) {
                        setCreateForm({ ...createForm, quantity: 1 });
                      }
                    }}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* SKU & UPC */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">SKU *</label>
                  <Input
                    value={createForm.sku}
                    onChange={(e) => setCreateForm({ ...createForm, sku: e.target.value })}
                    placeholder="Unique item SKU"
                    className="mt-1 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">UPC</label>
                  <Input
                    value={createForm.upc}
                    onChange={(e) => setCreateForm({ ...createForm, upc: e.target.value })}
                    placeholder="Universal Product Code"
                    className="mt-1 font-mono"
                  />
                </div>
              </div>

              {/* Condition */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Condition *</label>
                <select
                  value={createForm.condition}
                  onChange={(e) => setCreateForm({ ...createForm, condition: e.target.value })}
                  className="mt-1 w-full bg-background border border-input rounded-lg px-3 py-2 text-sm"
                >
                  {CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category</label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={createForm.categorySearch}
                    onChange={(e) => {
                      setCreateForm({ ...createForm, categorySearch: e.target.value });
                      searchCategories(e.target.value);
                    }}
                    placeholder="Search eBay categories..."
                    className="pl-9"
                  />
                  {categoryLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
                {categorySuggestions.length > 0 && (
                  <div className="mt-1 border border-border rounded-lg bg-popover max-h-40 overflow-y-auto">
                    {categorySuggestions.map((cs, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setCreateForm({
                            ...createForm,
                            categoryId: cs.category.categoryId,
                            categorySearch: cs.category.categoryName,
                          });
                          setCategorySuggestions([]);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                      >
                        {cs.category.categoryName}
                        <span className="text-xs text-muted-foreground ml-2">#{cs.category.categoryId}</span>
                      </button>
                    ))}
                  </div>
                )}
                {createForm.categoryId && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Selected: <span className="font-mono">{createForm.categoryId}</span>
                  </p>
                )}
              </div>

              {/* Images */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Photos</label>
                {uploadedPhotos.length > 0 ? (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {uploadedPhotos.map((url, idx) => (
                      <div key={idx} className="h-16 w-16 rounded border border-border overflow-hidden bg-muted">
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </div>
                    ))}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="h-16 w-16 rounded border-2 border-dashed border-border flex items-center justify-center hover:border-orange-600/50 transition-colors"
                    >
                      <PlusCircle className="h-5 w-5 text-muted-foreground" />
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">Upload photos above to attach to this listing.</p>
                )}
              </div>

              {/* Shipping Dimensions */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Shipping (AI Estimated)</label>
                <div className="grid grid-cols-4 gap-3 mt-1">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Weight (lbs)</label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={createForm.weightLbs}
                      onChange={(e) => setCreateForm({ ...createForm, weightLbs: e.target.value })}
                      placeholder="0.0"
                      className="mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Length (in)</label>
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      value={createForm.lengthIn}
                      onChange={(e) => setCreateForm({ ...createForm, lengthIn: e.target.value })}
                      placeholder="0"
                      className="mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Width (in)</label>
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      value={createForm.widthIn}
                      onChange={(e) => setCreateForm({ ...createForm, widthIn: e.target.value })}
                      placeholder="0"
                      className="mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Height (in)</label>
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      value={createForm.heightIn}
                      onChange={(e) => setCreateForm({ ...createForm, heightIn: e.target.value })}
                      placeholder="0"
                      className="mt-0.5"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">AI estimates package dimensions. Verify before publishing — affects shipping cost.</p>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={submitListing}
                  disabled={createSubmitting || !createForm.title || !createForm.sku || !createForm.price || connectionStatus !== "connected"}
                  className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
                >
                  {createSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Create & Publish
                </button>
                <button
                  onClick={saveAsDraft}
                  disabled={!createForm.title}
                  className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium bg-muted rounded-lg hover:bg-muted/80 disabled:opacity-50 transition-colors"
                >
                  <Copy className="h-4 w-4" />
                  Save as Draft
                </button>
                <button
                  onClick={resetCreateForm}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Orders Tab ────────────────────────────────────────────── */}
        {activeTab === "orders" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={ordersSearch}
                  onChange={(e) => setOrdersSearch(e.target.value)}
                  placeholder="Search orders..."
                  className="pl-9"
                />
              </div>
              <button
                onClick={loadOrders}
                disabled={ordersLoading || connectionStatus !== "connected"}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                {ordersLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </button>
            </div>

            {connectionStatus !== "connected" && (
              <div className="rounded-lg border border-border bg-card p-12 text-center">
                <Settings className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Connect your eBay account in Settings first</p>
              </div>
            )}

            {connectionStatus === "connected" && ordersLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-2">
                    <div className="h-5 bg-muted rounded animate-pulse w-1/3" />
                    <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
                    <div className="h-3 bg-muted rounded animate-pulse w-1/4" />
                  </div>
                ))}
              </div>
            )}

            {connectionStatus === "connected" && !ordersLoading && filteredOrders.length === 0 && (
              <div className="rounded-lg border border-border bg-card p-12 text-center">
                <Package className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">
                  {orders.length === 0 ? "No orders found" : "No orders match your search"}
                </p>
              </div>
            )}

            <div className="space-y-3">
              {filteredOrders.map((order) => {
                const isExpanded = expandedOrder === order.orderId;
                const total = order.pricingSummary?.total;
                const isFulfilled = order.orderFulfillmentStatus === "FULFILLED";
                const address = order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo;
                const isShipping = shipForm?.orderId === order.orderId;

                return (
                  <div key={order.orderId} className="rounded-lg border border-border bg-card overflow-hidden">
                    {/* Order Header */}
                    <button
                      onClick={() => setExpandedOrder(isExpanded ? null : order.orderId)}
                      className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold font-mono truncate">{order.orderId}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            isFulfilled
                              ? "bg-green-500/10 text-green-500"
                              : "bg-yellow-500/10 text-yellow-500"
                          }`}>
                            {isFulfilled ? "Shipped" : "Awaiting Shipment"}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            order.orderPaymentStatus === "PAID"
                              ? "bg-green-500/10 text-green-500"
                              : "bg-red-500/10 text-red-500"
                          }`}>
                            {order.orderPaymentStatus || "Unknown"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>Buyer: {order.buyer?.username || "—"}</span>
                          <span>{new Date(order.creationDate).toLocaleDateString()}</span>
                          <span>{order.lineItems?.length || 0} item(s)</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold">
                          ${total?.value || "0.00"}
                        </p>
                        <p className="text-xs text-muted-foreground">{total?.currency || "USD"}</p>
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>

                    {/* Order Details */}
                    {isExpanded && (
                      <div className="border-t border-border p-4 space-y-4">
                        {/* Line Items */}
                        <div>
                          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Items</h4>
                          <div className="space-y-2">
                            {order.lineItems?.map((li, idx) => (
                              <div key={idx} className="flex items-center justify-between py-2 px-3 rounded bg-muted/30">
                                <div>
                                  <p className="text-sm font-medium">{li.title}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {li.sku && <span className="font-mono">SKU: {li.sku}</span>}
                                    {li.quantity && li.quantity > 1 && <span className="ml-2">x{li.quantity}</span>}
                                  </p>
                                </div>
                                <span className="text-sm font-medium">${li.total?.value || "—"}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Shipping Address */}
                        {address && (
                          <div>
                            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Ship To</h4>
                            <div className="text-sm px-3 py-2 rounded bg-muted/30">
                              <p className="font-medium">{address.fullName}</p>
                              <p className="text-muted-foreground">
                                {address.contactAddress?.addressLine1}
                                {address.contactAddress?.city && `, ${address.contactAddress.city}`}
                                {address.contactAddress?.stateOrProvince && `, ${address.contactAddress.stateOrProvince}`}
                                {address.contactAddress?.postalCode && ` ${address.contactAddress.postalCode}`}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Shipping Action */}
                        {!isFulfilled && (
                          <div>
                            {isShipping ? (
                              <div className="space-y-3 p-3 rounded-lg border border-orange-500/30 bg-orange-500/5">
                                <h4 className="text-sm font-semibold">Mark as Shipped</h4>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-xs text-muted-foreground">Carrier</label>
                                    <select
                                      value={shipForm.carrier}
                                      onChange={(e) => setShipForm({ ...shipForm, carrier: e.target.value })}
                                      className="mt-1 w-full bg-background border border-input rounded-lg px-3 py-2 text-sm"
                                    >
                                      <option value="">Select carrier</option>
                                      {CARRIERS.map((c) => (
                                        <option key={c} value={c}>{c}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground">Tracking Number</label>
                                    <Input
                                      value={shipForm.trackingNumber}
                                      onChange={(e) => setShipForm({ ...shipForm, trackingNumber: e.target.value })}
                                      placeholder="Tracking #"
                                      className="mt-1 font-mono"
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={markShipped}
                                    disabled={shipping}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                                  >
                                    {shipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                                    Confirm Shipment
                                  </button>
                                  <button
                                    onClick={() => setShipForm(null)}
                                    className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setShipForm({ orderId: order.orderId, trackingNumber: "", carrier: "" })}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                              >
                                <Truck className="h-4 w-4" />
                                Mark as Shipped
                              </button>
                            )}
                          </div>
                        )}

                        {isFulfilled && (
                          <div className="flex items-center gap-2 text-sm text-green-500">
                            <CheckCircle2 className="h-4 w-4" />
                            Order fulfilled
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

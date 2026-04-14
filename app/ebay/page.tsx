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
  Sparkles,
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
  const [token, setToken] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [connectionStatus, setConnectionStatus] = useState<"untested" | "testing" | "connected" | "failed">("untested");
  const [connectionError, setConnectionError] = useState("");
  const [showToken, setShowToken] = useState(false);

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
  });
  const [categorySuggestions, setCategorySuggestions] = useState<{ category: { categoryId: string; categoryName: string } }[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createResult, setCreateResult] = useState<{ success?: boolean; error?: string } | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Orders
  const [orders, setOrders] = useState<EbayOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersSearch, setOrdersSearch] = useState("");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [shipForm, setShipForm] = useState<{ orderId: string; trackingNumber: string; carrier: string } | null>(null);
  const [shipping, setShipping] = useState(false);

  // Load saved settings & drafts on mount, check for OAuth token
  useEffect(() => {
    // Check for OAuth token from server first
    fetch("/api/ebay/token")
      .then((res) => res.json())
      .then((data) => {
        if (data.connected && data.token) {
          setToken(data.token);
          setEnvironment("production");
          setConnectionStatus("connected");
        } else {
          // Fall back to localStorage
          const saved = localStorage.getItem("ebay-settings");
          if (saved) {
            try {
              const s = JSON.parse(saved);
              if (s.token) setToken(s.token);
              if (s.environment) setEnvironment(s.environment);
            } catch { /* ignore */ }
          }
        }
      })
      .catch(() => {
        // Fall back to localStorage
        const saved = localStorage.getItem("ebay-settings");
        if (saved) {
          try {
            const s = JSON.parse(saved);
            if (s.token) setToken(s.token);
            if (s.environment) setEnvironment(s.environment);
          } catch { /* ignore */ }
        }
      });
    const savedDrafts = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (savedDrafts) {
      try { setDrafts(JSON.parse(savedDrafts)); } catch { /* ignore */ }
    }
    // Check for OAuth callback status in URL
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "true") {
      setConnectionStatus("connected");
      window.history.replaceState({}, "", "/ebay");
    }
    if (params.get("error")) {
      setConnectionStatus("failed");
      alert("eBay OAuth error: " + decodeURIComponent(params.get("error") || "Unknown error"));
      window.history.replaceState({}, "", "/ebay");
    }
  }, []);

  // Save settings when changed
  useEffect(() => {
    if (token) {
      localStorage.setItem("ebay-settings", JSON.stringify({ token, environment }));
    }
  }, [token, environment]);

  // Save drafts
  useEffect(() => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
  }, [drafts]);

  // ─── API Helpers ───────────────────────────────────────────────────────

  const apiGet = useCallback(async (action: string, extra: Record<string, string> = {}) => {
    const params = new URLSearchParams({ action, env: environment, token, ...extra });
    const res = await fetch(`/api/ebay?${params}`);
    return res.json();
  }, [environment, token]);

  const apiPost = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    const res = await fetch("/api/ebay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, env: environment, token, ...payload }),
    });
    return res.json();
  }, [environment, token]);

  // ─── Settings ──────────────────────────────────────────────────────────

  const [tokenType, setTokenType] = useState("");

  async function testConnection() {
    if (!token) return;
    setConnectionStatus("testing");
    setConnectionError("");
    setTokenType("");
    try {
      const data = await apiGet("test-connection");
      if (data.tokenType) setTokenType(data.tokenType);
      if (data.connected) {
        setConnectionStatus("connected");
      } else {
        setConnectionStatus("failed");
        const errorMsg = data.error || "Connection failed";
        const statusInfo = data.httpStatus ? ` (HTTP ${data.httpStatus})` : "";
        setConnectionError(`${errorMsg}${statusInfo}`);
        if (data.apiResponse) {
          console.error("eBay API response:", data.apiResponse);
        }
      }
    } catch {
      setConnectionStatus("failed");
      setConnectionError("Network error — check console");
    }
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

  function compressImage(file: File, maxWidth = 1600, quality = 0.8): Promise<File> {
    return new Promise((resolve) => {
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
          (blob) => resolve(new File([blob!], file.name, { type: "image/jpeg" })),
          "image/jpeg",
          quality
        );
      };
      img.src = URL.createObjectURL(file);
    });
  }

  async function handlePhotoUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        const compressed = await compressImage(files[i]);
        formData.append("photos", compressed);
      }
      const res = await fetch("/api/ebay/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok && data.urls?.length) {
        const existing = createForm.imageUrls.filter(Boolean);
        setCreateForm({ ...createForm, imageUrls: [...existing, ...data.urls] });
      } else {
        alert(data.error || "Upload failed");
      }
    } catch {
      alert("Failed to upload photos");
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  async function aiAnalyzePhotos() {
    const urls = createForm.imageUrls.filter(Boolean);
    if (urls.length === 0) {
      alert("Upload photos first");
      return;
    }
    setAiAnalyzing(true);
    try {
      const res = await fetch("/api/listings/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: urls }),
      });
      const data = await res.json();
      if (res.ok && data.analysis) {
        const a = data.analysis;
        const autoSku = `ITEM-${Date.now().toString(36).toUpperCase()}`;
        setCreateForm((prev) => ({
          ...prev,
          title: a.suggestedTitle || prev.title,
          description: a.suggestedDescription || prev.description,
          price: a.suggestedPrice ? String(a.suggestedPrice) : prev.price,
          condition: a.suggestedCondition
            ? CONDITIONS.find((c) => c.label.toLowerCase() === a.suggestedCondition.toLowerCase())?.value || prev.condition
            : prev.condition,
          sku: prev.sku || autoSku,
        }));
        // Auto-search and select eBay category from title
        if (a.suggestedTitle) {
          try {
            const catData = await apiGet("categories", { q: a.suggestedTitle });
            const cats = catData.categorySuggestions || [];
            setCategorySuggestions(cats);
            if (cats.length > 0) {
              setCreateForm((prev) => ({
                ...prev,
                categoryId: cats[0].category.categoryId,
                categorySearch: cats[0].category.categoryName,
              }));
            }
          } catch {}
        }
      } else {
        alert(data.error || "AI analysis failed");
      }
    } catch {
      alert("Failed to analyze photos");
    } finally {
      setAiAnalyzing(false);
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
      // Auto-generate SKU if empty
      const sku = createForm.sku || `ITEM-${Date.now().toString(36).toUpperCase()}`;
      if (!createForm.sku) setCreateForm((prev) => ({ ...prev, sku }));

      // Step 1: Create inventory item
      const invResult = await apiPost("create-inventory-item", {
        sku,
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
      });

      if (invResult.error || invResult.errors) {
        setCreateResult({ error: invResult.errors?.[0]?.message || invResult.error || "Failed to create inventory item" });
        return;
      }

      // Fetch policies
      let policies = { fulfillmentPolicyId: "", returnPolicyId: "", paymentPolicyId: "" };
      try {
        const polRes = await fetch("/api/ebay/policies");
        if (polRes.ok) {
          const polData = await polRes.json();
          if (polData.policies) policies = polData.policies;
        }
      } catch {}

      // Step 2: Create offer
      const offerResult = await apiPost("create-offer", {
        sku,
        marketplaceId: "EBAY_US",
        format: "FIXED_PRICE",
        availableQuantity: createForm.quantity || 1,
        categoryId: createForm.categoryId,
        listingPolicies: policies,
        pricingSummary: {
          price: {
            value: createForm.price,
            currency: "USD",
          },
        },
      });

      if (offerResult.error || offerResult.errors) {
        setCreateResult({ error: offerResult.errors?.[0]?.message || offerResult.error || "Failed to create offer" });
        return;
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
    });
    setCategorySuggestions([]);
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
        pricingSummary: {
          price: { value: draft.price, currency: "USD" },
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
                if (tab.key === "listings" && listings.length === 0 && token) loadListings();
                if (tab.key === "orders" && orders.length === 0 && token) loadOrders();
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
                  {connectionStatus === "connected" && "Connected"}
                  {connectionStatus === "failed" && "Connection Failed"}
                  {connectionStatus === "testing" && "Testing..."}
                  {connectionStatus === "untested" && "Not Connected"}
                </span>
                {tokenType && (
                  <span className="text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                    {tokenType}
                  </span>
                )}
              </div>
              {connectionError && (
                <p className="text-xs text-red-500 mt-1">{connectionError}</p>
              )}
            </div>

            {/* Environment */}
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <h2 className="text-lg font-semibold">Environment</h2>
              <div className="flex gap-3">
                {(["sandbox", "production"] as const).map((env) => (
                  <button
                    key={env}
                    onClick={() => {
                      setEnvironment(env);
                      setConnectionStatus("untested");
                    }}
                    className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      environment === env
                        ? "border-orange-600 bg-orange-600/10 text-orange-600"
                        : "border-border hover:border-foreground/20"
                    }`}
                  >
                    {env === "sandbox" ? "Sandbox" : "Production"}
                  </button>
                ))}
              </div>
              {environment === "production" && (
                <p className="text-xs text-yellow-500 flex items-center gap-1">
                  <XCircle className="h-3 w-3" /> Production mode — actions affect real listings
                </p>
              )}
            </div>

            {/* Connect with OAuth */}
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <h2 className="text-lg font-semibold">Connect to eBay</h2>
              <p className="text-sm text-muted-foreground">
                Sign in with your eBay account to automatically connect. Tokens refresh automatically.
              </p>
              <div className="flex gap-3 flex-wrap">
                <a
                  href="/api/ebay/auth?action=login"
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Connect with eBay
                </a>
                <button
                  onClick={testConnection}
                  disabled={!token || connectionStatus === "testing"}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-50"
                >
                  {connectionStatus === "testing" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Test Connection
                </button>
              </div>
            </div>

            {/* Manual Token (Advanced) */}
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <h2 className="text-sm font-semibold text-muted-foreground">Manual Token (Advanced)</h2>
              <div className="relative">
                <Input
                  type={showToken ? "text" : "password"}
                  value={token}
                  onChange={(e) => {
                    setToken(e.target.value);
                    setConnectionStatus("untested");
                  }}
                  placeholder="Paste token manually if needed"
                  className="pr-20 font-mono text-xs"
                />
                <button
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground px-2 py-1"
                >
                  {showToken ? "Hide" : "Show"}
                </button>
              </div>
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
                disabled={listingsLoading || !token}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                {listingsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </button>
            </div>

            {!token && (
              <div className="rounded-lg border border-border bg-card p-12 text-center">
                <Settings className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Configure your eBay token in Settings first</p>
              </div>
            )}

            {token && listingsLoading && (
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

            {token && !listingsLoading && filteredListings.length === 0 && (
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
                        disabled={publishingDraft === draft.id || !token}
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

            <div className="rounded-lg border border-border bg-card p-6 space-y-5">
              <h2 className="text-lg font-semibold">New Listing</h2>

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
                    value={createForm.quantity}
                    onChange={(e) => setCreateForm({ ...createForm, quantity: e.target.value === "" ? (0 as any) : parseInt(e.target.value) || 0 })}
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

              {/* Photo Upload */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Photos</label>
                <div
                  className="mt-1 border-2 border-dashed border-muted-foreground/25 hover:border-orange-500/50 rounded-lg p-4 text-center cursor-pointer transition-colors"
                  onClick={() => !photoUploading && photoInputRef.current?.click()}
                >
                  {photoUploading ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
                      <span className="text-sm">Uploading...</span>
                    </div>
                  ) : (
                    <div>
                      <ImageIcon className="h-8 w-8 text-muted-foreground/50 mx-auto mb-1" />
                      <p className="text-sm text-muted-foreground">Tap to add photos</p>
                    </div>
                  )}
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handlePhotoUpload(e.target.files)}
                  />
                </div>
                {/* AI Generate button - show when photos uploaded */}
                {createForm.imageUrls.some(Boolean) && (
                  <button
                    onClick={aiAnalyzePhotos}
                    disabled={aiAnalyzing}
                    className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                  >
                    {aiAnalyzing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Analyzing photos...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        AI Generate Listing
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Images */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Image URLs</label>
                <div className="mt-1 space-y-2">
                  {createForm.imageUrls.map((url, idx) => (
                    <div key={idx} className="flex gap-2">
                      <Input
                        value={url}
                        onChange={(e) => {
                          const urls = [...createForm.imageUrls];
                          urls[idx] = e.target.value;
                          setCreateForm({ ...createForm, imageUrls: urls });
                        }}
                        placeholder="https://..."
                        className="flex-1"
                      />
                      {createForm.imageUrls.length > 1 && (
                        <button
                          onClick={() => {
                            const urls = createForm.imageUrls.filter((_, i) => i !== idx);
                            setCreateForm({ ...createForm, imageUrls: urls });
                          }}
                          className="px-2 text-red-500 hover:text-red-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => setCreateForm({ ...createForm, imageUrls: [...createForm.imageUrls, ""] })}
                    className="text-xs text-orange-600 hover:text-orange-700 flex items-center gap-1"
                  >
                    <PlusCircle className="h-3 w-3" /> Add another image
                  </button>
                </div>

                {/* Image previews */}
                {createForm.imageUrls.some(Boolean) && (
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {createForm.imageUrls.filter(Boolean).map((url, idx) => (
                      <div key={idx} className="h-16 w-16 rounded border border-border overflow-hidden bg-muted">
                        <img src={url} alt="" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={submitListing}
                  disabled={createSubmitting || !createForm.title || !createForm.price}
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
                disabled={ordersLoading || !token}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                {ordersLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </button>
            </div>

            {!token && (
              <div className="rounded-lg border border-border bg-card p-12 text-center">
                <Settings className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Configure your eBay token in Settings first</p>
              </div>
            )}

            {token && ordersLoading && (
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

            {token && !ordersLoading && filteredOrders.length === 0 && (
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

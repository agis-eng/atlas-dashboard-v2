"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Upload,
  Download,
  Loader2,
  Sparkles,
  Crop,
  RotateCcw,
  Trash2,
  Image as ImageIcon,
  Palette,
  Globe,
  ArrowUp,
  RefreshCw,
  Check,
  Pencil,
  Eraser,
  Save,
  FolderOpen,
  Square,
  MousePointer2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "create" | "clean";

interface StyleSuggestion {
  style: string;
  description: string;
  colors: string[];
  prompt: string;
}

interface GeneratedLogo {
  id: string;
  url: string;
  prompt: string;
}

export default function LogoPage() {
  const [mode, setMode] = useState<Mode>("create");

  // ─── Create Mode State ───
  const [businessName, setBusinessName] = useState("");
  const [businessUrl, setBusinessUrl] = useState("");
  const [businessDesc, setBusinessDesc] = useState("");
  const [inspirationSrc, setInspirationSrc] = useState<string | null>(null);
  const inspirationRef = useRef<HTMLInputElement>(null);

  const [styleSuggestions, setStyleSuggestions] = useState<StyleSuggestion[]>([]);
  const [loadingStyles, setLoadingStyles] = useState(false);
  const [generatedLogos, setGeneratedLogos] = useState<GeneratedLogo[]>([]);
  const [generating, setGenerating] = useState(false);
  const [remixTarget, setRemixTarget] = useState<GeneratedLogo | null>(null);
  const [remixPrompt, setRemixPrompt] = useState("");
  const [researching, setResearching] = useState(false);

  // ─── Clean Mode State ───
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cleanSrc, setCleanSrc] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [tolerance, setTolerance] = useState(30);
  const [tool, setTool] = useState<"none" | "eraser" | "crop">("none");
  const [brushSize, setBrushSize] = useState(20);
  const [isDrawing, setIsDrawing] = useState(false);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [cropEnd, setCropEnd] = useState<{ x: number; y: number } | null>(null);
  const [savedLogos, setSavedLogos] = useState<Array<{ id: string; src: string; name: string; date: string }>>([]);
  const [showSaved, setShowSaved] = useState(false);

  // ─── Clean Mode Functions ───

  function loadImageToCanvas(src: string) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      setCleanSrc(src);
      setHistory([canvas.toDataURL("image/png")]);
    };
    img.src = src;
  }

  function saveToHistory() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setHistory((prev) => [...prev.slice(-10), canvas.toDataURL("image/png")]);
  }

  function undo() {
    if (history.length < 2) return;
    const prev = history[history.length - 2];
    setHistory((h) => h.slice(0, -1));
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
    };
    img.src = prev;
  }

  function handleCleanUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Use createObjectURL instead of FileReader for better performance with large images
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      // Limit max dimension to 4000px to avoid canvas limits
      let w = img.width;
      let h = img.height;
      const maxDim = 4000;
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      setCleanSrc(url);
      setHistory([canvas.toDataURL("image/png")]);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      setStatus("Failed to load image. Try a different file.");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function handleCleanDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => loadImageToCanvas(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function hexToRgb(hex: string) {
    const m = hex.replace("#", "").match(/.{2}/g);
    if (!m || m.length < 3) return null;
    return { r: parseInt(m[0], 16), g: parseInt(m[1], 16), b: parseInt(m[2], 16) };
  }

  function removeColor(r: number, g: number, b: number, tol: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const dist = Math.sqrt((d[i] - r) ** 2 + (d[i + 1] - g) ** 2 + (d[i + 2] - b) ** 2);
      if (dist <= tol) d[i + 3] = 0;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function cleanEdges() {
    // Remove semi-transparent pixels near fully transparent areas (fringing/halos)
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const { width, height } = canvas;
    const imageData = ctx.getImageData(0, 0, width, height);
    const d = imageData.data;

    // Find pixels that are low-alpha (semi-transparent) and near fully transparent pixels
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const alpha = d[idx + 3];
        // If pixel is semi-transparent (between 1 and 180)
        if (alpha > 0 && alpha < 180) {
          // Check if any neighbor is fully transparent
          const neighbors = [
            ((y - 1) * width + x) * 4,
            ((y + 1) * width + x) * 4,
            (y * width + (x - 1)) * 4,
            (y * width + (x + 1)) * 4,
          ];
          const hasTransparentNeighbor = neighbors.some((ni) => d[ni + 3] === 0);
          if (hasTransparentNeighbor) {
            d[idx + 3] = 0; // Make fully transparent
          }
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function trimWhitespace() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    saveToHistory();
    const { width, height } = canvas;
    const d = ctx.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = 0, maxY = 0, found = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (d[(y * width + x) * 4 + 3] > 10) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          found = true;
        }
      }
    }
    if (!found) return;
    const pad = 10;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
    const cW = maxX - minX + 1, cH = maxY - minY + 1;
    const cropped = ctx.getImageData(minX, minY, cW, cH);
    canvas.width = cW; canvas.height = cH;
    ctx.putImageData(cropped, 0, 0);
    setStatus("Trimmed");
  }

  function getSmallPreview(): string {
    // Create a small version of the canvas for API calls (max 800px)
    const canvas = canvasRef.current;
    if (!canvas) return "";
    const maxDim = 800;
    const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
    const w = Math.round(canvas.width * scale);
    const h = Math.round(canvas.height * scale);
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const ctx = tmp.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(canvas, 0, 0, w, h);
    return tmp.toDataURL("image/jpeg", 0.7);
  }

  async function removeBackground() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setProcessing(true); setStatus("Detecting background...");
    saveToHistory();
    try {
      // Send a small preview to the API for color detection
      const preview = getSmallPreview();
      const res = await fetch("/api/logo/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "detect-bg", image: preview }),
      });
      const data = await res.json();
      if (data.error) {
        setStatus(`Error: ${data.error}`);
      } else if (data.colors?.length) {
        for (const hex of data.colors) {
          const rgb = hexToRgb(hex);
          if (rgb) removeColor(rgb.r, rgb.g, rgb.b, tolerance);
        }
        setStatus(`Removed ${data.colors.length} background colors`);
      } else {
        setStatus("Could not detect background colors. The image may not have a clear background.");
      }
    } catch (err) {
      setStatus(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    finally { setProcessing(false); }
  }

  async function fullClean() {
    await removeBackground();
    trimWhitespace();
    setStatus("Background removed and trimmed!");
  }

  async function deepClean() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setProcessing(true);
    setStatus("Removing background with AI...");
    saveToHistory();
    try {
      // Use remove.bg for professional quality background removal
      const preview = getSmallPreview();
      const res = await fetch("/api/logo/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove-bg-pro", image: preview }),
      });
      const data = await res.json();

      if (data.image) {
        // Load the clean result
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const c = canvasRef.current;
            if (!c) { resolve(); return; }
            const ctx = c.getContext("2d", { willReadFrequently: true });
            if (!ctx) { resolve(); return; }
            c.width = img.width;
            c.height = img.height;
            ctx.clearRect(0, 0, c.width, c.height);
            ctx.drawImage(img, 0, 0);
            setCleanSrc(data.image);
            resolve();
          };
          img.src = data.image;
        });
        trimWhitespace();
        setStatus("Background removed! Clean edges, sharp text.");
      } else if (data.error?.includes("API key")) {
        // Fallback to color detection if remove.bg not configured
        setStatus("Falling back to color detection...");
        await deepCleanFallback();
      } else {
        setStatus(data.error || "Failed");
      }
    } catch (err) {
      setStatus(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setProcessing(false);
    }
  }

  async function deepCleanFallback() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setProcessing(true);
    setStatus("Detecting background colors...");
    saveToHistory();
    try {
      const preview = getSmallPreview();
      const res = await fetch("/api/logo/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deep-detect", image: preview }),
      });
      const data = await res.json();
      if (data.colors?.length) {
        setStatus(`Found ${data.colors.length} colors, removing...`);
        for (const hex of data.colors) {
          const rgb = hexToRgb(hex);
          if (rgb) {
            removeColor(rgb.r, rgb.g, rgb.b, tolerance);
          }
        }
        cleanEdges();
        trimWhitespace();
        setStatus(`Removed ${data.colors.length} colors. Use Eraser for touch-ups.`);
      } else {
        setStatus(data.error || "Could not detect background colors.");
      }
    } catch {
      setStatus("Color detection failed.");
    } finally {
      setProcessing(false);
    }
  }

  async function upscaleImage() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setProcessing(true); setStatus("Upscaling...");
    saveToHistory();
    try {
      const preview = getSmallPreview();
      const res = await fetch("/api/logo/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upscale", image: preview }),
      });
      const data = await res.json();
      if (data.image) {
        // Load upscaled image
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const c = canvasRef.current;
            if (!c) { resolve(); return; }
            const ctx = c.getContext("2d", { willReadFrequently: true });
            if (!ctx) { resolve(); return; }
            c.width = img.width;
            c.height = img.height;
            ctx.drawImage(img, 0, 0);
            setCleanSrc(data.image);
            resolve();
          };
          img.src = data.image;
        });
        // Remove white background that upscale adds
        removeColor(255, 255, 255, tolerance);
        cleanEdges();
        trimWhitespace();
        setStatus("Upscaled and cleaned!");
      } else { setStatus(data.error || "Upscale failed"); }
    } catch { setStatus("Upscale failed"); }
    finally { setProcessing(false); }
  }

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "logo-transparent.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function resetClean() {
    setCleanSrc(null); setHistory([]); setStatus(""); setTool("none");
    setCropStart(null); setCropEnd(null);
    const canvas = canvasRef.current;
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }

  // ─── Eraser Tool ───
  function getCanvasCoords(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.floor((e.clientX - rect.left) * scaleX),
      y: Math.floor((e.clientY - rect.top) * scaleY),
    };
  }

  function eraseAt(x: number, y: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, brushSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  function handleCanvasMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (tool === "eraser") {
      saveToHistory();
      setIsDrawing(true);
      const { x, y } = getCanvasCoords(e);
      eraseAt(x, y);
    } else if (tool === "crop") {
      const { x, y } = getCanvasCoords(e);
      setCropStart({ x, y });
      setCropEnd({ x, y });
    }
  }

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (tool === "eraser" && isDrawing) {
      const { x, y } = getCanvasCoords(e);
      eraseAt(x, y);
    } else if (tool === "crop" && cropStart) {
      const { x, y } = getCanvasCoords(e);
      setCropEnd({ x, y });
      // Draw crop overlay
      drawCropOverlay(cropStart.x, cropStart.y, x, y);
    }
  }

  function handleCanvasMouseUp() {
    if (tool === "eraser") {
      setIsDrawing(false);
    } else if (tool === "crop" && cropStart && cropEnd) {
      applyCrop();
    }
  }

  function drawCropOverlay(x1: number, y1: number, x2: number, y2: number) {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    overlay.width = canvas.width;
    overlay.height = canvas.height;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, overlay.width, overlay.height);
    const left = Math.min(x1, x2), top = Math.min(y1, y2);
    const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
    ctx.clearRect(left, top, w, h);
    ctx.strokeStyle = "#ea580c";
    ctx.lineWidth = 2;
    ctx.strokeRect(left, top, w, h);
  }

  function applyCrop() {
    if (!cropStart || !cropEnd) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    saveToHistory();
    const left = Math.min(cropStart.x, cropEnd.x);
    const top = Math.min(cropStart.y, cropEnd.y);
    const w = Math.abs(cropEnd.x - cropStart.x);
    const h = Math.abs(cropEnd.y - cropStart.y);
    if (w < 10 || h < 10) { setCropStart(null); setCropEnd(null); return; }
    const cropped = ctx.getImageData(left, top, w, h);
    canvas.width = w;
    canvas.height = h;
    ctx.putImageData(cropped, 0, 0);
    setCropStart(null);
    setCropEnd(null);
    setTool("none");
    // Clear overlay
    const overlay = overlayRef.current;
    if (overlay) { overlay.width = 0; overlay.height = 0; }
    setStatus("Cropped");
  }

  // ─── Save / Load Logos ───
  useEffect(() => {
    try {
      const saved = localStorage.getItem("logoclear-saved");
      if (saved) setSavedLogos(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  function saveLogo() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const src = canvas.toDataURL("image/png");
    const entry = {
      id: crypto.randomUUID(),
      src,
      name: `Logo ${savedLogos.length + 1}`,
      date: new Date().toISOString(),
    };
    const updated = [entry, ...savedLogos].slice(0, 20);
    setSavedLogos(updated);
    localStorage.setItem("logoclear-saved", JSON.stringify(updated));
    setStatus("Saved!");
  }

  function loadSavedLogo(src: string) {
    loadImageToCanvas(src);
    setShowSaved(false);
  }

  function deleteSavedLogo(id: string) {
    const updated = savedLogos.filter((l) => l.id !== id);
    setSavedLogos(updated);
    localStorage.setItem("logoclear-saved", JSON.stringify(updated));
  }

  // Send generated logo to clean mode
  function sendToClean(src: string) {
    setMode("clean");
    setTimeout(() => loadImageToCanvas(src), 100);
  }

  // ─── Create Mode Functions ───

  async function researchBusiness() {
    if (!businessUrl) return;
    setResearching(true);
    try {
      const res = await fetch("/api/logo/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "research", prompt: businessUrl }),
      });
      const data = await res.json();
      if (data.description) setBusinessDesc(data.description);
    } catch { /* ignore */ }
    finally { setResearching(false); }
  }

  async function getStyleSuggestions() {
    const desc = `Business: ${businessName}. ${businessDesc || businessUrl}`;
    setLoadingStyles(true);
    try {
      const res = await fetch("/api/logo/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suggest-styles", prompt: desc }),
      });
      const data = await res.json();
      setStyleSuggestions(data.styles || []);
    } catch { /* ignore */ }
    finally { setLoadingStyles(false); }
  }

  async function generateFromStyle(stylePrompt: string) {
    setGenerating(true);
    const fullPrompt = `Create a professional logo for "${businessName}". ${stylePrompt}. The logo should be on a plain white background. Make it clean and suitable for business use.`;
    try {
      const res = await fetch("/api/logo/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          prompt: fullPrompt,
          inspirationImage: inspirationSrc || undefined,
        }),
      });
      const data = await res.json();
      if (data.image) {
        setGeneratedLogos((prev) => [
          { id: crypto.randomUUID(), url: data.image, prompt: fullPrompt },
          ...prev,
        ]);
      }
    } catch { /* ignore */ }
    finally { setGenerating(false); }
  }

  async function generateAll3Styles() {
    if (!styleSuggestions.length) return;
    setGenerating(true);
    for (const style of styleSuggestions) {
      try {
        const fullPrompt = `Create a professional logo for "${businessName}". ${style.prompt}. The logo should be on a plain white background.`;
        const res = await fetch("/api/logo/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "generate", prompt: fullPrompt, inspirationImage: inspirationSrc || undefined }),
        });
        const data = await res.json();
        if (data.image) {
          setGeneratedLogos((prev) => [
            { id: crypto.randomUUID(), url: data.image, prompt: fullPrompt },
            ...prev,
          ]);
        }
      } catch { /* ignore */ }
    }
    setGenerating(false);
  }

  async function remixLogo() {
    if (!remixTarget || !remixPrompt) return;
    setGenerating(true);
    const fullPrompt = `Take this logo and ${remixPrompt}. Keep the same general concept but apply the requested changes. Output on a plain white background.`;
    try {
      const res = await fetch("/api/logo/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", prompt: fullPrompt, inspirationImage: remixTarget.url }),
      });
      const data = await res.json();
      if (data.image) {
        setGeneratedLogos((prev) => [
          { id: crypto.randomUUID(), url: data.image, prompt: fullPrompt },
          ...prev,
        ]);
      }
    } catch { /* ignore */ }
    finally { setGenerating(false); setRemixTarget(null); setRemixPrompt(""); }
  }

  function handleInspirationUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setInspirationSrc(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ImageIcon className="h-6 w-6 text-orange-600" />
            LogoClear
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Create logos with AI or clean up existing ones</p>
        </div>
        <div className="flex border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setMode("create")}
            className={cn("px-4 py-2 text-sm font-medium transition-colors", mode === "create" ? "bg-orange-600 text-white" : "hover:bg-muted")}
          >
            <Sparkles className="h-4 w-4 inline mr-1" /> Create
          </button>
          <button
            onClick={() => setMode("clean")}
            className={cn("px-4 py-2 text-sm font-medium transition-colors", mode === "clean" ? "bg-orange-600 text-white" : "hover:bg-muted")}
          >
            <Crop className="h-4 w-4 inline mr-1" /> Clean
          </button>
        </div>
      </div>

      {/* ═══ CREATE MODE ═══ */}
      {mode === "create" && (
        <div className="space-y-6">
          {/* Input Form */}
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <h2 className="text-lg font-semibold">Describe Your Brand</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">Business Name *</label>
                <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Your business name" className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">Website (optional)</label>
                <div className="flex gap-2 mt-1">
                  <Input value={businessUrl} onChange={(e) => setBusinessUrl(e.target.value)} placeholder="https://..." className="flex-1" />
                  {businessUrl && (
                    <Button onClick={researchBusiness} disabled={researching} variant="outline" size="sm" className="shrink-0">
                      {researching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase">Brand Description</label>
              <textarea
                value={businessDesc}
                onChange={(e) => setBusinessDesc(e.target.value)}
                placeholder="Describe your business, industry, target audience, and brand personality..."
                rows={3}
                className="mt-1 w-full bg-background border border-input rounded-lg px-3 py-2 text-sm resize-y"
              />
            </div>

            {/* Inspiration Upload */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase">Inspiration Image (optional)</label>
              <div className="flex items-center gap-3 mt-1">
                {inspirationSrc ? (
                  <div className="relative group">
                    <img src={inspirationSrc} alt="" className="h-16 w-16 rounded border object-contain bg-white" />
                    <button onClick={() => setInspirationSrc(null)} className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100">x</button>
                  </div>
                ) : (
                  <button onClick={() => inspirationRef.current?.click()} className="h-16 w-16 rounded border-2 border-dashed border-border flex items-center justify-center hover:border-orange-600/50 transition-colors">
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  </button>
                )}
                <input ref={inspirationRef} type="file" accept="image/*" className="hidden" onChange={handleInspirationUpload} />
                <span className="text-xs text-muted-foreground">Upload a logo you like for style reference</span>
              </div>
            </div>

            <Button onClick={getStyleSuggestions} disabled={!businessName || loadingStyles} className="bg-orange-600 hover:bg-orange-700">
              {loadingStyles ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Palette className="h-4 w-4 mr-2" />}
              Get Style Ideas
            </Button>
          </div>

          {/* Style Suggestions */}
          {styleSuggestions.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Style Directions</h2>
                <Button onClick={generateAll3Styles} disabled={generating} className="bg-orange-600 hover:bg-orange-700">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Generate All 3
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {styleSuggestions.map((style, i) => (
                  <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-3">
                    <h3 className="font-semibold text-sm">{style.style}</h3>
                    <p className="text-xs text-muted-foreground">{style.description}</p>
                    <div className="flex gap-1">
                      {style.colors.map((c, j) => (
                        <div key={j} className="h-6 w-6 rounded-full border" style={{ backgroundColor: c }} title={c} />
                      ))}
                    </div>
                    <Button onClick={() => generateFromStyle(style.prompt)} disabled={generating} size="sm" variant="outline" className="w-full">
                      {generating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                      Generate This Style
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Remix Panel */}
          {remixTarget && (
            <div className="rounded-lg border border-orange-600/30 bg-orange-600/5 p-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <RefreshCw className="h-4 w-4" /> Remix Logo
              </h3>
              <div className="flex gap-4">
                <img src={remixTarget.url} alt="" className="h-20 w-20 rounded border object-contain bg-white" />
                <div className="flex-1 space-y-2">
                  <Input
                    value={remixPrompt}
                    onChange={(e) => setRemixPrompt(e.target.value)}
                    placeholder="Describe changes... (e.g. make it more modern, change colors to blue, add a tagline)"
                    onKeyDown={(e) => e.key === "Enter" && remixLogo()}
                  />
                  <div className="flex gap-2">
                    <Button onClick={remixLogo} disabled={generating || !remixPrompt} size="sm" className="bg-orange-600 hover:bg-orange-700">
                      {generating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                      Remix
                    </Button>
                    <Button onClick={() => { setRemixTarget(null); setRemixPrompt(""); }} size="sm" variant="ghost">Cancel</Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Generated Logos Gallery */}
          {generatedLogos.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Generated Logos ({generatedLogos.length})</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {generatedLogos.map((logo) => (
                  <div key={logo.id} className="rounded-lg border border-border bg-card overflow-hidden group">
                    <div className="aspect-square bg-white flex items-center justify-center p-4">
                      <img src={logo.url} alt="" className="max-w-full max-h-full object-contain" />
                    </div>
                    <div className="p-3 flex gap-2">
                      <Button onClick={() => sendToClean(logo.url)} size="sm" variant="outline" className="flex-1 text-xs">
                        <Crop className="h-3 w-3 mr-1" /> Clean Up
                      </Button>
                      <Button onClick={() => { setRemixTarget(logo); setRemixPrompt(""); }} size="sm" variant="outline" className="flex-1 text-xs">
                        <Pencil className="h-3 w-3 mr-1" /> Remix
                      </Button>
                      <Button
                        onClick={() => {
                          const link = document.createElement("a");
                          link.download = `logo-${logo.id.slice(0, 8)}.png`;
                          link.href = logo.url;
                          link.click();
                        }}
                        size="sm" variant="ghost" className="px-2"
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ CLEAN MODE ═══ */}
      {mode === "clean" && (
        <div className="space-y-4">
          {/* Upload area + Saved logos — shown when no image loaded */}
          {!cleanSrc && (
            <>
              <div
                className="border-2 border-dashed border-border rounded-xl p-16 text-center"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={handleCleanDrop}
              >
                <Upload className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-lg font-medium mb-4">Upload your logo</p>
                <label className="inline-flex items-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-lg cursor-pointer hover:bg-orange-700 transition-colors font-medium text-sm">
                  <Upload className="h-4 w-4" />
                  Choose File
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCleanUpload}
                    style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", opacity: 0 }}
                  />
                </label>
                <p className="text-sm text-muted-foreground mt-3">PNG, JPG, or WebP — or drag and drop</p>
              </div>

              {/* Saved Logos */}
              {savedLogos.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <FolderOpen className="h-4 w-4" /> Saved Logos ({savedLogos.length})
                  </h3>
                  <div className="grid gap-3 grid-cols-3 sm:grid-cols-4 lg:grid-cols-6">
                    {savedLogos.map((logo) => (
                      <div key={logo.id} className="relative group">
                        <button
                          onClick={() => loadSavedLogo(logo.src)}
                          className="w-full aspect-square rounded-lg border border-border overflow-hidden bg-[repeating-conic-gradient(#80808020_0%_25%,transparent_0%_50%)] bg-[length:10px_10px] hover:border-orange-600/50 transition-colors"
                        >
                          <img src={logo.src} alt="" className="w-full h-full object-contain p-1" />
                        </button>
                        <button
                          onClick={() => deleteSavedLogo(logo.id)}
                          className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Toolbar — shown when image loaded */}
          {cleanSrc && (
            <div className="space-y-2">
              {/* AI Tools Row */}
              <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-border bg-card">
                <Button onClick={fullClean} disabled={processing} className="bg-orange-600 hover:bg-orange-700">
                  {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Remove BG + Trim
                </Button>
                <Button onClick={deepClean} disabled={processing} variant="outline" size="sm" className="border-purple-600/30 text-purple-600 hover:bg-purple-600/10">
                  {processing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                  Deep Clean
                </Button>
                <Button onClick={() => deepCleanFallback()} disabled={processing} variant="outline" size="sm">
                  {processing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                  Color Clean
                </Button>
                <Button onClick={removeBackground} disabled={processing} variant="outline" size="sm">Remove BG</Button>
                <Button onClick={trimWhitespace} variant="outline" size="sm"><Crop className="h-3 w-3 mr-1" /> Trim</Button>
                <Button onClick={upscaleImage} disabled={processing} variant="outline" size="sm"><ArrowUp className="h-3 w-3 mr-1" /> Upscale</Button>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Tol:</label>
                  <input type="range" min="10" max="80" value={tolerance} onChange={(e) => setTolerance(parseInt(e.target.value))} className="w-20" />
                  <span className="text-xs font-mono w-5">{tolerance}</span>
                </div>
              </div>

              {/* Manual Tools Row */}
              <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-border bg-card">
                <Button
                  onClick={() => setTool(tool === "eraser" ? "none" : "eraser")}
                  variant={tool === "eraser" ? "default" : "outline"}
                  size="sm"
                  className={tool === "eraser" ? "bg-purple-600 hover:bg-purple-700" : ""}
                >
                  <Eraser className="h-3 w-3 mr-1" /> Eraser
                </Button>
                <Button
                  onClick={() => { setTool(tool === "crop" ? "none" : "crop"); setCropStart(null); setCropEnd(null); }}
                  variant={tool === "crop" ? "default" : "outline"}
                  size="sm"
                  className={tool === "crop" ? "bg-purple-600 hover:bg-purple-700" : ""}
                >
                  <Square className="h-3 w-3 mr-1" /> Crop
                </Button>
                {tool === "eraser" && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Size:</label>
                    <input type="range" min="5" max="80" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="w-20" />
                    <span className="text-xs font-mono w-5">{brushSize}</span>
                  </div>
                )}
                <div className="flex gap-1 ml-auto">
                  <Button onClick={saveLogo} variant="outline" size="icon" title="Save"><Save className="h-4 w-4" /></Button>
                  <Button onClick={undo} variant="ghost" size="icon" disabled={history.length < 2} title="Undo"><RotateCcw className="h-4 w-4" /></Button>
                  <Button onClick={downloadPng} variant="ghost" size="icon" title="Download"><Download className="h-4 w-4" /></Button>
                  <Button onClick={resetClean} variant="ghost" size="icon" title="Start over"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </div>
          )}

          {status && <p className="text-sm text-muted-foreground">{status}</p>}

          {/* Canvas — ALWAYS rendered so ref is available, hidden when empty */}
          <div className={cn(
            "rounded-lg border overflow-hidden relative",
            cleanSrc
              ? "border-border bg-[repeating-conic-gradient(#80808020_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]"
              : "border-transparent"
          )}>
            <canvas
              ref={canvasRef}
              className={cn(
                "max-w-full h-auto mx-auto block",
                !cleanSrc && "hidden",
                tool === "eraser" && "cursor-crosshair",
                tool === "crop" && "cursor-crosshair",
              )}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
            />
            {/* Crop overlay canvas */}
            <canvas
              ref={overlayRef}
              className={cn(
                "absolute inset-0 max-w-full h-auto mx-auto block pointer-events-none",
                (!cleanSrc || tool !== "crop" || !cropStart) && "hidden"
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}

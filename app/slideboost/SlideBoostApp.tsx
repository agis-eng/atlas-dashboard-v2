"use client";

import React, { useState, useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { jsPDF } from "jspdf";
import JSZip from 'jszip';
// PptxGenJS imported dynamically at runtime to avoid node:fs build issues
import { get, set } from 'idb-keyval';
import { Slide, AIResponse, BrandAsset, Project } from '@/lib/slideboost/types';
import { APP_THEME } from '@/lib/slideboost/constants';
import { analyzeAndReviseSlide, removeWatermark, removeNotebookLMLogo, replaceLogo, editSlideImage, upscaleSlideImage } from '@/lib/slideboost/geminiClient';
import { 
  ChevronLeft, ChevronRight, Sparkles, FileText, Edit3, CheckCircle, 
  Loader2, Upload, Share2, Plus, Trash2, FileImage, FileIcon, 
  Image as ImageIcon, X, Wand2, Save, Folder, Layers,
  Pencil, Check, Undo2, Zap, ArrowUp, ArrowDown, GripVertical, Download, FileDown,
  RefreshCcw, MonitorUp, Package, CheckSquare, Presentation, Layout, Paperclip,
  ScanEye, Ban, Maximize2, Eraser
} from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/build/pdf.worker.min.mjs`;

// Load PptxGenJS from CDN (avoids node:fs webpack issues)
function loadPptxGenJS(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).PptxGenJS) {
      resolve((window as any).PptxGenJS);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js";
    script.onload = () => {
      if ((window as any).PptxGenJS) {
        resolve((window as any).PptxGenJS);
      } else {
        reject(new Error("PptxGenJS not found after loading"));
      }
    };
    script.onerror = () => reject(new Error("Failed to load PptxGenJS"));
    document.head.appendChild(script);
  });
}

const STORAGE_KEY = 'legacy_studio_projects_v2';
const MAX_HISTORY = 5;

// Resolution constants for Export
// 4K Resolution: 3840 x 2160
const EXPORT_WIDTH = 3840;
const EXPORT_HEIGHT = 2160;

// Helper to compress images before adding to PDF/PPTX to prevent memory crashes
// Now defaults to 4K (3840x2160) for high fidelity on large screens
const compressImageForExport = (base64Str: string, width = EXPORT_WIDTH, height = EXPORT_HEIGHT): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }
      // Fill white background to handle transparency
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw image to fit the target area
      ctx.drawImage(img, 0, 0, width, height);
      
      // Export as JPEG with 0.9 quality for high fidelity
      const compressed = canvas.toDataURL('image/jpeg', 0.9);
      resolve(compressed);
    };
    img.onerror = () => {
      // If compression fails, return original
      resolve(base64Str);
    };
  });
};

export default function SlideBoostApp() {
  // Session Persistence State
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Active Project Content
  const [slides, setSlides] = useState<Slide[]>([]);
  const [brandLogo, setBrandLogo] = useState<BrandAsset | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedSlideIds, setSelectedSlideIds] = useState<Set<string>>(new Set());
  
  // UI State
  const [instruction, setInstruction] = useState('');
  const [inspirationImage, setInspirationImage] = useState<{url: string, base64: string, mime: string} | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [isRemovingNotebookLM, setIsRemovingNotebookLM] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempTitle, setTempTitle] = useState('');
  const [isZipping, setIsZipping] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isGeneratingPPT, setIsGeneratingPPT] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{current: number, total: number} | null>(null);
  const [analysis, setAnalysis] = useState<AIResponse | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  
  // Comparison & Stats State
  const [isComparing, setIsComparing] = useState(false);
  const [imgDimensions, setImgDimensions] = useState<{w: number, h: number} | null>(null);
  const cancelRef = useRef(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const inspirationInputRef = useRef<HTMLInputElement>(null);

  const currentSlide = slides[currentIndex];
  const activeProject = projects.find(p => p.id === activeProjectId);

  // --- Session Management ---

  useEffect(() => {
    // Load projects from IndexedDB (async), falling back to localStorage for migration
    const loadSession = async () => {
      try {
        const saved = await get(STORAGE_KEY);
        if (saved && Array.isArray(saved) && saved.length > 0) {
          setProjects(saved);
          const lastProj = saved[0];
          setActiveProjectId(lastProj.id);
          setSlides(lastProj.slides.map((s: Slide) => ({ ...s, history: s.history || [] })));
          setBrandLogo(lastProj.brandLogo);
        } else {
          // Migration check: If nothing in IDB, check LocalStorage
          const local = localStorage.getItem(STORAGE_KEY);
          if (local) {
            try {
              const parsed = JSON.parse(local);
              if (Array.isArray(parsed) && parsed.length > 0) {
                 console.log("Migrating data from LocalStorage to IndexedDB...");
                 await set(STORAGE_KEY, parsed);
                 setProjects(parsed);
                 setActiveProjectId(parsed[0].id);
                 setSlides(parsed[0].slides.map((s: Slide) => ({ ...s, history: s.history || [] })));
                 setBrandLogo(parsed[0].brandLogo);
                 localStorage.removeItem(STORAGE_KEY); // Clear legacy storage
                 return;
              }
            } catch (e) {
              console.error("Migration failed", e);
            }
          }
          createNewProject();
        }
      } catch (err) {
        console.error("Failed to load session", err);
        createNewProject();
      }
    };
    loadSession();
  }, []);

  useEffect(() => {
    if (!activeProjectId || projects.length === 0 || isCleaning) return;

    let isMounted = true;
    const saveTimer = setTimeout(async () => {
      setIsSaving(true);
      const updatedProjects = projects.map(p => 
        p.id === activeProjectId 
          ? { ...p, slides, brandLogo, lastModified: Date.now() } 
          : p
      );
      
      try {
        await set(STORAGE_KEY, updatedProjects);
        if (isMounted) {
          setProjects(updatedProjects);
          // Reduced visual delay for snappier feel (800ms -> 400ms)
          setTimeout(() => setIsSaving(false), 400); 
        }
      } catch (e) {
        console.error("Save Error (Quota likely exceeded or IDB error):", e);
        if (isMounted) setIsSaving(false);
      }
    }, 1000); // Reduced debounce from 1500ms -> 1000ms

    return () => {
      isMounted = false;
      clearTimeout(saveTimer);
    };
  }, [slides, brandLogo, activeProjectId, isCleaning]);

  // Measure Image Dimensions
  useEffect(() => {
    const targetImage = isComparing && currentSlide?.history?.length 
        ? currentSlide.history[currentSlide.history.length - 1] 
        : currentSlide?.imageUrl;

    if (!targetImage) {
        setImgDimensions(null);
        return;
    }

    const img = new Image();
    img.onload = () => setImgDimensions({w: img.naturalWidth, h: img.naturalHeight});
    img.src = targetImage;
  }, [currentSlide, isComparing]);

  const switchProject = (projectId: string) => {
    const target = projects.find(p => p.id === projectId);
    if (!target || projectId === activeProjectId) return;

    setActiveProjectId(projectId);
    setSlides(target.slides.map(s => ({ ...s, history: s.history || [] })));
    setBrandLogo(target.brandLogo);
    setCurrentIndex(0);
    setAnalysis(null);
    setInstruction('');
    setInspirationImage(null);
    setSelectedSlideIds(new Set()); // Clear selection on switch
  };

  const createNewProject = () => {
    // When called from init, projects might be empty in closure, but we set state which queues update.
    const newProj: Project = {
      id: Math.random().toString(36).substr(2, 9),
      name: `Project ${Date.now().toString().slice(-4)}`,
      slides: [],
      brandLogo: null,
      lastModified: Date.now()
    };
    
    setProjects(prev => {
      const updated = [newProj, ...prev];
      // Async initial save
      set(STORAGE_KEY, updated).catch(console.error);
      return updated;
    });
    
    setActiveProjectId(newProj.id);
    setSlides([]);
    setBrandLogo(null);
    setCurrentIndex(0);
    setSelectedSlideIds(new Set());
  };

  const deleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = projects.filter(p => p.id !== id);
    setProjects(updated);
    set(STORAGE_KEY, updated).catch(console.error); // Immediate save
    
    if (activeProjectId === id) {
      if (updated.length > 0) switchProject(updated[0].id);
      else createNewProject();
    }
  };

  const renameActiveProject = (newName: string) => {
    const updated = projects.map(p => p.id === activeProjectId ? { ...p, name: newName } : p);
    setProjects(updated);
    set(STORAGE_KEY, updated).catch(console.error); // Persist immediately
  };

  const moveSlide = (index: number, direction: 'up' | 'down', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= slides.length) return;
    
    const newSlides = [...slides];
    const [moved] = newSlides.splice(index, 1);
    newSlides.splice(newIndex, 0, moved);
    
    setSlides(newSlides);
    if (currentIndex === index) setCurrentIndex(newIndex);
    else if (currentIndex === newIndex) setCurrentIndex(index);
  };

  // --- Drag & Drop Reordering ---
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    const dragIcon = document.createElement('div');
    dragIcon.style.opacity = '0';
    document.body.appendChild(dragIcon);
    e.dataTransfer.setDragImage(dragIcon, 0, 0);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) return;
    
    setSlides(prev => {
      const next = [...prev];
      const [moved] = next.splice(draggedIdx, 1);
      next.splice(idx, 0, moved);
      setDraggedIdx(idx);
      if (currentIndex === draggedIdx) setCurrentIndex(idx);
      return next;
    });
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
  };

  const handleDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    handleDragEnd();
  };

  // --- Export Handlers ---
  const handleDownloadCurrentSlide = () => {
    if (!currentSlide) return;
    const link = document.createElement('a');
    link.href = currentSlide.imageUrl;
    link.download = `${activeProject?.name.replace(/\s+/g, '-') || 'Slide'}-Slide-${currentIndex + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPDF = async () => {
    if (slides.length === 0) return;
    
    setIsGeneratingPDF(true);
    // Allow UI render cycle to show loading state
    await new Promise(r => setTimeout(r, 50));

    try {
      // Use 4K dimensions for PDF
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [EXPORT_WIDTH, EXPORT_HEIGHT]
      });

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        if (i > 0) pdf.addPage();
        
        let imageData = slide.imageUrl;
        let format = 'PNG';
        
        try {
          // Force scale to 4K
          imageData = await compressImageForExport(slide.imageUrl, EXPORT_WIDTH, EXPORT_HEIGHT);
          format = 'JPEG'; 
        } catch (err) {
          console.warn("Compression failed, using original", err);
        }

        if (imageData) {
          pdf.addImage(imageData, format, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
        }
      }
      
      pdf.save(`${activeProject?.name || 'Presentation'}.pdf`);
    } catch (e) {
      console.error("PDF generation failed", e);
      alert("Could not generate PDF (file too large). Please try downloading as ZIP instead.");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const generatePPTX = async (isGoogleSlides = false) => {
    if (slides.length === 0) return;
    
    setIsGeneratingPPT(true);
    // Allow UI render cycle to show loading state
    await new Promise(r => setTimeout(r, 50));

    try {
      // Load PptxGenJS from CDN to avoid node:fs webpack issues
      const PptxGenJS = await loadPptxGenJS();
      const pres = new PptxGenJS();
      pres.layout = 'LAYOUT_16x9'; 

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        const pptSlide = pres.addSlide();
        
        let imageData = slide.imageUrl;
        
        try {
           // Upscale/Compress to 4K for maximum quality on big screens
           imageData = await compressImageForExport(slide.imageUrl, EXPORT_WIDTH, EXPORT_HEIGHT);
        } catch (err) {
           console.warn("Compression for PPT failed, using original", err);
        }

        // Add image covering the entire slide
        pptSlide.addImage({ 
            data: imageData, 
            x: 0, 
            y: 0, 
            w: '100%', 
            h: '100%',
            sizing: { type: 'contain', w: '100%', h: '100%' }
        });
      }

      const fileName = `${activeProject?.name || 'Presentation'}${isGoogleSlides ? '_Slides' : ''}.pptx`;
      await pres.writeFile({ fileName });

      if (isGoogleSlides) {
        setTimeout(() => {
          if (window.confirm("Presentation file ready! Open Google Slides to upload?")) {
            window.open("https://docs.google.com/presentation", "_blank");
          }
        }, 500);
      }
    } catch (e) {
      console.error("PPTX generation failed", e);
      alert("Could not generate PowerPoint file. Please check console.");
    } finally {
      setIsGeneratingPPT(false);
    }
  };

  const handleDownloadPPTX = () => generatePPTX(false);
  const handleDownloadGoogleSlides = () => generatePPTX(true);

  const handleDownloadAllPNGs = async () => {
    if (slides.length === 0) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      const folderName = activeProject?.name.replace(/[^a-z0-9]/gi, '_') || "slides";
      const folder = zip.folder(folderName);
      
      slides.forEach((slide, i) => {
        // slide.imageUrl is base64 data uri: "data:image/png;base64,....."
        const parts = slide.imageUrl.split(',');
        if (parts.length === 2) {
          folder?.file(`Slide-${i + 1}.png`, parts[1], { base64: true });
        }
      });
      
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${folderName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Zip failed", e);
      alert("Failed to zip images.");
    } finally {
      setIsZipping(false);
    }
  };

  // --- Bulk Actions ---
  const stopBulkOperation = () => {
      cancelRef.current = true;
  };

  const toggleSlideSelection = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedSlideIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
  };

  const handleBulkDelete = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const idsToDelete = new Set(selectedSlideIds);
    if (idsToDelete.size === 0) return;
    
    // Robust state update: filter out any slides that are in the delete set
    setSlides(prevSlides => {
        const newSlides = prevSlides.filter(s => !idsToDelete.has(s.id));
        return newSlides;
    });
    
    const newSlidesList = slides.filter(s => !idsToDelete.has(s.id));
    
    if (newSlidesList.length === 0) {
        setCurrentIndex(0);
    } else if (currentIndex >= newSlidesList.length) {
        setCurrentIndex(Math.max(0, newSlidesList.length - 1));
    }
    
    // Clear selection immediately
    setSelectedSlideIds(new Set());
    setAnalysis(null);
  };

  const handleBulkDownload = async () => {
    if (selectedSlideIds.size === 0) return;
    setIsZipping(true);
    try {
        const zip = new JSZip();
        const folderName = activeProject?.name.replace(/[^a-z0-9]/gi, '_') || "selected_slides";
        const folder = zip.folder(folderName);
        
        const selectedSlides = slides.filter(s => selectedSlideIds.has(s.id));
        
        selectedSlides.forEach((slide, i) => {
            const parts = slide.imageUrl.split(',');
            if (parts.length === 2) {
                folder?.file(`Slide-${i + 1}.png`, parts[1], { base64: true });
            }
        });
        
        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${folderName}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error(e);
        alert("Zip failed");
    } finally {
        setIsZipping(false);
    }
  };

  // --- Helpers ---
  // Original used the AI Studio in-browser key picker; the dashboard keeps the
  // Gemini key server-side (env var), so this is a no-op.
  const ensureApiKey = async () => true;

  // --- Handlers ---

  const handleNext = () => setCurrentIndex((prev) => (prev + 1) % slides.length);
  const handlePrev = () => setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);

  const handleUndo = () => {
    if (!currentSlide || !currentSlide.history || currentSlide.history.length === 0) return;
    
    const updated = [...slides];
    const history = [...(currentSlide.history || [])];
    const prevBase64 = history.pop(); 
    
    if (prevBase64) {
      updated[currentIndex] = {
        ...currentSlide,
        base64Data: prevBase64,
        imageUrl: prevBase64,
        history: history
      };
      setSlides(updated);
    }
  };

  const addToHistory = (slide: Slide): string[] => {
    const history = [...(slide.history || [])];
    if (slide.base64Data) {
      history.push(slide.base64Data);
      if (history.length > MAX_HISTORY) history.shift();
    }
    return history;
  };

  const handleApplyLogo = async () => {
    const current = slides[currentIndex];
    if (!current || !brandLogo || isCleaning || isRemovingNotebookLM) return;
    setIsCleaning(true);
    try {
      const compressedBase64 = await compressImageForExport(current.base64Data!, 1280, 720);
      const brandedBase64 = await replaceLogo(compressedBase64, "image/jpeg", brandLogo.base64Data, brandLogo.mimeType);
      setSlides(prev => {
        const next = [...prev];
        const newHistory = addToHistory(next[currentIndex]);
        next[currentIndex] = { ...next[currentIndex], base64Data: brandedBase64, imageUrl: brandedBase64, history: newHistory };
        return next;
      });
    } catch (e) { 
      console.error(e);
      alert("Logo replacement failed. Ensure the slide image is clear."); 
    }
    finally { setIsCleaning(false); }
  };

  const handleCleanWatermark = async () => {
    const current = slides[currentIndex];
    if (!current || isCleaning || isRemovingNotebookLM) return;
    setIsCleaning(true);
    try {
      const compressedBase64 = await compressImageForExport(current.base64Data!, 1280, 720);
      const clean = await removeWatermark(compressedBase64, "image/jpeg");
      setSlides(prev => {
        const next = [...prev];
        const newHistory = addToHistory(next[currentIndex]);
        next[currentIndex] = { ...next[currentIndex], base64Data: clean, imageUrl: clean, history: newHistory };
        return next;
      });
    } catch (e) { alert("Cleanup failed."); }
    finally { setIsCleaning(false); }
  };

  const handleCleanAllSlides = async () => {
    if (slides.length === 0 || isCleaning || isUpscaling || isRemovingNotebookLM) return;
    if (!window.confirm(`Start cleaning all ${slides.length} slides? This process uses visual AI on each slide sequentially.`)) return;
    
    cancelRef.current = false;
    setIsCleaning(true);
    setBulkProgress({ current: 0, total: slides.length });
    
    try {
      let localSlides = [...slides];
      
      for (let i = 0; i < localSlides.length; i++) {
        if (cancelRef.current) break;
        setBulkProgress({ current: i + 1, total: localSlides.length });
        const slide = localSlides[i];
        
        try {
          const compressedBase64 = await compressImageForExport(slide.base64Data!, 1280, 720);
          const cleaned = await removeWatermark(compressedBase64, "image/jpeg");
          
          setSlides(prev => {
            const next = [...prev];
            const target = next[i];
            const history = [...(target.history || [])];
            if (target.base64Data) {
              history.push(target.base64Data);
              if (history.length > MAX_HISTORY) history.shift();
            }
            next[i] = {
              ...target,
              base64Data: cleaned,
              imageUrl: cleaned,
              history: history
            };
            return next;
          });
        } catch (err) {
          console.error(`Slide ${i+1} clean failed:`, err);
        }
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (e) {
      console.error("Bulk process interrupted:", e);
    } finally {
      setIsCleaning(false);
      setBulkProgress(null);
    }
  };

  const handleBulkUpscale = async () => {
    if (slides.length === 0 || isUpscaling || isCleaning || isRemovingNotebookLM) return;
    if (!window.confirm(`Start enhancing resolution for all ${slides.length} slides? This process uses Pro vision AI on each slide sequentially and may take some time.`)) return;
    
    await ensureApiKey(); // Ensure user has picked a key for Pro model

    cancelRef.current = false;
    setIsUpscaling(true);
    setBulkProgress({ current: 0, total: slides.length });
    
    try {
      let localSlides = [...slides];
      
      for (let i = 0; i < localSlides.length; i++) {
        if (cancelRef.current) break;
        setBulkProgress({ current: i + 1, total: localSlides.length });
        const slide = localSlides[i];
        
        try {
          const upscaled = await upscaleSlideImage(slide.base64Data!, slide.mimeType!);
          
          setSlides(prev => {
            const next = [...prev];
            // Safety check in case slides changed (though we block interactions usually)
            if (!next[i] || next[i].id !== slide.id) return next;

            const target = next[i];
            const history = [...(target.history || [])];
            if (target.base64Data) {
              history.push(target.base64Data);
              if (history.length > MAX_HISTORY) history.shift();
            }
            next[i] = {
              ...target,
              base64Data: upscaled,
              imageUrl: upscaled,
              history: history
            };
            return next;
          });
        } catch (err) {
          console.error(`Slide ${i+1} upscale failed:`, err);
        }
        // Small delay to allow UI updates
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (e) {
      console.error("Bulk process interrupted:", e);
    } finally {
      setIsUpscaling(false);
      setBulkProgress(null);
    }
  };

  const handleBulkRemoveNotebookLM = async () => {
    if (slides.length === 0 || isCleaning || isUpscaling || isRemovingNotebookLM) return;
    if (!window.confirm(`Start removing NotebookLM branding from all ${slides.length} slides?`)) return;

    await ensureApiKey();

    cancelRef.current = false;
    setIsRemovingNotebookLM(true);
    setBulkProgress({ current: 0, total: slides.length });

    try {
      let localSlides = [...slides];

      for (let i = 0; i < localSlides.length; i++) {
        if (cancelRef.current) break;
        setBulkProgress({ current: i + 1, total: localSlides.length });
        const slide = localSlides[i];

        try {
          const compressedBase64 = await compressImageForExport(slide.base64Data!, 1280, 720);

          let modified: string | null = null;
          let lastErr: unknown = null;
          const MAX_ATTEMPTS = 3;
          for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            if (cancelRef.current) break;
            try {
              modified = await removeNotebookLMLogo(compressedBase64, "image/jpeg");
              break;
            } catch (err) {
              lastErr = err;
              console.warn(`Slide ${i+1} attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err);
              if (attempt < MAX_ATTEMPTS) {
                await new Promise(r => setTimeout(r, 1500 * attempt));
              }
            }
          }
          if (!modified) throw lastErr ?? new Error("Removal failed after retries");

          setSlides(prev => {
            const next = [...prev];
             // Safety check
            if (!next[i] || next[i].id !== slide.id) return next;

            const target = next[i];
            const history = [...(target.history || [])];
            if (target.base64Data) {
              history.push(target.base64Data);
              if (history.length > MAX_HISTORY) history.shift();
            }

            next[i] = {
              ...target,
              base64Data: modified,
              imageUrl: modified,
              history: history
            };
            return next;
          });
        } catch (err) {
          console.error(`Slide ${i+1} NotebookLM removal failed:`, err);
        }
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (e) {
      console.error("Bulk process interrupted:", e);
    } finally {
      setIsRemovingNotebookLM(false);
      setBulkProgress(null);
    }
  };

  const handleApplyToImage = async () => {
    const current = slides[currentIndex];
    if (!current || !instruction || isCleaning || isRemovingNotebookLM) return;
    
    await ensureApiKey(); // Ensure user has picked a key for Pro model
    
    setIsCleaning(true);
    try {
      const compressedBase64 = await compressImageForExport(current.base64Data!, 1280, 720);
      let compressedInspiration = inspirationImage?.base64;
      if (inspirationImage?.base64) {
        compressedInspiration = await compressImageForExport(inspirationImage.base64, 1280, 720);
      }
      const modified = await editSlideImage(
          compressedBase64,
          "image/jpeg",
          instruction,
          compressedInspiration,
          inspirationImage?.mime ? "image/jpeg" : undefined
      );
      setSlides(prev => {
        const next = [...prev];
        const newHistory = addToHistory(next[currentIndex]);
        next[currentIndex] = { ...next[currentIndex], base64Data: modified, imageUrl: modified, history: newHistory };
        return next;
      });
    } catch (e) { 
      console.error("Detailed error:", e);
      alert("Visual modification failed: " + (e instanceof Error ? e.message : String(e))); 
    }
    finally { setIsCleaning(false); }
  };

  const handleUpscale = async () => {
    const current = slides[currentIndex];
    if (!current || isUpscaling || isCleaning || isRemovingNotebookLM) return;
    
    await ensureApiKey(); // Ensure user has picked a key for Pro model
    
    setIsUpscaling(true);
    try {
      const compressedBase64 = await compressImageForExport(current.base64Data!, 1280, 720);
      const upscaled = await upscaleSlideImage(compressedBase64, "image/jpeg");
      setSlides(prev => {
        const next = [...prev];
        const newHistory = addToHistory(next[currentIndex]);
        next[currentIndex] = { ...next[currentIndex], base64Data: upscaled, imageUrl: upscaled, history: newHistory };
        return next;
      });
    } catch (e) { 
      console.error(e);
      alert("Enhancement failed. Please check your API key."); 
    }
    finally { setIsUpscaling(false); }
  };

  const handleDeleteSlide = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (slides.length === 0) return;
    if (!window.confirm("Are you sure you want to delete this slide?")) return;

    const slideToDelete = slides[index];
    const newSlides = slides.filter((_, idx) => idx !== index);
    setSlides(newSlides);
    
    // Clean up selection
    if (selectedSlideIds.has(slideToDelete.id)) {
        const next = new Set(selectedSlideIds);
        next.delete(slideToDelete.id);
        setSelectedSlideIds(next);
    }
    
    // Determine new active index
    if (newSlides.length === 0) {
      setCurrentIndex(0);
    } else if (currentIndex >= newSlides.length) {
      // If we were at the end, step back
      setCurrentIndex(newSlides.length - 1);
    } else if (index < currentIndex) {
      // If deleted slide was before current, decrement current
      setCurrentIndex(currentIndex - 1);
    }
    // If index === currentIndex (and not at end), standard behavior is to stay at currentIndex
    // which now points to the *next* slide. This is correct.

    setAnalysis(null);
  };

  const handleReplaceClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    replaceInputRef.current?.click();
  };

  const handleReplaceFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input
    if (replaceInputRef.current) replaceInputRef.current.value = '';

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result as string;
      setSlides(prev => {
        const next = [...prev];
        // We replace the current slide's image data but keep ID/Title if desired, 
        // or effectively swap the whole visual content. History can be kept or reset.
        // Resetting history on replacement is usually cleaner.
        next[currentIndex] = {
          ...next[currentIndex],
          imageUrl: data,
          base64Data: data,
          mimeType: file.type,
          history: [] // Reset history for the new slide
        };
        return next;
      });
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async (customPrompt?: string) => {
    const current = slides[currentIndex];
    if (!current || isProcessing) return;
    setIsProcessing(true);
    try {
      const res = await analyzeAndReviseSlide(current.base64Data!, current.mimeType!, customPrompt || instruction, brandLogo?.base64Data, brandLogo?.mimeType);
      setAnalysis(res);
      setSlides(prev => {
        const next = [...prev];
        next[currentIndex] = { ...next[currentIndex], originalText: res.extractedText, revisedText: res.suggestedRevision, status: 'ready' };
        return next;
      });
    } catch (e) { alert("Analysis failed."); }
    finally { setIsProcessing(false); }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    setIsExtracting(true);
    const newSlides: Slide[] = [];
    const fileList = Array.from(files) as File[];
    
    for (const file of fileList) {
      if (file.type === 'application/pdf') {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: canvas.getContext('2d')!, viewport } as any).promise;
            const data = canvas.toDataURL('image/png');
            newSlides.push({ id: Math.random().toString(36).substr(2, 9), title: `Page ${i}`, imageUrl: data, base64Data: data, mimeType: 'image/png', status: 'idle', history: [] });
          }
        } catch (e) { console.error(e); }
      } else {
        await new Promise(r => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const data = e.target?.result as string;
            newSlides.push({ id: Math.random().toString(36).substr(2, 9), title: file.name, imageUrl: data, base64Data: data, mimeType: file.type, status: 'idle', history: [] });
            r(null);
          };
          reader.readAsDataURL(file);
        });
      }
    }
    setSlides(prev => [...prev, ...newSlides]);
    setIsExtracting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden text-gray-900 bg-[#fcfbf7] font-sans selection:bg-amber-100 selection:text-amber-900">
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*,application/pdf" multiple onChange={handleFileUpload} />
      <input type="file" ref={replaceInputRef} className="hidden" accept="image/*" onChange={handleReplaceFile} />
      <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={(e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = (ev) => setBrandLogo({ imageUrl: ev.target?.result as string, base64Data: ev.target?.result as string, mimeType: file.type });
        r.readAsDataURL(file);
      }} />
      <input type="file" ref={inspirationInputRef} className="hidden" accept="image/*" onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const r = new FileReader();
          r.onload = (ev) => setInspirationImage({ url: ev.target?.result as string, base64: ev.target?.result as string, mime: file.type });
          r.readAsDataURL(file);
          // Reset input to allow re-selecting the same file if needed
          if (inspirationInputRef.current) inspirationInputRef.current.value = '';
      }} />

      {/* Sidebar */}
      <aside className="w-80 border-r border-gray-200 bg-white flex flex-col shadow-sm z-30">
        <div className="p-6 border-b border-gray-100 bg-white">
          <h1 className="text-xl font-bold tracking-tight text-gray-800 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-serif" style={{backgroundColor: APP_THEME.primary}}>S</div>
            SlideBoostAI
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <div className={`w-1.5 h-1.5 rounded-full ${isSaving ? 'bg-amber-400 animate-pulse' : 'bg-green-400'}`}></div>
            <span className="text-[9px] text-gray-400 uppercase tracking-widest font-black">{isSaving ? 'Syncing...' : 'Synced'}</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar">
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Project Sessions</h4>
              <button onClick={createNewProject} className="p-1 hover:bg-amber-50 rounded-md transition-all text-amber-600"><Plus className="w-4 h-4" /></button>
            </div>
            <div className="space-y-1">
              {projects.map(p => (
                <div key={p.id} onClick={() => switchProject(p.id)} className={`group relative w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl text-sm font-bold cursor-pointer transition-all border ${activeProjectId === p.id ? 'bg-amber-50 text-amber-900 border-amber-200 shadow-sm' : 'text-gray-500 hover:bg-gray-50 border-transparent'}`}>
                  <div className="flex items-center gap-3 truncate">
                    <Folder className={`w-4 h-4 shrink-0 ${activeProjectId === p.id ? 'text-amber-600' : 'text-gray-300'}`} />
                    <span className="truncate">{p.name}</span>
                  </div>
                  <button onClick={(e) => deleteProject(p.id, e)} className="p-1 opacity-0 group-hover:opacity-100 hover:bg-white rounded-lg text-gray-400 hover:text-red-500 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            {selectedSlideIds.size > 0 ? (
                <div className="flex items-center gap-2 bg-amber-50 p-2 rounded-lg -mx-2 mb-2 border border-amber-100 animate-in fade-in slide-in-from-top-1">
                    <span className="text-xs font-bold text-amber-800 flex-1 pl-1">{selectedSlideIds.size} Selected</span>
                    <button onClick={handleBulkDownload} className="p-1.5 hover:bg-amber-200 text-amber-700 rounded-md transition-colors" title="Download Selected">
                        <Download className="w-4 h-4" />
                    </button>
                    <button 
                        type="button"
                        onClick={handleBulkDelete} 
                        className="flex items-center gap-1 px-2 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-md transition-colors text-[10px] font-black uppercase tracking-widest" 
                        title="Delete Selected"
                    >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete</span>
                    </button>
                    <button onClick={() => setSelectedSlideIds(new Set())} className="p-1.5 hover:bg-amber-200 text-amber-600 rounded-md transition-colors" title="Clear Selection">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ) : (
                <div className="flex items-center justify-between px-1">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Current Deck</h4>
                    {slides.length > 0 && (
                        <div className="flex gap-2">
                            <button 
                            onClick={handleCleanAllSlides}
                            disabled={isCleaning || isUpscaling || isRemovingNotebookLM}
                            className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-widest transition-colors ${isCleaning ? 'text-gray-400 cursor-wait' : 'text-amber-600 hover:text-amber-700'}`}
                            title="Remove watermarks from all slides"
                            >
                            <Zap className={`w-3 h-3 ${isCleaning ? 'animate-pulse' : ''}`} /> {isCleaning ? 'Cleaning...' : 'Clean All'}
                            </button>
                            <button 
                            onClick={handleBulkRemoveNotebookLM}
                            disabled={isCleaning || isUpscaling || isRemovingNotebookLM}
                            className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-widest transition-colors ${isRemovingNotebookLM ? 'text-gray-400 cursor-wait' : 'text-rose-600 hover:text-rose-700'}`}
                            title="Remove NotebookLM Branding"
                            >
                            <Eraser className={`w-3 h-3 ${isRemovingNotebookLM ? 'animate-pulse' : ''}`} /> {isRemovingNotebookLM ? 'Removing...' : 'No-Logo'}
                            </button>
                            <button 
                            onClick={handleBulkUpscale}
                            disabled={isCleaning || isUpscaling || isRemovingNotebookLM}
                            className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-widest transition-colors ${isUpscaling ? 'text-gray-400 cursor-wait' : 'text-indigo-600 hover:text-indigo-700'}`}
                            title="Enhance resolution for all slides"
                            >
                            <MonitorUp className={`w-3 h-3 ${isUpscaling ? 'animate-pulse' : ''}`} /> {isUpscaling ? 'Enhancing...' : 'Enhance All'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            <button onClick={() => fileInputRef.current?.click()} className="w-full flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50 transition-all group">
              <Plus className="w-5 h-5" />
              <span className="text-sm font-bold">Import Assets</span>
            </button>
            
            <div className="space-y-3 pb-8">
              {slides.map((s, idx) => (
                <div 
                  key={s.id} 
                  className={`group relative transition-all duration-200 ${draggedIdx === idx ? 'opacity-30 scale-95' : 'opacity-100'}`}
                  draggable={!isCleaning}
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={(e) => handleDrop(e, idx)}
                  onDragEnd={handleDragEnd}
                >
                  <div 
                    role="button"
                    onClick={() => setCurrentIndex(idx)} 
                    className={`w-full p-2 rounded-xl border-2 transition-all text-left ${currentIndex === idx ? 'bg-amber-50 border-amber-200 ring-4 ring-amber-50/50' : 'bg-white border-transparent hover:bg-gray-50'} relative overflow-hidden cursor-pointer`}
                  >
                    <div className="aspect-video rounded-lg overflow-hidden bg-gray-100 mb-2 relative">
                      <img src={s.imageUrl} className="w-full h-full object-cover" />
                      
                      {/* Checkbox for Selection */}
                      <div className="absolute top-2 left-2 z-20" onClick={(e) => e.stopPropagation()}>
                         <input 
                            type="checkbox" 
                            checked={selectedSlideIds.has(s.id)}
                            onChange={() => toggleSlideSelection(s.id)}
                            className="w-4 h-4 accent-amber-600 rounded cursor-pointer shadow-md border-white/50"
                         />
                      </div>

                      {/* Slide Number - Moved to Bottom Left */}
                      <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold rounded-md">{idx + 1}</div>
                      
                      {/* Drag Handle */}
                      <div className="absolute top-2 right-2 p-1.5 bg-white/40 backdrop-blur-md rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-grab">
                        <GripVertical className="w-3.5 h-3.5 text-white" />
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-[11px] font-bold truncate text-gray-600 px-1 max-w-[80px]">{s.title}</p>
                      {/* Hover Actions for Slide Management */}
                      {currentIndex === idx && (
                         <div className="flex gap-1">
                           <button 
                             onClick={(e) => handleReplaceClick(e)} 
                             className="p-1.5 hover:bg-amber-100 rounded text-gray-400 hover:text-amber-600 cursor-pointer transition-colors" 
                             title="Replace Slide"
                             type="button"
                           >
                             <RefreshCcw className="w-3 h-3" />
                           </button>
                           <button 
                             onClick={(e) => handleDeleteSlide(idx, e)} 
                             className="p-1.5 hover:bg-red-100 rounded text-gray-400 hover:text-red-600 cursor-pointer transition-colors" 
                             title="Delete Slide"
                             type="button"
                           >
                             <Trash2 className="w-3 h-3" />
                           </button>
                         </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </aside>

      {/* Workspace */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {slides.length > 0 ? (
          <>
            <header className="h-20 bg-white border-b flex items-center justify-between px-10 shadow-sm z-10 shrink-0">
              <div className="flex items-center gap-4">
                <button onClick={handlePrev} className="p-2.5 hover:bg-gray-100 rounded-xl transition-all"><ChevronLeft className="w-5 h-5" /></button>
                <div className="flex flex-col items-center justify-center min-w-[60px]">
                   <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-0.5">Slide</span>
                   <span className="text-sm font-black text-gray-800">{currentIndex + 1} / {slides.length}</span>
                </div>
                <button onClick={handleNext} className="p-2.5 hover:bg-gray-100 rounded-xl transition-all"><ChevronRight className="w-5 h-5" /></button>
                <div className="h-8 w-px bg-gray-100 mx-4" />
                {isEditingName ? (
                   <input 
                      autoFocus
                      className="font-serif text-xl font-bold bg-transparent border-b-2 border-amber-500 outline-none text-gray-900 w-64"
                      value={tempTitle}
                      onChange={(e) => setTempTitle(e.target.value)}
                      onBlur={() => {
                         if (tempTitle.trim()) renameActiveProject(tempTitle);
                         setIsEditingName(false);
                      }}
                      onKeyDown={(e) => {
                         if (e.key === 'Enter') {
                             e.currentTarget.blur();
                         }
                      }}
                   />
                ) : (
                   <div 
                      onClick={() => {
                         setTempTitle(activeProject?.name || '');
                         setIsEditingName(true);
                      }}
                      className="group flex items-center gap-2 cursor-pointer"
                   >
                      <h2 className="font-serif text-xl font-bold truncate max-w-md group-hover:text-amber-700 transition-colors">{activeProject?.name}</h2>
                      <Pencil className="w-4 h-4 text-gray-300 group-hover:text-amber-500 transition-colors opacity-0 group-hover:opacity-100" />
                   </div>
                )}
              </div>
              <div className="flex items-center gap-4">
                <button onClick={handleDownloadAllPNGs} disabled={isZipping} className="bg-white text-gray-900 border border-gray-200 px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all flex items-center gap-2 shadow-sm active:scale-95 disabled:opacity-50">
                  {isZipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />} 
                  {isZipping ? 'Zipping...' : 'Get Images'}
                </button>
                <button onClick={handleDownloadPDF} disabled={isGeneratingPDF} className="bg-white text-gray-900 border border-gray-200 px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all flex items-center gap-2 shadow-sm active:scale-95 disabled:opacity-50">
                  {isGeneratingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                  {isGeneratingPDF ? 'Exporting...' : 'Get PDF'}
                </button>
                <button onClick={handleDownloadGoogleSlides} disabled={isGeneratingPPT} className="bg-white text-gray-900 border border-gray-200 px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all flex items-center gap-2 shadow-sm active:scale-95 disabled:opacity-50">
                  {isGeneratingPPT ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layout className="w-4 h-4" />}
                  {isGeneratingPPT ? 'Building...' : 'Google Slides'}
                </button>
                <button onClick={handleDownloadPPTX} disabled={isGeneratingPPT} className="bg-black text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:opacity-90 transition-all flex items-center gap-2 shadow-xl shadow-gray-200 active:scale-95 disabled:opacity-50">
                  {isGeneratingPPT ? <Loader2 className="w-4 h-4 animate-spin" /> : <Presentation className="w-4 h-4" />}
                  {isGeneratingPPT ? 'Building...' : 'Get PPTX'}
                </button>
              </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
              <div className="flex-[3] bg-[#f7f7f4] p-12 flex items-center justify-center pattern-dots overflow-auto relative">
                <div className="max-w-5xl w-full aspect-video bg-white rounded-2xl shadow-[0_40px_100px_-20px_rgba(0,0,0,0.15)] overflow-hidden relative group/canvas">
                  <img 
                    src={isComparing && currentSlide.history && currentSlide.history.length > 0 
                        ? currentSlide.history[currentSlide.history.length - 1] 
                        : currentSlide.imageUrl} 
                    className={`w-full h-full object-contain transition-all duration-1000 ${isCleaning || isUpscaling || isRemovingNotebookLM ? 'scale-95 opacity-50 blur-lg grayscale' : 'scale-100 opacity-100'}`} 
                  />
                  {(isCleaning || isUpscaling || isRemovingNotebookLM) && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/40 backdrop-blur-sm z-50">
                      <Loader2 className="w-16 h-16 text-amber-600 animate-spin" />
                      <p className="mt-6 font-black uppercase tracking-[0.3em] text-amber-900 text-sm">
                        {isUpscaling ? 'Restoring High Fidelity...' : isRemovingNotebookLM ? 'Removing Branding...' : bulkProgress ? `Refining ${bulkProgress.current}/${bulkProgress.total}...` : 'Refining Aesthetic...'}
                      </p>
                      {bulkProgress && (
                         <button 
                           onClick={stopBulkOperation}
                           className="mt-4 px-4 py-2 bg-red-100 text-red-600 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-red-200 flex items-center gap-2"
                         >
                            <Ban className="w-3 h-3" /> Stop
                         </button>
                      )}
                    </div>
                  )}
                  {/* Resolution Badge Overlay */}
                  {imgDimensions && (
                      <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-[10px] font-mono border border-white/20 flex items-center gap-2 opacity-0 group-hover/canvas:opacity-100 transition-opacity">
                         <Maximize2 className="w-3 h-3 text-amber-400" />
                         {imgDimensions.w} x {imgDimensions.h} px
                      </div>
                  )}
                  
                  {/* Comparison Mode Indicator */}
                  {isComparing && (
                      <div className="absolute top-4 right-4 bg-amber-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg animate-pulse">
                         Comparing Original
                      </div>
                  )}
                </div>
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 bg-white/80 backdrop-blur-xl border border-white rounded-2xl shadow-2xl">
                   {currentSlide.history && currentSlide.history.length > 0 && (
                     <>
                        <button onClick={handleUndo} className="flex items-center gap-3 px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest text-amber-700 hover:bg-amber-50">
                            <Undo2 className="w-4 h-4" /> Undo ({currentSlide.history.length})
                        </button>
                        <div className="w-px h-6 bg-gray-200" />
                        <button 
                            onMouseDown={() => setIsComparing(true)}
                            onMouseUp={() => setIsComparing(false)}
                            onMouseLeave={() => setIsComparing(false)}
                            className="flex items-center gap-3 px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest text-gray-500 hover:bg-gray-100 active:bg-amber-100 active:text-amber-800 transition-colors select-none"
                            title="Hold to see original"
                        >
                            <ScanEye className="w-4 h-4" /> Compare
                        </button>
                        <div className="w-px h-6 bg-gray-200" />
                     </>
                   )}
                   <button onClick={handleCleanWatermark} disabled={isCleaning || isUpscaling || isRemovingNotebookLM} className="flex items-center gap-3 px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest text-gray-600 hover:bg-amber-50 hover:text-amber-700">
                     <Wand2 className="w-4 h-4 text-amber-600" /> Clean Slide
                   </button>
                   <div className="w-px h-6 bg-gray-200" />
                   <button onClick={handleUpscale} disabled={isCleaning || isUpscaling || isRemovingNotebookLM} className="flex items-center gap-3 px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 transition-all">
                      <MonitorUp className="w-4 h-4 text-indigo-500" /> Enhance Resolution
                   </button>
                   <div className="w-px h-6 bg-gray-200" />
                   <button onClick={handleDownloadCurrentSlide} disabled={isCleaning || isUpscaling || isRemovingNotebookLM} className="flex items-center gap-3 px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest text-gray-600 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-30 transition-all">
                      <Download className="w-4 h-4 text-amber-600" /> Save Slide
                   </button>
                </div>
              </div>

              {/* Enhanced Sidepanel with Brand Field */}
              <div className="flex-[2] bg-white border-l border-gray-100 shadow-2xl flex flex-col z-20 overflow-y-auto custom-scrollbar">
                <div className="p-8 border-b border-gray-50 bg-gray-50/20">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="p-2.5 bg-amber-100 rounded-xl text-amber-700"><Sparkles className="w-5 h-5" /></div>
                    <h3 className="font-black text-xs uppercase tracking-[0.2em] text-gray-800">Visual Intelligence</h3>
                  </div>

                  {/* Brand Field inside Intelligence */}
                  <div className="mb-8 space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Brand Identity Context</h4>
                    {brandLogo ? (
                      <div className="relative group bg-white border-2 border-gray-100 rounded-2xl p-4 flex items-center justify-center gap-4 overflow-hidden">
                        <img src={brandLogo.imageUrl} alt="Logo" className="w-12 h-12 object-contain" />
                        <div className="flex-1">
                          <p className="text-[10px] font-black uppercase text-amber-600">Active Asset</p>
                          <button onClick={() => setBrandLogo(null)} className="text-[10px] font-bold text-gray-400 hover:text-red-500">Remove</button>
                        </div>
                        <button onClick={handleApplyLogo} disabled={isCleaning} className="px-4 py-2 bg-amber-100 text-amber-700 rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-amber-200 transition-all shadow-sm">Apply to Slide</button>
                      </div>
                    ) : (
                      <button onClick={() => logoInputRef.current?.click()} className="w-full flex items-center gap-4 p-4 border-2 border-dashed border-gray-100 rounded-2xl text-gray-400 hover:border-amber-200 hover:text-amber-500 transition-all bg-white">
                        <ImageIcon className="w-5 h-5" />
                        <span className="text-[10px] font-black uppercase">Upload Brand Asset</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-5">
                    <div className="relative group">
                      <div className="absolute -top-2 left-4 px-2 bg-white text-[9px] font-black uppercase tracking-widest text-amber-600">Revision Intent</div>
                      <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. 'Make the headline font smaller', 'Resize the blue box', or 'Replace the photo with a cityscape'..." className="w-full h-32 p-5 pt-6 bg-white border-2 border-gray-100 rounded-3xl focus:border-amber-400 outline-none text-sm font-medium shadow-sm resize-none pb-12" />
                      
                      {/* Inspiration Image Attachment */}
                      <div className="absolute bottom-3 right-3 flex items-center gap-2 z-10">
                        {inspirationImage ? (
                            <div className="relative group/preview animate-in fade-in zoom-in duration-200">
                                <div className="w-10 h-10 rounded-lg border-2 border-white shadow-md overflow-hidden relative">
                                  <img src={inspirationImage.url} className="w-full h-full object-cover" alt="Inspiration" />
                                </div>
                                <button 
                                  onClick={() => setInspirationImage(null)} 
                                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-sm hover:scale-110 transition-transform"
                                  title="Remove inspiration image"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                            </div>
                        ) : (
                            <button 
                              onClick={() => inspirationInputRef.current?.click()} 
                              className="p-1.5 bg-gray-50 hover:bg-amber-100 rounded-lg text-gray-400 hover:text-amber-600 transition-colors border border-gray-200 hover:border-amber-200 shadow-sm" 
                              title="Attach visual inspiration image"
                            >
                                <Paperclip className="w-4 h-4" />
                            </button>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button onClick={() => handleAnalyze()} disabled={isProcessing || isCleaning || !currentSlide} className="flex-1 py-5 bg-black text-white rounded-[24px] font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-3">
                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />}
                        Rewrite Text
                      </button>
                      <button onClick={handleApplyToImage} disabled={isCleaning || !currentSlide || !instruction} className="flex-1 py-5 bg-amber-500 text-white rounded-[24px] font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-3">
                        {isCleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                        Apply Visual Edit
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-8 space-y-12">
                  {analysis ? (
                    <>
                      <section className="animate-in fade-in slide-in-from-bottom-8">
                        <div className="flex items-center gap-2 mb-4 text-gray-400">
                          <FileText className="w-3.5 h-3.5" />
                          <h4 className="text-[10px] font-black uppercase tracking-[0.2em]">Source Content</h4>
                        </div>
                        <p className="p-6 bg-gray-50 border border-gray-100 rounded-3xl text-xs text-gray-500 italic leading-relaxed font-medium">{analysis.extractedText}</p>
                      </section>
                      <section className="bg-amber-50/50 p-8 rounded-[32px] border border-amber-100/50">
                        <div className="flex items-center gap-2 mb-5 text-amber-700">
                          <Check className="w-3.5 h-3.5" />
                          <h4 className="text-[10px] font-black uppercase tracking-[0.2em]">Refined Strategy</h4>
                        </div>
                        <p className="text-lg text-gray-800 font-bold leading-relaxed">{analysis.suggestedRevision}</p>
                      </section>
                      <section>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-6">Execution Logic</h4>
                        <div className="space-y-4">
                           {analysis.improvements.map((imp, idx) => (
                             <div key={idx} className="flex gap-4">
                                <div className="w-6 h-6 rounded-lg bg-green-50 flex items-center justify-center shrink-0 border border-green-100 text-green-500"><CheckCircle className="w-3.5 h-3.5" /></div>
                                <p className="text-sm font-bold text-gray-600 leading-tight">{imp}</p>
                             </div>
                           ))}
                        </div>
                      </section>
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-40 text-center space-y-6 grayscale">
                      <div className="w-24 h-24 bg-gray-50 rounded-[32px] border border-gray-100 flex items-center justify-center shadow-inner text-gray-200"><FileImage className="w-10 h-10" /></div>
                      <div className="space-y-2">
                        <p className="text-sm font-black uppercase tracking-widest text-gray-800">Ready for Strategy</p>
                        <p className="text-xs font-medium text-gray-400 leading-relaxed">Adjust your revision objective above to refine this slide.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-20">
             <div className="max-w-md space-y-8">
                <div className="w-32 h-32 bg-amber-50 border-2 border-amber-100 rounded-[48px] flex items-center justify-center mx-auto shadow-xl text-amber-600"><Upload className="w-12 h-12" /></div>
                <div className="space-y-4">
                  <h2 className="text-5xl font-serif font-bold text-gray-900 leading-tight">SlideBoostAI</h2>
                  <p className="text-gray-400 font-medium text-lg leading-relaxed">Elevate your Google Notebook slides with AI-powered vision copywriting and professional branding.</p>
                </div>
                <button onClick={() => fileInputRef.current?.click()} className="w-full py-6 bg-black text-white rounded-3xl font-black uppercase tracking-[0.2em] text-sm hover:scale-105 transition-all shadow-2xl flex items-center justify-center gap-4"><Plus className="w-5 h-5" /> Upload Media Session</button>
             </div>
          </div>
        )}
      </main>
    </div>
  );
}

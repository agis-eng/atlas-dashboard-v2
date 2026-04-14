export interface Slide {
  id: string;
  title: string;
  imageUrl: string;
  base64Data?: string;
  mimeType?: string;
  originalText?: string;
  revisedText?: string;
  status: "idle" | "analyzing" | "ready" | "processing";
  history?: string[];
}

export interface BrandAsset {
  imageUrl: string;
  base64Data: string;
  mimeType: string;
}

export interface Project {
  id: string;
  name: string;
  slides: Slide[];
  brandLogo: BrandAsset | null;
  lastModified: number;
}

export interface AIResponse {
  extractedText: string;
  suggestedRevision: string;
  improvements: string[];
}

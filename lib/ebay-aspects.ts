// Fills eBay's category-specific required item specifics (aspects) from a
// listing's structured fields + title/description extraction. eBay rejects
// publish if a category's required aspects (e.g. "US Shoe Size", "Department")
// are missing, so we resolve every required aspect to a best-effort value.

export interface EbayAspectMeta {
  localizedAspectName: string;
  aspectConstraint?: { aspectRequired?: boolean; aspectMode?: string };
  aspectValues?: { localizedValue: string }[];
}

export interface AspectListing {
  title: string;
  description?: string;
  category?: string;
  brand?: string;
  size?: string;
  sizeType?: string;
}

export function extractColor(text: string): string {
  const colors = ["black","white","gray","grey","blue","red","green","yellow","pink","purple","brown","tan","beige","navy","orange","gold","silver","burgundy","maroon","teal","cream","ivory","multicolor"];
  const t = text.toLowerCase();
  for (const c of colors) if (t.includes(c)) return c.charAt(0).toUpperCase() + c.slice(1);
  return "Multicolor";
}

export function extractMaterial(text: string): string {
  const mats = ["canvas","leather","suede","cotton","polyester","nylon","wool","denim","mesh","rubber","synthetic","fleece","silk","linen","plastic","ceramic","metal","wood","glass"];
  const t = text.toLowerCase();
  for (const m of mats) if (t.includes(m)) return m.charAt(0).toUpperCase() + m.slice(1);
  return "";
}

export function detectDepartment(text: string): string {
  const t = text.toLowerCase();
  if (/\b(women|woman|womens|women's|ladies)\b/.test(t)) return "Women";
  if (/\b(men|mens|men's)\b/.test(t)) return "Men";
  if (/\bgirl/.test(t)) return "Girls";
  if (/\bboy/.test(t)) return "Boys";
  if (/\b(kid|child|youth|toddler|baby|infant)\b/.test(t)) return "Unisex Kids";
  return "Unisex Adult";
}

export function extractSize(text: string): string | null {
  const numeric = text.match(/\b(?:size|sz)\s*[:.]?\s*(\d{1,2}(?:\.5)?)\b/i)
    || text.match(/\b(\d{1,2}(?:\.5)?)\s*(?:us|m\b|d\b)\b/i);
  if (numeric) return numeric[1];
  const letter = text.match(/\b(?:size|sz)\s*[:.]?\s*(xxs|xs|s|m|l|xl|xxl|xxxl|small|medium|large)\b/i);
  if (letter) return letter[1].toUpperCase();
  return null;
}

function isUnbranded(brand?: string): boolean {
  return !brand || /no brand|not sure|unbranded/i.test(brand);
}

function resolveAspect(meta: EbayAspectMeta, listing: AspectListing): string[] | null {
  const name = meta.localizedAspectName;
  const nameLc = name.toLowerCase();
  const text = `${listing.title} ${listing.description || ""} ${listing.category || ""}`;
  const allowed = (meta.aspectValues || []).map(v => v.localizedValue);
  const mode = meta.aspectConstraint?.aspectMode;

  const matchAllowed = (val: string): string | null => {
    if (!allowed.length) return val;
    const v = String(val).toLowerCase().trim();
    const exact = allowed.find(a => a.toLowerCase().trim() === v);
    if (exact) return exact;
    const esc = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|\\s)${esc}(\\s|$)`, "i");
    return allowed.find(a => re.test(a)) || null;
  };

  let val: string | null = null;
  if (/brand/.test(nameLc)) val = isUnbranded(listing.brand) ? "Unbranded" : (listing.brand as string);
  else if (/shoe size|us shoe size/.test(nameLc)) val = listing.size || extractSize(text);
  else if (/^size/.test(nameLc) || /size type/.test(nameLc)) val = nameLc.includes("type") ? (listing.sizeType || "Regular") : (listing.size || extractSize(text));
  else if (/department/.test(nameLc)) val = detectDepartment(text);
  else if (/color/.test(nameLc)) val = extractColor(text);
  else if (/material/.test(nameLc)) val = extractMaterial(text) || null;

  if (val != null) {
    const m = matchAllowed(val);
    if (m) return [String(m)];
    if (mode === "FREE_TEXT") return [String(val)];
  }
  if (allowed.length) return [allowed[0]];
  if (/brand/.test(nameLc)) return ["Unbranded"];
  if (/color/.test(nameLc)) return [extractColor(text)];
  if (/department/.test(nameLc)) return [detectDepartment(text)];
  if (/size/.test(nameLc)) return [String(listing.size || "One Size")];
  return ["Does Not Apply"];
}

// Build the full aspects object for an inventory item, covering all required
// aspects for the chosen category plus Brand.
export function buildAspects(listing: AspectListing, requiredAspects: EbayAspectMeta[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  out.Brand = [isUnbranded(listing.brand) ? "Unbranded" : (listing.brand as string)];
  for (const a of requiredAspects) {
    const v = resolveAspect(a, listing);
    if (v && v[0]) out[a.localizedAspectName] = v;
  }
  return out;
}

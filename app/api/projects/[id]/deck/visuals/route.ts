import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";
import Anthropic from "@anthropic-ai/sdk";

const PROJECT_DECKS_PATH = join(process.cwd(), "data", "projectDecks.yaml");

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

async function loadYaml<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, "utf8");
    return (yaml.load(raw, { schema: yaml.JSON_SCHEMA }) as T) || fallback;
  } catch {
    return fallback;
  }
}

function extractJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function fallbackVisualPrompt(title: string, bullets: string[], visualIdea: string, stylePreset: string) {
  return `LANDSCAPE orientation (16:9 widescreen). ${stylePreset} presentation slide visual. Dark modern presentation aesthetic, no people, no faces, minimal clutter, strong hierarchy. Slide title: ${title}. Key points: ${bullets.join(' | ') || 'None'}. Visual direction: ${visualIdea || 'clean presentation visual metaphor'}. High contrast, presentation-ready, simple and memorable.`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { deckId, stylePreset } = await request.json();
    if (!deckId) {
      return Response.json({ error: "deckId is required" }, { status: 400 });
    }

    const decksData = await loadYaml<{ projectDecks: any[] }>(PROJECT_DECKS_PATH, { projectDecks: [] });
    const deckIndex = (decksData.projectDecks || []).findIndex((d) => d.projectId === id && d.id === deckId);
    if (deckIndex === -1) {
      return Response.json({ error: "Deck not found" }, { status: 404 });
    }

    const deck = decksData.projectDecks[deckIndex];
    const preset = String(stylePreset || deck.visualStylePreset || "dark modern strategic").trim();

    let coverImagePrompt = `LANDSCAPE orientation (16:9 widescreen). ${preset} presentation cover slide. Title: ${deck.title}. Subtitle: ${deck.subtitle || ''}. Dark polished deck aesthetic, no people, no faces, minimal clutter, strong focal hierarchy, cinematic but presentation-safe.`;
    let slides = (deck.slides || []).map((slide: any) => ({
      ...slide,
      imagePrompt: fallbackVisualPrompt(slide.title || 'Slide', slide.bullets || [], slide.visualIdea || '', preset),
    }));

    if (anthropic) {
      try {
        const msg = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2200,
          messages: [{
            role: "user",
            content: `You are generating visual prompts for a presentation deck. Do not generate images. Generate concise, production-usable image prompts for a slide deck visual layer. Respect these constraints: dark presentation aesthetic unless the style preset clearly implies otherwise, landscape 16:9, no people, no faces, low clutter, readable visual hierarchy, suitable for slide backgrounds or infographic-like slide visuals.\n\nStyle preset: ${preset}\nDeck title: ${deck.title}\nDeck subtitle: ${deck.subtitle || 'None'}\nDeck audience: ${deck.audience || 'None'}\nNarrative arc: ${(deck.narrativeArc || []).join(' | ') || 'None'}\n\nSlides:\n${(deck.slides || []).map((slide: any, idx: number) => `${idx + 1}. ${slide.title}\nPurpose: ${slide.purpose || 'None'}\nBullets: ${(slide.bullets || []).join(' | ') || 'None'}\nVisual idea: ${slide.visualIdea || 'None'}\nSpeaker notes: ${slide.speakerNotes || 'None'}`).join('\n\n')}\n\nReturn strict JSON with keys: coverImagePrompt, slides. slides must be an array of objects with keys: title, imagePrompt. Keep image prompts compact but specific.`
          }],
        });

        const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
        const parsed = extractJson(text);
        if (parsed) {
          if (typeof parsed.coverImagePrompt === 'string' && parsed.coverImagePrompt.trim()) {
            coverImagePrompt = parsed.coverImagePrompt;
          }
          if (Array.isArray(parsed.slides)) {
            const byTitle = new Map(parsed.slides.map((s: any) => [s.title, s.imagePrompt]));
            slides = slides.map((slide: any) => {
              const prompt = byTitle.get(slide.title);
              return {
                ...slide,
                imagePrompt: typeof prompt === 'string' && prompt.trim() ? prompt : slide.imagePrompt,
              };
            });
          }
        }
      } catch (error) {
        console.error('Deck visual prompt generation failed, using fallback:', error);
      }
    }

    const updatedDeck = {
      ...deck,
      visualStylePreset: preset,
      coverImagePrompt,
      slides,
      updatedAt: new Date().toISOString(),
    };

    decksData.projectDecks[deckIndex] = updatedDeck;
    await writeFile(PROJECT_DECKS_PATH, yaml.dump(decksData, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false }), 'utf8');

    return Response.json({ success: true, deck: updatedDeck });
  } catch (error: any) {
    console.error('Deck visual generation error:', error);
    return Response.json({ error: error.message || 'Failed to generate deck visuals' }, { status: 500 });
  }
}

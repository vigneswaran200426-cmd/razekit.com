// VisualBriefBuilder — transforms product data into a structured visual brief,
// then into the image-generation prompt. Never concatenate raw entity fields
// directly into a prompt.
import { VISUAL_ASSET_TYPES, resolveVisualCategory, resolvePlatform, PROMPT_VERSION } from "./registry.ts";

export function buildVisualBrief(entityType, entity, assetType) {
  const typeCfg = VISUAL_ASSET_TYPES[assetType];
  if (!typeCfg) throw new Error(`Unknown asset type: ${assetType}`);
  if (!entity) throw new Error("Entity data missing for visual brief");
  const category = resolveVisualCategory(entityType, entity);
  const platform = resolvePlatform(entityType, entity);
  const title = String(entity.title || "Razekit creative contest").trim();
  return {
    entityType,
    assetType,
    promptVersion: PROMPT_VERSION,
    subject: `${category.subjectHint}, inspired by the theme "${title}"`,
    mood: category.mood,
    composition: `${typeCfg.framing}; ${category.compositionHint}`,
    audience: "social-media content creators and modern marketing teams",
    style: category.style,
    lighting: category.lighting,
    palette: category.palette,
    platform: platform.guidance,
    restrictions: "no text, no words, no letters, no numbers, no typography; no UI elements, no screenshots, no app mockups, no cards or panels; no watermark; no logos or brand marks; no collages",
  };
}

export function buildImagePrompt(brief) {
  return [
    "Create ONE original piece of visual artwork — pure artwork, never a screenshot, UI mockup, poster with text, or collage.",
    `Subject: ${brief.subject}.`,
    `Mood: ${brief.mood}.`,
    `Composition: ${brief.composition}.`,
    `Style: ${brief.style}.`,
    `Lighting: ${brief.lighting}.`,
    `Color palette: ${brief.palette}.`,
    `Platform context: ${brief.platform}.`,
    `Audience: ${brief.audience}.`,
    `Strict restrictions: ${brief.restrictions}.`,
    "High production quality, cohesive, premium marketplace aesthetic.",
  ].join(" ");
}
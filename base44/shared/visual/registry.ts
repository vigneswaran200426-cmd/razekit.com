// Razekit Visual Asset System — central configuration registry (server-side).
// ─────────────────────────────────────────────────────────────────────────────
// This file IS the platform capability: adding a new asset type, platform, or
// visual category is a config entry here — no engine rewrite, no schema change.
// Bump PROMPT_VERSION when prompt logic changes; bump POLICY_VERSION when
// visual/category/platform rules change. Existing assets keep their version.

export const PROMPT_VERSION = "v1";
export const POLICY_VERSION = "v1";

// Single place to change the image model / provider. Never scatter model names.
// Generation runs server-side only — credentials never reach the browser.
export const IMAGE_PROVIDER_CONFIG = {
  name: "openai",
  model: "openai-image-auto",
};

export const RETRY_POLICY = {
  maxAttempts: 3,
  backoffMs: [60 * 1000, 5 * 60 * 1000], // after attempt 1 → 1 min, after attempt 2 → 5 min
  maintenanceBatch: 10,                   // due retries per maintenance run
  backfillBatch: 5,                       // generations per backfill run (controlled batches)
  backfillScanLimit: 200,                 // entities scanned per backfill run
};

export const CURRENT_STATUSES = ["ready", "custom_active"];

// ── Asset types (config-driven; add entries for future products/modules) ──
export const VISUAL_ASSET_TYPES = {
  CONTEST_THUMBNAIL: {
    id: "CONTEST_THUMBNAIL",
    label: "Contest Thumbnail",
    framing: "wide 16:9 landscape composition suited to a card cover, bold focal point",
    required: true,
    autoOnCreate: true,
    onDemand: false,
  },
  CONTEST_BANNER: {
    id: "CONTEST_BANNER",
    label: "Contest Banner",
    framing: "extra-wide 21:9 panoramic banner composition",
    required: false,
    autoOnCreate: false,
    onDemand: true,
  },
  CONTEST_HERO: {
    id: "CONTEST_HERO",
    label: "Contest Hero",
    framing: "cinematic 16:9 landscape composition with generous calm space at the top for overlaid UI",
    required: false,
    autoOnCreate: false,
    onDemand: true,
  },
  CONTEST_AD: {
    id: "CONTEST_AD",
    label: "Contest Ad Creative",
    framing: "square 1:1 composition with a clear central focal point",
    required: false,
    autoOnCreate: false,
    onDemand: true,
  },
  FEATURED_CONTEST_ART: {
    id: "FEATURED_CONTEST_ART",
    label: "Featured Contest Art",
    framing: "wide 16:9 hero composition with a dramatic single focal subject",
    required: false,
    autoOnCreate: false,
    onDemand: true,
  },
  WINNER_HUB_COVER: {
    id: "WINNER_HUB_COVER",
    label: "Winners Hub Cover",
    framing: "wide celebratory 16:9 composition, trophy-adjacent mood without literal UI",
    required: false,
    autoOnCreate: false,
    onDemand: true,
  },
};

// ── Entity types and their asset requirements (future entities register here) ──
export const ENTITY_TYPES = {
  CONTEST: {
    entityName: "Contest",
    requirements: {
      CONTEST_THUMBNAIL: "required",
      CONTEST_HERO: "optional",
      CONTEST_BANNER: "optional",
      CONTEST_AD: "optional",
    },
  },
};

export function getAssetType(assetType) {
  return VISUAL_ASSET_TYPES[assetType] || null;
}

export function getEntityTypeConfig(entityType) {
  return ENTITY_TYPES[entityType] || null;
}

export function isGenerationRequired(entityType, assetType) {
  const cfg = getEntityTypeConfig(entityType);
  return !!(cfg && cfg.requirements[assetType] === "required");
}

export function getAutoOnCreateAssetTypes(entityType) {
  const cfg = getEntityTypeConfig(entityType);
  if (!cfg) return [];
  return Object.keys(cfg.requirements).filter((t) => VISUAL_ASSET_TYPES[t] && VISUAL_ASSET_TYPES[t].autoOnCreate);
}

// ── Social platform visual context (add future platforms as config entries) ──
export const PLATFORM_VISUALS = {
  instagram: { id: "instagram", label: "Instagram", orientation: "vertical", guidance: "composed for a social feed — thumb-stopping, reads clearly at small sizes" },
  tiktok: { id: "tiktok", label: "TikTok", orientation: "vertical", guidance: "fast, punchy, vertically framed energy" },
  youtube_shorts: { id: "youtube_shorts", label: "YouTube Shorts", orientation: "vertical", guidance: "short-form vertical energy with a clear single subject" },
  youtube: { id: "youtube", label: "YouTube", orientation: "landscape", guidance: "cinematic wide composition with strong thumbnail-style focal hierarchy" },
  facebook: { id: "facebook", label: "Facebook", orientation: "landscape", guidance: "friendly, shareable, broadly appealing composition" },
  x: { id: "x", label: "X", orientation: "landscape", guidance: "clean landscape composition that reads at feed scale" },
  linkedin: { id: "linkedin", label: "LinkedIn", orientation: "landscape", guidance: "professional, business-oriented, composed and credible" },
  pinterest: { id: "pinterest", label: "Pinterest", orientation: "vertical", guidance: "tall, aesthetic, inspiration-board friendly framing" },
  threads: { id: "threads", label: "Threads", orientation: "square", guidance: "intimate, conversational square composition" },
  other: { id: "other", label: "Other", orientation: "landscape", guidance: "versatile composition that works across placements" },
};

const CONTEST_CATEGORY_TO_PLATFORM = {
  "Instagram Reel": "instagram",
  "YouTube Shorts": "youtube_shorts",
  "YouTube Video": "youtube",
  "Advertisement": "other",
  "Gaming": "youtube",
  "Wedding": "instagram",
  "Documentary": "youtube",
  "Corporate": "linkedin",
  "Travel": "instagram",
  "Music Video": "youtube",
};

const PLATFORM_KEYWORDS = [
  ["tiktok", ["tiktok"]],
  ["instagram", ["instagram", "insta", "reel"]],
  ["youtube", ["youtube", "vlog"]],
  ["linkedin", ["linkedin", "b2b"]],
  ["pinterest", ["pinterest"]],
  ["threads", ["threads"]],
  ["facebook", ["facebook"]],
  ["x", ["twitter", " x "]],
];

export function resolvePlatform(entityType, entity) {
  const category = String((entity && entity.category) || "");
  const mapped = CONTEST_CATEGORY_TO_PLATFORM[category];
  if (mapped && PLATFORM_VISUALS[mapped]) return PLATFORM_VISUALS[mapped];
  const text = `${category} ${entity?.title || ""} ${entity?.description || ""}`.toLowerCase();
  for (const [platformId, keywords] of PLATFORM_KEYWORDS) {
    if (keywords.some((k) => text.includes(k))) return PLATFORM_VISUALS[platformId];
  }
  return PLATFORM_VISUALS.other;
}

// ── Visual categories (extensible by configuration/data; spec §13) ──
export const CATEGORY_VISUALS = {
  TRAVEL: {
    id: "travel", mood: "aspirational, cinematic, wanderlust-filled",
    subjectHint: "a breathtaking travel destination experience",
    compositionHint: "a hero subject set against a sweeping landscape",
    lighting: "golden-hour sunlight, warm and inviting",
    palette: "deep navy blues, sky cyan and warm sunset amber",
    style: "premium commercial travel photography",
    keywords: ["travel", "bali", "island", "tropical", "beach", "mountain", "voyage", "wanderlust", "roadtrip", "destination", "vacation", "tour"],
  },
  GAMING: {
    id: "gaming", mood: "high-energy, neon-lit, futuristic",
    subjectHint: "an immersive gaming and esports atmosphere",
    compositionHint: "dynamic diagonal composition full of motion energy",
    lighting: "neon rim lighting against deep dark tones",
    palette: "dark navy with electric cyan and magenta accents",
    style: "sleek digital game key art illustration",
    keywords: ["gaming", "game", "esports", "montage", "fps", "console", "controller", "clutch", "valorant", "pubg", "fortnite"],
  },
  FASHION: {
    id: "fashion", mood: "editorial, confident, trend-setting",
    subjectHint: "a striking fashion editorial scene",
    compositionHint: "model-centred composition with strong pose and styling",
    lighting: "studio lighting with crisp contrast",
    palette: "monochrome tones with one bold accent colour",
    style: "high-fashion magazine editorial photography",
    keywords: ["fashion", "outfit", "style", "runway", "apparel", "clothing", "lookbook", "streetwear", "dress"],
  },
  FOOD: {
    id: "food", mood: "appetising, warm, vibrant",
    subjectHint: "a mouth-watering food scene",
    compositionHint: "close hero framing of the dish with texture detail",
    lighting: "soft natural window light with fresh highlights",
    palette: "rich warm tones with fresh green and red accents",
    style: "premium food commercial photography",
    keywords: ["food", "recipe", "cooking", "restaurant", "cafe", "dish", "baking", "chef", "meal", "kitchen"],
  },
  FITNESS: {
    id: "fitness", mood: "energetic, disciplined, powerful",
    subjectHint: "an intense fitness training moment",
    compositionHint: "dynamic action framing with sweat and motion",
    lighting: "dramatic gym lighting with rim highlights",
    palette: "charcoal and steel with electric accent",
    style: "bold sports commercial photography",
    keywords: ["fitness", "gym", "workout", "training", "athlete", "run", "yoga", "crossfit", "exercise"],
  },
  BEAUTY: {
    id: "beauty", mood: "clean, luxurious, radiant",
    subjectHint: "an elegant beauty product scene",
    compositionHint: "minimal centred product hero with soft textures",
    lighting: "soft diffused beauty lighting",
    palette: "pastel blush, cream and soft rose tones",
    style: "luxury beauty campaign photography",
    keywords: ["beauty", "makeup", "skincare", "cosmetic", "salon", "glow", "hair", "spa"],
  },
  TECHNOLOGY: {
    id: "technology", mood: "sleek, innovative, precise",
    subjectHint: "a modern technology scene with device and innovation cues",
    compositionHint: "clean geometric composition with negative space",
    lighting: "cool studio lighting with subtle glow",
    palette: "graphite, white and electric blue",
    style: "premium tech product photography",
    keywords: ["tech", "technology", "app", "ai", "startup", "software", "gadget", "device", "saas", "innovation"],
  },
  MUSIC: {
    id: "music", mood: "rhythmic, electric, alive",
    subjectHint: "a vivid live music performance atmosphere",
    compositionHint: "stage-centred composition with light beams and crowd energy",
    lighting: "concert lighting with rich colour washes",
    palette: "deep black with saturated stage colours",
    style: "cinematic live-music photography",
    keywords: ["music", "song", "artist", "concert", "beat", "audio", "rapper", "band", "guitar", "dj"],
  },
  FILM: {
    id: "film", mood: "cinematic, storytelling, atmospheric",
    subjectHint: "an evocative documentary-style scene",
    compositionHint: "cinematic wide framing with layered depth",
    lighting: "moody natural light with filmic contrast",
    palette: "muted earthy tones with deep shadows",
    style: "documentary cinematography still",
    keywords: ["documentary", "film", "story", "cinematic", "movie", "reel", "narrative", "scene", "short film"],
  },
  WEDDING: {
    id: "wedding", mood: "romantic, elegant, timeless",
    subjectHint: "a romantic wedding celebration moment",
    compositionHint: "tender couple-centred composition with floral detail",
    lighting: "soft romantic backlight",
    palette: "ivory, blush pink and champagne gold",
    style: "fine-art wedding photography",
    keywords: ["wedding", "bride", "marriage", "engagement", "ceremony", "romantic", "haldi", "sangeet"],
  },
  CORPORATE: {
    id: "corporate", mood: "professional, trustworthy, modern",
    subjectHint: "a contemporary business environment scene",
    compositionHint: "clean architectural composition with confident perspective",
    lighting: "bright even corporate lighting",
    palette: "navy, white and steel blue",
    style: "premium corporate campaign photography",
    keywords: ["corporate", "business", "company", "brand", "enterprise", "startup", "professional", "b2b", "office"],
  },
  LIFESTYLE: {
    id: "lifestyle", mood: "warm, authentic, everyday-premium",
    subjectHint: "an aspirational everyday lifestyle scene",
    compositionHint: "natural candid framing with lived-in detail",
    lighting: "soft daylight",
    palette: "warm neutrals with muted colour accents",
    style: "premium lifestyle commercial photography",
    keywords: ["lifestyle", "daily", "vlog", "home", "morning", "routine", "wellness", "family"],
  },
  SPORTS: {
    id: "sports", mood: "thrilling, competitive, peak-action",
    subjectHint: "a peak-action sports moment",
    compositionHint: "fast action framing with dramatic perspective",
    lighting: "stadium lighting with high contrast",
    palette: "grass green, floodlight white and team colour accents",
    style: "sports photojournalism",
    keywords: ["sports", "cricket", "football", "match", "tournament", "team", "league", "athletics"],
  },
  AUTOMOTIVE: {
    id: "automotive", mood: "powerful, sleek, precision-engineered",
    subjectHint: "a striking automotive scene",
    compositionHint: "low-angle hero car composition with motion cues",
    lighting: "dusk ambient with reflective highlights",
    palette: "gunmetal, chrome and deep blue",
    style: "premium automotive advertising photography",
    keywords: ["car", "automotive", "drive", "motor", "bike", "rider", "engine", "road trip", "vehicle"],
  },
  ENTERTAINMENT: {
    id: "entertainment", mood: "playful, vibrant, show-stopping",
    subjectHint: "a colourful entertainment and pop-culture moment",
    compositionHint: "lively centred composition with celebratory energy",
    lighting: "vibrant saturated stage-style lighting",
    palette: "bold multi-colour pops on a deep base",
    style: "vibrant entertainment campaign art",
    keywords: ["entertainment", "comedy", "viral", "meme", "show", "funny", "trend", "pop culture"],
  },
  EDUCATION: {
    id: "education", mood: "clear, curious, inspiring",
    subjectHint: "a bright learning and knowledge scene",
    compositionHint: "orderly composition with a clear focal subject",
    lighting: "bright airy daylight",
    palette: "clean whites with primary accent colours",
    style: "modern educational campaign photography",
    keywords: ["education", "course", "learn", "study", "tutorial", "teach", "school", "how to"],
  },
  FINANCE: {
    id: "finance", mood: "confident, secure, growth-oriented",
    subjectHint: "a modern finance and growth scene",
    compositionHint: "structured upward composition suggesting growth",
    lighting: "clean confident lighting",
    palette: "deep green, navy and gold accents",
    style: "premium fintech campaign photography",
    keywords: ["finance", "invest", "money", "trading", "crypto", "banking", "wealth", "fintech"],
  },
  OTHER: {
    id: "other", mood: "premium, modern, versatile",
    subjectHint: "a polished conceptual scene matching the contest theme",
    compositionHint: "clean hero composition with a clear single subject",
    lighting: "soft professional lighting",
    palette: "Razekit's icy blues with navy depth",
    style: "premium commercial photography",
    keywords: [],
  },
};

const CONTEST_CATEGORY_TO_VISUAL = {
  "Instagram Reel": null, // platform category — theme resolved from contest text
  "YouTube Shorts": null,
  "YouTube Video": null,
  "Advertisement": null,
  "Gaming": "GAMING",
  "Wedding": "WEDDING",
  "Documentary": "FILM",
  "Corporate": "CORPORATE",
  "Travel": "TRAVEL",
  "Music Video": "MUSIC",
};

export function resolveVisualCategory(entityType, entity) {
  const category = String((entity && entity.category) || "");
  const mapped = CONTEST_CATEGORY_TO_VISUAL[category];
  if (mapped && CATEGORY_VISUALS[mapped]) return CATEGORY_VISUALS[mapped];
  const text = `${category} ${entity?.title || ""} ${entity?.description || ""} ${entity?.editing_style || ""} ${entity?.custom_editing_style || ""}`.toLowerCase();
  for (const cfg of Object.values(CATEGORY_VISUALS)) {
    if (cfg.keywords.some((k) => text.includes(k))) return cfg;
  }
  return CATEGORY_VISUALS.OTHER;
}
// ImageGenerationProvider — the seam between the Visual Asset Engine and the
// image backend. The default implementation calls the platform's server-side
// image generation integration (credentials stay server-side, never exposed to
// the browser). Swapping to a direct OpenAI/vendor API later = implement this
// same interface with a secrets-based client; the rest of the system is unchanged.
import { IMAGE_PROVIDER_CONFIG } from "./registry.ts";

function guessMime(url) {
  const ext = String(url || "").split("?")[0].split(".").pop().toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

function extractGenerationId(url) {
  const parts = String(url || "").split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

export function createImageProvider(srClient) {
  return {
    name: IMAGE_PROVIDER_CONFIG.name,
    model: IMAGE_PROVIDER_CONFIG.model,

    // generateImage(prompt) → raw provider response ({ url })
    async generateImage(prompt) {
      return await srClient.integrations.Core.GenerateImage({ prompt });
    },

    // validateResponse(raw) → { url, generationId } or throws
    validateResponse(raw) {
      const url = raw && raw.url;
      if (!url || typeof url !== "string") {
        throw new Error("Image provider returned no URL");
      }
      return { url, generationId: extractGenerationId(url) };
    },

    // returnAsset(validated) → asset fields to persist
    returnAsset(validated) {
      return {
        storageUrl: validated.url,
        generationId: validated.generationId,
        provider: IMAGE_PROVIDER_CONFIG.name,
        model: IMAGE_PROVIDER_CONFIG.model,
        mimeType: guessMime(validated.url),
      };
    },

    // handleError(err) → { code, message }
    handleError(err) {
      return {
        code: (err && (err.code || err.name)) || "generation_failed",
        message: String((err && err.message) || err).slice(0, 400),
      };
    },
  };
}
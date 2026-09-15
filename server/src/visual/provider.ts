// @ts-nocheck
// ImageGenerationProvider — the seam between the Visual Asset Engine and the
// image backend, so the engine never knows which vendor produced a picture.
//
// It used to call srClient.integrations.Core.GenerateImage — a Base44 platform
// call left behind when RazeKit moved off Base44 — and then treated the result
// as a URL. It now calls the server-side image integration directly and passes
// BYTES through, because bytes are the only thing that can honestly be stored.
//
// The credential never leaves the server, and nothing here ever reaches the
// browser.
import { generateImage, assertUsableImage, ImageGenerationError } from '../integrations/image.js';

export function createImageProvider() {
  return {
    name: 'image',

    /** generateImage(prompt) → GeneratedImage ({ bytes, mime, model, ... }) */
    async generateImage(prompt) {
      return await generateImage({ prompt });
    },

    /**
     * validateResponse(raw) → the image, or throws.
     *
     * Re-validates the bytes rather than trusting the integration's word for
     * it. This is the last point before an asset is written as "ready", and a
     * row marked ready pointing at a broken image is worse than a failure — a
     * failure gets retried, a bad success does not.
     */
    validateResponse(raw) {
      if (!raw || !Buffer.isBuffer(raw.bytes)) {
        throw new ImageGenerationError('IMAGE_VALIDATION_ERROR', 'The image provider returned no image data.', 502);
      }
      const mime = assertUsableImage(raw.bytes);
      return {
        bytes: raw.bytes,
        mime,
        provider: raw.provider,
        model: raw.model,
        generationId: raw.generationId,
        placeholder: Boolean(raw.placeholder),
        width: raw.width ?? null,
        height: raw.height ?? null,
      };
    },

    /** returnAsset(validated) → the fields the engine persists. */
    returnAsset(validated) {
      return {
        provider: validated.provider,
        model: validated.model,
        generationId: validated.generationId,
        mimeType: validated.mime,
        width: validated.width,
        height: validated.height,
        // Carried through so a placeholder can never be mistaken for artwork
        // once it is a database row.
        placeholder: validated.placeholder,
      };
    },

    /** handleError(err) → { code, message, retryable } */
    handleError(err) {
      if (err instanceof ImageGenerationError) {
        return { code: err.code, message: err.message.slice(0, 400), retryable: err.retryable };
      }
      return {
        code: (err && (err.code || err.name)) || 'generation_failed',
        message: String((err && err.message) || err).slice(0, 400),
        // An unrecognised error is not assumed transient: retrying a permanent
        // failure three times just spends money to fail three times.
        retryable: false,
      };
    },
  };
}

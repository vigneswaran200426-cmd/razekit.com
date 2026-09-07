// The `integrations.Core.*` surface used by ported backend code (service role).
// Same method names/shapes as Base44's integrations.Core.
import { generateImage } from './image.js';
import { invokeLLM } from './llm.js';
import { sendEmail } from './email.js';
import { createSignedUrl } from './storage.js';

export const coreIntegrations = {
  GenerateImage: (input: { prompt: string }) => generateImage(input),
  InvokeLLM: (input: any) => invokeLLM(input),
  SendEmail: (input: any) => sendEmail(input),
  CreateFileSignedUrl: (input: { file_uri: string; expires_in?: number }) => createSignedUrl(input.file_uri, input.expires_in),
  // Server-side callers rarely upload from a Buffer path; the HTTP route handles
  // browser uploads. Kept for parity / future backend use.
};

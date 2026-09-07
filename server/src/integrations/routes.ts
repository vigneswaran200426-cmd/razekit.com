import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../auth/middleware.js';
import { uploadPublic, uploadPrivate, createSignedUrl } from './storage.js';
import { sendEmail } from './email.js';
import { invokeLLM } from './llm.js';
import { generateImage } from './image.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 * 1024 } }); // 512MB

export const integrationsRouter = Router();

// base44.integrations.Core.UploadFile({ file }) → { file_url }
integrationsRouter.post('/upload-file', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const out = await uploadPublic(req.file.buffer, req.file.originalname, req.file.mimetype);
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Upload failed' });
  }
});

// base44.integrations.Core.UploadPrivateFile({ file }) → { file_uri }
integrationsRouter.post('/upload-private-file', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const out = await uploadPrivate(req.file.buffer, req.file.originalname, req.file.mimetype);
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Upload failed' });
  }
});

// base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in }) → { signed_url }
integrationsRouter.post('/create-file-signed-url', requireAuth, async (req, res) => {
  try {
    const out = await createSignedUrl(req.body?.file_uri, req.body?.expires_in);
    res.json(out);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Could not sign URL' });
  }
});

// base44.integrations.Core.SendEmail({...}) → { ok }
integrationsRouter.post('/send-email', requireAuth, async (req, res) => {
  try {
    res.json(await sendEmail(req.body || {}));
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Email failed' });
  }
});

// base44.integrations.Core.InvokeLLM({ prompt, response_json_schema }) → result
integrationsRouter.post('/invoke-llm', requireAuth, async (req, res) => {
  try {
    res.json(await invokeLLM(req.body || {}));
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'LLM failed' });
  }
});

// base44.integrations.Core.GenerateImage({ prompt }) → { url }
integrationsRouter.post('/generate-image', requireAuth, async (req, res) => {
  try {
    res.json(await generateImage(req.body || {}));
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Image generation failed' });
  }
});

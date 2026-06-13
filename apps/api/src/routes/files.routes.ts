import { Router, Request, Response } from 'express';
import { logger } from '../lib/logger';
import { getDownloadUrl } from '../services/storage.service';

export const filesRouter = Router();

// ── GET /api/files/download/:key — Securely download or redirect to file ──
filesRouter.get('/download/:key', async (req: Request, res: Response) => {
  try {
    const key = req.params.key as string;
    const downloadUrl = await getDownloadUrl(key);
    
    // Redirect client to download URL (either R2 signed or local uploads static URL)
    res.redirect(downloadUrl);
  } catch (err) {
    logger.error({ err }, 'Get download file error');
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
